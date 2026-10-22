# Setting Up Kit Webhooks

## Prerequisites

- A Kit account on a [plan with API access](https://kit.com/pricing)
- A Kit API key (`X-Kit-Api-Key`) or OAuth access token
- A public HTTP(S) URL for your handler (e.g. `https://your-app.com/webhooks/kit`)

## Create the Endpoint and Get Your Secret

Use the API or the **Webhooks** page at [app.kit.com/webhooks](https://app.kit.com/webhooks).
With the API:

```bash
curl -X POST https://api.kit.com/v4/webhook_endpoints \
  -H "X-Kit-Api-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/kit",
    "events": ["subscriber.created", "subscriber.activated", "subscriber.tag_added"]
  }'
```

The response includes `webhook_endpoint.secret` (looks like `whsec_...`). **It is returned in
plaintext only once** (and again when you rotate it). Store the whole string as
`KIT_WEBHOOK_SECRET`, `whsec_` prefix included.

## Subscribe to Events

`PATCH /v4/webhook_endpoints/{id}` with an `events` array replaces the current subscriptions.
Only events marked **Available** in the [event types](https://developers.kit.com/webhooks/event-types)
catalog can be subscribed to; planned ones return `422`.

## Rotate the Secret

`POST /v4/webhook_endpoints/{id}/rotate_secret` returns the new secret. For the overlap window
(`previous_secret_expires_at`) Kit signs with both secrets, so `X-Kit-Signature` carries two `v1`
values; a verifier that accepts any matching `v1` keeps working with no downtime. Close the window
early with `POST /v4/webhook_endpoints/{id}/revoke_previous_secret`.

## Check Deliveries

`GET /v4/webhook_endpoints/{id}/deliveries` lists the last 30 days of deliveries and attempts with
the status code your URL returned. Set the endpoint `status` to `disabled` to pause deliveries.

## Local Development

```bash
npx hookdeck-cli listen 3000 kit --path /webhooks/kit
```

Register the tunnel URL as the endpoint `url` (it is public HTTPS). For FastAPI use port `8000`.
Then trigger an event, e.g. add a subscriber for `subscriber.created`.
