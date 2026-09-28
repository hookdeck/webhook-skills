# Setting Up WordPress.com Webhooks

## Prerequisites

- A WordPress.com site. **"Only admin-level users can add or manage webhooks."**
- A publicly reachable HTTPS endpoint (or a Hookdeck / `hookdeck-cli` URL while
  developing).
- A long random token you generate yourself — WordPress.com provides no secret.

## Where the Feature Lives

Verbatim from the docs: *"You can find this feature by adding
`/wp-admin/options-general.php?page=webhooks` to the end of your site's URL
(e.g. `example.wordpress.com/wp-admin/options-general.php?page=webhooks`)."*

It is the **Settings → Webhooks** screen. The docs describe **only this admin
UI** for adding, editing, deleting, activating or deactivating a webhook (each
webhook row carries those controls) — no API for managing webhooks is
documented.

> These settings do **not** apply to plugin-enabled sites: *"The Webhook settings
> mentioned on this page do not apply to plugin-enabled sites. Various plugins
> offer similar functionality."*

## Step 1: Generate Your URL Token

WordPress.com has no signing secret, so the practical protection is an
unguessable URL. Generate a token and keep it in your app's environment:

```bash
openssl rand -hex 32
```

```bash
# .env
WORDPRESS_COM_WEBHOOK_TOKEN=3f9c...   # the value you just generated
```

The handler compares the `token` query param against this value in constant time
and **fails closed** (HTTP 500) when the variable is unset — an unconfigured
endpoint must never accept everything.

## Step 2: Add the Webhook

1. Visit `https://<your-site>/wp-admin/options-general.php?page=webhooks`.
2. Click **Add webhook**.
3. Choose the **action**. There are exactly three:
   - `publish_post` — a post is published, or edited while published
   - `publish_page` — a page is published, or edited while published
   - `comment_post` — a comment has just been saved
4. Choose the **fields** to send. Recommended minimums:
   - `publish_post` / `publish_page`: `ID`, `post_title`, `post_status`,
     `post_type`, `post_url`, `post_modified_gmt` (the last one makes deduping
     possible)
   - `comment_post`: `comment_ID`, `comment_post_ID`, `comment_approved`,
     `comment_author`, `comment_content`
   - **Skip `post_password`, `comment_author_email` and `comment_author_IP`**
     unless you genuinely need them — they are sensitive, they travel to your
     endpoint, and they will sit in your logs.
5. Enter the **URL**, including your token:

   ```
   https://your-app.example.com/webhooks/wordpress-com?token=3f9c...
   ```

   The docs neither mention nor forbid a query string on the webhook URL; this is
   the standard pattern for unsigned senders, not a WordPress.com feature.
6. Save. Repeat for each action you need — one webhook per action.

`hook` is always included in the POST body, on top of whatever fields you
selected, so your handler can dispatch on it.

## Step 3: Receive It

The delivery is an HTTP `POST` with a flat
`application/x-www-form-urlencoded` body:

```
hook=publish_post&ID=42&post_title=Hello+world&post_status=publish
```

Parse it accordingly:

| Framework | Parse with |
|---|---|
| Express | `express.urlencoded({ extended: true })` (plus `express.json()` for the defensive JSON path) |
| Next.js (App Router) | `await request.formData()` or `new URLSearchParams(await request.text())` |
| FastAPI | `await request.form()` — requires `python-multipart` |

All values arrive as strings, and only the ticked fields are present. See
[examples/express/](../examples/express/),
[examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/).

## Step 4: Verify Nothing, Re-fetch Instead

There is no signature (see [verification.md](verification.md)), so treat the
payload as an untrusted hint and re-fetch anything consequential:

```bash
curl https://public-api.wordpress.com/rest/v1.1/sites/example.wordpress.com/posts/42
```

Set `WORDPRESS_COM_SITE=example.wordpress.com` if you want the examples' fetch-back
helper to run.

## Testing

The docs describe **no test/ping button and no delivery log** for Settings →
Webhooks. To exercise your handler:

- **Do it for real**: publish a draft post, or edit a published one (both fire
  `publish_post`); leave a comment (fires `comment_post`).
- **Send it by hand**:

  ```bash
  curl -X POST 'http://localhost:3000/webhooks/wordpress-com?token=YOUR_TOKEN' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'hook=publish_post' \
    --data-urlencode 'ID=42' \
    --data-urlencode 'post_title=Hello world' \
    --data-urlencode 'post_url=https://example.wordpress.com/2026/09/28/hello-world/'
  ```

- **Expose localhost** with the Hookdeck CLI and inspect every request:

  ```bash
  npx hookdeck-cli listen 3000 wordpress-com --path /webhooks/wordpress-com
  ```

  (Use port `8000` for the FastAPI example.) No account required — the CLI
  creates a guest account on first run and gives you a public HTTPS URL plus a
  web UI. Put the CLI's URL (with `?token=...`) into the webhook's URL field.

## Hookdeck Source Configuration

Hookdeck's source type for this provider is **`WORDPRESS_COM`** (slug
`wordpress-com`). It is schema-only with `http_method_managed_post` and **no
verification controller** — because there is nothing to verify. Consequences:

- The Hookdeck Source URL itself is the secret endpoint. Keep your `?token=`
  on it anyway: Hookdeck preserves the original query string when it forwards,
  **unless the Destination URL has its own query string**, in which case the
  Destination's replaces it — so don't put a query string on the Destination
  URL (or put the token there instead).
- `x-hookdeck-signature` is only added when **Hookdeck Signature** auth is set on
  the Destination.
- Hookdeck signs what it forwards to your app with `x-hookdeck-signature`
  (HMAC-SHA256, base64, over the raw body). That is the one HMAC worth
  implementing here, and it is **Hookdeck's** signature, not WordPress.com's —
  see [verification.md](verification.md).
- Because WordPress.com has no documented retries, Hookdeck's retries and replay
  are the only safety net you get for a handler that was down.

## Deactivating

Each webhook row in Settings → Webhooks can be edited, deleted, activated or
deactivated. Deactivate rather than delete while debugging — you would otherwise
have to re-tick the whole field list.
