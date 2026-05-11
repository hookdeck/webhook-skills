# Setting Up Intercom Webhooks

## Prerequisites

- An Intercom workspace
- An app in the [Intercom Developer Hub](https://app.intercom.com/a/apps/_/developer-hub)
- Your application's public webhook endpoint URL (HTTPS recommended in production)

## Get Your Signing Secret

Intercom signs webhooks using your **app's `client_secret`** — it is **not** a
dedicated webhook secret. To find it:

1. Sign in to the Intercom Developer Hub.
2. Open your app → **Basic Information**.
3. Copy the **Client secret** value.
4. Store it as `INTERCOM_CLIENT_SECRET` in your application's environment.

> Rotating the client secret will invalidate signatures for all existing webhook
> deliveries — rotate carefully and update your environment in lockstep.

## Register Your Webhook Endpoint

1. In the Developer Hub, open your app.
2. Go to **Webhooks** (under **Configure**).
3. Set the **Endpoint URL** (e.g. `https://your-app.com/webhooks/intercom`).
4. Choose the **API version** you want notifications to use.
5. Select the **Topics** you want to subscribe to (see "Recommended Topics" below).
6. Click **Save**.

When you save, Intercom sends a `ping` notification to verify the endpoint. Your
handler must return `2xx` for the webhook to be saved. If your endpoint fails the
handshake, the Developer Hub will show an error — check your server logs.

## Recommended Topics by Use Case

**Conversation routing / alerting:**
- `conversation.user.created`
- `conversation.user.replied`
- `conversation.admin.assigned`

**Sync replies to a CRM or analytics warehouse:**
- `conversation.admin.replied`
- `conversation.admin.closed`

**Contact sync / lead routing:**
- `contact.user.created`
- `contact.lead.created`
- `contact.user.tag.created`

**Ticket mirroring:**
- `ticket.created`
- `ticket.state.updated`
- `ticket.admin.assigned`

## Test Webhook Delivery

1. After saving, Intercom delivers a `ping` immediately — check your logs.
2. To replay or inspect deliveries, open the webhook in the Developer Hub. The
   delivery log shows the request body, status code, and any retries.
3. To generate real events, take the action in your Intercom workspace (start a
   conversation, create a contact, etc.).

## Local Development

For local webhook testing, use the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 intercom --path /webhooks/intercom
```

Use the URL it prints as the **Endpoint URL** in the Developer Hub.

## Environment Variables

Store your secret securely — never commit it:

```bash
# .env
INTERCOM_CLIENT_SECRET=your_app_client_secret_here
```

## IP Allowlisting (Optional)

Intercom publishes a list of egress IPs in its webhooks documentation. For
defence in depth you can allowlist these in your firewall, but **always also
verify the signature** — IP allowlisting alone is not a substitute for HMAC
verification.

## Full Documentation

- [Intercom Webhooks](https://developers.intercom.com/docs/webhooks)
- [Webhook Models](https://developers.intercom.com/docs/references/webhooks/webhook-models)
