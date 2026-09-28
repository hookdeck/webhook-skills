# WordPress.com Webhooks - Next.js Example

Minimal App Router example of receiving **WordPress.com** webhooks (the native
Settings → Webhooks feature).

> **These deliveries are UNSIGNED.** No HMAC, no signature header, no secret, no
> timestamp, no handshake — so there is nothing to verify. The body is a flat
> `application/x-www-form-urlencoded` key/value set whose only discriminator is
> the `hook` field. This is **not** WooCommerce (`X-WC-Webhook-Signature`) and
> **not** a WordPress.org plugin. See the skill's `references/verification.md`.

## What this example shows

- `app/webhooks/wordpress-com/route.ts` exporting **`POST`**.
- A **URL token** check (`?token=...` from `request.nextUrl.searchParams`) run
  before the body is touched, compared with `crypto.timingSafeEqual` behind a
  length guard. It **fails closed**: with `WORDPRESS_COM_WEBHOOK_TOKEN` unset
  every delivery gets a `500`.
- Parsing the form-encoded body with `new URLSearchParams(await request.text())`
  (`await request.formData()` works too), grouping bracket-encoded arrays such as
  `post_category[0]=1&post_category[1]=5`, with a defensive `application/json`
  fallback.
- Dispatching on the **`hook`** field over the three documented hooks —
  `publish_post`, `publish_page`, `comment_post` — with an unknown hook logged
  and still answered `200`.
- A dedupe key (`hook` + `ID` + `post_modified_gmt`, or `comment_ID`), because
  `publish_post` also fires on every edit of a published post and there is no
  delivery-id header.
- Re-fetching authoritative data from `public-api.wordpress.com` — the unsigned
  payload is only a hint.

## Prerequisites

- Node.js 18+
- A WordPress.com site where you are an **admin** ("Only admin-level users can
  add or manage webhooks.")

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Generate a token and put it in `.env.local` as
   `WORDPRESS_COM_WEBHOOK_TOKEN`:
   ```bash
   openssl rand -hex 32
   ```
   There is **no webhook signing secret to configure** — WordPress.com does not
   have one. Optionally set `WORDPRESS_COM_SITE` (e.g. `example.wordpress.com`)
   to enable the REST fetch-back.

4. Register the webhook at
   `https://<your-site>/wp-admin/options-general.php?page=webhooks` → **Add
   webhook**, choosing an action, the fields, and this URL **including the
   token**:
   ```
   https://your-app.example.com/webhooks/wordpress-com?token=<your token>
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Send a delivery by hand:

```bash
curl -X POST 'http://localhost:3000/webhooks/wordpress-com?token=YOUR_TOKEN' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'hook=publish_post' \
  --data-urlencode 'ID=42' \
  --data-urlencode 'post_title=Hello world' \
  --data-urlencode 'post_status=publish'
```

The docs describe **no test/ping button** for Settings → Webhooks, so the real-world test
is to publish (or edit) a post, or leave a comment.

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 wordpress-com --path /webhooks/wordpress-com
```

Paste the CLI's HTTPS URL (with `?token=...` appended) into the webhook's URL
field. Hookdeck's `WORDPRESS_COM` source type runs **no** signature check —
there is nothing to check — but the request Hookdeck forwards to your app
carries `x-hookdeck-signature` (HMAC-SHA256, base64, over the raw body), which is
**Hookdeck's** signature and worth verifying in production.

## Notes

- Route Handlers do not body-parse for you, so nothing strips the form encoding —
  read `request.text()` (or `request.formData()`) yourself.
- Do **not** call `request.json()`: the body is form-encoded and it will throw.
- Keep the handler short. No retry policy is documented, so push slow work onto a
  queue (or `after()`) and acknowledge immediately.

## Endpoint

- `POST /webhooks/wordpress-com` — `200` on success (including for an unknown
  `hook`), `400` when the body carries no `hook` field or cannot be parsed,
  `401` when the URL token is missing or wrong, `500` when
  `WORDPRESS_COM_WEBHOOK_TOKEN` is unset (fail closed).
