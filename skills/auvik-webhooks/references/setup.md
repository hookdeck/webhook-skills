# Setting Up Auvik Webhooks

> **Choose Header authentication on the Auvik webhook, not OAuth.**

## Prerequisites

- An Auvik account with access to the MSP dashboard integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 auvik --path /webhooks/auvik` locally)

## Pick Your Header and Secret

Decide the header Key and Value before configuring Auvik, and store them:

```bash
AUVIK_WEBHOOK_HEADER=Authorization       # the Key (any header name; default Authorization)
AUVIK_WEBHOOK_SECRET=your-header-value   # the Value, exactly as you will type it in Auvik
```

Use a long random value. If you type a prefix such as `Bearer ` into the Value field, put the
same prefix in `AUVIK_WEBHOOK_SECRET`: the whole value is compared.

## Register Your Endpoint

1. In the Auvik MSP dashboard, add the **Webhook** integration.
2. Enter your URL, including the protocol (e.g. `https://example.com/webhooks/auvik`).
3. Set the authentication method to **Header** ("An API key is provided through a custom HTTP
   header"). Do not choose Basic Authentication or OAuth 2.0.
4. Enter the header **Key** and **Value** from above.
5. Optionally add a JSONata expression to reshape the body (leave blank for the default body).
6. Save, then trigger or wait for an alert.

Menu names may differ slightly between Auvik releases; follow Auvik's
[webhook article](https://support.auvik.com/hc/en-us/articles/216977386-Integrating-Auvik-with-a-webhook).

## Test

Replay a sample alert with curl:

```bash
curl -X POST http://localhost:3000/webhooks/auvik \
  -H "Content-Type: application/json" \
  -H "$AUVIK_WEBHOOK_HEADER: $AUVIK_WEBHOOK_SECRET" \
  -d '{"alertId":"1234","alertName":"Device offline","alertStatus":0,"alertStatusString":"Triggered","entityName":"core-switch-01","companyName":"Acme MSP"}'
```

## Rotating the Credential

Change the Value in Auvik and `AUVIK_WEBHOOK_SECRET` together; requests with the old value get
401. Rotate immediately if the value leaks.
