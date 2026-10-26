# Setting Up Hostaway Webhooks

## Prerequisites

- A Hostaway account with access to **Settings > Integrations**
- A publicly reachable HTTPS endpoint on port 80 or 443 (use `npx hookdeck-cli listen 3000 hostaway --path /webhooks/hostaway` locally)

## Set a Login and Password

> **Set a login and password on the Hostaway webhook. Webhooks without them send nothing to verify.**

Hostaway's webhook `login` and `password` fields are optional: if both are provided, Hostaway sends a Basic auth header; if not, requests carry no credential at all. Choose a long random password and store both values:

```bash
HOSTAWAY_WEBHOOK_USERNAME=your-webhook-login
HOSTAWAY_WEBHOOK_PASSWORD=your-webhook-password
```

## Register Your Endpoint

1. In Hostaway go to **Settings > Integrations** and add the unified webhook (or configure the legacy reservation and message webhooks).
2. Enter your HTTPS URL, e.g. `https://example.com/webhooks/hostaway`.
3. Enter the **login** and **password** from above.
4. Select the events you want: reservations, messages, tasks.

## Use With Hookdeck

Create a Hostaway source (source type `HOSTAWAY`) in Hookdeck, enter the same login and password for verification, and point Hostaway at the source URL.

- **Hookdeck never sends a 401 challenge** (no `WWW-Authenticate` round trip), so Hostaway must include the credentials on every request. That is what it does when a login and password are set.
- Hookdeck's Hostaway source **pre-selects POST without managing the method**. Hostaway's docs don't name the method, so if the sender uses another one (GET, PUT, PATCH, DELETE), also allow it on the source.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/hostaway \
  -u "$HOSTAWAY_WEBHOOK_USERNAME:$HOSTAWAY_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"reservation.created","data":{"id":1001}}'
```

## Network Notes

Only ports 80 and 443 are reachable. Hostaway times out after 20 seconds and retries transient failures up to 3 times.
