# Setting Up OneLogin Webhooks

## Prerequisites

- A OneLogin account with administrator access to **Developers > Webhooks**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 onelogin --path /webhooks/onelogin` locally)

## Create the Secret

Generate a long random string (for example `openssl rand -hex 32`). Store it as `ONELOGIN_WEBHOOK_SECRET`. Pick a header name for it and store that as `ONELOGIN_WEBHOOK_HEADER` (e.g. `X-Onelogin-Secret`; if unset the examples use `Authorization`).

Prefer a plain random string over `Bearer <token>`. If you do type a `Bearer ` prefix in OneLogin, the stored secret must include it, because the whole value is compared.

## Register Your Endpoint

1. In the OneLogin admin portal go to **Developers > Webhooks** and create an Event Broadcaster.
2. Enter your endpoint URL (`https://example.com/webhooks/onelogin`).
3. Choose the **JSON Array** format type (OneLogin recommends it, and it is the only format the docs describe and the examples handle).
4. Add a **custom header**: name = your `ONELOGIN_WEBHOOK_HEADER`, value = your `ONELOGIN_WEBHOOK_SECRET`.
5. Save and enable the broadcaster.

(The OneLogin portal's labels may differ slightly between releases; the docs only say the broadcaster is configured under Developers > Webhooks with optional custom headers.)

## Test

Log in or out of a OneLogin user account and check that the endpoint logs a login success (`event_type_id` 5) or logout (7). Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/onelogin \
  -H "Content-Type: application/json" \
  -H "$ONELOGIN_WEBHOOK_HEADER: $ONELOGIN_WEBHOOK_SECRET" \
  -d '[{"event_type_id":5,"user_id":1,"user_name":"Test User","ipaddr":"203.0.113.1"}]'
```

## Notes

- Every event type is sent. Filter in your handler; there is no per-event subscription.
- Failed deliveries are retried up to 3 attempts in total.
