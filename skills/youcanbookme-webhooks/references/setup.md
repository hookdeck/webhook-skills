# Setting Up YouCanBookMe Webhooks

## Prerequisites

- A YouCanBookMe account on a plan that includes webhooks (the help articles conflict, so check
  your current plan)
- A publicly reachable HTTPS endpoint (locally:
  `npx hookdeck-cli listen 3000 youcanbookme --path /webhooks/youcanbookme`)

## Choose Your Secret

Pick a header name and a long random value, and store them on your server:

```bash
YOUCANBOOKME_WEBHOOK_HEADER=Authorization    # any header name you like
YOUCANBOOKME_WEBHOOK_SECRET=change-me-long-random-value
```

`YOUCANBOOKME_WEBHOOK_SECRET` must be the **exact, whole header value**. If you type
`Bearer abc123` as the value in YouCanBookMe, set the variable to `Bearer abc123`.

## Register Your Endpoint

1. In YouCanBookMe, open the booking page and go to its notifications.
2. Add a **webhook** action and choose the trigger (booking made, rescheduled, cancelled,
   reminder, follow-up or no-show).
3. Enter your URL, e.g. `https://example.com/webhooks/youcanbookme`.
4. Choose the request method. The example handlers accept `POST`, `PUT`, `PATCH`, `DELETE` and `GET`.
5. Under **Request Headers**, add a key/value pair: the header name and the secret value from above.
6. Write the body with shorthand codes and add an `event` field that names the trigger, e.g.
   `{"event": "booking_made", "email": "{EMAIL}"}`.
7. Save. Repeat per trigger, each with its own `event` value.

## Test

Make a test booking, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/youcanbookme \
  -H "Content-Type: application/json" \
  -H "Authorization: $YOUCANBOOKME_WEBHOOK_SECRET" \
  -d '{"event":"booking_made","email":"jane@example.com","start":"2026-11-02 10:00"}'
```

(Use your own header name in place of `Authorization` if you changed it.)
