# Setting Up Castle Webhooks

## Prerequisites

- A Castle account with dashboard access
- Your application's public webhook endpoint URL (HTTPS URLs must have a valid certificate)

## Get Your Signing Secret

Castle does not issue a per-webhook secret. Signatures use your Castle **API secret**, the same one your backend uses to call the Castle API. Find it in the Castle dashboard under your app's API keys/settings and store it as `CASTLE_API_SECRET`.

## Register Your Endpoint

1. In the Castle dashboard, open the **Policy** page or the **Lists** page, depending on what should trigger the webhook.
2. Open the **Integrations** tab and click **Add Integration**.
3. Choose a webhook, enter your endpoint URL, and save. You can also create one directly from a Policy or List entry.

Return a `2xx` status to acknowledge. Anything else (including 3xx) is retried up to six more times with exponential backoff.

## Allowlisting Castle IPs (optional)

Production webhooks are sent from: `34.194.74.182`, `23.20.75.190`, `34.194.26.104`.

## Testing

Point a policy at a temporary endpoint (e.g. Webhook Tester) or use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 castle --path /webhooks/castle
```

Then send a Castle event that matches the policy (for example an event whose email domain matches a policy rule).
