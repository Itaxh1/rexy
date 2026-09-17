# Rexy

Rexy is the authenticated React dashboard for Claude Code and Codex activity
collected by Linus. It shows annual activity, a selected-day event ribbon,
session TLDRs, token totals, tool outcomes, and deterministic intervention flags.

## Split day loading

The production dashboard uses `/v1/day/ribbon` for real per-session rows on the
local-midnight axis, `/v1/day/extras` for saved TLDRs and token usage, and paginated
`/v1/day/story` for exchanges. These requests paint independently. Prompt/tool
previews use `/v1/events/{id}` only after focus/hover or explicit expansion.
The synthetic session-ribbon generator is test-only and is not imported into the
production application. Explicit demo mode still uses the bundled synthetic fixture.

The bounded **memory-only** cache uses per-day/per-tier revisions, preserves saved
TLDRs while refresh is pending, and rejects observed pre-delete purge tokens.
It is cleared when the account/year changes. IndexedDB persistence, cross-tab
purge barriers, non-blocking cached startup and prefetch remain separate work;
this release does not promise instantaneous refreshes or uncached days.

## Profile and Projects

`?view=profile` and `?view=projects` use real authenticated backend snapshots;
only `?demo=1` uses synthetic examples. These two pages have a separate
account-scoped IndexedDB cache with a 24-hour TTL, cross-tab deletion/logout
barriers and background refresh. They skip the global backend readiness gate
so saved content can remain visible while Render is unavailable. This does
not add persisted caching to the Activity page described above.

Profile displays recorded counts and marks unsupported metrics as untracked.
Projects lists recorded folder-label groups. Generate/Regenerate explicitly
queue Grok; opening or refreshing a page never generates files. Saved
PROJECT.md and SKILL.md support Preview, Source, Copy and Download. Source
coverage is shown; review generated advice against the current repository.

Private transcript-derived design fixtures are retained only in the ignored
`.local-fixtures/` directory; they are not shipped in the public demo build.

The ribbon retains unknown durations as unknown, displays failures/interruption
markers from recorded status, and exposes off-axis events through session inspection.
Activity time is an estimate formed by unioning short within-session intervals.
Tool percentiles use linear interpolation. Automated semantic/slop findings remain
unsupported in the backend; existing text-based correction hints are labelled inferred.

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
