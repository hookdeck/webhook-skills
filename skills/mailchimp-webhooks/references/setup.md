# Setting Up Mailchimp Webhooks

## Prerequisites

- A Mailchimp account with access to the audience (list) you want to watch
- Your application's public webhook endpoint URL (must be HTTPS)
- A long, unguessable secret string you generate yourself

## Generate a URL Secret

Mailchimp does not give you a signing secret — you invent one. Generate a long
random string and store it in your app's environment as `MAILCHIMP_WEBHOOK_SECRET`:

```bash
# Example: 32 random bytes as hex
openssl rand -hex 32
```

You will append this secret to your webhook URL as a query parameter so your
handler can confirm each request really came from your Mailchimp configuration.

## Register Your Endpoint

1. Log in to Mailchimp and go to **Audience → Manage Audience → Settings → Webhooks**
   (or **Audience → Settings → Webhooks** depending on your UI).
2. Click **Create New Webhook**.
3. Enter your **Callback URL** including the secret in the query string:

   ```
   https://your.app/webhooks/mailchimp?secret=<MAILCHIMP_WEBHOOK_SECRET>
   ```

4. Under **What type of updates should we send?**, select the events you want:
   - Subscribes
   - Unsubscribes
   - Profile updates
   - Email changed
   - Cleaned addresses
   - Campaign sending status
5. Under **Only send when...**, choose whether to include changes made by
   subscribers, by account admins, and/or via the API.
6. Click **Save**.

## URL Validation (the GET request)

When you click **Save**, Mailchimp immediately sends a `GET` request to your
callback URL to confirm it is reachable. Your endpoint **must respond `200`** to
that GET or Mailchimp will refuse to save the webhook. The example handlers in
this skill answer the GET with `200` and do not require the secret on GET.

## Test Your Webhook

- Mailchimp's webhook editor has a **Send Test** button that posts a sample
  `subscribe`-style payload to your URL.
- Or trigger a real event: subscribe/unsubscribe a test contact in the audience.
- For local development, use the Hookdeck CLI to tunnel to your machine:

  ```bash
  npx hookdeck-cli listen 3000 mailchimp --path /webhooks/mailchimp
  ```

## Security Notes

- **Always use HTTPS.** The secret travels in the URL, so plain HTTP would leak it.
- **Keep the secret out of logs.** Query strings are often logged by proxies and
  servers — scrub `secret` from access logs where possible.
- **Rotate by editing the webhook URL** in Mailchimp and updating
  `MAILCHIMP_WEBHOOK_SECRET` in your app.
- Mailchimp cannot show you the URL secret again after saving from its side; keep
  your own copy in your secrets manager.
