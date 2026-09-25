// Inject the real Cloudflare settings into the vinext-generated deploy config.
//
// `vinext build` writes dist/server/wrangler.json with a placeholder D1 binding
// (database_id 0000...) and no routing. vinext owns that file and the .wrangler
// deploy redirect, so instead of maintaining a competing root wrangler config
// (which gets merged and creates duplicate DB bindings), we patch the generated
// file after each build.
//
// Two things get patched in:
//
//   1. The D1 binding, from cloudflare.d1.json (overridable via env for CI).
//   2. The custom domain, workers.dev fallback, and preview-URL setting,
//      from cloudflare.routes.json.
//
// Previously called patch-d1.mjs, back when it only did the first.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "..");
const cfgPath = path.join(root, "dist", "server", "wrangler.json");
const d1Path = path.join(root, "cloudflare.d1.json");
const routesPath = path.join(root, "cloudflare.routes.json");

/* ---------------------------------------------------------------- D1 */

const d1 = JSON.parse(readFileSync(d1Path, "utf8"));
const binding = process.env.D1_BINDING ?? d1.binding ?? "DB";
const database_name = process.env.D1_DATABASE_NAME ?? d1.database_name;
const database_id = process.env.D1_DATABASE_ID ?? d1.database_id;

if (!database_id || database_id.startsWith("REPLACE")) {
  throw new Error(
    "No real D1 database_id. Set it in cloudflare.d1.json or via D1_DATABASE_ID.",
  );
}

const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
cfg.d1_databases = [{ binding, database_name, database_id }];

/* ------------------------------------------------------------ routing */

let routeNote = "no custom domain (cloudflare.routes.json absent)";

if (existsSync(routesPath)) {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const domains = routes.custom_domains ?? [];

  if (domains.length) {
    cfg.routes = domains.map((pattern) => ({ pattern, custom_domain: true }));

    // Set EXPLICITLY. Defining routes silently flips workers_dev's default to
    // false, which takes the *.workers.dev hostname from serving to 404 on the
    // next deploy. That happened on the IRONCLAD side and was only caught by
    // checking the old URL afterwards. It is the fallback if anything is wrong
    // with the domain, so it stays on unless deliberately turned off.
    cfg.workers_dev = routes.workers_dev ?? true;

    // Preview URLs publish every deployed version on its own
    // <version>-<worker>.workers.dev hostname. This app is public by design,
    // so they leak nothing — but they are a data-entry surface nobody asked
    // for, and enabling workers_dev turns them on by default.
    cfg.preview_urls = routes.preview_urls ?? false;

    routeNote =
      `custom domain(s) ${domains.join(", ")}` +
      `; workers_dev=${cfg.workers_dev}, preview_urls=${cfg.preview_urls}`;
  }
}

writeFileSync(cfgPath, JSON.stringify(cfg));

console.log(
  `Patched ${path.relative(root, cfgPath)}:\n` +
    `  D1 "${binding}" -> ${database_name} (${database_id})\n` +
    `  ${routeNote}`,
);
