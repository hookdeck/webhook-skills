# Setting Up UKG Ready Webhooks

> Choose Bearer Token authentication on the UKG Ready webhook, not Basic, and paste the whole Authorization value, including "Bearer ".

## Prerequisites

- A UKG Ready account with access to **Global Setup > Webhook Subscriptions**. Check
  Profile Policies > Security > Global tab > Global Setup > Webhook Subscriptions.
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Create a Subscription

1. Go to **Settings > Global Setup > Webhook Subscriptions** and click **Add Subscription**.
2. Pick the **Category** (for example `ACCOUNT_CREATED` or `ACCOUNT_UPDATED`) and the
   **Event**, enter a **Name**, and tick **Active**.
3. Enter the **Endpoint URL**, for example `https://example.com/webhooks/ukg-ready`.
4. Set **Authentication** to **Bearer Token** and enter a token you generate. UKG Ready's docs
   say only that the token goes in the request header; the expected form is
   `Authorization: Bearer <token>`. Store the whole value (`Bearer <token>`, prefix
   included) as `UKG_READY_AUTHORIZATION`. If deliveries are rejected, capture one and set
   `UKG_READY_AUTHORIZATION` to the `Authorization` value exactly as received.
5. Tick the fields that should trigger the webhook and be included in the payload. The
   **Payload Preview** shows what will be sent.
6. Click **Save**, then **Test Connection** (reachability only; no payload is sent).

The other options: **Basic** and **OAuth** are not supported by Hookdeck's UKG Ready source,
and **No Authentication** is insecure ("only in non-production or controlled environments").
Use Bearer Token.

## Local Testing

```bash
npx hookdeck-cli listen 3000 ukg-ready --path /webhooks/ukg-ready
```

Use the printed URL as the Endpoint URL. For FastAPI, use port `8000`.

## Sending a Manual Test

Test Connection sends no payload, so post one yourself:

```bash
curl -X POST http://localhost:3000/webhooks/ukg-ready \
  -H "Content-Type: application/json" \
  -H "Authorization: $UKG_READY_AUTHORIZATION" \
  -d '{"accountId":1001,"email":"ada@example.com"}'
```

## Troubleshooting Delivery

Failures are recorded in the Webhook Events Log (My Reports > System Reports > System
Utilities). Use **Retry Failed Events** after fixing credentials; each event is tried at most 5
times in total.
