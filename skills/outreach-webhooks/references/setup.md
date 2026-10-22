# Setting Up Outreach Webhooks

## Prerequisites

- An Outreach OAuth app (or service-to-service app) with API access and scopes for the resources you subscribe to
- An access token for `https://api.outreach.io`
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 outreach --path /webhooks/outreach` for local development)

## How Do I Create a Webhook With a Secret?

Webhooks are created through the REST API. **Always send a `secret`**: Outreach only adds the `Outreach-Webhook-Signature` header when the webhook has one, and unsigned deliveries cannot be verified.

```bash
curl -X POST https://api.outreach.io/api/v2/webhooks \
  -H "Authorization: Bearer $OUTREACH_ACCESS_TOKEN" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "webhook",
      "attributes": {
        "url": "https://example.com/webhooks/outreach",
        "resource": "prospect",
        "action": "created",
        "secret": "a-long-random-string"
      }
    }
  }'
```

- `resource` and `action` default to `*`.
- Add `"payloadVersion": 2` to receive `beforeUpdate` values.
- Store the same secret as `OUTREACH_WEBHOOK_SECRET` in your app.
- To add a secret to an existing webhook, `PATCH /api/v2/webhooks/{id}` with `attributes.secret`.
- The secret and the `cleanupToken` are redacted when other users or apps list the webhook, so keep your own copy.

List webhooks with `GET /api/v2/webhooks`.

## Removing a Webhook

The create response includes `cleanupToken`, and every delivery carries it in the `outreach-webhook-cleanup-token` header. If your API token is revoked, `POST https://api.outreach.io/api/v2/webhooks/cleanup` with that token as the bearer token returns `204` (removed), `404` (already gone) or `401` (invalid token).

## Testing

Create a prospect in Outreach (or a task and complete it) and watch the delivery arrive. With the Hookdeck CLI you can inspect and replay requests in its web UI.

## Gotchas

- No secret means no signature header, so verification always fails.
- A hostname that resolves to a private IP disables the webhook for an hour; an unresolvable hostname disables it for a minute; a week of failures disables it permanently.
