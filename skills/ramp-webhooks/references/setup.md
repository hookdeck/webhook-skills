# Setting Up Ramp Webhooks

## Prerequisites

- A Ramp developer app and an API access token
- Token scopes covering every event you subscribe to (for example `transactions:read` for `transactions.*`, `bills:read` for `bills.*`, `reimbursements:read` for `reimbursements.*`)
- A public HTTPS endpoint that returns 2xx within 10 seconds

Ramp webhook subscriptions are created through the API; there is no dashboard step for the signing secret.

## Create a Subscription and Get Your Secret

`POST /developer/v1/webhooks` with your endpoint URL and the event types to receive. Ramp supports an optional `additional_headers` object (up to five custom headers, sent on verification requests and deliveries).

The response includes a `secret`. Store it as `RAMP_WEBHOOK_SECRET` and use it verbatim as the HMAC key.

The subscription starts in `pending_verification` and receives no business events until verified.

## Complete the Verification Challenge

1. Ramp POSTs a signed `{"type": "webhooks.verification", "challenge": ...}` to your URL.
2. Verify the signature, then return any 2xx.
3. Submit the challenge to `POST /developer/v1/webhooks/{id}/verify`. A successful call returns `{"success": true}` and activates the subscription.

## Local Testing

```bash
npx hookdeck-cli listen 3000 ramp --path /webhooks/ramp
```

Use the printed Hookdeck URL as the subscription URL. For test events, use a sandbox token and sandbox subscriptions, then call `POST /developer/v1/webhooks/mock-webhook-event` (it fires a mock event at all matching active subscriptions; mock events are signed like real ones and carry no test marker, so do not run it against a production receiver).

## Changing the URL

Delete the subscription, create a new one with the updated URL, and re-verify.
