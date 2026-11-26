# Setting Up Bridge API Webhooks

## Prerequisites

- A Bridge API account with **admin** access (only admins can manage webhooks).
- Your application's public webhook endpoint URL (e.g.
  `https://api.example.com/webhooks/bridge-api`).

## Register Your Endpoint

1. Sign in to the [Bridge dashboard](https://dashboard.bridgeapi.io) as an admin.
2. Go to **Webhooks** and click to create a new webhook.
3. Configure:
   - **Callback URL** — your public HTTPS endpoint.
   - **Name** — optional label to identify the webhook.
   - **Events** — select the events you want delivered (e.g. `item.refreshed`,
     `item.account.updated`, `payment.transaction.updated`).
4. Save. You can create up to **10 webhooks per application**.

## Get Your Signing Secret

When you create the webhook, Bridge auto-generates a **signing secret** and
displays it **only once**. Copy it immediately and store it securely — set it as
`BRIDGE_WEBHOOK_SECRET` in your environment.

```bash
BRIDGE_WEBHOOK_SECRET=your_webhook_signing_secret
```

If you lose it, update the secret by editing the webhook in the dashboard.

## Rotating the Signing Secret

- Rotating generates a **new** secret while the **old one stays valid for 24
  hours** — a grace period so you can deploy the new secret without dropping
  deliveries.
- During that window a webhook can have **up to 2 active signatures**, so
  Bridge may send `BridgeApi-Signature: v1=<sig-new>,v1=<sig-old>`.
- Your verification code should accept the delivery if **any** `v1` signature
  matches (the example handlers do this). After 24 hours, remove the old secret.
- A webhook can't have more than two active secrets: updating twice in a row
  without deploying invalidates the first secret.

## Test Your Webhook

- Use the dashboard's **"Send a test"** button. It delivers a payload with
  `type: "TEST_EVENT"` to your callback URL so you can confirm reachability and
  signature verification.
- For local development, tunnel deliveries to your machine with the Hookdeck CLI
  (no account required):

  ```bash
  npx hookdeck-cli listen 3000 bridge-api --path /webhooks/bridge-api
  ```

  Then set the Hookdeck URL as the callback URL in the Bridge dashboard.

## Source IP Allowlisting (optional)

Bridge delivers from fixed IPs. If you allowlist inbound traffic, permit:

```
63.32.31.5
52.215.247.62
34.249.92.209
```

Behind a proxy or load balancer, read the originating IP from the
`X-Forwarded-For` header rather than the socket address.

## No Official SDK

Bridge does **not** publish an SDK for webhook verification. Verify signatures
manually with your language's standard HMAC-SHA256 library — see
[verification.md](verification.md).
