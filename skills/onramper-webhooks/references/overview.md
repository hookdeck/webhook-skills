# Onramper Webhooks Overview

## What Are Onramper Webhooks?

Onramper is a fiat-to-crypto on-ramp aggregator. Its transaction status webhooks call your endpoint when a transaction changes status. They are enabled per ApiKey by your Onramper Customer Success Manager. Each delivery is the transaction's current state: one JSON shape, with no event name and no header that carries a type.

Onramper's docs say nothing about timeouts, the response they expect, or retries, so return a `2xx` quickly and make the handler idempotent.

## Event Types

Dispatch on the body's `status` field (the six values in Onramper's "Webhook Status" table):

| `status` | Handled in the examples |
|----------|-------------------------|
| `completed` | Logged, with a TODO to fulfil the order |
| `paid` | Logged |
| `pending` | Logged |
| `new` | Logged |
| `failed` | Logged, with a TODO to alert or retry |
| `canceled` | Logged |

Any other value is logged as unhandled. `transactionType` is `buy` or `offramp` and gives the direction.

## Payload Structure

From Onramper's documented sample (`status: "pending"`):

```json
{
  "apiKey": "pk_test_01K4MF4ZBPGDCV3GFFNA684NT0",
  "country": "us",
  "inAmount": 100,
  "onramp": "gatefi",
  "onrampTransactionId": "8bf94c80-test-aabb-851-143835984d1d",
  "outAmount": 3.83527521,
  "paymentMethod": "creditcard",
  "partnerContext": "",
  "sourceCurrency": "usd",
  "status": "pending",
  "statusDate": "2023-08-09T13:15:18.725Z",
  "targetCurrency": "sol",
  "transactionId": "01H7D547TESTV2RQJ52ZAB7WF7",
  "transactionType": "buy",
  "transactionHash": "",
  "walletAddress": "testG15oy66q7cU6aNige54PxLLEfGZvRsAADjbF7D4"
}
```

Because every delivery is a snapshot, dedupe on `transactionId` plus `status` (and `statusDate`).

## Full Event Reference

See [Onramper's webhook documentation](https://docs.onramper.com/docs/optional-webhook-setup).
