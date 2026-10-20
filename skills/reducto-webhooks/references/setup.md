# Setting Up Reducto Webhooks

## Prerequisites

- A Reducto account and API key
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## How Do I Open the Svix Dashboard?

**Via Studio:** in [Reducto Studio](https://studio.reducto.ai), click
**Webhooks** in the sidebar. This opens your Svix dashboard.

**Via API:** `POST /configure_webhook` returns a dashboard URL:

```bash
curl -X POST https://platform.reducto.ai/configure_webhook \
  -H "Authorization: Bearer $REDUCTO_API_KEY"
```

## Register Your Endpoint

1. In the Svix dashboard click **+ Add Endpoint**.
2. Enter your endpoint URL, e.g. `https://your-app.com/webhooks/reducto`
   (HTTPS required in production).
3. Optionally restrict the endpoint to specific **channels** (e.g. `production`).
4. Save.

## Get Your Signing Secret

1. Open the endpoint in the Svix dashboard.
2. Copy the **Signing Secret** (starts with `whsec_`).
3. Store it as `REDUCTO_WEBHOOK_SECRET` in your environment.

## Submit Jobs With Webhooks Enabled

Webhooks are opt-in per job. Include `async.webhook` with `mode: "svix"`:

```bash
curl -X POST https://platform.reducto.ai/parse_async \
  -H "Authorization: Bearer $REDUCTO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "https://example.com/document.pdf",
    "async": {
      "webhook": {"mode": "svix", "channels": []},
      "metadata": {"user_id": "123"}
    }
  }'
```

```typescript
import Reducto from 'reductoai';

const client = new Reducto();
const job = await client.parse.runJob({
  input: 'https://example.com/document.pdf',
  async: {
    webhook: { mode: 'svix', channels: [] },
    metadata: { userId: '123' },
  },
});
```

An empty `channels` array delivers to all endpoints; list channel names to route
to specific endpoints.

## Local Testing

```bash
npx hookdeck-cli listen 3000 reducto --path /webhooks/reducto
```

Add the printed Hookdeck URL as an endpoint in the Svix dashboard, then submit an
async job (or use the Svix dashboard's testing tools) and watch the request arrive.

## Troubleshooting Delivery

- Check **Message Attempts** in the Svix dashboard for status codes.
- Make sure the endpoint is public and returns 2xx within 15 seconds.
- Replay failed messages with **Resend**.
