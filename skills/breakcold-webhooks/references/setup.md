# Setting Up Breakcold Webhooks

## Prerequisites

- A Breakcold workspace
- An HTTPS endpoint URL for your application (use `npx hookdeck-cli listen 3000 breakcold --path /webhooks/breakcold` while developing)

## Create the Endpoint and Get Your Signing Secret

1. Open Breakcold and go to **Settings**.
2. Open **Webhook**, then **Send**.
3. Click **New outbound webhook**.
4. Enter your HTTPS endpoint URL.
5. Select the events you want to receive.
6. Optionally filter deliveries to specific object types (record-based events are then only sent for records of those types).
7. Copy the signing secret and store it as `BREAKCOLD_WEBHOOK_SECRET`.

## Test Your Endpoint

The endpoint's test button sends a `webhook.test` event with a valid signature. If your handler returns `2xx`, reachability and signature verification both work. If it returns `401`, see [verification.md](verification.md).

## Operational Notes

- Return any `2xx` quickly; Breakcold times out after 10 seconds and makes up to 3 attempts.
- After 50 consecutive failed deliveries the endpoint is disabled, so re-enable it in Settings after fixing the handler.
- Delivery logs are kept for 30 days.
- Each endpoint has its own signing secret.
