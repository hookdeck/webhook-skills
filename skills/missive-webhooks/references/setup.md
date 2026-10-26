# Setting Up Missive Webhooks

## Prerequisites

- A Missive organization on the **Productive** or **Business** plan, and admin or owner rights (required to create rules)
- A publicly reachable HTTPS endpoint, e.g. `https://example.com/webhooks/missive`, that accepts `POST` and responds within 15 seconds.
  For local development, use the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 missive --path /webhooks/missive
  ```

## Create the Webhook Rule

1. Go to **Settings > Rules** and create a new rule.
2. Set the rule's conditions (for example a label change or an incoming email).
3. Choose **Webhook** as the action and enter your endpoint URL.
4. **Set a validation secret** on the webhook action and store it as `MISSIVE_WEBHOOK_SECRET`.
5. Save the rule. Missive sends a validation request, so your endpoint must already be accepting `POST` requests.

## Validation Secret

The secret is optional on Missive's side. If it is set, every request carries
`X-Hook-Signature: sha256=<hex>`. **Without a secret, deliveries are unsigned**
and fail verification, so set one. The examples require the secret and reject
unsigned requests with `401`.

## Hookdeck Setup

Set a validation secret on the rule's webhook action. Without one, deliveries
are unsigned and fail verification. Then:

1. Create a Hookdeck source of type **Missive** and paste the same validation secret into its verification settings.
2. Use the Hookdeck source URL as the webhook action's endpoint in the rule.
3. Hookdeck verifies `X-Hook-Signature` and forwards to your destination, where the Express, Next.js or FastAPI example (or your own handler) can verify again.

## Reliability

Missive retries errors and timeouts up to 5 times over 8 minutes and disables a
rule after more than 50 consecutive failures (re-enable it in the Rules
settings). Return `2xx` quickly and do slow work in a background job.

## Testing

Turn on **Settings > Preferences > Appearance > Conversation view > Show rule
webhook events** to see an entry in the conversation timeline each time a rule
fires its webhook. This confirms Missive triggered it, which separates rule
problems from endpoint problems. The Hookdeck CLI above lets you inspect the
real deliveries.
