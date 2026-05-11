# Setting Up Notion Webhooks

## Prerequisites

- A Notion workspace where you can create or manage integrations
- A **publicly reachable HTTPS endpoint** — Notion does not deliver to
  `localhost`. Use a tunnel (Hookdeck, ngrok, etc.) during development.

## Create or Open Your Integration

1. Go to https://www.notion.so/profile/integrations
2. Create a new **internal integration** (or open an existing one).
3. Connect the integration to the pages/databases you want to monitor — you
   only receive events for content the integration has access to.

## Add a Webhook Subscription

1. In the integration settings, open the **Webhooks** tab.
2. Click **Create a subscription** (or **Add subscription endpoint**).
3. Configure:
   - **Webhook URL**: your public HTTPS endpoint (e.g.
     `https://your-app.com/webhooks/notion`)
   - **Events**: pick the event types you want to receive (see
     [overview.md](overview.md))
4. Save the subscription.

## Complete the Handshake

When you save the subscription, Notion immediately sends a **single POST**
to your URL with this body and **no signature header**:

```json
{ "verification_token": "secret_REPLACE_WITH_VALUE_FROM_NOTION_HANDSHAKE" }
```

Your handler must:

1. Detect this request (it has no `X-Notion-Signature` header and the body
   contains a `verification_token` field).
2. Surface the token — log it, write it to your dashboard, or send it to
   yourself. **Do not try to verify a signature on this request.**
3. Respond with `200 OK`.

Then in the Notion UI:

4. Paste the captured `verification_token` into the **Verification token**
   field for that subscription.
5. Click **Verify subscription**.

Notion now activates the subscription and starts sending signed events. Store
the same token in your application as the HMAC signing key — typically as the
`NOTION_VERIFICATION_TOKEN` environment variable.

## Test Webhook Delivery

After verification, trigger an event in the workspace (edit a page, add a
comment, change a property) on content the integration can access.

In the Notion subscription UI you can also see recent deliveries and replay
them.

## Local Development

Notion will not deliver to `localhost`. Use Hookdeck to expose your local
server:

```bash
npx hookdeck-cli listen 3000 notion --path /webhooks/notion
```

Use the public URL Hookdeck prints as the **Webhook URL** in the Notion UI.
The handshake will arrive at that URL and be forwarded to your local
`http://localhost:3000/webhooks/notion`.

## Environment Variables

```bash
# .env
NOTION_VERIFICATION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Full Documentation

- [Notion Webhooks reference](https://developers.notion.com/reference/webhooks)
- [Manage your integrations](https://www.notion.so/profile/integrations)
