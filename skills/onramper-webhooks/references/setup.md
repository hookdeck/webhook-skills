# Setting Up Onramper Webhooks

## Prerequisites

- An Onramper account and ApiKey
- A public HTTPS endpoint (for local work, use the Hookdeck CLI below)

## Get Webhooks Enabled and Your Secret

There is no self-serve dashboard step. Webhooks are enabled per ApiKey:

> Onramper turns on webhooks through your Customer Success Manager. Send them the Hookdeck URL and paste the secret key they issue.

1. Get your endpoint URL (your server's `/webhooks/onramper` route, or the Hookdeck URL for an Onramper source).
2. Send it to your Onramper Customer Success Manager and ask for webhooks on your ApiKey.
3. Onramper issues a secret key when the webhook is registered. No format or rotation process is documented.
4. Store it as `ONRAMPER_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes (not hex- or base64-decoded).

## Local Development

```bash
npx hookdeck-cli listen 3000 onramper --path /webhooks/onramper
```

Use the printed URL as the endpoint you give your Customer Success Manager.

## Test Mode vs Live Mode

Onramper's docs don't describe a webhook test mode or a "send test event" button. The documented sample uses a `pk_test_` key, and you can replay it locally by signing it yourself (see [verification.md](verification.md)).
