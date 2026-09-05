# Legacy URL redirect

Deploy the `legacy-redirect/` directory to the `rexy-legacy-redirect` Pages
project. Its external custom domain is `rexy.tryoz.dev`.

The DNS CNAME for `rexy.tryoz.dev` now targets
`rexy-legacy-redirect.pages.dev` (DNS only, TTL 300). Pages redirects all paths
to `https://rexy.baememory.com`, retaining the path and query string.

Rollback: restore that exact CNAME to
`6094ae98-5e24-44de-9331-9bb1c0b8032d.cfargotunnel.com`, proxied with automatic
TTL, then restart the old frontend origin and its tunnel. The API tunnel is a
separate record and must not be changed as part of frontend rollback.
