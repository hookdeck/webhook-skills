# Setting Up BoldSign Webhooks

## Prerequisites

- BoldSign account (a free API sandbox works for testing)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. In BoldSign, go to **API → Webhooks** and click **Add Webhook**.
2. Choose the type:
   - **Account Level**: documents sent from the web app or API.
   - **App Level**: documents sent via one OAuth app (create it first under **API → OAuth Apps**, then pick it).
3. Enter a descriptive name and your **HTTPS webhook URL**.
4. Select the events to receive, e.g. `Sent`, `Viewed`, `Signed`, `Completed`, `Declined`, `Revoked`, `Expired`.
5. Optionally add custom headers (plain, secret, or one basic auth header) and tick **Listen to Team user's events**.
6. Click **Verify**. BoldSign POSTs a `Verification` event:

   ```json
   { "event": { "id": "7c872a5b-...", "created": 1617180024, "eventType": "Verification", "environment": "Test" } }
   ```

   Your endpoint must return `200 OK` within 10 seconds. It arrives with `X-BoldSign-Event: Verification`, and the examples return 200 for it before any signature check.
7. Click **Save**.

## Get Your Signing Secret

BoldSign assigns a signing secret once the webhook is configured. Open the webhook's overview page (**API → Webhooks → select the webhook**) and click **Reveal**. Set it as `BOLDSIGN_WEBHOOK_SECRET`.

Rolling the secret can keep the old one valid for a set time. During that window every event carries both `s0` (new key) and `s1` (old key), so deliveries keep verifying while you deploy the new secret.

## Test Mode vs Live Mode

Sandbox and production are separate BoldSign environments with their own webhooks and secrets. `event.environment` is `Test` or `Live`.

## IP Allowlisting (optional)

BoldSign sends from fixed IPs per region: US `35.243.182.124`, Europe `34.141.138.53`, Canada `34.130.12.142`, Australia `34.40.190.114`. Check the [IP allowlisting page](https://developers.boldsign.com/webhooks/ip-whitelisting/) for the current list. The signature is the primary check.

## Local Development

```bash
npx hookdeck-cli listen 3000 boldsign --path /webhooks/boldsign
```

Use the Hookdeck URL as the webhook URL and click **Verify**. Use **Webhook History** in BoldSign to resend events.
