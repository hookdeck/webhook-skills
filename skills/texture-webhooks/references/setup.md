# Setting Up Texture Webhooks

## Prerequisites

- A Texture workspace where you can manage destinations
- A public HTTPS endpoint for your receiver. Texture delivers from the cloud, so
  `http://localhost` URLs are never reached: use the Hookdeck CLI or ngrok locally.

## Get Your Signing Secret

Paste the whole secret, including the whsec_ prefix. Texture uses it as a plain HMAC key.

1. Create (or open) a webhook destination in the Texture dashboard, or use the
   [destinations API](https://docs.texturehq.com/management-api/destinations).
2. The `secret` field is optional and can be any string you choose, for example
   `whsec_my-webhook-secret`. If you omit it, Texture generates a random one for you.
3. Store the whole value as `TEXTURE_WEBHOOK_SECRET`. Do not strip `whsec_`, and do not
   base64-decode it. It is not a Standard Webhooks key.

## Register Your Endpoint

1. Set a **Label** (for example "Production Webhook") and the **URL** of your receiver, such as
   `https://example.com/webhooks/texture`.
2. Optionally add **Headers**; Texture sends them on every request.
3. Choose the events to subscribe to. In the API these are UPPER_SNAKE names, for example
   `["DEVICE_UPDATED", "COMMAND_SUCCEEDED", "CUSTOMER_CREATED"]`. Optionally scope by device
   type (`ALL`, `BATTERIES`, `CHARGERS`, `SOLAR_INVERTERS`, `THERMOSTATS`, `VEHICLES`).
4. Optionally set `redactCategories` (`LOCATION`, `CONTACT`) to omit personal data from payloads.

## Local Development

```bash
npx hookdeck-cli listen 3000 texture --path /webhooks/texture
```

Use the printed URL as the destination URL.

## Testing

Each destination belongs to one workspace, so use a separate staging workspace and destination
for testing. Trigger a real event (for example a device update) and check your logs, or replay
requests from the Hookdeck CLI web UI.
