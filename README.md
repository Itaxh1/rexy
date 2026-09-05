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
