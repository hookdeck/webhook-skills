# Setting Up Sevalla Webhooks

## Prerequisites

- A Sevalla account with the **Company owner** or **Company admin** role
- A valid payment method on the company (Sevalla won't create webhooks without one)
- A public `http://` or `https://` endpoint (use HTTPS: the secret travels in a header). Private,
  loopback and link-local addresses are rejected. Locally, use
  `npx hookdeck-cli listen 3000 sevalla --path /webhooks/sevalla`

## Register Your Endpoint

1. In the sidebar, under **Tools**, click **Webhooks**, then **Create webhook**.
2. Enter your URL in **Endpoint** (e.g. `https://example.com/webhooks/sevalla`).
3. Under **Allowed events**, tick the events to send (e.g. `APP_DEPLOY`, `STATIC_SITE_DEPLOY`).
   The database events can be selected but are not sent yet.
4. Click **Create webhook**. It starts as **Active** and sends events right away.

## Get Your Signing Secret

Click the webhook. On the **Overview** tab, under **Details**, **Signing secret** has buttons to
show and copy it. Store it as `SEVALLA_WEBHOOK_SECRET` (`whsec_` followed by 30 characters).

If you use a Hookdeck **Sevalla** source, enter the whole secret there too, `whsec_` prefix
included, and update it when a rolled secret becomes active.

## Roll the Secret

On the webhook's **Overview** tab click **Roll secret**, then pick how long the old secret keeps
signing (**Now**, 1, 2, 4, 8, 16 or 24 hours; default 24). Until then **Signing secret** shows the
new secret with a *Rolling over* note giving the activation time. Deliveries keep carrying the
**old** secret until that time, then the **new** one, so update the stored value then.
**Now** switches immediately and requests fail verification until your endpoint has the new secret.

To avoid a gap, accept both: set `SEVALLA_WEBHOOK_SECRET` to the new secret and
`SEVALLA_WEBHOOK_SECRET_OLD` to the old one, then remove the old one after the period ends. (If you
use Hookdeck, just update the source's secret when the new one becomes active.)

## Test

Trigger a deployment, or send Sevalla's documented `APP_DEPLOY` example with curl:

```bash
curl -X POST http://localhost:3000/webhooks/sevalla \
  -H "Content-Type: application/json" \
  -H "svl-signature: $SEVALLA_WEBHOOK_SECRET" \
  -d '{"webhook_id":"d5f8a1c2-3b4e-4f6a-8b8c-9d0e1f2a3b4c","event_id":"a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d","event_delivery_id":"f1e2d3c4-b5a6-4788-9a0b-c1d2e3f4a5b6","type":"APP_DEPLOY","data":{"company_id":"0c9e3f5a-7b2d-4e1f-8a6c-5d4b3a2f1e0d","app_id":"7f3c2b1a-9e8d-4c7b-a6f5-4e3d2c1b0a9f","app_name":"storefront-x7k2m","app_display_name":"storefront","deployment_id":"3b2a1c0d-8e7f-4a6b-9c5d-2e1f0a9b8c7d","status":"success","commit":"9fceb02d0ae598e95dc970b74767f19372d61af8","stage":"","is_preview":false}}'
```

Check deliveries on the webhook's **Event deliveries** tab (request payload, response status and
body). There is no button to resend an event; Sevalla retries failures on its own.

## Update, Disable, Delete

**Update** changes the endpoint, description or events for the next event (retries of earlier events
still go to the original endpoint). **Disable webhook** stops new events (they aren't sent later);
retries already queued continue. Deleting removes its deliveries and analytics.
