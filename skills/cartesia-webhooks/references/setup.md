# Setting Up Cartesia Webhooks

## Prerequisites

- A Cartesia account with a Line agent
- A public `https` URL for your endpoint (use `npx hookdeck-cli listen 3000 cartesia --path /webhooks/cartesia` while developing)
- For the API route, a Cartesia platform API key

## Choose Your Secret

The secret is required when you create a webhook. Generate a long random value and store it as
`CARTESIA_WEBHOOK_SECRET` in your app:

```bash
openssl rand -hex 32
```

Cartesia omits the secret from API responses afterwards, so keep your own copy.

## Register Your Endpoint

**Playground:** open your agent's **Webhook** settings and enter the `https` **URL** and the
**secret**.

**API:**

```bash
# Create the webhook
curl -X POST "https://api.cartesia.ai/agents/webhooks" \
  -H "X-API-Key: your-api-key" \
  -H "Cartesia-Version: 2026-03-01" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-server.example/webhooks/cartesia", "secret": "YOUR_WEBHOOK_SECRET"}'

# Attach it to an agent (turns on delivery for that agent)
curl -X PATCH "https://api.cartesia.ai/agents/{agent_id}" \
  -H "X-API-Key: your-api-key" \
  -H "Cartesia-Version: 2026-03-01" \
  -H "Content-Type: application/json" \
  -d '{"webhook_id": "agent_webhook_..."}'
```

Events are not selected per webhook: once attached, the agent's calls deliver `call_started`,
`call_turn`, `call_completed` / `call_failed` and `post_call_analysis`. Ignore the ones you
don't need and still return `200`.

## Test Your Endpoint

```bash
curl -sS -X POST "https://your-server.example/webhooks/cartesia" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_WEBHOOK_SECRET" \
  -d '{"type":"call_started","call_id":"ac_test_123","agent_id":"agent_demo","webhook_id":"agent_webhook_test","webhook_request_id":"webhook_req_test_123","timestamp":"2026-01-01T00:00:00Z"}'
```

Then place a call to the agent and watch the events arrive.
