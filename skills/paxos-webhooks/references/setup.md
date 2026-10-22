# Setting Up Paxos Webhooks

## Prerequisites

- A Paxos Dashboard account (sandbox and production are separate)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 paxos --path /webhooks/paxos`)

## Choose Your Credential

Paxos won't generate one for you. Pick a header name (for example `X-Paxos-Webhook-Secret`) and a long random value (for example `openssl rand -hex 32`). Avoid spaces; if you use a prefix like `Bearer abc`, the *entire* string is the value. Store them as:

```bash
PAXOS_WEBHOOK_HEADER=X-Paxos-Webhook-Secret
PAXOS_WEBHOOK_SECRET=<the value>
```

## Register Your Endpoint

1. In Dashboard, go to **Developer > Webhooks** and click **Create Webhook**.
2. Enter a unique **Name** and your endpoint **URL** (HTTPS required).
3. Set **Auth Type** to **API Key**, then enter the **API Key Header** name and **API Key** value from above.
4. Select the **Event Types** to receive (Identity, Transfer, Orchestration, ...).
5. Set the **Rate Limit** (1-100 RPS, default 10) and click **Create**.

Webhooks can't be edited. To rotate the credential, create a new webhook with the new value, switch your endpoint, then delete the old one. If approvals are enabled under Admin > Approvals, creation and deletion need approval.

## Test

Once the webhook shows **Active**, use **Actions > Test**, pick an event type and send it. The event arrives with `is_test: true`. Or replay locally with curl:

```bash
curl -X POST http://localhost:3000/webhooks/paxos \
  -H "Content-Type: application/json" \
  -H "$PAXOS_WEBHOOK_HEADER: $PAXOS_WEBHOOK_SECRET" \
  -d '{"id":"bd019f1c-89a7-4372-9d21-eaad9280dc41","type":"identity.approved","source":"com.paxos","time":"2025-01-01T14:30:02Z","object":"event","is_test":false}'
```

You can also trigger real sandbox events, such as creating an identity with the CreateIdentity API to receive `identity.approved`.

## Get the Full Event

The payload is thin. Call the Get Event API with the event `id` (an authenticated Paxos API request) to read the full object.

## Network Notes

Paxos documents no IP allowlist for webhook deliveries, so rely on the API Key header and HTTPS.
