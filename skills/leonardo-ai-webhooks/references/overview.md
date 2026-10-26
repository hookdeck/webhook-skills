# Leonardo.Ai Webhooks Overview

## What Are Leonardo.Ai Webhooks?

Leonardo.Ai is a generative image API. Instead of polling for a generation, you can configure a
**webhook callback** on a production API key. When a generation made with that key finishes,
Leonardo.Ai POSTs a JSON body to your callback URL. If you also set a callback API key, it is sent
as `Authorization: Bearer <key>`. Callbacks are not signed.

Requests are `POST` with `Content-Type: application/json`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `image_generation.complete` | A generation finishes | Download the images, update a job record, notify the user |

Dispatch on the top-level `type`. Acknowledge unknown types with `200`.

## Event Payload Structure

```json
{
  "type": "image_generation.complete",
  "object": "generation",
  "timestamp": 1699490546932,
  "api_version": "v1",
  "data": {
    "object": {
      "id": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
      "status": "COMPLETE",
      "prompt": "An oil painting of a cat",
      "images": [
        { "id": "...", "url": "https://cdn.leonardo.ai/users/.../Leonardo_Creative_An_oil_painting_of_a_cat_0.jpg", "generationId": "..." }
      ]
    }
  }
}
```

- `timestamp` is in milliseconds.
- `data.object` is the generation: `id`, `status`, `prompt`, model fields and an `images` array
  (one entry per image, each with a `url`).
- The documented sample also embeds the `apiKey` record, including `webhookCallbackApiKey`.
  **Don't log the whole payload**; it contains your callback key.

## Full Event Reference

See [Leonardo.Ai's webhook callback guide](https://docs.leonardo.ai/docs/guide-to-the-webhook-callback-feature).
