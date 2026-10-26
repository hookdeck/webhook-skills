# Setting Up Leonardo.Ai Webhook Callbacks

## Prerequisites

- A Leonardo.Ai API account that can create a **production** API key
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 leonardo-ai --path /webhooks/leonardo-ai` locally)

## Get Your Callback API Key

Set a webhook callback API key on the production API key, then paste it here.

(That is Hookdeck's setup note for the Leonardo.Ai source. In your own receiver, "here" is
`LEONARDO_AI_WEBHOOK_SECRET`.)

1. Create a production API key in the Leonardo.Ai API settings.
2. In the optional webhook settings, enter your **callback URL** and a **webhook callback API key**
   of your choice (a long random string).
3. Store the key, without any `Bearer ` prefix, as `LEONARDO_AI_WEBHOOK_SECRET`.

The callback URL and key are optional settings on a production API key. **Changing them means
creating a new production API key**, so plan the secret rotation: create the new key, update
`LEONARDO_AI_WEBHOOK_SECRET`, then switch your generation requests to the new key.

## Register Your Endpoint

Use `https://example.com/webhooks/leonardo-ai` as the callback URL. Leonardo.Ai sends:

```
POST /webhooks/leonardo-ai
Authorization: Bearer <webhook callback API key>
Content-Type: application/json
```

## Test

Run a generation with the production API key, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/leonardo-ai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEONARDO_AI_WEBHOOK_SECRET" \
  -d '{"type":"image_generation.complete","object":"generation","timestamp":1699490546932,"api_version":"v1","data":{"object":{"id":"gen-1","status":"COMPLETE","images":[{"id":"img-1","url":"https://cdn.leonardo.ai/example.jpg"}]}}}'
```
