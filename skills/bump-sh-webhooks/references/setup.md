# Setting Up Bump.sh Webhooks

## Prerequisites

- A Bump.sh account with a documentation you can manage
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Open your documentation in the Bump.sh dashboard and select the **Integrations** tab to reach the webhook section.
2. Add a webhook and enter your payload URL, e.g. `https://your-app.example.com/webhooks/bump-sh`. You can add several URLs.
3. After adding the webhook a confirmation screen is displayed. From it you can **modify the payload URL** and find the **secret token** used to secure requests from Bump.sh.

## Get Your Secret Token

Copy the secret token from the webhook's confirmation screen and store it as `BUMP_SH_WEBHOOK_SECRET`. Use it exactly as shown (as UTF-8 text); it is not hex- or base64-encoded.

## Test Your Webhook

In the **Recent deliveries** section, the **Test Webhook** element sends a notification so you can check your endpoint works. The same section lists the last 10 notifications.

## Local Development

```bash
npx hookdeck-cli listen 3000 bump-sh --path /webhooks/bump-sh
```

Use the public URL the CLI prints as the webhook's payload URL. The FastAPI example runs on port 8000: `npx hookdeck-cli listen 8000 bump-sh --path /webhooks/bump-sh`.

## Delete a Webhook

To stop receiving notifications, select the webhook in the Integrations section and confirm deletion in the **Danger zone**.
