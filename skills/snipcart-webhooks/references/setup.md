# Setting Up Snipcart Webhooks

## Prerequisites

- A Snipcart account with dashboard access (`app.snipcart.com`)
- A publicly reachable HTTPS endpoint (or a tunnel — see "Local development")

## Step 1: Get Your SECRET API Key

Snipcart webhooks are not signed. Authenticity is proved by calling Snipcart's
API with your **secret API key**, so the key is a hard requirement for a secure
receiver.

1. In the Snipcart merchant dashboard, open your account's credentials / API
   keys page ("create a secret API key from your merchant dashboard" — the
   docs don't spell out the menu path; the public key lives at
   `app.snipcart.com/dashboard/account/credentials`)
2. Create or copy a **SECRET** API key (not the public key used in the front-end snippet)
3. Store it server-side only:

```bash
SNIPCART_SECRET_API_KEY=your_secret_api_key
```

> **Never ship the secret key to the browser.** The public API key in your
> `<script>` snippet is a different value; Snipcart's REST API (which
> `requestvalidation` belongs to) authenticates with a secret key.

### Test mode vs Live mode

> "Keys are created in **Test** or **Live** mode, and each key only grants
> access to the data for its own mode. A key created in Test mode cannot read
> your Live data, and vice versa."

The webhook envelope tells you which mode a delivery came from via the
top-level `mode` field (`"Test"` or `"Live"`). The docs do not state this
explicitly for the `requestvalidation` endpoint, but it is therefore very likely
that a **Test-mode** webhook's token must be validated with a **Test-mode** key.
Configure the key that matches the mode you are receiving; if you process both,
keep both keys and select by `mode` after a successful validation — or run
separate endpoints per mode.

## Step 2: Configure the Webhook URL (async events)

1. Snipcart dashboard → **Store Configurations → Webhooks**
2. Enter your endpoint URL, e.g. `https://example.com/webhooks/snipcart`
3. Save

**Multiple endpoints:** enter several URLs separated by **semicolons**.

This URL receives the asynchronous events: `order.*` and `v3/subscription.*`.

## Step 3: Configure the Synchronous Webhooks (optional)

These have their **own** settings and are not sent to the general webhook URL:

| Webhook | Dashboard path |
|---------|----------------|
| `shippingrates.fetch` | **Store configurations → Shipping → Webhooks** |
| `taxes.calculate` | **Store configurations → Taxes → Providers → Webhooks** |

Snipcart consumes the **response body** of these two at checkout, so they must
point directly at your application — a store-and-forward gateway (Hookdeck
included) cannot return your destination's response to the client.

## Step 4: Respond Correctly

Your endpoint must respond with `Content-Type: application/json` and status
`200` ("Your designated endpoint must respond with data in Content-Type
application/json format and a status code 200"), so return a small JSON body
rather than an empty or `text/plain` 200.

```json
{ "received": true }
```

Return `400` for an unparsable body or a missing `eventName`, and `401` when
the request token fails validation.

## Step 5: Test the Integration

1. Switch the store to **Test mode** and place a test order — `order.completed`
   fires with `"mode": "Test"`.
2. Open **Store Configurations → Webhooks** in the dashboard: each request is
   logged with its full HTTP detail (headers, body, your response).
3. Use the **"Send this hook again"** button to re-send a request while
   developing. The docs say the token header is "added to each outbound
   request", so a resend should carry its own fresh token — this is not stated
   verbatim for resends, so if a resend fails validation, check the logged
   header value before assuming your code is wrong.

## Local Development

Expose your local server with the Hookdeck CLI — no account and no install
required:

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 snipcart --path /webhooks/snipcart

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 snipcart --path /webhooks/snipcart
```

Paste the printed URL into the dashboard webhook field.

> **Token lifetime caveat while tunnelling:** the request token is valid for one
> hour and the validation endpoint treats an already-validated token as unknown
> (404). Validate synchronously, on receipt — not from a worker queue that may
> sit longer — and validate each token exactly once.

## Using Hookdeck in Production

Hookdeck has a `SNIPCART` source type (recently added, so it may not yet
appear on [hookdeck.com/docs/sources](https://hookdeck.com/docs/sources)). Its
config takes a single secret API key — use the key for the same mode (Test or
Live) as the webhook — and performs the same `X-Snipcart-RequestToken`
validation at ingestion: `GET .../requestvalidation/{token}` with the key as the
Basic-auth username, a format check on the token, no redirects followed, and a
5-second timeout that fails closed.

When Hookdeck sits in front of your handler:

- **Do not re-validate the token at the destination.** Hookdeck has already
  validated it — if tokens are single-use (see
  [verification.md](verification.md#token-lifetime-and-one-time-use)) a second
  validation returns 404 — and on a Hookdeck retry more than an hour later it
  will have expired anyway.
- Verify the `x-hookdeck-signature` header at the destination instead — see
  [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway).
- Send only the asynchronous `order.*` / `v3/subscription.*` events through
  Hookdeck. Keep `shippingrates.fetch` and `taxes.calculate` pointed directly at
  your app.

## Related

- [overview.md](overview.md) — event list and payload shapes
- [verification.md](verification.md) — request-token validation in detail
