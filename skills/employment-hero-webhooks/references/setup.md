# Setting Up Employment Hero Webhooks

## Prerequisites

- An Employment Hero organisation on a **Platinum subscription or above**
- Access to the Employment Hero Developer Portal
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Register the Webhook

1. Sign in to the Employment Hero Developer Portal.
2. Open **My Webhooks** and click **Add Webhooks** ([registering a webhook](https://developer.employmenthero.com/api-references/webhook/registering-webhook.md)).
3. Enter your endpoint URL (for example `https://your-app.example.com/webhooks/employment-hero`) and choose the events.
4. Save, then copy the **secret key** from the webhook's configuration page into `EMPLOYMENT_HERO_WEBHOOK_SECRET`, exactly as shown. It's base64; your handler decodes it.

## Test

Employment Hero documents no test button. Make a change the webhook subscribes to, such as updating an employee, and check that your endpoint returns `200`.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 employment-hero --path /webhooks/employment-hero
```

Use the printed URL as the webhook URL. The CLI shows each request's headers and body, which is the easiest way to see the payload format.

## Using Hookdeck

Create a source with the **Employment Hero** source type and paste the secret key exactly as the Developer Portal shows it. Hookdeck decodes the base64 and verifies `X-EmploymentHero-Signature` against `<X-EmploymentHero-Timestamp>.<body>`. Verification is optional on the source, and Hookdeck applies no timestamp window. POST is pre-selected as the allowed method because Employment Hero doesn't document one.
