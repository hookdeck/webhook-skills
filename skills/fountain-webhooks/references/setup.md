# Setting Up Fountain Webhooks

## Prerequisites

- A Fountain Hire account with access to Company Settings and API settings
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 fountain --path /webhooks/fountain` for local development)

## Get Your Signing Secret

Paste your Fountain Hire private API token. Only the default body signing is supported: accounts switched to applicant ID signing fail verification.

1. In Fountain Hire, open the API settings (where the private API token is shown) and copy your **private API token**.
2. Store it as `FOUNTAIN_WEBHOOK_SECRET`. Use it exactly as shown (UTF-8, not decoded).

The token is your account's API credential, not a webhook-specific secret. Rotating the API token rotates
the webhook signing key, so update `FOUNTAIN_WEBHOOK_SECRET` at the same time.

## Register Your Endpoint

1. In Fountain Hire, go to **Company Settings -> Webhooks**.
2. Add your endpoint URL (for example `https://example.com/webhooks/fountain`). Fountain sends `POST` requests.
3. Choose the screening (applicant) and/or Post-Hire (worker) events you want.
4. Save, then trigger a stage change (or a worker activation) to send a delivery.

## Default Body Signing Only

By default Fountain signs the request body. Fountain's Admin Tools can switch an account to signing the
**applicant ID** instead of the body. This skill (and Hookdeck's Fountain source) supports only the default
body signing: if your account was switched, signatures will not verify. Ask Fountain to switch the
account back to body signing.

## Test Mode vs Live Mode

Fountain does not document a separate test mode. Use a test funnel or a test applicant to trigger deliveries.

## Delivery Notes

Fountain retries a failed request twice, and disables a webhook that fails more than 10 times in 24 hours.
Return `200` quickly and process asynchronously. If a webhook is disabled, fix the endpoint and re-enable it.
