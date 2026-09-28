/**
 * Security headers for every response this app sends.
 *
 * ── Why this exists as a Worker wrapper ──────────────────────────────────
 * This app shipped with no security headers at all: no CSP, no HSTS, no
 * X-Frame-Options, no nosniff. It holds people's food and health diaries,
 * and it sits on a subdomain of a site that had all four — so the gap was
 * invisible from either side, because they are separate repos with
 * separate deploys and nothing compares them.
 *
 * The obvious fix, a `_headers` file, does not work here. `_headers` only
 * applies to STATIC ASSET responses, and dist/client has no index.html:
 * every page is rendered by the Worker (`main: index.js`). A _headers
 * file would have protected /assets/*.css and left every actual page
 * bare — which looks like a fix, reports as a fix, and fixes nothing.
 *
 * So the headers go on in front of the generated Worker instead. The
 * build writes dist/server/index.js and owns it; scripts/patch-deploy-
 * config.mjs points `main` at a tiny entry that wraps it with this, the
 * same post-build patching pattern already used for the D1 binding and
 * the custom domain.
 *
 * ── Why script-src carries 'unsafe-inline' ───────────────────────────────
 * Not laziness, and worth understanding before anyone "tightens" it.
 *
 * The rendered page contains six inline <script> blocks — React's
 * streaming hydration payload, emitted by the framework as the response
 * streams. `script-src 'self'` blocks every one of them and the app does
 * not start. The proper answer is a per-request nonce, but React has to
 * put that nonce on the scripts it generates, which means the renderer
 * has to cooperate; this wrapper sits outside it and cannot.
 *
 * What 'unsafe-inline' still leaves in place is worth having: an injected
 * <script src="//evil.example"> is refused, because only 'self' is an
 * allowed origin. eval() is refused, because 'unsafe-eval' is absent.
 * frame-ancestors, base-uri, form-action and object-src all hold. It is
 * weaker than the main site's `script-src 'self'` and stronger than the
 * nothing that was here.
 */

/** Headers applied to every response, HTML or not. */
function baseHeaders(url) {
  const headers = {
    /* An injected inline script still runs — see the note above — but an
       injected script TAG pointing somewhere else does not, and neither
       does eval. */
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      /* Nobody has any business framing a page that shows someone's food
         diary, and this is the only defence against clickjacking that
         works in current browsers. */
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'"
    ].join("; "),

    /* Stops a browser second-guessing a Content-Type — the trick that
       turns an uploaded file into a script. */
    "x-content-type-options": "nosniff",

    /* frame-ancestors above covers modern browsers; this covers the ones
       that never implemented it. */
    "x-frame-options": "DENY",

    /* A diary URL can name the person or the day. Send the origin to
       other sites, never the path. */
    "referrer-policy": "strict-origin-when-cross-origin",

    /* Nothing here needs any of these, and saying so stops an injected
       script from asking. */
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()"
  };

  /* Only meaningful over TLS, and sending it on http://localhost during
     development would be noise. One year, matching the main site, which
     is also the floor for the HSTS preload list.

     Not includeSubDomains: this IS a subdomain, and claiming authority
     over a parent's other names from here would be wrong. */
  if (url.protocol === "https:") {
    headers["strict-transport-security"] = "max-age=31536000";
  }

  return headers;
}

/**
 * Wraps a Worker's default export so every response it produces carries
 * the headers above.
 *
 * Fills in rather than overwrites: if a route has deliberately set its
 * own CSP or cache policy, that decision wins. The point of this is the
 * responses that set nothing, which is currently all of them.
 */
export function withSecurityHeaders(worker) {
  return {
    ...worker,
    async fetch(request, env, ctx) {
      const response = await worker.fetch(request, env, ctx);

      /* A response body can only be read once, and some are immutable
         (anything from the asset handler), so copy rather than mutate.
         Status and statusText have to be carried across explicitly or a
         404 quietly becomes a 200. */
      const out = new Response(response.body, response);

      for (const [key, value] of Object.entries(baseHeaders(new URL(request.url)))) {
        if (!out.headers.has(key)) out.headers.set(key, value);
      }

      return out;
    }
  };
}
