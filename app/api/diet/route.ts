import { env } from "cloudflare:workers";
import { summarizeDay } from "../../day-totals";

type DailyRow = {
  day_date: string;
  payload: unknown;
  updated_at: string;
};

type SettingsRow = {
  payload: unknown;
  updated_at: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  BACKUP_DRIVER?: "d1" | "supabase";
};

type SupabaseConfig = {
  url: string;
  key: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USER_KEY_RE = /^[A-Za-z0-9_-]{24,128}$/;

function getRuntimeEnv() {
  return env as unknown as RuntimeEnv;
}

function getD1Db() {
  const runtimeEnv = getRuntimeEnv();

  if (!runtimeEnv.DB) {
    throw new Error("Cloud backup is unavailable because the D1 binding is missing.");
  }

  return runtimeEnv.DB;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const runtimeEnv = getRuntimeEnv();
  const url = runtimeEnv.SUPABASE_URL?.replace(/\/$/, "");
  const key = runtimeEnv.SUPABASE_SECRET_KEY ?? runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || runtimeEnv.BACKUP_DRIVER === "d1") {
    return null;
  }

  return { url, key };
}

function assertUserKey(value: unknown): string {
  if (typeof value !== "string" || !USER_KEY_RE.test(value)) {
    throw new Error("A valid cloud sync key is required.");
  }

  return value;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) {
    return fallback;
  }

  if (typeof value !== "string") {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function supabaseRequest<T>(
  config: SupabaseConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user_settings (
        user_key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS daily_logs (
        user_key TEXT NOT NULL,
        day_date TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_key, day_date)
      )`,
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS daily_logs_user_date_idx ON daily_logs (user_key, day_date)",
    ),
    /* Denormalised mirror of the numbers inside payload, so the coach roster
       can be one indexed query. Derived data - daily_logs stays canonical. */
    db.prepare(
      `CREATE TABLE IF NOT EXISTS daily_totals (
        user_key TEXT NOT NULL,
        day_date TEXT NOT NULL,
        kcal REAL NOT NULL DEFAULT 0,
        protein REAL NOT NULL DEFAULT 0,
        fat REAL NOT NULL DEFAULT 0,
        carbs REAL NOT NULL DEFAULT 0,
        target_kcal REAL NOT NULL DEFAULT 0,
        target_protein REAL NOT NULL DEFAULT 0,
        target_fat REAL NOT NULL DEFAULT 0,
        target_carbs REAL NOT NULL DEFAULT 0,
        weight REAL,
        meals_logged INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_key, day_date)
      )`,
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS daily_totals_user_date_idx ON daily_totals (user_key, day_date)",
    ),
  ]);
}

function toErrorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}

/**
 * The sync key is a bearer credential: whoever holds it can read and write
 * everything under it. It therefore travels in a header, never a query
 * string — query strings are captured verbatim by proxy logs, server access
 * logs, browser history and Referer headers.
 *
 * The query parameter is deliberately NOT accepted as a fallback. This is a
 * web app, so every client loads the current bundle on next visit; there is
 * no installed version left behind to break.
 */
function readSyncKey(request: Request): string {
  const header =
    request.headers.get("x-sync-key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  return assertUserKey(header);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userKey = readSyncKey(request);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const hasRange = start && end && DATE_RE.test(start) && DATE_RE.test(end);
    const supabase = getSupabaseConfig();

    if (supabase) {
      const encodedUserKey = encodeURIComponent(userKey);
      const settingsRows = await supabaseRequest<SettingsRow[]>(
        supabase,
        `user_settings?select=payload,updated_at&user_key=eq.${encodedUserKey}&limit=1`,
      );
      const dayRange = hasRange
        ? `&day_date=gte.${encodeURIComponent(start)}&day_date=lte.${encodeURIComponent(end)}`
        : "";
      const rows = await supabaseRequest<DailyRow[]>(
        supabase,
        `daily_logs?select=day_date,payload,updated_at&user_key=eq.${encodedUserKey}${dayRange}&order=day_date.asc`,
      );
      const settings = settingsRows[0];

      return Response.json({
        profile: parseJson(settings?.payload, null),
        profileUpdatedAt: settings?.updated_at ?? null,
        days: rows.map((row) => ({
          date: row.day_date,
          payload: parseJson(row.payload, null),
          updatedAt: row.updated_at,
        })),
        backend: "supabase",
      });
    }

    const db = getD1Db();

    await ensureSchema(db);

    const settings = await db
      .prepare("SELECT payload, updated_at FROM user_settings WHERE user_key = ?")
      .bind(userKey)
      .first<SettingsRow>();

    const rows = hasRange
      ? await db
          .prepare(
            "SELECT day_date, payload, updated_at FROM daily_logs WHERE user_key = ? AND day_date BETWEEN ? AND ? ORDER BY day_date",
          )
          .bind(userKey, start, end)
          .all<DailyRow>()
      : await db
          .prepare(
            "SELECT day_date, payload, updated_at FROM daily_logs WHERE user_key = ? ORDER BY day_date",
          )
          .bind(userKey)
          .all<DailyRow>();

    return Response.json({
      profile: parseJson(settings?.payload, null),
      profileUpdatedAt: settings?.updated_at ?? null,
      days: rows.results.map((row) => ({
        date: row.day_date,
        payload: parseJson(row.payload, null),
        updatedAt: row.updated_at,
      })),
      backend: "d1",
    });
  } catch (error) {
    return toErrorResponse(error, 400);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      userKey?: unknown;
      profile?: unknown;
      days?: Record<string, unknown>;
    };
    const userKey = assertUserKey(body.userKey);
    const now = new Date().toISOString();
    const supabase = getSupabaseConfig();

    if (supabase) {
      if (body.profile) {
        await supabaseRequest(
          supabase,
          "user_settings?on_conflict=user_key",
          {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify([
              {
                user_key: userKey,
                payload: body.profile,
                updated_at: now,
              },
            ]),
          },
        );
      }

      const dayRows = Object.entries(body.days ?? {})
        .filter(([dayDate]) => DATE_RE.test(dayDate))
        .map(([dayDate, payload]) => ({
          user_key: userKey,
          day_date: dayDate,
          payload,
          updated_at: now,
        }));

      if (dayRows.length > 0) {
        await supabaseRequest(
          supabase,
          "daily_logs?on_conflict=user_key,day_date",
          {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(dayRows),
          },
        );

        /* Keep the queryable mirror in step with the blob. */
        const totalRows = dayRows.map((row: { day_date: string; payload: unknown }) => {
          const totals = summarizeDay(row.payload);
          return {
            user_key: userKey,
            day_date: row.day_date,
            kcal: totals.kcal,
            protein: totals.protein,
            fat: totals.fat,
            carbs: totals.carbs,
            target_kcal: totals.targetKcal,
            target_protein: totals.targetProtein,
            target_fat: totals.targetFat,
            target_carbs: totals.targetCarbs,
            weight: totals.weight,
            meals_logged: totals.mealsLogged,
            updated_at: now,
          };
        });

        await supabaseRequest(
          supabase,
          "daily_totals?on_conflict=user_key,day_date",
          {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(totalRows),
          },
        );
      }

      return Response.json({
        ok: true,
        backend: "supabase",
        savedDays: dayRows.length,
        updatedAt: now,
      });
    }

    const db = getD1Db();
    const statements: D1PreparedStatement[] = [];

    await ensureSchema(db);

    if (body.profile) {
      statements.push(
        db
          .prepare(
            `INSERT INTO user_settings (user_key, payload, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(user_key) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at`,
          )
          .bind(userKey, JSON.stringify(body.profile), now),
      );
    }

    for (const [dayDate, payload] of Object.entries(body.days ?? {})) {
      if (!DATE_RE.test(dayDate)) {
        continue;
      }

      statements.push(
        db
          .prepare(
            `INSERT INTO daily_logs (user_key, day_date, payload, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_key, day_date) DO UPDATE SET
               payload = excluded.payload,
               updated_at = excluded.updated_at`,
          )
          .bind(userKey, dayDate, JSON.stringify(payload), now),
      );

      /* Keep the queryable mirror in step with the blob, in the same batch so
         the two cannot drift apart on a partial failure. */
      const totals = summarizeDay(payload);

      statements.push(
        db
          .prepare(
            `INSERT INTO daily_totals (
               user_key, day_date, kcal, protein, fat, carbs,
               target_kcal, target_protein, target_fat, target_carbs,
               weight, meals_logged, updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_key, day_date) DO UPDATE SET
               kcal = excluded.kcal,
               protein = excluded.protein,
               fat = excluded.fat,
               carbs = excluded.carbs,
               target_kcal = excluded.target_kcal,
               target_protein = excluded.target_protein,
               target_fat = excluded.target_fat,
               target_carbs = excluded.target_carbs,
               weight = excluded.weight,
               meals_logged = excluded.meals_logged,
               updated_at = excluded.updated_at`,
          )
          .bind(
            userKey,
            dayDate,
            totals.kcal,
            totals.protein,
            totals.fat,
            totals.carbs,
            totals.targetKcal,
            totals.targetProtein,
            totals.targetFat,
            totals.targetCarbs,
            totals.weight,
            totals.mealsLogged,
            now,
          ),
      );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return Response.json({
      ok: true,
      backend: "d1",
      savedDays: Object.keys(body.days ?? {}).length,
      updatedAt: now,
    });
  } catch (error) {
    return toErrorResponse(error, 400);
  }
}
