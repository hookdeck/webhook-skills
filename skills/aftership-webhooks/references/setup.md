# Setting Up AfterShip Webhooks

## Prerequisites

- An AfterShip account for the product you want events from (Tracking, Shipping,
  Returns, or Warranty) with admin access to its settings
- A publicly reachable HTTPS endpoint

> **Each AfterShip product has its own webhook secret.** They are configured in different
> admins and are not interchangeable. Register **one endpoint per product** (or one
> Hookdeck source per product) so each handler has exactly one secret to check.

## AfterShip Tracking

### Register your endpoint

1. Sign in to **admin.aftership.com**.
2. Go to **Settings → Webhooks**.
3. Add your webhook URL.
   - The URL's **port must be 80, 443 or 8080**. Other ports are rejected.
   - Up to **10** webhook URLs per organization.
4. Pick the **webhook version** for this URL (`YYYY-MM`, e.g. `2026-07`). The version is
   sent back on every delivery in the `as-webhook-version` header and is independent of
   the API version. Payload fields differ between versions — `2026-01`, for example,
   renamed `checkpoint.zip` to `checkpoint.postal_code`.
5. Save.

### Get your signing secret

The **webhook secret of your account** is on the same **Settings → Webhooks** page. Copy
it into `AFTERSHIP_WEBHOOK_SECRET`. It is used verbatim as UTF-8 bytes — do not
base64-decode it and do not strip any prefix.

### Test it

Use the **Send test webhook** button in the admin. It sends a normal delivery (not a
challenge or handshake) and expects a `2xx`.

### Optional extra auth on Tracking webhooks

Tracking webhooks can additionally carry authentication *beyond* the HMAC signature. The
signature remains the primary scheme; treat these as extras:

- **Custom headers** — up to **5 per webhook URL**. Use them for HTTP Basic auth, a bearer
  token, or a shared secret header. Configure the header names and values in the admin.
- **OAuth 2.0 client credentials** — supply a Token URL, `client_id` and `client_secret`
  (and optionally a `scope`). AfterShip calls your Token URL with
  `grant_type=client_credentials`, then sends the returned access token in the
  `Authorization` header on each delivery.

Verify the HMAC signature regardless of which of these you enable.

## AfterShip Shipping (formerly Postmen)

1. Sign in to **admin.postmen.com**.
2. Go to **Settings → Webhooks**.
3. Add your webhook URL and copy the **webhook secret** into `AFTERSHIP_WEBHOOK_SECRET`
   for that endpoint.

Shipping deliveries carry the signature in `am-webhook-signature`, and the value is
prefixed: `hmac-sha256=<base64 digest>`.

Shipping webhooks report the completion of async API calls — `calculate_rates`,
`create_a_label`, `cancel_a_label`, `manifest_a_label`. Label file URLs are hosted on
`postmen.com`.

## AfterShip Returns

1. Open the **AfterShip Returns** admin and go to its webhook settings page.
2. Add your webhook URL and subscribe to the events you need.
3. Copy the **webhook secret** into `AFTERSHIP_WEBHOOK_SECRET` for that endpoint.

Returns deliveries carry the signature in `as-signature-hmac-sha256` as a bare base64
digest, and the payload version in the `as-webhook-version` header.

> **Legacy Returns organizations.** Organizations created **before Oct 25, 2022** receive
> the signature in `am-webhook-signature` with the value in the form
> `hmac-sha256={signature}` — the same shape as Shipping. The handler in the examples
> accepts both, so no configuration is required.

The Returns docs also note explicitly that "the header and format are not the same as our
AfterShip product's webhooks" — i.e. Returns does *not* use `aftership-hmac-sha256`.

## AfterShip Warranty

Configured like Returns: set the webhook URL in the Warranty settings, copy its own
secret, and expect `as-signature-hmac-sha256` (bare base64). The payload envelope differs
from Returns — see [overview.md](overview.md#warranty-events).

## Environment Variables

```bash
# The webhook secret for the ONE product this endpoint receives.
AFTERSHIP_WEBHOOK_SECRET=your_webhook_secret
```

If you must receive more than one product on a single deployment, give each route its own
variable (`AFTERSHIP_TRACKING_WEBHOOK_SECRET`, `AFTERSHIP_RETURNS_WEBHOOK_SECRET`, …) and
mount one route per product.

## Local Development

Use the Hookdeck CLI to get a public HTTPS URL that forwards to localhost — no account and
no install required:

```bash
npx hookdeck-cli listen 3000 aftership --path /webhooks/aftership
```

Use `8000` instead of `3000` for the FastAPI example. Paste the printed HTTPS URL into the
AfterShip admin as your webhook URL (it satisfies Tracking's port 443 requirement), then
press **Send test webhook**.

## Delivery Expectations

- Respond `2xx` as fast as you can; do slow work asynchronously.
- A non-`2xx` triggers up to **14 retries** with `2^retry × 30s` backoff (30s, 60s,
  120s … 122,880s) — about **68 hours** of retrying.
- Deliveries are at-least-once. De-duplicate on `event_id` (Tracking) or `id`
  (Returns / Warranty).

## Verifying Deliveries

See [verification.md](verification.md) for the signature algorithm, header names, and the
most common causes of verification failures.
