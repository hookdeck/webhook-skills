# Setting Up Cerebrum Webhooks

## Prerequisites

- A Cerebrum API key
- A publicly reachable HTTPS endpoint for your application (use the Hookdeck CLI during development)
- Access to the Svix Portal that Cerebrum provides, to get the signing secret

## Register Your Endpoint

Pass an HTTPS `postbackWebhookUrl` when you create an order (`POST /v1/orders`) or a vID invite (`POST /v1/vid/invites`), for example `https://example.com/webhooks/cerebrum`. Configure the same endpoint in the Svix application portal. Deliveries are POSTed as JSON.

Cerebrum sends no challenge or handshake request, so nothing has to be echoed back. Respond with a `2xx` promptly: Cerebrum recommends under 10 seconds, after storing the notification.

## Get Your Signing Secret

1. Ask Cerebrum for access to the Svix application portal (it is available on request).
2. Create or select the endpoint and copy that endpoint's signing secret.
3. Store the full value (Cerebrum's examples show `whsec_...`) in `CEREBRUM_WEBHOOK_SECRET`.

Each endpoint has its own secret. It is not your Cerebrum API key, and `svixAppId` in the payload is not a secret. With CRA webhook delegation, postbacks and parent-owned destinations are signed with the parent CRA application's endpoint secrets.

## Choose Events

Through the Svix portal you can manage endpoints, inspect delivery attempts and replay messages. Handle the order events, and the invite events if you use vID:

- `ORDER_STATUS_CHANGE`, `ORDER_SCORE_CHANGE`, `ORDER_CUSTOM_SCORE_CHANGE`, `ORDER_DISPUTE_RESOLVED`, `ORDER_ERROR`
- `VOUCHER_REDEEMED`, `VOUCHER_ACCEPTED`, `VOUCHER_STARTED`, `VOUCHER_CANCELED`, `VOUCHER_EXPIRED`, `VOUCHER_OPTED_OUT`
- `MONITORING_REPORT_GENERATED`, `BEAM_INPUT_CREATED` (simulation only so far)

`ORDER_ERROR`, `VOUCHER_ACCEPTED`, `VOUCHER_STARTED` and `VOUCHER_CANCELED` are off by default. Enable them with `metadata.webhooks.events` on the package or organization:

```json
{
  "webhooks": {
    "events": {
      "voucher.started": {
        "enabled": true
      },
      "order.error": {
        "enabled": true
      }
    }
  }
}
```

## Local Development

```bash
npx hookdeck-cli listen 3000 cerebrum --path /webhooks/cerebrum   # use 8000 for FastAPI
```

Send a test notification to the printed HTTPS URL with Cerebrum's simulation route. It needs a public HTTPS URL and refuses HTTP `localhost`:

```bash
curl --request POST "$CEREBRUM_BASE_URL/v1/orders/simulate-webhook" \
  --header "apikey: $CEREBRUM_API_KEY" \
  --header 'content-type: application/json' \
  --data '{
    "id": "ORD-SIMULATED-NOT-REAL",
    "event": "ORDER_STATUS_CHANGE",
    "postbackWebhookUrl": "'"$CEREBRUM_WEBHOOK_URL"'",
    "additionalMetadata": {
      "testRun": "webhook-receiver-001"
    }
  }'
```

A `201` with `{"success": true}` means the notification was queued. The `id` is a dummy and can't be fetched.

## Test Mode vs Live Mode

Cerebrum promises no public sandbox. Use the simulation route above against an environment your key works in, never customer production data, and replay messages from the Svix portal while you iterate.
