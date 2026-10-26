# Setting Up Bayou Energy Webhooks

## Prerequisites

- A Bayou Energy account with access to the [Bayou dashboard](https://bayou.energy/dashboard)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen` during development)

## How Do I Register My Webhook URL?

1. Open your company's **Settings** page in the Bayou dashboard.
2. Enter your endpoint in the **Webhook URL** field and save.

There is one webhook URL per company. Every webhook Bayou sends goes to it, and there is no per-event subscription, so branch on the `event` field. There is no challenge or handshake step.

## Where Do I Get the Signing Secret?

Each company has its own signing secret, shown in **Settings**, just below the Webhook URL field. It looks like `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`.

1. Copy the whole value, including the `whsec_` prefix.
2. Store it as `BAYOU_ENERGY_WEBHOOK_SECRET` in your secret manager. Don't commit it.

The `standardwebhooks` library strips `whsec_` and base64-decodes the rest to get the HMAC key. If you verify manually, do the same (see [verification.md](verification.md)).

Verification is optional on Bayou's side: webhooks are delivered whether or not you verify them. Verify anyway, because your URL is public.

## Local Development

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 bayou-energy --path /webhooks/bayou-energy
```

Paste the URL it prints into the Webhook URL field. No account or install is needed.

## How Do I Test Webhooks?

- Bayou provides a fake utility and fake customers for testing. See [Bayou's test-customer guide](https://docs.bayou.energy/docs/speculoos). The docs use it for `customer_must_reauthenticate`.
- Check your implementation against the documented test vector: secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, `webhook-id` `wh_12345`, `webhook-timestamp` `1750000000`, body `{"event": "bills_ready", "object": {"id": 123456}}` must give `webhook-signature: v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI=`. The timestamp is old, so only use it to test the HMAC itself (or a verifier with the window disabled).

## Delivery Notes

- Bayou doesn't document a retry policy. Make handlers idempotent (dedupe on `webhook-id`) and return a `2xx` quickly.
