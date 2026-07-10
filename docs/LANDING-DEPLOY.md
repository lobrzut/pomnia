# Deploy landing to pomnia.ai

Static site lives in `landing/` — HTML files, no build step.

Pages:

- `index.html` — marketing + waitlist
- `cursor-mcp.html` — **Podłącz Cursor** generator (URL + token → full 3-server `mcp.json`; works without Pomnia desktop / Mac DMG)

## Prerequisites

- Domain **pomnia.ai** registered (done 2026-07-07)
- DNS managed at your registrar or Cloudflare
- Optional: Formspree account for waitlist emails (replace `YOUR_FORM_ID` in `landing/index.html`)

---

## Option A — Cloudflare Pages (recommended)

1. Push `landing/` to GitHub (this repo or a public mirror of only `landing/`).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → Connect Git.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `landing`
4. Deploy. Note the `*.pages.dev` preview URL.
5. **Custom domain:** Pages project → **Custom domains** → Add `pomnia.ai` and `www.pomnia.ai`.
6. Cloudflare will auto-provision SSL and suggest DNS records.

### DNS at Cloudflare (if domain uses Cloudflare nameservers)

| Type  | Name | Content              |
|-------|------|----------------------|
| CNAME | `@`  | `<project>.pages.dev` (or use CNAME flattening) |
| CNAME | `www`| `<project>.pages.dev` |

If apex `@` CNAME is not supported at your DNS host, use Cloudflare's **CNAME flattening** or redirect `www` → apex.

---

## Option B — nginx on VPS

```nginx
server {
    listen 443 ssl http2;
    server_name pomnia.ai www.pomnia.ai;

    ssl_certificate     /etc/letsencrypt/live/pomnia.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pomnia.ai/privkey.pem;

    root /var/www/pomnia;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name pomnia.ai www.pomnia.ai;
    return 301 https://pomnia.ai$request_uri;
}
```

Deploy files:

```bash
rsync -avz landing/ user@your-server:/var/www/pomnia/
sudo certbot --nginx -d pomnia.ai -d www.pomnia.ai
```

---

## Option C — GitHub Pages (private repo limitation)

GitHub Pages on a **private** repo requires GitHub Pro. If the repo stays private, prefer Cloudflare Pages or nginx.

If you publish a public `pomnia-landing` repo with only `index.html`:

1. Repo → Settings → Pages → Source: `main` / root
2. CNAME file containing `pomnia.ai`
3. DNS: `CNAME @` or `A` records to GitHub Pages IPs (see GitHub docs)

---

## Waitlist backend

| Method | Setup |
|--------|--------|
| **Formspree** | Create form at formspree.io → replace `YOUR_FORM_ID` in `landing/index.html` |
| **mailto fallback** | Works out of the box; set up `waitlist@pomnia.ai` forwarding at your mail host |
| **Later** | Cloudflare Worker + KV, or Airtable/Notion API |

---

## Verify after deploy

- [ ] `https://pomnia.ai` loads with SSL
- [ ] PL/EN toggle persists (localStorage)
- [ ] Waitlist form submits (Formspree or mailto)
- [ ] Mobile layout OK
- [ ] `www` redirects to apex (or vice versa — pick one canonical)

---

## Updating the site

Edit `landing/index.html`, commit, push. Cloudflare Pages redeploys automatically on push to the connected branch.
