# Setting Up Pleo Webhooks

Pleo has no dashboard for webhooks. You create and manage subscriptions with the **Webhook Subscriptions API** at `https://external.pleo.io` (staging: `https://external.staging.pleo.io`).

## Prerequisites

- A Pleo integration (Developer Partner) with an **OAuth access token (JWT)** or **API key** issued during the customer's integration setup
- Read access to the API behind each event you subscribe to. For export events, that's `export-jobs:read`. No separate webhook scope is needed, and scopes can't be changed when creating a subscription.
- A public **HTTPS** endpoint that accepts `POST` requests with a JSON body

Authenticate API calls with either:

```bash
# OAuth
-H "Authorization: Bearer $PLEO_ACCESS_TOKEN"
# API key: Basic auth with the key as username and an empty password
-u "$PLEO_API_KEY:"
```

Credentials are scoped to one company or organisation. For multi-entity customers, create one subscription per entity with that entity's credentials.

## Register Your Endpoint (Create a Subscription)

```bash
curl -X POST https://external.pleo.io/v1/subscriptions \
  -H "Authorization: Bearer $PLEO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "status": "ACTIVE",
        "eventTypes": ["v1.export-job.created", "v1.vendor.created"],
        "endpointUrl": "https://your-app.com/webhooks/pleo"
      }'
```

The response contains the subscription `id`:

```json
{
  "data": {
    "id": "2bfde1d4-b3be-4135-960a-914b41ed2dcc",
    "status": "ACTIVE",
    "eventTypes": ["v1.export-job.created", "v1.vendor.created"],
    "endpointUrl": "https://your-app.com/webhooks/pleo",
    "createdAt": "2025-03-24T16:19:23.113886Z",
    "updatedAt": "2025-03-24T16:19:23.113886Z"
  }
}
```

Pleo recommends creating subscriptions as part of the customer's integration setup.

Other subscription endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/subscriptions` | List subscriptions |
| `GET` | `/v1/subscriptions/{id}` | Get one subscription |
| `PUT` | `/v1/subscriptions/{id}` | Update event types, URL, status, auth, headers |
| `DELETE` | `/v1/subscriptions/{id}` | Delete a subscription |
| `GET` | `/v1/subscriptions/{id}/activities` | Delivery activity for a subscription |
| `GET` | `/v1/subscriptions/{id}/secret` | Get the signing secret |

## Get Your Signing Secret

Pleo generates a secret per subscription. Fetch it with the subscription `id`:

```bash
curl https://external.pleo.io/v1/subscriptions/2bfde1d4-b3be-4135-960a-914b41ed2dcc/secret \
  -H "Authorization: Bearer $PLEO_ACCESS_TOKEN"
```

```json
{ "data": { "secretKey": "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD" } }
```

Store `data.secretKey` as `PLEO_WEBHOOK_SECRET`. Keep the full value including the `whsec_` prefix; the Standard Webhooks libraries strip it and base64-decode the rest.

## Alternative Endpoint Authentication

Pleo recommends HMAC signature verification. If your receiver can't verify signatures, Pleo offers two fallbacks, set when you create the subscription:

**Basic auth.** Pleo sends the credentials with every delivery as an `Authorization: Basic ...` header:

```json
{
  "status": "ACTIVE",
  "eventTypes": ["v1.export-job.created"],
  "endpointUrl": "https://your-app.com/webhooks/pleo",
  "endpointAuth": {
    "type": "BASIC",
    "credentials": { "username": "your_username", "password": "your_password" }
  }
}
```

**Custom headers.** Pleo adds static headers (an API key, a bearer token) to every delivery:

```json
{
  "status": "ACTIVE",
  "eventTypes": ["v1.export-job.created"],
  "endpointUrl": "https://your-app.com/webhooks/pleo",
  "customHeaders": { "x-api-key": "xxxxx", "Authorization": "Bearer your_token" }
}
```

These are shared-secret checks. They don't protect the body against tampering or replay, so prefer the signature where you can. Note that the subscription API returns the Basic credentials and custom headers in plain text.

## Firewall / IP Allowlist

Pleo delivers through Svix. If your endpoint sits behind a firewall, allowlist the [Svix source IPs](https://docs.svix.com/receiving/source-ips). Treat this as defence in depth, not a replacement for signature verification.

## Testing

Pleo has no "send test event" button. To test end to end:

1. Expose your local server: `npx hookdeck-cli listen 3000 pleo --path /webhooks/pleo`
2. Create a subscription on the **staging** API (`https://external.staging.pleo.io`) with the Hookdeck URL as `endpointUrl`
3. Trigger the event in Pleo, for example click **Export** in a test company, or add a new vendor

The example tests generate valid signatures locally, so you can test the handler without Pleo.
