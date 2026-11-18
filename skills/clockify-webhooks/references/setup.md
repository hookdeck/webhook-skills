# Setting Up Clockify Webhooks

## Prerequisites

- A Clockify workspace where you are an owner or admin (Free plan: up to 3 webhooks)
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Create the Webhook

**UI:** **Preferences > Advanced > Webhooks > Manage webhooks > Create new**. Enter a name, your endpoint URL, and the one event that triggers it.

**API:** `POST https://api.clockify.me/api/v1/workspaces/{workspaceId}/webhooks` with your `X-Api-Key`:

```json
{
  "name": "Time entries",
  "url": "https://example.com/webhooks/clockify",
  "webhookEvent": "NEW_TIME_ENTRY",
  "triggerSourceType": "WORKSPACE_ID",
  "triggerSource": ["<workspaceId>"]
}
```

The response includes `authToken`.

## 2. Copy the Token

In the UI, the token is the webhook's **Signing secret**. Copy it into `CLOCKIFY_WEBHOOK_SIGNING_SECRET`. For several webhooks on one endpoint, separate their tokens with commas.

## Rotating the Token

**Edit > Change (reset) Signing secret** in the UI, or `PATCH /v1/workspaces/{workspaceId}/webhooks/{webhookId}/token`, issues a new token and invalidates the old one. Add the new token to your list before rotating if you can't update both at once, then remove the old one.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 clockify --path /webhooks/clockify
```

Use the printed URL as the endpoint, then trigger the event (add a time entry, create a project).

## Using Hookdeck

Create a source with the **Clockify** source type and paste the webhook's token in **Signing Secret**. Hookdeck compares `Clockify-Signature` with it in constant time. Each webhook has its own token, so use one source per Clockify webhook. Verification is optional on the source, and Hookdeck applies no timestamp window.
