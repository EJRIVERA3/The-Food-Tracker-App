/**
 * Shared plumbing for the coach endpoints.
 *
 * ── The rule this module exists to enforce ────────────────────────────────
 * A client's sync key is a 192-bit read/WRITE bearer token and is also their
 * only identity — losing or rotating it costs them their data. So it must
 * never be handed to a coach. Instead the client accepts an invite, the server
 * records the mapping in `coach_links`, and the coach addresses that client by
 * the link's `id`. Revoking flips one column and costs the client nothing.
 *
 * ── Coach authentication ──────────────────────────────────────────────────
 * Deliberately minimal: a shared bearer token in `COACH_TOKEN`, which suits a
 * single-coach business and nothing larger. Every handler resolves the caller
 * to a `coachId`, so swapping this for real per-coach auth (Supabase Auth,
 * say) is a change to `authenticateCoach` alone.
 */
import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  COACH_TOKEN?: string;
  COACH_ID?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  BACKUP_DRIVER?: "d1" | "supabase";
};

export const USER_KEY_RE = /^[A-Za-z0-9_-]{24,128}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** No 0/O/1/I/L — these get typed by hand off a screen or a phone call. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
export const INVITE_CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

/**
 * The coach endpoints are implemented against D1 only. Supabase remains a
 * supported driver for /api/diet, so fail loudly here rather than quietly
 * reading an empty table on a Supabase deployment.
 */
export function getCoachDb(): D1Database {
  const runtimeEnv = getRuntimeEnv();

  if (runtimeEnv.BACKUP_DRIVER === "supabase" || (runtimeEnv.SUPABASE_URL && runtimeEnv.BACKUP_DRIVER !== "d1")) {
    throw new HttpError(
      501,
      "Coach sharing is implemented for the D1 driver only. This deployment is configured for Supabase; run supabase/migrations/0002_coach_links.sql and port these handlers before enabling it.",
    );
  }

  if (!runtimeEnv.DB) {
    throw new HttpError(503, "Coach sharing is unavailable because the D1 binding is missing.");
  }

  return runtimeEnv.DB;
}

/** Length-independent comparison, so timing does not leak the token. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  let diff = left.length ^ right.length;

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

/** Resolves the caller to a coach id, or throws 401/503. */
export function authenticateCoach(request: Request): string {
  const runtimeEnv = getRuntimeEnv();
  const expected = runtimeEnv.COACH_TOKEN;

  if (!expected) {
    throw new HttpError(
      503,
      "Coach access is not configured. Set the COACH_TOKEN secret (npx wrangler secret put COACH_TOKEN).",
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (!presented || !safeEqual(presented, expected)) {
    throw new HttpError(401, "Not authorised.");
  }

  return runtimeEnv.COACH_ID || "coach";
}

function randomInts(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function makeInviteCode(): string {
  const bytes = randomInts(CODE_LENGTH);
  let out = "";

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }

  return out;
}

export function makeLinkId(): string {
  const bytes = randomInts(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function assertUserKey(value: unknown): string {
  if (typeof value !== "string" || !USER_KEY_RE.test(value)) {
    throw new HttpError(400, "A valid sync key is required.");
  }

  return value;
}

export function assertInviteCode(value: unknown): string {
  const normalised = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]/g, "") : "";

  if (!INVITE_CODE_RE.test(normalised)) {
    throw new HttpError(400, "That invite code is not valid.");
  }

  return normalised;
}

/**
 * Fixed-window rate limit, backed by D1.
 *
 * Exists mainly for /api/coach/accept: an invite code is 8 characters from a
 * 31-character alphabet. That is fine against blind guessing and poor against
 * sustained automation, and the endpoint is deliberately unauthenticated
 * because the client accepting an invite has no account yet. Limiting by IP
 * turns "grind until something lands" into "give up".
 */
export async function enforceRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  /* Single statement, so two concurrent requests cannot both read the old
     value and each write 1. */
  const row = await db
    .prepare(
      `INSERT INTO coach_rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN coach_rate_limits.window_start = excluded.window_start
                      THEN coach_rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();

  if (Number(row?.count ?? 1) > limit) {
    throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
  }
}

export function requestIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export async function ensureCoachSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS coach_rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS coach_links (
        id TEXT PRIMARY KEY,
        coach_id TEXT NOT NULL,
        user_key TEXT,
        client_label TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        invite_code TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT 'read',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        accepted_at TEXT,
        revoked_at TEXT
      )`,
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS coach_links_coach_idx ON coach_links (coach_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS coach_links_user_idx ON coach_links (user_key, status)"),
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
    db.prepare("CREATE INDEX IF NOT EXISTS daily_totals_user_date_idx ON daily_totals (user_key, day_date)"),
  ]);
}

export type CoachLinkRow = {
  id: string;
  coach_id: string;
  user_key: string | null;
  client_label: string;
  status: string;
  invite_code: string;
  scope: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

/**
 * Loads a link the given coach is allowed to read from, or throws.
 * Returns 404 rather than 403 for links belonging to another coach, so the
 * endpoint does not confirm that an id exists.
 */
export async function requireActiveLink(
  db: D1Database,
  coachId: string,
  linkId: string,
): Promise<CoachLinkRow & { user_key: string }> {
  const row = await db
    .prepare("SELECT * FROM coach_links WHERE id = ? AND coach_id = ?")
    .bind(linkId, coachId)
    .first<CoachLinkRow>();

  if (!row) {
    throw new HttpError(404, "No such client.");
  }

  if (row.status !== "active" || !row.user_key) {
    throw new HttpError(403, "That client is not sharing their data.");
  }

  return row as CoachLinkRow & { user_key: string };
}

/** Never leaks user_key or invite_code for accepted links. */
export function publicLink(row: CoachLinkRow) {
  return {
    id: row.id,
    label: row.client_label,
    status: row.status,
    scope: row.scope,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    /* only meaningful while nobody has claimed it */
    inviteCode: row.status === "pending" ? row.invite_code : null,
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}
