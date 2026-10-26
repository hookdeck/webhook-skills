# Setting Up Roam Webhooks

## Prerequisites

- A Roam account with access to **Roam Administration → Developer**
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 roam --path /webhooks/roam` locally)

## How Do I Get the Signing Secret?

1. Open **Roam Administration → Developer** (gear icon → Settings), **API Clients** tab.
2. Under **API Keys** or **OAuth Apps**, click **Edit** next to your app (or **Add API Key** / **Create OAuth App**, then **Create**).
3. Open the **Webhooks** tab. The **Signing Secret** (`whsec_...`) is shown there.
4. Store it as `ROAM_WEBHOOK_SIGNING_SECRET`.

For a Personal Access Token the secret is shown when the token is created; click **Reveal Token** in **User Settings → Developer** to see it again.

**Configure a signing secret for the Roam webhook.** Without one, deliveries are unsigned (no `webhook-timestamp` or `webhook-signature`) and fail verification. This applies when you receive through Hookdeck too.

## How Do I Register an Endpoint?

Static (API Key or OAuth App): on the **Webhooks** tab enter your HTTPS **Webhook URL**, toggle the **Subscribed Events**, enable each event's required scope on the **Permissions** tab, and click **Save**. **Test** sends a sample delivery.

Dynamic (the only option for Personal Access Tokens):

```bash
curl -X POST https://api.ro.am/v1/webhook.subscribe \
  -H "Authorization: Bearer $ROAM_TOKEN" -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/roam", "event": "chat.message", "filter": {"chatType": "dm"}}'
```

Recommended events: `chat.message`, `meeting.ended`, `lobby.booked`. Pin `apiVersion` to `2026-07-07` or later to receive the envelope body.

## Authentication

Deliveries are authenticated only by the Standard Webhooks signature. There is no API key, Basic Auth or IP allowlist on incoming requests; the `Authorization` bearer token is used only when you call Roam's API.

## Local Testing

```bash
npx hookdeck-cli listen 3000 roam --path /webhooks/roam
```

Use the printed URL as the Webhook URL and click **Test**.
