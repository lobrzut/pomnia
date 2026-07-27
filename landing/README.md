# Pomnia landing page

Static site for [pomnia.ai](https://pomnia.ai). No build step — plain HTML.

- **Entry point:** `index.html`
- **Previous version:** `index-classic.html` — the earlier waitlist/beta page, kept
  for reference. Not linked from anywhere; do not deploy it as `index.html`.
- **Deploy:** see [`docs/LANDING-DEPLOY.md`](../docs/LANDING-DEPLOY.md)

## Waitlist

The form posts straight to MailerLite (account `2536223`, group *Pomnia launch*)
via a hidden iframe, so the page needs no third-party JavaScript. Double opt-in is
enabled, which is what the success message promises.

Keep reCAPTCHA **off** on that MailerLite form — it would make the endpoint reject
posts from this custom markup.

## Ground rules for this page

- **No external requests.** The only outbound links are to GitHub. No CDN, no web
  fonts, no analytics, no tracking pixel. A page selling "no cloud required" has to
  survive someone reading its source.
- **Claims must match the product.** The copy says "no mandatory cloud" and
  "hardware you control" rather than absolutes, because the app has a local/server
  switch and distillation can use a cloud API key.
- `prefers-reduced-motion` disables the background animation entirely.
