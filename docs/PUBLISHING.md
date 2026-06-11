# Publishing Packages

**Registry:** `https://registry.dfactories.ir:4873`
**Version pattern:** `<base>-dfactories.<n>` — e.g. `2.1.2-dfactories.8`

---

## Setup

Add to `~/.npmrc`:

```
//registry.dfactories.ir:4873/:_authToken=<TOKEN>
```

If you don't have a token:

```bash
npm adduser --registry https://registry.dfactories.ir:4873
```

---

## Find changed packages

```bash
git diff --name-only HEAD~<n> HEAD | grep "^packages/" | cut -d'/' -f1,2 | sort -u
```

---

## Publish a package

```bash
# 1. Bump version in packages/<name>/package.json
#    "version": "2.1.2-dfactories.<n>"

# 2. Build
cd packages/<name>
bun run build

# 3. Publish
npm publish --registry https://registry.dfactories.ir:4873 --tag dfactories
```

> Large packages (e.g. vendor) may need a higher timeout:
> `--fetch-timeout 300000`

---

## Verify

```bash
npm view @mercurjs/<name> versions --registry https://registry.dfactories.ir:4873
```

---

## Install in a project

Add to project `.npmrc`:

```
@mercurjs:registry=https://registry.dfactories.ir:4873
//registry.dfactories.ir:4873/:_authToken=<TOKEN>
```

```bash
npm install @mercurjs/<name>@2.1.2-dfactories.<n>
# or by tag:
npm install @mercurjs/<name>@dfactories
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ENEEDAUTH` | Check `~/.npmrc` has the auth token for `registry.dfactories.ir:4873` |
| `You must specify a tag` | Add `--tag dfactories` to the publish command |
| `403 Forbidden` | Run `npm adduser --registry https://registry.dfactories.ir:4873` to refresh token |
| `FETCH_ERROR` / network timeout | Add `--fetch-timeout 300000` for large packages |
| Empty `dist/` | Run `bun run build` before publishing |

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
