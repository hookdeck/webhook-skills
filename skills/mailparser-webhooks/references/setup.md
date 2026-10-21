# Setting Up Mailparser Webhooks

## Prerequisites

- A Mailparser account with an inbox and at least one parsed document
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 mailparser --path /webhooks/mailparser` locally)

## Generate a Secret

Mailparser provides no signing secret, so create your own:

```bash
openssl rand -hex 32
```

## Create an Advanced Webhook

1. Open your inbox in Mailparser and go to its webhook/integration settings, then add an **Advanced Webhook** (the exact menu labels may vary by plan and UI version).
2. **Name**: e.g. `My app`.
3. **HTTP Verb**: `POST`.
4. **Target URL**: `https://your-domain.example/webhooks/mailparser`.
5. **Content-Type**: JSON (the examples expect a JSON body).
6. **What data to send**: default (one request per email), or "One request per row" for line items.
7. **Additional Headers**: add the secret, one header per line:

   ```
   X-Webhook-Secret: <the random value>
   ```

   or Basic Auth: `Authorization: Basic <base64(username:password)>`.
8. Edit the **HTTP Body Payload Template** if needed and click **Preview Payload** to check it.
9. Save, then send or re-process a test email.

## Configure Your App

```bash
MAILPARSER_WEBHOOK_HEADER=X-Webhook-Secret
MAILPARSER_WEBHOOK_SECRET=<the exact value after the colon>
```

For `Authorization: Basic ...`, set `MAILPARSER_WEBHOOK_HEADER=Authorization`
and the secret to the full `Basic ...` value, scheme included.

## Testing

Use Preview Payload in Mailparser, then parse a real email. Locally, the
Hookdeck CLI shows the exact headers and body received.
