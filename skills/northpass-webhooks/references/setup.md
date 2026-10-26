# Setting Up Northpass Webhooks

## Prerequisites

- A Northpass school on a plan that includes the Webhooks app (Premium)
- Admin access to the school
- A publicly reachable HTTPS endpoint (locally, use
  `npx hookdeck-cli listen 3000 northpass --path /webhooks/northpass`)

## Get Your Shared Secret

Webhooks are managed in the Northpass **Webhooks** app. The school's shared secret is viewable
from that app. Store it as `NORTHPASS_WEBHOOK_SECRET`; it is used as-is (its UTF-8 bytes) as the
HMAC key. The same secret signs every webhook for the school.

## Register Your Endpoint

1. Open the Webhooks app in your Northpass school.
2. Add your endpoint URL (for example `https://example.com/webhooks/northpass`).
3. Select the events (subscriptions) to receive, such as `learner_created_events`,
   `learner_enrolled_to_course_events` and `course_completed_events`.

See the [Northpass webhooks guide](https://developers.northpass.com/docs/getting-started-webhooks)
for the current screens and the full event list.

## Test

Sign a documented payload yourself and replay it:

```bash
BODY='{"data":{"id":"11111111-1111-1111-1111-111111111111","type":"learner_created_events","links":{}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$NORTHPASS_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:3000/webhooks/northpass \
  -H "Content-Type: application/json" \
  -H "X-Northpass-Hmac-SHA256: $SIG" \
  -d "$BODY"
```

## Keep Delivery Healthy

A failed delivery is retried hourly for 24 hours, after which **all** of the school's webhooks
are disabled and the admin is notified. If that happens, fix the endpoint, re-enable webhooks in
the Webhooks app, and use the List all sent webhooks endpoint to find failed messages.
