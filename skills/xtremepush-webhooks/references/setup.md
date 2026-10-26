# Setting Up Xtremepush Webhooks

## Prerequisites

- An Xtremepush project with access to integrations
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint and Get the Webhook Secret Key

1. In Xtremepush, open the Webhooks integration (see the [webhooks documentation](https://docs.xtremepush.com/docs/webhooks-integration)) and add a webhook with your endpoint URL.
2. Select the events to receive (start with `message_send` and `message_delivery`).
3. Choose the authentication type. The options are None, Basic Auth, Bearer Token and Signed Payload.
4. With Signed Payload, Xtremepush generates a Webhook Secret Key. Copy it into `XTREMEPUSH_WEBHOOK_SECRET`.

**Choose the Signed Payload auth type on the Xtremepush webhook and paste its Webhook Secret Key. Other auth types are unsigned and fail verification.**

Use the key exactly as shown, as a UTF-8 string (no base64 or hex decoding). A new key replaces the old one immediately, but the old one keeps signing for a fixed 24 hours, so deliveries carry two `v1` entries during that window.

## Hookdeck Source

Hookdeck's source type is `XTREMEPUSH`, labelled "Xtremepush", and Hookdeck's source verifies the signature. Create it with the Webhook Secret Key. Xtremepush's docs don't name the HTTP method. **Hookdeck's Xtremepush source pre-selects POST without managing the method (you can change it), so any other method the sender uses must also be allowed on the source.**

## Local Development

```bash
npx hookdeck-cli listen 3000 xtremepush --path /webhooks/xtremepush
```

Use the Hookdeck URL as the webhook URL in Xtremepush. For FastAPI use port `8000`.

## Respond Quickly

Respond within 5 seconds or the delivery may fail. Return `2xx` as soon as the signature is verified and do the slow work asynchronously. Use `401` for a missing or bad signature. "Notify on error" emails your team periodically while failures continue.
