# Setting Up Datto RMM Global Webhooks

> **Use Global Webhooks. Per-monitor webhooks can't carry a secret header.**

## Prerequisites

- A Datto RMM account with the Administrator permission
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 datto-rmm --path /webhooks/datto-rmm` locally)
- A secret value you generate, stored as `DATTO_RMM_WEBHOOK_SECRET`

## Turn On Global Webhooks

1. Go to **Setup > Integrations > Global Webhooks**.
2. In **Details**, next to **Enable Webhooks globally for Monitors**, click **Turn On**.

This disables any webhooks set on individual monitors. When you turn Global Webhooks off, Datto
RMM asks whether to keep or delete the configuration.

## Configure the Webhook

1. In **Alert priorities to send as webhooks**, pick the priorities to send.
2. Enter the destination **URL** (max 500 characters), e.g. `https://example.com/webhooks/datto-rmm`.
3. Choose a **Content Type**: `application/json`, `text/plain` or
   `application/x-www-form-urlencoded`.
4. Add the secret header: click **Add Header**, enter a **Name** and a **Value**, hide the value
   if offered, and click **Add Header** again.
   - Name: for example `Authorization` or `X-Datto-Secret`. Set `DATTO_RMM_WEBHOOK_HEADER` to
     the same name (default `Authorization`).
   - Value: your secret, exactly as it will be sent. If you type `Bearer abc123`, set
     `DATTO_RMM_WEBHOOK_SECRET` to `Bearer abc123`; the whole value is compared.
5. Write the **alert raised** payload template (see [overview.md](overview.md)). Include a
   `status` field if you want the examples to dispatch on it.
6. Optional: turn on **When alert is resolved (optional)** and write the resolved template.

## Test

Click **Test Alert (Raised/Resolved) Webhook** below the payloads. A success message shows if
the request was delivered; otherwise the related error is displayed. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/datto-rmm \
  -H "Content-Type: application/json" \
  -H "Authorization: $DATTO_RMM_WEBHOOK_SECRET" \
  -d '{"status":"raised","alert_uid":"abc123","alert_type":"disk usage","device_hostname":"SRV-01","site_name":"Acme"}'
```

## Network Notes

Datto RMM doesn't publish a fixed sender IP list in the Global Webhooks docs, so rely on the
secret header and HTTPS rather than an IP allowlist.
