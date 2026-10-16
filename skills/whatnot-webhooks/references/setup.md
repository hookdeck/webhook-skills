# Setting Up Whatnot Webhooks

## Prerequisites

- A **Whatnot Seller API app** (you'll need its **App ID**). See
  [Getting Started](https://developers.whatnot.com/docs/getting-started/introduction)
  on the developer site.
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck
  CLI (below).
- The `read_customers` scope if you need `shipping_address`, `tracking_info`
  or `label_url` in payloads.

## Subscribing to Topics

During the development preview there's **no dashboard or API** for creating
webhook subscriptions. You request them from Whatnot by email. The address is
on the [overview page](https://developers.whatnot.com/docs/webhooks/overview#creating-a-webhook)
(it's obfuscated in the page source, so open the page in a browser).

Include:

1. Your **App ID**
2. The **URL** that will receive the POST requests
3. The **topic** (or topics) to subscribe to, e.g. `order/created`

See [overview.md](overview.md#topics-and-payloads) for the full topic list.

## Getting the Webhook Secret

Whatnot's docs say the webhook secret key "will be provided to you by a
Whatnot representative". There's nowhere in a dashboard to copy it from, so
ask for it when you request your subscription, and store it as:

```bash
WHATNOT_WEBHOOK_SECRET=your_whatnot_webhook_secret
```

Use it exactly as given, as a UTF-8 string HMAC key. Don't hex- or
base64-decode it.

## Local Development

```bash
npx hookdeck-cli listen 3000 whatnot --path /webhooks/whatnot
```

The CLI prints a public HTTPS URL that forwards to
`http://localhost:3000/webhooks/whatnot`. Give that URL to Whatnot as your
webhook URL. No Hookdeck account is required; the CLI creates a guest account
on first run and gives you a web UI showing each request's raw body and
headers.

Because subscriptions go through Whatnot staff, changing your URL isn't
instant. A stable Hookdeck URL that you point at different local or deployed
destinations saves re-requesting the subscription each time.

## Using a Hookdeck Source

Hookdeck has a `WHATNOT` source type. Configure it with your webhook secret
and Hookdeck verifies `X-Whatnot-Webhook-Signature` (HMAC-SHA256, hex, raw
body) before forwarding. You can then also verify in your own handler with
the same secret, as the examples here do.

## Checklist

- [ ] Webhook route reads the **raw** body (no JSON body parser ahead of it)
- [ ] `WHATNOT_WEBHOOK_SECRET` set; handler fails closed without it
- [ ] Handler returns **200** for every verified event, including unknown topics
- [ ] Events deduped on envelope `id`
- [ ] Customer-data fields null-checked
- [ ] Money `amount` kept as a string or decimal
