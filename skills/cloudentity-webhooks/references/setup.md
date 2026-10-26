# Setting Up Cloudentity (SecureAuth) Webhooks

## Prerequisites

- A SecureAuth Connect (formerly Cloudentity) workspace where you can manage extensions
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 cloudentity --path /webhooks/cloudentity` locally)

## Create the Webhook and Get the API Key

1. In the target workspace, go to **Extensions > Webhooks** in the left sidebar.
2. Click **Create Webhook**.
3. Enter the **URL** (for example `https://example.com/webhooks/cloudentity`).
4. Choose the **Subscribed events** that should trigger notifications. The list depends on the
   server type.
5. Click **Create**. When prompted, **copy the API key**: it is shown once. Store it as
   `CLOUDENTITY_WEBHOOK_API_KEY`.

SecureAuth sends this key as plain text in the `X-API-Key` header of every request. Webhooks can
also be managed through the Webhook CRUD APIs.

## Test Mode vs Live Mode

There is no separate test mode. To test against a development endpoint with an untrusted
certificate, enable **Developer mode** to disable certificate validation for SecureAuth
requests. Don't leave it on for production.

## Test

Trigger a subscribed event (for example create a user) and check your endpoint logs it, or
replay with curl:

```bash
curl -X POST https://example.com/webhooks/cloudentity \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CLOUDENTITY_WEBHOOK_API_KEY" \
  -d '{"audit_events":[{"tenant_id":"example","server_id":"demo","event_id":"1","payload":{"user_created":{}}}]}'
```
