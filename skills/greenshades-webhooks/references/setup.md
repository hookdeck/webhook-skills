# Setting Up Greenshades Webhooks

## Prerequisites

- Greenshades API credentials (OAuth2 client credentials) that can request `GO.Api.WEBHOOK.write` or `GO.Api.WEBHOOK.full_access`
- The workspace ID you want events for
- A public HTTPS endpoint for your handler (use the Hookdeck CLI while developing)

## Choose Your HMAC Key

Greenshades signs with a key **you provide**: "The key can be anything, but we recommend using a strong password of your choosing." Generate a long random string, store it as `GREENSHADES_WEBHOOK_SECRET`, and send the same value as `hmacKey`. It is used as UTF-8 bytes exactly as written (not hex- or base64-decoded).

## Register Your Endpoint

Create a subscription with `POST https://api.greenshadesonline.com/webhooks/subscriptions`, authenticated with an OAuth2 bearer token (token URL `https://auth.greenshadesonline.com/connect/token`):

```json
{
  "url": "https://your-domain.example/webhooks/greenshades",
  "hmacKey": "my-secret-hmac-key",
  "subscribedEvents": ["payRun.completed", "employee.updated"]
}
```

Subscriptions are per workspace. Event names are listed in [overview.md](overview.md).

## Use Hookdeck as the Receiver

1. Create a Hookdeck source of type **Greenshades** and set the signing key to your `hmacKey`.
2. Use the source URL as the subscription `url`.
3. **Allow the right HTTP method on the source.** Greenshades' docs don't name the method. Hookdeck's Greenshades source pre-selects POST without managing the method, so if the sender uses another method, add it to the source's allowed methods.

For local development:

```bash
npx hookdeck-cli listen 3000 greenshades --path /webhooks/greenshades
```

## Test Mode vs Live Mode

Greenshades documents no separate test mode. Subscribe to a low-volume event such as `employee.updated`, change a test employee, and confirm the delivery verifies. Check the request body to confirm which field names the event.
