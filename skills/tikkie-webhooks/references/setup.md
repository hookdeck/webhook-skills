# Setting Up Tikkie Notifications

Tikkie has no dashboard screen for webhooks. You subscribe through the API.

## 1. Credentials

| Header | Where it comes from |
|---|---|
| `API-Key` | The consumer key of your app on the ABN AMRO developer portal (developer.abnamro.com) |
| `X-App-Token` | A UUID app token. **Production:** create it in the Tikkie Business Portal. **Sandbox:** create it with `POST /sandboxapps` (`API-Key` only) |

```bash
# Sandbox app token
curl -X POST https://api-sandbox.abnamro.com/v2/tikkie/sandboxapps \
  -H "API-Key: $TIKKIE_API_KEY"
```

Base URLs:

- Production: `https://api.abnamro.com/v2/tikkie`
- Sandbox: `https://api-sandbox.abnamro.com/v2/tikkie`

## 2. Subscribe

There are two independent subscriptions. **Each can have only one active
subscription.** A repeat `POST` overwrites the existing one, including its URL.

### Payments and refunds (`PAYMENT`, `REFUND`)

This needs **payment request permission** on the app token.

```bash
curl -X POST "$TIKKIE_API_BASE_URL/paymentrequestssubscription" \
  -H "API-Key: $TIKKIE_API_KEY" \
  -H "X-App-Token: $TIKKIE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/tikkie"}'
# 201 → { "subscriptionId": "6289db02-d422-4e93-b65c-30fa973bd341" }
```

### Transaction bundles (`BUNDLE`)

This needs **transaction bundle permission** on the app token.

```bash
curl -X POST "$TIKKIE_API_BASE_URL/transactionssubscription" \
  -H "API-Key: $TIKKIE_API_KEY" \
  -H "X-App-Token: $TIKKIE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/tikkie"}'
# 201 → { "subscriptionId": "5505d055-89e9-48b7-913d-8414d9f8d3cd" }
```

**Store each returned `subscriptionId`.** Your handler compares incoming
notifications against it (see [verification.md](verification.md)). If both
subscriptions point at the same URL, list both ids, comma-separated:

```bash
TIKKIE_SUBSCRIPTION_ID=6289db02-d422-4e93-b65c-30fa973bd341,5505d055-89e9-48b7-913d-8414d9f8d3cd
```

URL validation errors from the spec:

- `URL_MISSING`
- `URL_INVALID`
- `URL_DISALLOWED`: "It is prohibited to use this `url` for webhooks"

## 3. Unsubscribe

```bash
curl -X DELETE "$TIKKIE_API_BASE_URL/paymentrequestssubscription" \
  -H "API-Key: $TIKKIE_API_KEY" -H "X-App-Token: $TIKKIE_APP_TOKEN"   # 204
curl -X DELETE "$TIKKIE_API_BASE_URL/transactionssubscription" \
  -H "API-Key: $TIKKIE_API_KEY" -H "X-App-Token: $TIKKIE_APP_TOKEN"   # 204
```

## 4. Environment variables

```bash
TIKKIE_SUBSCRIPTION_ID=     # id(s) from step 2
TIKKIE_API_KEY=             # API-Key
TIKKIE_APP_TOKEN=           # X-App-Token
TIKKIE_API_BASE_URL=https://api-sandbox.abnamro.com/v2/tikkie
```

There's **no webhook signing secret** to configure. Tikkie doesn't have one.

## Local testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 tikkie --path /webhooks/tikkie   # Express / Next.js
npx hookdeck-cli listen 8000 tikkie --path /webhooks/tikkie   # FastAPI
```

Subscribe with the printed Hookdeck URL as `url`. Tikkie sends no
signature, so there is nothing for Hookdeck to verify. Keep the
`subscriptionId` check and the re-fetch in your handler. To test without
waiting for a real payment, `POST` one of the example payloads from
[overview.md](overview.md) to your endpoint.
