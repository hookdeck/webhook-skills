# Setting Up Mailtrap Webhooks

## Prerequisites

- A Mailtrap account with a sending domain (Email API/SMTP)
- A public HTTPS endpoint. Webhooks are delivered only to ports 443 (HTTPS) or 80 (HTTP)
- Audit Log webhooks require an Enterprise plan

## Register Your Endpoint

1. In Mailtrap, go to **Webhooks** and click **Create New Webhook**.
2. Enter the **Webhook URL**. (Basic auth in the URL or a token query parameter are also offered; this skill uses the signature.)
3. Choose the **Payload format**: JSON (`{"events": [...]}`) or JSON Lines.
4. Select the webhook area: Audit Log, Email Sending, Inbound Inboxes, Campaigns or Reputation Monitor.
5. For Email Sending, pick the **Sending Stream** (Transactional or Bulk), the **domain**, and the event types.
6. Click **Run Test**. A dummy payload is sent; only a 200 response counts as success.
7. Click **Save**.

## Get Your Signing Secret

The signing secret (32 hex characters) is generated when the webhook is created
and is displayed in the webhook's details. Copy it into `MAILTRAP_WEBHOOK_SECRET`.
Use it as plain text, not hex-decoded. Resetting it in the UI invalidates the old
secret immediately.

## Retries and Pausing

Any response other than 200 is retried 40 times every 5 minutes (30 second
timeout). If every retry fails, Mailtrap pauses the webhook and emails you; resume it manually.

## Firewalls

Mailtrap sends webhooks from `45.158.83.0/24` and `5.181.200.0/24`
(machine-readable list: https://mailtrap.io/ip-ranges.json).

## Local Testing

```bash
npx hookdeck-cli listen 3000 mailtrap --path /webhooks/mailtrap
```
