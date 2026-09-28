import test from "node:test";
import assert from "node:assert/strict";
import { withSecurityHeaders } from "./server/security-headers.mjs";

/**
 * The wrapper that puts security headers on every response.
 *
 * This app shipped with none at all, on a subdomain holding people's food
 * and health diaries, so these tests are mostly about the ways a fix like
 * this silently stops working: a rebuild dropping it, a response type it
 * forgets, a status code it mangles on the way through.
 */

const wrap = (handler: unknown) =>
  withSecurityHeaders({ fetch: handler } as never) as {
    fetch: (r: Request, e?: unknown, c?: unknown) => Promise<Response>;
  };

const get = (url = "https://food.enlightenedlifter.us/") => new Request(url);

test("every header is present on an ordinary page", async () => {
  const app = wrap(async () => new Response("<html></html>", {
    headers: { "content-type": "text/html" },
  }));
  const res = await app.fetch(get());

  for (const h of [
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
  ]) {
    assert.ok(res.headers.get(h), `${h} should be set`);
  }
});

test("the CSP refuses a script from anywhere but this origin", async () => {
  /* The protection that survives 'unsafe-inline': an injected
     <script src="//evil.example"> still has no allowed origin. */
  const app = wrap(async () => new Response("ok"));
  const csp = (await app.fetch(get())).headers.get("content-security-policy")!;

  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.ok(!csp.includes("unsafe-eval"), "eval must stay blocked");
  assert.ok(!/script-src[^;]*https?:/.test(csp), "no third-party script origin");
});

test("the page cannot be framed", async () => {
  /* A food diary in an invisible iframe over someone else's buttons is
     the whole clickjacking attack, and frame-ancestors is the only
     defence that works in current browsers. */
  const app = wrap(async () => new Response("ok"));
  const res = await app.fetch(get());

  assert.match(res.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
});

test("HSTS is sent over TLS and withheld over plain HTTP", async () => {
  /* Sending it on http://localhost during development would be noise,
     and browsers ignore it there anyway. */
  const app = wrap(async () => new Response("ok"));

  assert.ok((await app.fetch(get("https://food.enlightenedlifter.us/"))).headers.get("strict-transport-security"));
  assert.equal((await app.fetch(get("http://localhost:8801/"))).headers.get("strict-transport-security"), null);
});

test("HSTS does not claim authority over sibling subdomains", async () => {
  /* This IS a subdomain. includeSubDomains here would be asserting
     something about names it does not own. */
  const app = wrap(async () => new Response("ok"));
  const hsts = (await app.fetch(get())).headers.get("strict-transport-security")!;

  assert.match(hsts, /max-age=31536000/);
  assert.ok(!hsts.includes("includeSubDomains"));
});

test("the status and body pass through untouched", async () => {
  /* Rebuilding a Response is how a 404 quietly becomes a 200. */
  const app = wrap(async () => new Response("missing", { status: 404, statusText: "Not Found" }));
  const res = await app.fetch(get());

  assert.equal(res.status, 404);
  assert.equal(await res.text(), "missing");
  assert.ok(res.headers.get("content-security-policy"));
});

test("a route that sets its own policy keeps it", async () => {
  /* Fill in, never overwrite. If something deliberately set a stricter
     CSP, this must not relax it back to the default. */
  const app = wrap(async () => new Response("ok", {
    headers: { "content-security-policy": "default-src 'none'" },
  }));
  const res = await app.fetch(get());

  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'");
  assert.ok(res.headers.get("x-frame-options"), "the others still fill in");
});

test("an immutable response is still covered", async () => {
  /* Asset-handler responses have immutable headers; mutating one throws,
     which would have taken out every static file. */
  const inner = new Response("body", { headers: { "content-type": "text/css" } });
  Object.freeze(inner.headers);
  const app = wrap(async () => inner);
  const res = await app.fetch(get("https://food.enlightenedlifter.us/assets/x.css"));

  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), "body");
});

test("the wrapper keeps the rest of the worker's exports", async () => {
  /* A Worker can export scheduled(), queue() and friends. Wrapping only
     fetch must not drop them — losing a cron handler this way produces
     no error anywhere, it just stops running. */
  const scheduled = async () => {};
  const wrapped = withSecurityHeaders({ fetch: async () => new Response("ok"), scheduled } as never) as Record<string, unknown>;

  assert.equal(wrapped.scheduled, scheduled);
});
