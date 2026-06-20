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

HTTPS is terminated by **stunnel** in front of Verdaccio (Verdaccio 6 native
HTTPS does not work reliably). Layout:

```
client → HTTPS :4873 → stunnel → HTTP 127.0.0.1:4874 → verdaccio
```

- Verdaccio config: `/opt/verdaccio/config.yaml` — listens on `127.0.0.1:4874`
- stunnel config: `/etc/stunnel/verdaccio.conf` — accepts `:4873`, connects to `127.0.0.1:4874`
- TLS cert: Let's Encrypt at `/etc/letsencrypt/live/registry.dfactories.ir/`
- DNS: A record `registry → 202.155.8.110` (Parspack, CDN/proxy disabled)
- Port 443 is occupied by x-ui (REALITY), so the registry stays on `:4873`

Restart after changes:

```bash
systemctl restart verdaccio
systemctl restart stunnel4
```

Renew certs (stunnel must be restarted to pick up new cert):

```bash
certbot renew
systemctl restart stunnel4
```
