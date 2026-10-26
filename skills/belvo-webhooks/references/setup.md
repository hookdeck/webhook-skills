# Setting Up Belvo Webhooks

## Prerequisites

- A Belvo account for the product you use (Aggregation, Payments Brazil or Payments Mexico)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Payments Mexico (Direct Debit Portal)

1. Log in to the Direct Debit Portal (separate sandbox and production logins).
2. Go to **Developers → Webhooks** and click **New webhook**.
3. Enter your URL (for example `https://example.com/webhooks/belvo`).
4. Select the events to receive, or **All events**.
5. Optionally enter an authentication **token**. Belvo then sends
   `Authorization: Bearer <token>` on every request.
6. Click **Create webhook**. You can add up to 5 webhooks; each event goes to every active
   webhook subscribed to it, with the same payload.

Store `Bearer <token>` (prefix included) as `BELVO_AUTHORIZATION`.

Use the **Active / Inactive** toggle to pause deliveries without deleting a webhook.

## Aggregation (Belvo Dashboard)

1. Create the webhook in the Belvo dashboard (one per environment).
2. In the **Authentication (Optional)** field enter the full value: `Bearer <token>` or
   `Basic <base64 of username:password>`. Belvo sends it unchanged as `Authorization`.
3. Store that exact value as `BELVO_AUTHORIZATION`.

Allowlist Belvo's webhook IPs if you filter inbound traffic: `3.130.254.46`, `18.220.61.186`,
`18.223.45.212`.

## Payments Brazil

In the Belvo dashboard, open the payment webhooks section, select the **Payments Webhooks** tab and
click **+New webhook**. Enter the URL and, in **Authorization**, "an optional bearer token". The
Brazil docs don't show the exact header Belvo sends, so check a test delivery (you should see
`Authorization: Bearer <token>`) and store that whole value as `BELVO_AUTHORIZATION`.

## Local Testing

```bash
npx hookdeck-cli listen 3000 belvo --path /webhooks/belvo
```

Use the printed URL as the endpoint. For FastAPI, use port `8000`.

## Sending a Test Event

In the Payments Mexico portal, click **Test** on a webhook's row and pick an event type. Belvo
sends a sample payload and shows the request, response code and body; **Resend** repeats it.
Test deliveries are not retried. For Aggregation, trigger any event type (including link events)
from the dashboard's **Webhooks** tab to get a dummy payload.

Test endpoints such as webhook.site return `418` by default; Belvo won't retry a `4xx`, so
configure the test endpoint to return `2xx`.

Or send one yourself:

```bash
curl -X POST http://localhost:3000/webhooks/belvo \
  -H "Content-Type: application/json" \
  -H "Authorization: $BELVO_AUTHORIZATION" \
  -d '{"eventType":"payment_request_update","eventCode":"payment_request_successful","details":{"id":"3118128a","status":"successful","amount":100.5}}'
```
