# Setting Up ClickStack Alert Webhooks

Covers ClickStack alert webhooks of type Generic only.

## Prerequisites

- A ClickStack (HyperDX) deployment where you can create alerts
- A saved search or a saved dashboard chart to attach an alert to
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen` locally)

## Create a Generic Webhook With a Secret Header

1. Create or edit an alert on a saved search, or on a dashboard chart.
2. In the alert dialog, choose **Add New Webhook**.
3. Enter a webhook name (required) and optionally a description.
4. Set the service type to **Generic** (called **Webhook** in the service type list).
5. Enter the **Webhook URL**.
6. Under **Webhook headers (optional)**, add your secret header. ClickHouse has no signing, so
   this header is your only authentication. For example:
   - Name: `Authorization`, value: `Bearer a-long-random-string`
   - or a custom name such as `X-ClickStack-Secret`, value: `a-long-random-string`
7. Optionally set **Webhook body** using the template variables `{{title}}`, `{{body}}` and
   `{{link}}`, for example:
   ```json
   {"title": "{{title}}", "body": "{{body}}", "link": "{{link}}"}
   ```
8. Save. The webhook can be reused by other alerts.

## Configure Your Endpoint

```bash
CLICKHOUSE_WEBHOOK_HEADER=Authorization            # the header name from step 6
CLICKHOUSE_WEBHOOK_SECRET="Bearer a-long-random-string"   # the exact, whole header value
```

The secret is compared as a whole: include any `Bearer ` prefix you typed. The header name is
matched case-insensitively.

## Alert Behavior

Alerts are evaluated on the interval (period/duration) you set. A notification is sent only when
the condition is met, and it can fire again on every evaluation while the condition holds, so make
your handler idempotent.

## Local Testing

```bash
npx hookdeck-cli listen 3000 clickhouse --path /webhooks/clickhouse
```
