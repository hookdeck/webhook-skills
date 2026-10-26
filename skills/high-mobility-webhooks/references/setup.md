# Setting Up High Mobility Webhooks

## Prerequisites

- A High Mobility account with an app (sandbox or production)
- A public **HTTPS** URL for your receiver (use the Hookdeck CLI locally)

## Create the Webhook and Choose the Secret

1. In the High Mobility console, open your app's **API Credentials > Webhooks**.
2. Enter the **URL** (your Hookdeck source URL or your endpoint).
3. Enter a **secret**: a string you choose. Each webhook configuration (project) has one.
4. Choose the events to receive (`fleet_clearance_changed`; `ping` is sent when the configuration changes).
5. Save, and store the secret as `HIGH_MOBILITY_WEBHOOK_SECRET`. Use it exactly as entered; don't hex- or base64-decode it.

## Set Up the Hookdeck Source

In Hookdeck, create a source of type **High Mobility** and paste the same secret. Hookdeck's source verifies `X-HM-Signature-256` (HMAC-SHA256, hex, raw body).

Hookdeck's High Mobility source pre-selects POST without managing the method (you can change it). High Mobility's docs don't name the HTTP method, so if the sender uses another one, allow that method on the source too.

## Test Mode vs Live Mode

The sandbox retries a failed delivery up to 5 times; production retries up to 200 times, every 10 minutes. Changing the webhook configuration sends a signed `ping`, which is a quick way to confirm your endpoint verifies correctly.

## Local Development

```bash
npx hookdeck-cli listen 3000 high-mobility --path /webhooks/high-mobility
```
