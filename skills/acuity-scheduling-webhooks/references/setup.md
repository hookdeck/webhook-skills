# Setting Up Acuity Scheduling Webhooks

## Prerequisites

- Acuity Scheduling account with access to Integrations (static webhooks) or API access (dynamic)
- A public HTTPS (port 443) or HTTP (port 80) endpoint URL, at most 256 characters

## Get Your Signing Key (API Key)

Acuity has no separate webhook secret. Notifications are signed with your **API key**:

- **Static webhooks:** the main admin's API key
- **Dynamic webhooks:** the API key of the user who created the webhook

Find it under Integrations → API in your Acuity account (the same page shows your user ID).
Store it as `ACUITY_API_KEY`.

## Register Your Endpoint

### Static webhook

1. In Acuity go to Integrations and open the **Webhook** integration.
2. Enter your endpoint URL.
3. Save. Acuity then notifies it of appointment changes.

### Dynamic webhook

Authenticate with HTTP Basic auth (user ID and API key) and create one subscription per event:

```bash
curl -u "$ACUITY_USER_ID:$ACUITY_API_KEY" -X POST https://acuityscheduling.com/api/v1/webhooks \
  -H 'Content-Type: application/json' \
  -d '{"event":"appointment.scheduled","target":"https://example.com/webhooks/acuity-scheduling"}'
```

Events: `appointment.scheduled`, `appointment.rescheduled`, `appointment.canceled`,
`appointment.changed`, `order.completed`. List with `GET /api/v1/webhooks`; delete with
`DELETE /api/v1/webhooks/:id`.

## Test Without Booking

Acuity's docs suggest simulating a webhook with curl. Note that a real request is signed, so an
unsigned simulation is rejected by a verifying endpoint. Sign it yourself:

```bash
BODY='action=scheduled&id=1&calendarID=1&appointmentTypeID=1'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$ACUITY_API_KEY" -binary | base64)
curl -d "$BODY" -H "X-Acuity-Signature: $SIG" http://localhost:3000/webhooks/acuity-scheduling
```

## Local Development

```bash
npx hookdeck-cli listen 3000 acuity-scheduling --path /webhooks/acuity-scheduling
```
