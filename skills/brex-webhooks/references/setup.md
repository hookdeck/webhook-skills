# Brex Webhooks Setup

## Prerequisites

- A Brex API access token (user token or OAuth partner token) with access to the Webhooks API and to the APIs whose events you subscribe to.
- A public HTTPS endpoint. For local development, use `npx hookdeck-cli listen 3000 brex --path /webhooks/brex`.

## 1. Register the Endpoint

```bash
curl -X POST https://api.brex.com/v1/webhooks \
  -H "Authorization: Bearer $BREX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/brex",
    "event_types": ["TRANSFER_PROCESSED", "TRANSFER_FAILED", "USER_UPDATED"]
  }'
```

Only **one endpoint per `client_id`** is allowed. Manage it with:

| Call | Purpose |
|------|---------|
| `GET /v1/webhooks` | List your registered webhook |
| `GET /v1/webhooks/{id}` | Get one webhook |
| `PUT /v1/webhooks/{id}` | Change `url`, `event_types`, or set `status` to deactivate it temporarily |
| `DELETE /v1/webhooks/{id}` | Unregister |

## 2. Get the Signing Secret

```bash
curl https://api.brex.com/v1/webhooks/secrets \
  -H "Authorization: Bearer $BREX_API_TOKEN"
```

The response is a list of `{ "secret": "...", "status": "ACTIVE" }` objects. Set `BREX_WEBHOOK_SECRET` to the `secret` whose `status` is `ACTIVE`, exactly as returned. The handlers strip an optional `whsec_` prefix and base64-decode it.

| `status` | Meaning |
|----------|---------|
| `ACTIVE` | Current key, signs every delivery |
| `PENDING_REVOKE` | Old key during a rotation, still signs deliveries until revoked |
| `REVOKED` | No longer signs anything |

## 3. Key Rotation

Usually one secret is returned. After a rotation Brex returns two (the new `ACTIVE` key and the old `PENDING_REVOKE` key) and puts **two signatures** in `Webhook-Signature`. A delivery is valid if any signature matches any key.

- **Your own handler:** fetch the secrets (cache them) and accept a match against any non-revoked key, or keep one secret and switch it to the new `ACTIVE` key before the old one is revoked.
- **Hookdeck:** the Brex source holds one secret. Both keys sign during the overlap, so verification keeps passing with either; paste the new `ACTIVE` secret before the old key is revoked.

## IP Allowlist

Brex sends webhooks from these addresses (add all of them):

```
44.228.126.217
50.112.21.217
52.24.126.164
54.148.139.208
2600:1f24:64:8000::/52
```

## Staging

Brex's API also runs at `https://api-staging.brex.com`. Register a separate endpoint there for test traffic.
