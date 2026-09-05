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

`VITE_API_BASE` must point to the Rexy FastAPI backend. Supabase browser
configuration is fetched from the backend's public configuration endpoint.

Run validation with:

```sh
npm test
npm run build
npm audit --audit-level=high
```

## Cloudflare Pages

Rexy is a static Vite SPA. Build it with the public HTTPS URL of the Render API,
then direct-upload `dist` to the `rexy` Pages project:

```sh
VITE_API_BASE=https://rexy-api.tryoz.dev npm run build
npx wrangler pages deploy dist --project-name=rexy
```

Cloudflare Pages supplies SPA fallback when the build does not contain a
top-level `404.html`. The bundled demo fixture is synthetic and contains no
local transcript data.
