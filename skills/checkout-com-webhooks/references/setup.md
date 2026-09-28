# Setting Up Checkout.com Webhooks

Docs: [Receive webhooks](https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks) ·
[Configure your webhook server → Validate the payload](https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks/configure-your-webhook-server#Validate_the_payload)

## Prerequisites

- A Checkout.com account on the current ("NAS" / Workflows) platform, with
  access to **Developers → Webhooks** in the Dashboard
- Your application's webhook endpoint URL. The Dashboard accepts `https://` or
  `http://`; use **HTTPS** in production
  (for local development, see [Local development](#local-development))

## Option A — Dashboard (recommended)

1. Sign in to the [Checkout.com Dashboard](https://dashboard.checkout.com).
2. Go to **Developers → Webhooks**.
3. Select **Create configuration** (a webhook "configuration" is a workflow with
   a webhook action behind the scenes).
4. Enter your **Endpoint URL**, e.g.
   `https://your-app.example.com/webhooks/checkout-com`.
5. **Generate the signature key.** Checkout.com's own wording: *"To generate a
   signature key to hash the webhook payload as an HMAC, select Generate key"*.
   Copy it immediately and store it as `CHECKOUT_WEBHOOK_SIGNATURE_KEY`.
6. *(Optional)* **Generate an authorization header key.** Checkout.com: *"To
   generate an authorization header key to include in your webhook headers to
   validate that Checkout.com sent the webhook, select Generate key"*. Store it
   as `CHECKOUT_WEBHOOK_AUTHORIZATION_KEY`. It arrives **verbatim** in the
   `Authorization` header — Checkout.com adds no `Bearer ` prefix.
7. *(Optional)* **Add new header** lets you attach arbitrary extra static
   headers (a tenant id, a routing tag). They are not part of verification.
8. **Select the events** to receive. Subscribe only to what you handle — see
   [overview.md](overview.md) for the common ones and the
   [Event types](https://www.checkout.com/docs/developer-resources/event-notifications/event-types)
   page for all 140+.
9. **Select the entities or processing channels** you want to receive
   webhooks for.
10. Select **Create webhook**. Checkout.com starts sending subscribed events
    immediately.

Both keys are **optional and independent**. You can configure neither, either,
or both. Configure at least the **signature key** — it is the only mechanism
that proves the body wasn't tampered with.

## Option B — Workflows API

A webhook is a workflow action, so you can create one directly:

```bash
curl -X POST "https://$CHECKOUT_PREFIX.api.checkout.com/workflows" \
  -H "Authorization: Bearer $CHECKOUT_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production webhook",
    "conditions": [
      {
        "type": "event",
        "events": {
          "gateway": [
            "payment_approved",
            "payment_captured",
            "payment_declined",
            "payment_refunded"
          ],
          "dispute": [
            "dispute_received",
            "dispute_evidence_required"
          ]
        }
      }
    ],
    "actions": [
      {
        "type": "webhook",
        "url": "https://your-app.example.com/webhooks/checkout-com",
        "headers": {
          "Authorization": "your-authorization-header-key"
        },
        "signature": {
          "method": "HMACSHA256",
          "key": "your-signature-key"
        }
      }
    ]
  }'
```

- `actions[].signature.key` → `CHECKOUT_WEBHOOK_SIGNATURE_KEY`
- `actions[].headers.Authorization` → `CHECKOUT_WEBHOOK_AUTHORIZATION_KEY`
- `signature.method` is `"HMACSHA256"` (as in Checkout.com's official SDK tests).

`conditions[].events` is an **object keyed by event source** (`gateway`,
`dispute`, …), each holding an array of event types — the shape used in
Checkout.com's own request example. The base URL's `{prefix}` is unique to your
account: `https://{prefix}.api.checkout.com/workflows` for live,
`https://{prefix}.api.sandbox.checkout.com/workflows` for sandbox (see
Checkout.com's *API endpoints* page for how to find it).

## The Signature Key Is Not Your Secret API Key

On the current platform, the **signature key** is the value you generate (or
choose) for the webhook action. It is **not** your `sk_...` secret API key, and
not your public key.

The one exception is by choice, not by default: an integrator can *set* the
signature key to their secret key. Checkout.com's own WooCommerce plugin does
exactly that when it registers its workflow, which is why some community
examples show `hash_hmac('sha256', $raw, $secret_key)`. If that's how your
workflow was created, then for you the two happen to be the same string.

The key is used **as a UTF-8 string, as-is** — the SDK's own test key looks like
`8V8x0dLK%AyD*DNS8JJr`. Never base64-decode or hex-decode it before hashing.

## Sandbox vs Live

Sandbox and live are **separate environments with separate Dashboards, separate
API keys and separate webhook configurations**. Creating a webhook in sandbox
does not create it in live.

- Sandbox Dashboard: `https://dashboard.sandbox.checkout.com` / API `{prefix}.api.sandbox.checkout.com`
- Live Dashboard: `https://dashboard.checkout.com` / API `{prefix}.api.checkout.com`

Configure and test in sandbox first, then repeat the setup in live and store the
**live** signature key separately. Trigger real events in sandbox by creating
test payments — Checkout.com has **no "send test webhook" button that sends a
special envelope**, and no handshake/challenge request. Every delivery you see
is an ordinary signed event.

## Verify Your Endpoint Is Working

1. Start your server (see the [examples](../examples/)).
2. Expose it (see below).
3. Create a sandbox payment that triggers a subscribed event, e.g. an
   authorization → `payment_approved`, then a capture → `payment_captured`.
4. Your logs should show a verified event with an `evt_…` id.

If verification fails, work through
[verification.md → Debugging verification failures](verification.md#debugging-verification-failures).

## Local Development

```bash
npx hookdeck-cli listen 3000 checkout-com --path /webhooks/checkout-com
```

For the FastAPI example, use port `8000`:

```bash
npx hookdeck-cli listen 8000 checkout-com --path /webhooks/checkout-com
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request (including the raw
body and the `Cko-Signature` header, which is exactly what you need when
debugging). Paste the printed URL into the webhook's **Endpoint URL** in the
Checkout.com Dashboard.

## Retries and the Response Budget

Once configured, Checkout.com expects a **2xx within 10 seconds**. A non-2xx or
a timeout triggers up to **8 retries** — 5 min, 10 min, 15 min, 30 min, 1 hour,
4 hours, 12 hours, 12 hours after each previous attempt. Acknowledge fast and do
the real work asynchronously.

## Source IP Restrictions

Checkout.com documents the IPs it sends webhooks from
([Developer resources → IP addresses](https://www.checkout.com/docs/developer-resources/ip-addresses)),
but warns that *"the provided IP address lists are subject to change"* and that
*"you may experience access issues if you do not keep your allowlists
updated."* If you need network-level filtering, read that page at deploy time
and re-check it periodically — **do not** copy an IP list out of a skill or a
blog post. The HMAC, not an allowlist, is what proves a delivery is genuine.
