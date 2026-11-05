# Setting Up Lago Webhooks

## Prerequisites

- A Lago account (cloud or self-hosted) with access to Developers
- A public HTTPS URL for your endpoint (use the Hookdeck CLI locally)

## Choose HMAC (Lago Defaults to JWT)

Lago's default signature algorithm is `jwt`. This skill only handles `hmac`, so select it when creating the endpoint.

**Dashboard:**
1. Developers > Webhooks tab > **Add an endpoint**
2. Enter a name and your URL
3. Set the signature to **HMAC**
4. Tick the events to receive, then **Create endpoint**

**API:**

```bash
curl --location --request POST "$LAGO_URL/api/v1/webhook_endpoints" \
  --header "Authorization: Bearer $API_KEY" \
  --header 'Content-Type: application/json' \
  --data-raw '{ "webhook_endpoint": { "webhook_url": "https://example.com/webhooks/lago", "signature_algo": "hmac" } }'
```

If an existing endpoint uses `jwt`, switch it with `PUT /api/v1/webhook_endpoints/{lago_id}` and `"signature_algo": "hmac"`.

## Get Your HMAC Signature Token

Developers > Webhooks > **HMAC Signature Token** > reveal and copy. Put it in `LAGO_HMAC_KEY`. It is per organization (shared by your HMAC endpoints), and it is not your API key.

## Local Development

```bash
npx hookdeck-cli listen 3000 lago --path /webhooks/lago
```

Use the printed URL as your endpoint URL.

## Webhook Logs

Developers > Webhooks > your endpoint > **Deliveries** shows each event with its timestamp, unique key, type, response code and retry count. Failed events can be retried from there.
