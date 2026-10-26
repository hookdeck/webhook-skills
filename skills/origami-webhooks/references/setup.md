# Setting Up Origami Webhooks

## Prerequisites

- An Origami org admin account on a paid plan (the Webhooks section is hidden otherwise)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work). IP
  literals, non-default ports, userinfo and cloud metadata hostnames are rejected.

## How Do I Create an Origami Webhook Endpoint?

1. Go to **Settings → Developers → Webhooks**.
2. Click **New endpoint**.
3. Enter the URL, e.g. `https://example.com/webhooks/origami`, and an optional description (up to
   500 characters).
4. Pick event types from the tree, or check **Everything**, **Sequencer** or **API Jobs** for
   wildcards.

You can also create endpoints with `POST /api/v3/account/webhooks`. There is a cap of **5 active
endpoints per organization**.

Frameworks with CSRF protection must exempt this route, since the signature is your
authentication.

## Where Do I Find the Signing Secret?

The `whsec_...` secret is revealed in a modal **once** when you create the endpoint (the API
returns it once as well). The list view only shows the last 4 characters. Store the full value:

```bash
ORIGAMI_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The HMAC key is the base64-decoding of the part after `whsec_`. Losing the secret means rotating
it. Origami's docs print only the placeholder `whsec_XXXXXXXX`, so check the real value against
what the dashboard shows.

## How Do I Rotate the Secret?

Use **Rotate secret** in the endpoint drawer (or the rotate API call). The previous secret stays
valid for **24 hours**. During that window `webhook-signature` carries two `v1,<sig>` entries,
and a verifier must accept either match (the library and the manual verifier both do).

## How Do I Test an Endpoint?

Open the endpoint drawer and click **Test endpoint**, or call
`POST /api/v3/account/webhooks/{webhook_id}/test`. Origami sends a `webhook.test` event, which is
always delivered regardless of your subscriptions. The deliveries drawer shows the response
status and the first 2 KB of the body for failures.

## Respond Quickly

Return a `2xx` within 30 seconds, since a timeout counts as a failure and is retried. Acknowledge
fast and process on a queue. Return `200` for events you don't handle: other `4xx` responses are
dropped and `410` disables the endpoint.

## Replaying and Disabling

- **Redeliver** a delivery from the deliveries panel. It keeps the original `webhook-id`, so your
  deduplication treats it as the same message.
- **Disable** pauses delivery and keeps the URL and subscriptions. **Delete** drops pending
  deliveries.
- An endpoint auto-disables on `410 Gone` or after roughly 100 consecutive failed attempts.
  Re-enable it from the dashboard once the receiver is fixed.
