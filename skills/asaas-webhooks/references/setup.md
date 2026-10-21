# Setting Up Asaas Webhooks

## Prerequisites

- An Asaas account (Sandbox and Production are configured independently)
- A public HTTPS URL that accepts `POST` requests with a JSON body
- An email address for webhook failure alerts

## Choose Your authToken

Generate a random value of **32-255 characters** with no whitespace. It must not be a simple
sequence and must **not be an Asaas API key**. The "Gerar token" (Generate token) button in the
dashboard creates a suitable value. Store it as `ASAAS_WEBHOOK_TOKEN` in your app.

## Register Your Endpoint

1. In Asaas, go to **User menu > Integrations > Webhooks** and click **Criar Webhook**.
2. Fill in: Name, URL, Email, API Version, **Auth Token**, Enabled, Interrupted, Send Type.
3. Select only the events you need (for example `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`,
   `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`).
4. Save, then trigger a matching action in Sandbox and confirm your endpoint receives the `POST`.

You can also create webhooks through the API ("Create new Webhook via the API").

## Send Type

- `SEQUENTIALLY`: events are delivered in order. Lower throughput.
- `NON_SEQUENTIALLY`: events may be delivered in parallel and out of order. Higher throughput.

Use sequential only if your logic depends on event order.

## Delivery and Failure Behavior

- Respond `200` as soon as you have persisted the event; do slow work afterwards.
- Failed deliveries are retried. After **15 consecutive failures** the queue can be paused: new
  events keep being generated but are not sent until you reactivate the queue.
- Events are kept for **14 days**; anything stuck longer is deleted permanently. Asaas emails you
  when delivery breaks.
- Inspect deliveries under **User menu > Integrations > Webhook Logs**.

## IP Allowlist (optional)

If your firewall or WAF restricts sources, allow the production webhook IPs from the
[official Asaas IPs page](https://docs.asaas.com/docs/official-asaas-ips): `52.67.12.206`,
`18.230.8.159`, `54.94.136.112`, `54.94.183.101`. Sandbox may use additional IPs.

## Local Testing

```bash
npx hookdeck-cli listen 3000 asaas --path /webhooks/asaas
```

Use the printed Hookdeck URL as the webhook URL in the Asaas Sandbox.
