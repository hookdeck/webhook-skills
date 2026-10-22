# Setting Up Truework Webhooks

## Prerequisites

- A Truework service account with API access (Sandbox and/or Production)
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 truework --path /webhooks/truework` locally)

## Create a Webhook and Get Its Token

1. In the Truework app, open **Developer** (`< > Developer`) in the left panel.
2. Scroll to **Webhooks**, choose **Sandbox** or **Production** (matching the API keys you use), and click **Edit**.
3. Pick the event from the subscriptions dropdown (**Order completed** or **Verification state change**), enter the endpoint URL, and optionally add a description.
4. Click **Create**. Each webhook shows its **authentication token** on this page. Copy it into `TRUEWORK_WEBHOOK_TOKEN`.

Webhooks can subscribe to multiple event types, and you can add, unsubscribe and delete them at any time. The limit is 10 webhooks per service account.

## Tokens Are Per Webhook

Each webhook has its own token. If you delete and recreate a webhook, the new one has a new token and the old value stops matching (your endpoint will return 401). If one endpoint serves several webhooks, accept each of their tokens.

## Sandbox vs Production

Sandbox and Production webhooks are separate and have different tokens and source IPs. Use separate environment values per environment.

## Which Events to Subscribe To

| Verification method | Webhook |
|---|---|
| Instant | None needed |
| Credentials, Documents (Beta) | Order completed |
| Smart Outreach | Verification state change |
