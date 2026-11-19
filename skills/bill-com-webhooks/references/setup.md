# Setting Up BILL Webhooks

## Prerequisites

- A BILL developer account and `devKey`. The sandbox is free: sign up at `https://www-test.bill.com/signup?env=stage`.
- A `sessionId` from the API login (or an `apiToken` for Spend & Expense events)
- A public HTTPS endpoint (use the Hookdeck CLI locally). In production, BILL coordinates an allowlist of notification URLs with you.

The sandbox Connect Events base URL is `https://gateway.stage.bill.com/connect-events`. Sandbox webhooks "use synthetic values & are not tied to real transactions."

## 1. Create a Subscription

```bash
curl --request POST \
  --url 'https://gateway.stage.bill.com/connect-events/v3/subscriptions' \
  --header 'content-type: application/json' \
  --header 'X-Idempotent-Key: {UUID4_key}' \
  --header 'devKey: {developer_key}' \
  --header 'sessionId: {session_id}' \
  --data '{
    "name": "Bill management",
    "status": { "enabled": true },
    "events": [
      { "type": "bill.created", "version": "1" },
      { "type": "bill.updated", "version": "1" }
    ],
    "notificationUrl": "https://your-app.example.com/webhooks/bill-com"
  }'
```

The response has the subscription `id`, the `organizationId` and the one-time **`securityKey`**. Store the key now.

## 2. Configure the Key

Set `BILL_WEBHOOK_SECURITY_KEY` to the `securityKey`, as-is.

## 3. Send a Test Notification

```bash
curl --request POST \
  --url 'https://gateway.stage.bill.com/connect-events/v3/subscriptions/{subscriptionId}/test' \
  --header 'content-type: application/json' \
  --header 'devKey: {developer_key}' \
  --header 'sessionId: {session_id}' \
  --data '{}'
```

Every field in the request body is optional. Set `eventType` and `version` to get a test shaped like a specific event. BILL posts a signed notification with `eventType` `test` to your URL and returns the notification it sent.

## Rotate the Key

`POST /v3/subscriptions/{subscriptionId}/security-key` returns a new `securityKey`. Update `BILL_WEBHOOK_SECURITY_KEY` at the same time. BILL recommends rotating regularly, and after you've used the key in an online HMAC tool.

## Re-enable a Subscription

If retries ran out, the subscription's `status.enabled` is `false`. Fix your endpoint, then set it back to `true` on the subscription.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 bill-com --path /webhooks/bill-com
```

Use the printed URL as `notificationUrl`.

## Using Hookdeck

Create a source with the **Bill.com** source type and paste the `securityKey` (from `POST /v3/subscriptions` or the rotation endpoint) as-is. Hookdeck verifies `x-bill-sha-signature`.
