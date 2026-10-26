# Setting Up Bayou Energy Webhooks

## Prerequisites

- A Bayou Energy company account with access to the Bayou dashboard settings
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Set the Webhook URL?

Bayou has one webhook URL per company, and every webhook goes to it.

1. Open the Bayou dashboard and go to your company's **Settings** page.
2. Enter your endpoint in the **Webhook URL** field, for example `https://your-app.com/webhooks/bayou-energy`.
3. Save.

There is no per-event subscription and no URL challenge. Your handler must route on the top-level `event` field.

## Where Do I Find the Signing Secret?

On the same **Settings** page, just below the **Webhook URL** field. It looks like `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` (that value is the docs' example, not a real secret).

- One secret per company. It signs every webhook for the company.
- Set the **full** value, including `whsec_`, as `BAYOU_ENERGY_WEBHOOK_SECRET`. The verification library strips the prefix and base64-decodes the rest.
- Store it in a secret manager and never commit it.

Verification is optional on Bayou's side (deliveries are sent either way), but your handler should always verify.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 bayou-energy --path /webhooks/bayou-energy
```

(Use port `8000` for FastAPI.) Paste the printed URL into the **Webhook URL** field. Bayou's docs describe testing `customer_must_reauthenticate` with a fake customer on Bayou's fake utility (see [Bayou's fake customer docs](https://docs.bayou.energy/docs/speculoos)).

When you've finished testing, replace the URL with your production endpoint.

## Test Mode vs Live Mode

Bayou doesn't document a separate webhook test mode.
