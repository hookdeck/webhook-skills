# Setting Up PAY.JP Webhooks

## Prerequisites

- A PAY.JP account
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 payjp --path /webhooks/payjp` locally)

## Get Your Webhook Token

Use the webhook token (whook_...) shown in your PAY.JP account settings.

1. Log in to PAY.JP and open **アカウント設定** (account settings).
2. Copy the webhook token (it looks like `whook_a09d5c1c87be4e1590a9f16516`) and store it as `PAYJP_WEBHOOK_SECRET`.

PAY.JP sets this token for your account; you don't choose it. It is sent unchanged in the `X-Payjp-Webhook-Token` header of every webhook.

## Register Your Endpoint

1. In the PAY.JP dashboard, open the Webhook settings.
2. Enter your endpoint URL (e.g. `https://example.com/webhooks/payjp`).
3. Choose whether the destination receives **test mode** or **live mode** events.
4. Add it. You can register several destinations.
5. Use the dashboard's test send to deliver sample events.

## Test Mode vs Live Mode

Each destination is bound to one mode, so register one URL for test events and one for live events. The `livemode` field in the payload tells you which mode produced the event. Both modes send the same account token.

## Respond Correctly

Return HTTP `200` for every webhook you accept. PAY.JP ignores the response body. A `4xx` or `5xx` triggers a retry every 3 minutes, up to 3 times.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/payjp \
  -H "Content-Type: application/json" \
  -H "X-Payjp-Webhook-Token: $PAYJP_WEBHOOK_SECRET" \
  -d '{"id":"evnt_test_1","object":"event","livemode":false,"type":"charge.succeeded","created":1442212986,"pending_webhooks":1,"data":{"id":"ch_test","object":"charge","amount":5000,"currency":"jpy","paid":true}}'
```

## Security Notes

Use HTTPS in production: payloads contain customer and payment details. The token is a static credential, so anyone who learns it can post forged events. If it leaks, rotate it in PAY.JP and update `PAYJP_WEBHOOK_SECRET`.
