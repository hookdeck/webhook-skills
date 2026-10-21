# Setting Up AgentMail Webhooks

## Prerequisites

- An AgentMail account and API key (`AGENTMAIL_API_KEY`) from the [AgentMail Console](https://console.agentmail.to)
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck CLI tunnel below

## Step 1: Expose Your Local Endpoint

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 agentmail --path /webhooks/agentmail

# FastAPI
npx hookdeck-cli listen 8000 agentmail --path /webhooks/agentmail
```

No account required. The CLI prints a public URL that forwards to `/webhooks/agentmail` on your machine, plus a web UI for inspecting requests.

## Step 2: Create the Webhook

`event_types` is **required** and must name at least one event. There's no "all events" default, and a request without it returns `400`.

### In the Console

1. Open the [AgentMail Console](https://console.agentmail.to) and go to **Webhooks**
2. Click **Create Webhook**
3. Paste your URL, e.g. `https://<your-hookdeck-url>/webhooks/agentmail`
4. Select the events you want to receive
5. Save, then copy the signing secret (`whsec_...`)

### With the SDK

```python
from agentmail import AgentMail

client = AgentMail()  # reads AGENTMAIL_API_KEY

webhook = client.webhooks.create(
    url="https://your-app.com/webhooks/agentmail",
    event_types=["message.received", "message.sent", "message.delivered", "message.bounced"],
)
print(webhook.webhook_id, webhook.secret)
```

```typescript
import AgentMail from "agentmail";

const client = new AgentMail();
const webhook = await client.webhooks.create({
  url: "https://your-app.com/webhooks/agentmail",
  eventTypes: ["message.received", "message.sent", "message.delivered", "message.bounced"],
});
```

### With the CLI

```bash
agentmail webhooks create \
  --url https://your-app.com/webhooks/agentmail \
  --event-types message.received \
  --event-types message.sent
```

## Step 3: Get the Signing Secret

Each webhook has its own secret, starting with `whsec_`. It's shown in the Console when you create the webhook, and you can fetch it later:

```python
webhook = client.webhooks.get(webhook_id="ep_xxx")
signing_secret = webhook.secret
```

```typescript
const webhook = await client.webhooks.get("ep_xxx");
const signingSecret = webhook.secret;
```

```bash
agentmail webhooks get --webhook-id ep_xxx
```

Put it in your environment:

```bash
AGENTMAIL_WEBHOOK_SECRET=whsec_your_secret_here
```

If you register several webhooks (for example one per pod), each has a different secret. Run one endpoint per webhook, or try each secret in turn.

## Which Events Need Extra Setup?

- `message.received.spam`, `message.received.blocked` and `message.received.unauthenticated` are **excluded by default**. List them explicitly, and the API key that creates the webhook needs `label_spam_read`, `label_blocked_read` or `label_unauthenticated_read` (otherwise creation returns `403`). Messages that get these labels are no longer sent as `message.received`.
- `message.security.*` needs `message_read` and Agent Armor (Monitor mode for `completed`, Hold mode for `review`/`override`).
- `calendar.event.*` needs `calendar_event_read`.
- `message.opened` needs `track_opens` on the send, a custom domain with tracking enabled, and an HTML body.

## How Do I Scope a Webhook to a Pod or Inbox?

By default a webhook belongs to the organization and receives events for all inboxes. To narrow it:

- Pass `pod_ids` or `inbox_ids` to `webhooks.create` (the webhook stays organization-owned), or
- Create it on the scoped endpoints: `pods.webhooks.create(pod_id, ...)` or `inboxes.webhooks.create(inbox_id, ...)`

A webhook can list at most 10 pods and inboxes combined. When the same event matches webhooks at different levels, each one gets its own delivery with a different `svix-id` but the same `event_id`.

## Can I Add My Own Headers?

Yes. Pass `headers` on create (e.g. `{"Authorization": "Bearer ..."}`) and AgentMail sends them with every delivery. Values are write-only; rotate them with `update_headers`. Custom headers are extra; still verify the Svix signature.

## Changing Events or Re-enabling

```python
client.webhooks.update(webhook_id="ep_xxx", event_types=["message.received", "message.bounced"])  # replaces the list
client.webhooks.update(webhook_id="ep_xxx", enabled=True)  # re-enable after auto-disable
```

AgentMail disables an endpoint after 5 days of failed deliveries and doesn't notify you, so monitor the `enabled` field.

## Testing

Send an email to one of your AgentMail inboxes to trigger `message.received`, or send a test event from the Console. The Hookdeck CLI web UI shows each request and response.
