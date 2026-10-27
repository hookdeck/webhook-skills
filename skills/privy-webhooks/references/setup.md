# Setting Up Privy Webhooks

## Prerequisites

- A Privy app and access to the [Privy Dashboard](https://dashboard.privy.io)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)
- Webhooks can be tested at no cost in development environments. Enabling them in production
  requires the Enterprise plan.

## How Do I Register a Privy Webhook Endpoint?

1. In your backend, create an endpoint that accepts `POST` requests, e.g.
   `https://example.com/webhooks/privy`. The URL must begin with `https://`.
2. In the Privy Dashboard, go to **Configuration > Webhooks**.
3. Add the URL as the destination and select the event types you want. A wallet app usually
   starts with `user.created`, `user.wallet_created`, `transaction.confirmed`,
   `transaction.failed`, `wallet.funds_deposited` and `wallet.funds_withdrawn`.
4. Return a `2xx` quickly. Acknowledge, then process on a queue. Return `200` for events you
   don't handle, otherwise Privy keeps retrying them (anything else, `3xx` included, counts as
   a failed delivery).

## Where Do I Find the Signing Secret?

Open the endpoint on the **Configuration > Webhooks** page and copy its signing secret. Privy's
docs don't print its format, but because Svix delivers the webhooks it starts with `whsec_`. Store
the full value, prefix included:

```bash
PRIVY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Privy's SDK samples call this variable `PRIVY_WEBHOOK_SIGNING_SECRET`; the name is yours to
choose. If the value doesn't start with `whsec_`, the examples here reject it with a 500 instead
of verifying with the wrong key.

## How Do I Send a Test Webhook?

Click **Test webhook** on the endpoint in the dashboard. Privy sends:

```json
{ "type": "privy.test", "message": "Hello, World!" }
```

Check your logs for the payload and confirm a `200` response. The examples route `privy.test`
and verify its signature like any other delivery.

## Local Development

```bash
npx hookdeck-cli listen 3000 privy --path /webhooks/privy
```

Register the tunnel URL as the endpoint, copy its signing secret into your `.env`, then use
**Test webhook** or trigger a real event such as creating a user.

## Allowlisting Source IPs

If your server restricts inbound traffic, Privy delivers from `44.228.126.217`,
`50.112.21.217`, `52.24.126.164`, `54.148.139.208` and `2600:1f24:64:8000::/56`. Signature
verification is still required; the IP list is an extra layer, not a replacement.

## Development vs Production

Each endpoint has its own signing secret, so a secret from a development endpoint won't verify
traffic sent to a production endpoint. Keep them in separate environment variables per deployment.

## Rotating the Secret

If the dashboard lets you roll the secret, Svix may sign with both the old and the new one for a
grace period, so `svix-signature` can carry two `v1,` entries. The examples accept any matching
entry, so deploy the new secret during that window.

## Retrying Failed Deliveries

Failed messages can be retried manually from the dashboard after the automatic schedule ends. A
retry reuses the original payload and `svix-id`, so your deduplication treats it as the same
message. It also reuses the original `svix-timestamp`, which the Svix library will reject after
5 minutes; see [verification.md](verification.md) for the manual verifier that drops the window.
