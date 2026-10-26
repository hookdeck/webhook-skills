# Setting Up a Particle Webhook Integration

## Prerequisites

- A Particle account and devices that publish events
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 particle --path /webhooks/particle` locally)

## Create a Secret Header Value

Generate a long random string and store it as `PARTICLE_WEBHOOK_SECRET`. Decide the header name
and store it as `PARTICLE_WEBHOOK_HEADER` (default `Authorization`). The secret is the exact,
whole header value, including any `Bearer ` prefix you type, because the whole value is compared.

## Register Your Endpoint

1. In the Particle Console open **Integrations** and add a **Custom Webhook** (or use a custom template).
2. Set the event name (the prefix your firmware publishes, for example `temperature`) and your URL.
3. Pick the request type (GET, POST, PUT or DELETE; default POST) and request format (web form is the default; JSON is also available).
4. Under advanced settings add a custom header, for example `Authorization` with value `Bearer <your secret>`,
   or in JSON: `"headers": {"Authorization": "Bearer 12345"}`.
5. Save, then publish an event from a device (or use **Test** in the Console).

Hookdeck's Particle source shows this setup note:

> Add a custom header to the webhook integration and enter it here. Use a static value, not a mustache variable.

Header values can contain mustache variables, but a value that changes per request can't be
compared with a stored secret.

## Methods and Hookdeck

The examples accept GET, POST, PUT, PATCH and DELETE on `/webhooks/particle` and check the header
first on every one. If you route through Hookdeck, its Particle source pre-selects POST without
managing the method, so any other method your integration uses must also be allowed on the source.

## Basic Auth Is Not Covered by Hookdeck

Particle integrations can also authenticate with HTTP basic auth (`"auth": {"username": ..., "password": ...}`).
Hookdeck's Particle source does not cover that; use a custom header as above.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/particle \
  -H "Authorization: $PARTICLE_WEBHOOK_SECRET" \
  -d "event=temperature&data=21.5&coreid=3f002b000000000000000000"
```

Then GET with a query string: `curl -H "Authorization: $PARTICLE_WEBHOOK_SECRET" "http://localhost:3000/webhooks/particle?event=motion-detected"`.
