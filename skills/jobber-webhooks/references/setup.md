# Setting Up Jobber Webhooks

## Prerequisites

- A Jobber developer account and an app in the [Developer Center](https://developer.getjobber.com/)
- Your application's public webhook endpoint URL (or a Hookdeck URL)
- The read scope for each object whose topics you want

## Get Your Signing Secret

Jobber signs webhooks with your app's **OAuth client secret**. There is no separate webhook secret.

Open your app in the Developer Center, copy its OAuth **client secret** (the same one used for the OAuth flow), and store it as `JOBBER_CLIENT_SECRET`.

## Register Your Endpoint

1. In the Developer Center, open your app's settings page.
2. Add a webhook: choose a **topic** and enter the **URL** Jobber should POST to (e.g. `https://example.com/webhooks/jobber`).
3. Repeat for each topic. Recommended: `CLIENT_CREATE`, `INVOICE_UPDATE`, `APP_CONNECT`, `APP_DISCONNECT`.
4. If you publish to the Jobber App Marketplace, `APP_DISCONNECT` handling is required.

## Using Hookdeck

Jobber signs webhooks with your app's OAuth client secret. Paste that secret into the Hookdeck source's verification settings (Jobber source type), then use the Hookdeck source URL as the webhook URL in the Developer Center.

For local development:

```bash
npx hookdeck-cli listen 3000 jobber --path /webhooks/jobber
```

## Test Mode vs Live Mode

Jobber has no separate webhook test mode. Develop against a Jobber developer test account connected to your app and trigger events by creating clients or updating invoices in it.
