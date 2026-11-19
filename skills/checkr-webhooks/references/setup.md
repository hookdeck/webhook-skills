# Setting Up Checkr Webhooks

## Prerequisites

- A Checkr account with access to Developer Settings, or a Checkr Partner Application
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Direct Accounts

1. Open [Developer Settings](https://dashboard.checkr.com/account/developer_settings) in the Checkr Dashboard.
2. Add your webhook URL, such as `https://your-app.example.com/webhooks/checkr`. You can have at most two.
3. Choose whether to include the related object (`include_object`).

### Which key verifies the signature

Checkr signs with the **oldest secret API key** on the account. It's in the same Developer Settings page. Set it as `CHECKR_SIGNING_KEY`.

Don't delete that key: Checkr warns that it will break signature verification for every event. If you must rotate it, update `CHECKR_SIGNING_KEY` (and any Hookdeck source) first.

## Partner Applications

1. Set the webhook URL on your Partner Application (see Checkr's [Partner getting started guide](https://docs.checkr.com/partners/getting-started)).
2. Partner apps are subscribed to all events, with `include_object` on.
3. Set `CHECKR_SIGNING_KEY` to the application's OAuth **client secret**. Events for objects created with a customer's `access_token` are also signed with your client secret.

## Optional: Basic Auth in the URL

Checkr can add basic auth if you put credentials in the URL: `https://user:password@your-app.example.com/webhooks/checkr`. The credentials must be URL-escaped. This is in addition to the signature, not a replacement.

## Test

Create a candidate or an invitation with a test API key and watch for `candidate.created` or `invitation.created`. Checkr's webhook logs are at [dashboard.checkr.com/webhook_logs](https://dashboard.checkr.com/webhook_logs).

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 checkr --path /webhooks/checkr
```

Add the printed URL as a webhook URL.

## Using Hookdeck

Create a source with the **Checkr** source type and paste your API key (or the Partner app's client secret) as the secret. Hookdeck verifies `X-Checkr-Signature` over the raw body. Verification is optional on the source, and Hookdeck applies no timestamp window.
