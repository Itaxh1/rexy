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
