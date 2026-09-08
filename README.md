# Rexy

Rexy is the authenticated React dashboard for Claude Code and Codex activity
collected by Linus. It shows annual activity, a selected-day event ribbon,
session TLDRs, token totals, tool outcomes, and deterministic intervention flags.

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

`VITE_API_BASE` must point to the Rexy API backend. Supabase browser
configuration is fetched from the backend's public configuration endpoint.

On a normal page load, Rexy first checks the API's `/readyz` endpoint. A sleeping
free Render instance shows a theme-matched startup screen; API/database readiness
automatically opens the app. Checks are serial, time out after eight seconds per
request, and retry after three seconds. After two minutes the screen offers
manual retry instead of spinning forever. Offline clients resume on reconnect;
`?demo=1` skips the backend entirely. Readiness checks stop once the app opens,
and later refresh failures do not hide already loaded history.

Run validation with:

```sh
npm test
npm run build
npm audit --audit-level=high
```

## Cloudflare

Rexy is a static Vite SPA. Build it with the stable production API URL, then
deploy `dist` to Cloudflare:

```sh
npm run deploy
```

`wrangler.jsonc` publishes the SPA as a static-assets Worker and attaches the
custom domain `rexy.baememory.com`.

`redirect/` provides the `baememory.com` entry point, redirecting to the
canonical Rexy origin while preserving paths and queries:
`npx wrangler deploy --config redirect/wrangler.jsonc`.

`legacy-redirect/` is a separate, static Pages deployment for the previous
`rexy.tryoz.dev` address. It exists so the old URL can redirect without a
running local web server.

The committed `.env.production` contains only the public API URL. Vite loads
it for production builds; explicit process variables can override it. Workers
Static Assets supplies SPA fallback through `not_found_handling`. The bundled
demo fixture is synthetic and contains no local transcript data.
