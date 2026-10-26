# Setting Up Socure RiskOS Webhooks

## Prerequisites

- A RiskOS account with permission to manage webhooks in the Dashboard
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 socure --path /webhooks/socure` locally)

## Choose Your Credentials

Pick a username and a long random password and store them as `SOCURE_WEBHOOK_USERNAME` and
`SOCURE_WEBHOOK_PASSWORD`. RiskOS sends them in `Authorization: Basic base64(username:password)`.

## Register Your Endpoint

1. In the RiskOS Dashboard go to **Developer Workbench > Webhooks**.
2. Click **Add a webhook** and fill in:
   - **Name**: a descriptive label
   - **URL**: your HTTPS endpoint, e.g. `https://example.com/webhooks/socure`
   - **Use Case**: the RiskOS use case to scope deliveries to
   - **Event Type**: one or more events (see [overview.md](overview.md))
   - **Auth Type**: **Basic Authentication**, with your username and password
3. Click **Continue to Test**. RiskOS sends a sample payload to your endpoint and shows success or failure.
4. Click **Save** to activate the webhook.

The auth type, its credentials and custom headers **can't be changed** after creation. To switch
auth methods or rotate credentials, delete the webhook and create a new one. Editing only updates
the URL and event subscriptions. (Bearer and OAuth 2.0 are also offered but are not covered here.)

The credentials must arrive on the first request. A `401` + `WWW-Authenticate` challenge flow
won't work through Hookdeck, which verifies the request as received.

## Allowlist RiskOS IPs (optional)

Only if you filter inbound traffic by source IP. Production: `54.209.34.129`, `100.24.247.109`,
`44.195.229.53`. Sandbox: `3.218.138.162`, `13.217.134.98`, `54.85.52.249`. Socure's configuration
reference lists additional ranges, so confirm the current list with Socure Support. If the test
fails behind a firewall, check the allowlist first.

## Test

Use **Continue to Test** in the Dashboard, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/socure \
  -u "$SOCURE_WEBHOOK_USERNAME:$SOCURE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb","event_at":"2025-01-15T13:04:11.468Z","event_type":"evaluation_completed","data":{"eval_id":"6dc8f39c","decision":"ACCEPT"}}'
```

Sandbox and production are separate environments: create the webhook in each.

## Webhook Testing Tools

Payloads can contain your credentials and customer data. Use public request-capture tools only
for non-production testing.
