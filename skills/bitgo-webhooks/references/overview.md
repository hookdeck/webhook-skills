# BitGo Webhooks Overview

## What BitGo Sends

BitGo makes `POST` requests with a JSON body to the webhook URL. Once the enterprise or organization has a webhook secret, each request carries `X-Signature-SHA256`. Webhooks can also add your own headers (`customHttpHeaders`).

## Webhook Scopes

- **Wallet webhooks:** `POST /api/v2/{coin}/wallet/{walletId}/webhooks`. Up to 10 webhooks of each type per wallet.
- **Enterprise and organization webhooks:** their own create endpoints.
- **Block webhooks:** notify about new blocks for a coin.

## Wallet Webhook Types

From [Create Wallet Webhooks](https://developers.bitgo.com/docs/webhooks-wallet):

| Type | Fires when |
|---|---|
| `address_confirmation` | A wallet address initialises on chain (ETH and XRP only) |
| `admin` | A wallet freezes, preventing withdrawals |
| `circuitBreaker` | More than $20M USD withdraws from the wallet within 24 hours |
| `lowFee` | The average fee drops below the wallet's threshold |
| `lowFeeAddressBalance` | The gas tank balance is low |
| `pendingapproval` | A wallet event requires approval |
| `stuckTx` | A transaction stays stuck in signed state after retried broadcasts |
| `transaction` | A transaction is recorded on chain |
| `transactionExpire` | A send request expires |
| `transactionRemoved` | BitGo removes a transaction |
| `transaction_finality_on_l1` | An L2 transaction reaches finality on L1 |
| `transfer` | A transfer goes into or out of the wallet |
| `txRequest` | A transaction request changes state |
| `txRequestTransaction` | A transaction inside a transaction request changes state |

For `transfer`, `numConfirmations` sets how many confirmations a transfer needs before BitGo notifies, and `listenToFailureStates: true` adds failed and removed transfers.

## Delivery

- BitGo needs **HTTP 200 OK**. Otherwise it retries up to 7 more times, after 1, 5, 10, 30, 60, 120 and 240 minutes.
- Make handlers idempotent: BitGo notes you can receive the same webhook twice.
- **Suspension:** after 500 consecutive failed deliveries, or more than 100 consecutive failures within 7 days. A suspended webhook must be deleted and created again.
- **URL block:** 10 non-retryable 4xx responses within 1 hour block the URL for every webhook registered to it. A successful delivery doesn't reset that counter.
- BitGo publishes its egress IPs for allowlisting.
