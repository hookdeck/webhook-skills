# Setting Up Moneybird Webhooks

## Prerequisites

- A Moneybird account and an API access token with the `settings` scope (`Authorization: Bearer <token>`)
- Your administration ID
- A publicly reachable HTTPS endpoint that answers `200` (use the Hookdeck CLI for local development)

## Register Your Endpoint

Webhooks are created through the API:

```bash
curl -X POST https://moneybird.com/api/v2/$ADMINISTRATION_ID/webhooks.json \
  -H "Authorization: Bearer $MONEYBIRD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/moneybird",
    "enabled_events": ["sales_invoice_created", "sales_invoice_state_changed_to_paid", "contact_created"]
  }'
```

- `url` (required): the HTTPS URL that receives events. It must answer `200` when you register it.
- `enabled_events` (optional): event names or group names from the [events list](https://developer.moneybird.com/webhooks/events). Omit it for the legacy behaviour (sales invoice state changes only).

## Get Your Signing Secret

The `201` response includes the webhook's `secret`. **The API returns it only at creation**, so store it right away as `MONEYBIRD_WEBHOOK_SECRET`. Use it exactly as returned. `GET`, `activate` and `deactivate` responses do not include it. (The response also has a `token`; that is the `webhook_token` in the body, not the signing secret.)

If you lose it: open the webhook's detail page inside Moneybird and reveal the secret there after an MFA confirmation. Webhooks created before signing was introduced were backfilled with a secret, so every webhook is signed.

## Rotating the Secret

Rotate on the same detail page and pick a grace period. While both secrets are valid, each delivery carries one `v1=` digest per secret, and a verifier that accepts any matching `v1` keeps working throughout. See [verification.md](verification.md).

## Testing

For local development:

```bash
npx hookdeck-cli listen 3000 moneybird --path /webhooks/moneybird
```

Use the Hookdeck URL as the webhook `url`, then create or update an invoice or contact in Moneybird to trigger a push. Moneybird stores the last HTTP status and body your URL returned; read them from `GET /{administration_id}/webhooks.json` when debugging.

## Managing Webhooks

`GET /{administration_id}/webhooks.json` lists webhooks, `PATCH .../webhooks/{id}/deactivate` and `.../activate` pause and resume one, and `DELETE .../webhooks/{id}` removes it.
