# Setting Up Cin7 Core Webhooks

## Prerequisites

- A Cin7 Core account with the Automation module and API access (account ID and application key)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 cin7-core --path /webhooks/cin7-core`)

## Choose the credential

Use a custom header (ExternalHeaders) or Bearer auth on the Cin7 Core webhook, and paste the exact header name and whole value, e.g. "authorization" and "Bearer <token>".

| Option | `ExternalAuthorizationType` | Header sent |
|--------|-----------------------------|-------------|
| Bearer | `bearerauth` | `authorization: Bearer <token>` |
| Custom header | `noauth` plus `ExternalHeaders` | Your own name and value |

`basicauth` is not covered by Hookdeck's Cin7 Core source; avoid it.

## Register Your Endpoint

Create the webhook with `POST /webhooks` (see the [API docs](https://dearinventory.docs.apiary.io/)), setting:

- the target URL (e.g. `https://example.com/webhooks/cin7-core`)
- the webhook `Type` (e.g. `Sale/Created`)
- `ExternalAuthorizationType` and the token, or `ExternalHeaders` with a key/value pair
- `IsActive` true

Create one webhook per `Type` you need.

## Configure the endpoint

```bash
CIN7_CORE_WEBHOOK_HEADER=authorization
CIN7_CORE_WEBHOOK_SECRET="Bearer your-token"
```

The secret is the exact, whole header value, including `Bearer ` if you used it.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/cin7-core \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"EventType":"Sale/Created"}'
```

## Delivery

6 attempts, then the webhook is deactivated; re-activate it in Cin7 Core if that happens.
