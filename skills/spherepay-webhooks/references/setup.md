# Setting Up SpherePay Webhooks

## Prerequisites

- A SpherePay account and API key (used as `Authorization: Bearer {api_key}`)
- A publicly reachable HTTPS URL for your handler (HTTPS is required in live mode; use the Hookdeck CLI for local development)

## Register Your Endpoint

Endpoints are registered through the API, not a dashboard form:

```bash
curl -X POST https://api.spherepay.co/v2/webhook-endpoints \
  -H "Authorization: Bearer $SPHERE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/webhooks/spherepay",
    "subscribedEvents": ["customer.approved", "customer.rejected", "transfer.*"],
    "apiVersion": "2026-08-01"
  }'
```

- `subscribedEvents` takes event names from the [event catalog](https://docs.spherepay.co/concepts/webhooks/event-catalog) or the wildcards `*`, `customer.*`, `transfer.*`.
- `apiVersion` is a `YYYY-MM-DD` date that is not in the future.
- New endpoints are enabled immediately.

## Get Your Signing Secret

The creation response includes `secret` (prefixed `whsec_`). It is returned **exactly once**, is never returned by `GET` requests, and each endpoint has its own secret. Store it as `SPHEREPAY_WEBHOOK_SECRET`.

Paste the whole secret, including the whsec_ prefix. SpherePay uses it as a plain HMAC key.

That means: do not strip `whsec_`, do not base64- or hex-decode it, and do not use a Standard Webhooks or Svix library. In Hookdeck, paste the same whole value into the SpherePay source's signing secret.

## Update or Rotate

There is no update operation yet. To change the URL, the subscribed events, or the secret, create a new endpoint, confirm it verifies deliveries, then delete the old one. Both endpoints receive matching events in between, so dedupe on the event `id`.

## Testing

- Use `GET /v2/events` and the delivery details in the Events API to inspect deliveries and replay a failed one. A manual replay carries a fresh `Sphere-Timestamp` and `Sphere-Signature` with a byte-identical body.
- SpherePay makes one attempt per event, so a handler that was down or returned non-2xx needs a manual replay.
- Test-mode events have `livemode: false`.

```bash
npx hookdeck-cli listen 3000 spherepay --path /webhooks/spherepay
```

Use the Hookdeck URL as the endpoint `url`. Hookdeck gives you retries and replay on top of SpherePay's single attempt.
