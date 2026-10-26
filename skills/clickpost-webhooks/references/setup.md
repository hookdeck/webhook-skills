# Setting Up ClickPost Webhooks

## Prerequisites

- A ClickPost account with access to **Settings > Notifications > Webhooks**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 clickpost --path /webhooks/clickpost` locally)

## Choose and Store the Token

Choose Simple Token authentication on the ClickPost webhook and paste the token.

1. Pick a long random token. Store the **bare** token as `CLICKPOST_WEBHOOK_SECRET` (without the `Token ` prefix).
2. ClickPost sends it as `Authorization: Token <token>`.

ClickPost also offers X-API-Key (`x-api-key`), Webhook-Key (`webhook-key`), Basic Auth and Dynamic
Token. They are not covered by this skill or by Hookdeck's ClickPost source.

## Register Your Endpoint

1. Go to **Settings > Notifications > Webhooks**.
2. Use the **Selected Status** tab to receive chosen statuses, or **All Status** for every scan.
3. Enter your URL (e.g. `https://example.com/webhooks/clickpost`), choose **Simple Token** authentication and paste the token.
4. Save.

## Test

Replay a sample with curl:

```bash
curl -X POST http://localhost:3000/webhooks/clickpost \
  -H "Content-Type: application/json" \
  -H "Authorization: Token $CLICKPOST_WEBHOOK_SECRET" \
  -d '{"waybill":"TEST-AWB-HLD-123","cp_id":10001,"status":"Delivered","remark":"Delivered","location":"","timestamp":"2024-11-19T10:04:20Z","clickpost_status_code":8,"clickpost_status_description":"Delivered","additional":{"latest_status":{}}}'
```
