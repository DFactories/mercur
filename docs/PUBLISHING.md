# Publishing Packages

**Registry:** `https://registry.dfactories.ir:4873`
**Version pattern:** `<base>-dfactories.<n>` — e.g. `2.1.2-dfactories.18`

Publishing is done by **CI on push**, not by hand. Do **not** run `npm publish`
from your laptop — the GitHub runner has a far better link to the VPS (the
~1.4 MB vendor tarball times out over the flaky local connection) and the
workflow already handles auth, build, and "skip if already published".

---

## How to publish (the only supported way)

1. **Bump** the `version` in each changed `packages/<name>/package.json` to the
   next `2.1.2-dfactories.<n>`:

   ```
   "version": "2.1.2-dfactories.<n>"
   ```

2. **Commit and push to a `dfactories/**` branch** (e.g. `dfactories/2.1.2`).
   The push is the trigger.

   ```bash
   git add -A
   git commit -m "feat(...): ..."
   git push origin dfactories/2.1.2
   ```

3. The Action `.github/workflows/dfactories-publish.yml`:
   - `bun install --frozen-lockfile`
   - `bun run build` (Turborepo)
   - for every non-private package with a `-dfactories.*` version **not already
     on the registry**, runs `npm publish --tag dfactories` from the runner.
   - Already-published versions are **skipped**, so re-pushing is safe and you
     only ever bump the packages you actually changed.

   You can also trigger it manually via **workflow_dispatch** (Actions tab →
   "Publish to Dfactories registry" → Run workflow).

4. Packages are usually installable **~10 minutes** after the push.

---

## Find changed packages

```bash
git diff --name-only HEAD~<n> HEAD | grep "^packages/" | cut -d'/' -f1,2 | sort -u
```

---

## Verify

```bash
npm view @mercurjs/<name>@<ver> version --registry https://registry.dfactories.ir:4873
# or list all:
npm view @mercurjs/<name> versions --registry https://registry.dfactories.ir:4873
```

---

## Install in a project

Add to project `.npmrc`:

```
@mercurjs:registry=https://registry.dfactories.ir:4873/
//registry.dfactories.ir:4873/:_authToken=<TOKEN>
```

```bash
npm install @mercurjs/<name>@2.1.2-dfactories.<n>
# or by tag:
npm install @mercurjs/<name>@dfactories
```

---

## CI requirements / troubleshooting

| Thing | Detail |
|-------|--------|
| Repo secret | `VERDACCIO_TOKEN` = the `_authToken` for the `dfactories` user |
| Trigger | push to `dfactories/**`, or manual `workflow_dispatch` |
| "skipped (already published)" | expected — bump the version to republish |
| Nothing published | check the version is a `-dfactories.*` prerelease and was actually bumped |
| Auth 403/ENEEDAUTH in CI | refresh `VERDACCIO_TOKEN` repo secret |

---

## Server notes (registry.dfactories.ir)

The registry moved to a new VPS on **2026-08-19** (`202.155.8.110` →
`212.115.103.26`). Storage, the `dfactories` htpasswd user and verdaccio's
token-signing secret all came across, so **existing tokens keep working** — the
`VERDACCIO_TOKEN` repo secret did not need rotating.

HTTPS is terminated by **nginx** in front of Verdaccio (Verdaccio 6 native HTTPS
does not work reliably). Layout:

```
client → HTTPS :4873 → nginx → HTTP 127.0.0.1:4874 → verdaccio
```

- Verdaccio config: `/opt/verdaccio/config.yaml` — listens on `127.0.0.1:4874`
- nginx site: `/etc/nginx/sites-available/verdaccio` — accepts `:4873`, proxies to `127.0.0.1:4874`
- TLS cert: Let's Encrypt at `/etc/letsencrypt/live/registry.dfactories.ir/`
- DNS: A record `registry → 212.115.103.26` (Parspack, CDN/proxy disabled)
- Port 443 is occupied by x-ui (REALITY), so the registry stays on `:4873`
- nginx deliberately does **not** listen on `:80` — certbot renews this cert with
  the `standalone` authenticator, which needs to bind `:80` itself.

Restart after changes:

```bash
systemctl restart verdaccio
systemctl reload nginx
```

Renewal is automatic (`certbot.timer`); the deploy hook
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` reloads nginx when the
cert rolls. Verify with `certbot renew --dry-run`.

### Why nginx and not stunnel

The old server terminated TLS with stunnel, which had two faults worth not
repeating:

1. `stunnel4.service` sat in `failed` state — `:4873` was held only by an
   orphaned process from the last successful boot, so the next restart would
   have dropped the registry with no way back up via systemd.
2. Its cert path was pinned to `/etc/letsencrypt/archive/…1.pem`, the *first*
   issued cert. certbot had already renewed to `…2.pem`, but stunnel never saw
   it, so TLS was set to break on **2026-09-09** with a valid cert sitting
   unused on disk.

nginx follows the `live/` symlinks, so renewals apply on reload.
