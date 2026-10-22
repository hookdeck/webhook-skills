# Setting Up Bird Webhooks

## Prerequisites

- A Bird workspace, and a user or API key with the `webhooks` scope (`webhooks:read` to inspect, `webhooks:write` to manage)
- A publicly reachable **HTTPS** URL for your endpoint (at most 2048 characters). Private, loopback and link-local addresses are rejected with a `422`.

## Create an Endpoint

Pick one:

1. **Dashboard:** Platform tools > Webhooks.
2. **Bird CLI:**
   ```bash
   bird webhooks create \
     --url https://example.com/webhooks/bird \
     --events email.delivered,email.bounced,email.complained \
     --description "Production delivery + bounce notifications"
   ```
3. **API:** `POST /v1/webhooks` with `url`, `events` and an optional `description`.

The `events` array lists up to 100 types from the event catalog. An endpoint receives only the types it lists. Wildcards such as `sms.*` are refused with a `422`, and subscriptions don't expand when new types ship. Replace the list with `PATCH /v1/webhooks/{webhook_id}`.

Before creating an endpoint, filter `GET /v1/webhooks` by `url` to find an existing one, rather than creating a duplicate.

## Get Your Signing Secret

The create response includes the endpoint's signing `secret` (prefixed `whsec_`) **exactly once**:

```json
{
  "id": "whk_01ky7q639cfh99xb7ysy2x2gzj",
  "url": "https://example.com/webhooks/bird",
  "events": ["email.delivered", "email.bounced", "email.complained"],
  "status": "active",
  "secret": "whsec_c+dgRBsFELJ9mR4tu2cyhK0gTMMkqntv"
}
```

Store it immediately (for example as `BIRD_WEBHOOK_SECRET`). It can't be retrieved again. Each endpoint has its own secret.

## Rotate the Secret

`POST /v1/webhooks/{webhook_id}/rotate-secret` returns a new secret once. For the next 24 hours Bird signs each delivery with both secrets, so `webhook-signature` holds two space-delimited `v1,` entries. Deploy the new secret during the overlap; the Standard Webhooks libraries try every entry. After 24 hours the old secret stops signing. An endpoint holds at most 5 concurrently valid secrets, so rotating repeatedly inside the window fails with `WebhookTooManySecrets`.

## Manage Endpoints

- List, get, update and delete are all supported. Deleting stops all deliveries, including pending retries, and can't be undone. To pause temporarily, set `status` to `paused`.
- `GET /v1/webhooks/{webhook_id}/attempts` lists recent delivery attempts with status codes and latency.

## Test Your Endpoint

- `POST /v1/webhooks/{webhook_id}/test` sends a signed synthetic event and returns whether your endpoint accepted it. Pass `{"event_type": "email.delivered"}` to choose the type. The body is a minimal stub with only the event type, not a real payload. Your endpoint has 10 seconds to respond.
- For end-to-end testing with real payloads, send to Bird's sandbox addresses, which emit real webhook events.
- Local development: `npx hookdeck-cli listen 3000 bird --path /webhooks/bird` (use `8000` for FastAPI) and register the printed URL as the endpoint.

## No Auth Headers

Bird's docs describe no API key, basic auth or IP allowlist for webhooks. The signature is the authentication, so always verify it.
