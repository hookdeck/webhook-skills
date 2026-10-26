# Setting Up Tabby Webhooks

> Set the header when you register the webhook through the Tabby API (POST /api/v1/webhooks). Webhooks without one send nothing to verify.

## Prerequisites

- A Tabby merchant account with a secret key (`sk_...` for production, `sk_test_...` for test)
  and your merchant code
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tabby --path /webhooks/tabby` locally)

## Choose Your Header

Pick any header name and a long random value. Both are yours; Tabby does not generate them:

```bash
openssl rand -hex 32   # use as header.value
```

Store the name in `TABBY_WEBHOOK_HEADER` (default `X-Auth-Key`) and the value in
`TABBY_WEBHOOK_SECRET`, exactly as you will send it. If the value includes a prefix such as
`Bearer `, keep it: the examples compare the whole header value.

## Register Your Endpoint

Registration is self-service through the API (no dashboard form). The key sets the environment:
a production key registers production payments, a test key registers test payments. Each
merchant code + key pair can have up to 4 webhooks.

```bash
curl -X POST https://api.tabby.ai/api/v1/webhooks \
  -H "Authorization: Bearer sk_test_..." \
  -H "X-Merchant-Code: your_merchant_code" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-store.com/webhooks/tabby",
    "header": { "title": "X-Auth-Key", "value": "your_random_signing_secret" }
  }'
```

KSA merchants use `https://api.tabby.sa/api/v1/webhooks`. The `header` object is optional, but
without it requests carry nothing to verify.

### Dispute webhooks

Register separately at `/api/v1/dispute-webhooks` with a live `sk_...` key (disputes have no test
mode) and the same `url` / `header` body. `X-Merchant-Code` is required. Responses mask
`header.value` (`****` plus the last 4 characters), so keep your own copy.

`PUT` replaces the whole object: send both `url` and `header` when updating, or the header is
removed.

## Test Mode vs Live Mode

Use a `sk_test_...` key to register a webhook for test payments. Tabby's docs suggest Webhook.site
for inspecting what is sent. Allowlisting Tabby's server IPs (listed on the payments webhook
page) is an optional extra on top of the header.
