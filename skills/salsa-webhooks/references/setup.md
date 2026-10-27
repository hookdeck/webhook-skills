# Setting Up Salsa Webhooks

Salsa has no dashboard form for webhooks in its docs. You create webhook endpoints through the REST API.

## Prerequisites

- A Salsa API auth token (sent as `authorization: Bearer [your-auth-token]`)
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Create an Endpoint and Get Your Signing Secret

```bash
curl --request POST \
  --url https://api.sandbox.salsa.dev/api/rest/v1/webhook-endpoints \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'authorization: Bearer [your-auth-token]' \
  --data '{
    "description": "This is my webhook endpoint that will receive events",
    "endpointUrl": "https://my-webhook-url.com/path"
  }'
```

The response looks like this:

```json
{
  "data": {
    "id": "prtnrendpt_8ae05235-927e-449f-a40a-9611bc4794ee",
    "description": "This is my webhook endpoint that will receive events",
    "endpointUrl": "https://my-webhook-url.com/path",
    "status": "ENABLED",
    "webhookVersion": "2023-01-01",
    "signatureSecret": "some-secret"
  }
}
```

`signatureSecret` is the signing secret. Salsa's example prints the placeholder `some-secret`, but a real
secret is a `whsec_` prefix followed by base64 (the docs use `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` as an
example). Put the full value, prefix included, in `SALSA_WEBHOOK_SECRET`.

Notes on the request:

- The endpoint is `ENABLED` by default, so events are sent right away.
- The docs describe no per-event selection. An endpoint receives the events Salsa sends for your account.
- No challenge or validation request is sent when you create an endpoint, so your handler doesn't need a
  handshake.
- `webhookVersion` appears in the responses and can be set when updating an endpoint.

## Manage Endpoints

Send a `PUT` request to `webhook-endpoints/{webhookEndpointId}` to change `endpointUrl`, `description`,
`status` or `webhookVersion`. Set `status` to disable the endpoint: Salsa then stops sending events to it, and
delivery attempts are disabled. See the
[Create Webhook Endpoint reference](https://docs.salsa.dev/reference/createwebhookendpoint) for the exact
request shapes.

To rotate the signing secret, contact Salsa support. Update `SALSA_WEBHOOK_SECRET` when they do.

## Register Your Endpoint (Local Development)

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 salsa --path /webhooks/salsa

# FastAPI
npx hookdeck-cli listen 8000 salsa --path /webhooks/salsa
```

No account is needed. Use the URL the CLI prints as `endpointUrl`, then create or update an Employer or a
Worker to see an event arrive.

## Test Mode vs Live Mode

Webhooks behave the same in the sandbox as in production, with one exception: `Notification.workerPayday` is
not sent in the sandbox for workers paid by Direct Deposit. To test it there, pay a worker by Paper Check.
Sandbox and production use different API hosts (`api.sandbox.salsa.dev`), so create an endpoint in each.

## Troubleshooting Delivery

- Salsa retries failed deliveries on an exponential backoff schedule (see the overview). It documents no
  timeout and doesn't say which status codes are retried, so return `2xx` quickly and treat any other
  response as a failure that will be retried.
- If deliveries never arrive, check that the endpoint's `status` is `ENABLED` and that the URL is public.
- Salsa doesn't say how it treats a `400`, so fix a wrong secret promptly rather than assuming the event will be retried.
