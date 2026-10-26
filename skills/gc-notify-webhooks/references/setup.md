# Setting Up GC Notify Callbacks

## Prerequisites

- A GC Notify service with access to the API integration page
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 gc-notify --path /webhooks/gc-notify` locally)

## Choose a Bearer Token

You choose the bearer token yourself; GC Notify puts it in the `Authorization` header of every
callback. Per GC Notify's guidance, when creating it:

- Keep it secure and change it if you think it may no longer be trusted
- Make sure callbacks you receive contain your bearer token in the `Authorization` header
- Consider a hashed value so GC Notify doesn't hold the true token

Store the token as `GC_NOTIFY_WEBHOOK_SECRET`.

## Hookdeck Source

If you receive callbacks through Hookdeck, create a source with type `GC_NOTIFY` ("GC Notify").
Hookdeck shows this note for the source:

> Paste the bearer token you set for the callback in GC Notify.

Paste just the token. Hookdeck sends and matches the `Bearer ` scheme itself.

## Register Your Endpoint

1. Sign in to GC Notify.
2. Go to the **API integration** page and select **Callbacks**.
3. Enter your callback URL (e.g. `https://example.com/webhooks/gc-notify`).
4. Enter the bearer token.
5. Save. GC Notify sends a health check (`{"health_check": "true"}`) to the URL.

The same page lets you test your API's response time. Keep responses under 1 second.

## Test

Send a message with a test API key (callbacks work with test keys, not with smoke-testing
addresses) and watch for the delivery receipt, or replay with curl (payload built from the
documented fields):

```bash
curl -X POST http://localhost:3000/webhooks/gc-notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GC_NOTIFY_WEBHOOK_SECRET" \
  -d '{"id":"3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11","reference":"12345678","to":"hello@canada.ca","status":"delivered","status_description":"Delivered","provider_response":null,"created_at":"2017-05-14T12:15:30.000000Z","completed_at":"2017-05-14T12:15:30.000000Z","sent_at":"2017-05-14T12:15:30.000000Z","notification_type":"email"}'
```

## Rotating the Token

Change the bearer token in GC Notify and in `GC_NOTIFY_WEBHOOK_SECRET` (or the Hookdeck source)
together. Callbacks sent with the old token will fail with 401 and count towards suspension.
