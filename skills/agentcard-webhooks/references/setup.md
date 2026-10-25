# Setting Up Agentcard Webhooks

## Prerequisites

- An Agentcard org token (sent as `Authorization: Bearer <token>`). A sandbox token creates sandbox endpoints, a production token production ones: do it once per mode.
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

Endpoints are created through the API (or in the dashboard under Developers → Webhooks):

```bash
curl -X POST https://api.agentcard.sh/api/v2/webhook_endpoints \
  -H "Authorization: Bearer $ORG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/agentcard",
    "enabled_events": ["card.*", "transaction.*", "balance.low", "approval.requested", "checkout_authorization.*"]
  }'
```

- `url` (required): an HTTPS URL you control.
- `enabled_events` (required): exact names, prefix wildcards (`card.*`), or `["*"]`. An endpoint receives only what it lists; unknown types are rejected.
- `description` (optional, up to 255 characters).

## Get Your Signing Secret

The create response carries the endpoint's `secret` (it looks like `whsec_...`) once. It can be read again with `GET /api/v2/webhook_endpoints/{id}/secret` and replaced with `POST /api/v2/webhook_endpoints/{id}/roll_secret`; deliveries are signed with the new secret from the next event, and Agentcard documents no overlap period, so update `AGENTCARD_WEBHOOK_SECRET` as soon as you roll it.

**Paste the whole secret, including the `whsec_` prefix.** Agentcard uses it as a plain HMAC key, UTF-8, exactly as shown. This is not Standard Webhooks: don't strip the prefix or base64-decode it, and don't use the `standardwebhooks` or `svix` libraries.

## Use Hookdeck

In Hookdeck, create a source of the Agentcard type, paste the endpoint's whole secret (with `whsec_`) into its verification field, and use the source URL as the endpoint `url` above. Hookdeck verifies `AgentCard-Signature` for you; if you also verify in your handler, use the same secret.

For local development:

```bash
npx hookdeck-cli listen 3000 agentcard --path /webhooks/agentcard
```

## Testing

Sandbox events deliver exactly like production, with `livemode: false`. If a sandbox integration completes actions but nothing arrives, check that the endpoint was created with a sandbox token. The Agentcard CLI can also forward signed events to your machine (`agent-cards companies webhooks listen --forward-to localhost:4000/webhooks`) and send a test event (`agent-cards companies webhooks test`).

Recent deliveries, with payloads and response codes, are listed by `GET /api/v2/webhook_endpoints/{id}/deliveries` and in the dashboard.

## Managing Endpoints

`GET /api/v2/webhook_endpoints` lists endpoints, `GET /{id}` reads one (without its secret), `PATCH /{id}` changes the URL, events, description or pause deliveries, and `DELETE /{id}` removes one. See the [Webhook endpoints API](https://docs.agentcard.com/api-reference/webhook-endpoints/overview).
