# Setting Up Helius Webhooks

## Prerequisites

- Helius account and API key
- A publicly reachable HTTPS endpoint (Helius cannot call `localhost`)
- A random secret to use as the `authHeader`

## Create the Webhook in the Dashboard

1. Open the [Helius Webhooks dashboard](https://dashboard.helius.dev/webhooks) and click **Add Webhook**.
2. Fill in the webhook URL (for example `https://app.example.com/webhooks/helius`), the transaction types, the account addresses (up to 25 in the dashboard) and the webhook type.
3. Set the **authentication header** to a secret value such as `Bearer <random-token>`.
4. Click **Create Webhook**. Events start flowing to your endpoint.

## Create the Webhook with the API

Use the API for more than 25 addresses (up to 100,000) or non-JavaScript stacks. See the [Create Webhook reference](https://www.helius.dev/docs/api-reference/webhooks/create-webhook).

```bash
curl -X POST "https://mainnet.helius-rpc.com/v0/webhooks?api-key=$HELIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookURL": "https://app.example.com/webhooks/helius",
    "transactionTypes": ["NFT_SALE", "SWAP", "TRANSFER"],
    "accountAddresses": ["<address-to-monitor>"],
    "webhookType": "enhanced",
    "authHeader": "Bearer your-secret-token"
  }'
```

Request fields: `webhookURL`, `transactionTypes`, `accountAddresses`, `webhookType`, `authHeader`, `encoding`, `txnStatus`.

## Configure Your App

Store the exact `authHeader` string in your environment:

```bash
HELIUS_AUTH_HEADER=Bearer your-secret-token
```

Your handler must compare the incoming `Authorization` header to this whole value.

## Devnet vs Mainnet

Choose "devnet" as the network in the dashboard, or use `enhancedDevnet`, `rawDevnet` or `discordDevnet` as `webhookType` in the API.

## Managing Webhooks

- Editing, creating or deleting a webhook costs 100 credits per request; each delivered event costs 1 credit, whether or not your endpoint succeeds.
- Toggle a webhook with `PATCH` and `{ "active": true }`, or in the dashboard.
- Helius auto-disables webhooks with a 95% or higher delivery failure rate (7-day window on paid plans, 24 hours on Free). Re-enabling starts a 24-hour grace period.
