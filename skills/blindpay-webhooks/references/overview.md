# BlindPay Webhooks Overview

## What Are BlindPay Webhooks?

[BlindPay](https://blindpay.com) is a stablecoin and fiat payins/payouts API. It sends an HTTPS `POST` to your endpoint whenever a customer, bank account, wallet, payin, payout, virtual account, transfer, limit increase or payable changes. Webhooks are configured per instance and delivered through [Svix](https://www.svix.com/), so each request carries `svix-id`, `svix-timestamp` and `svix-signature` headers.

## Common Event Types

26 events are documented (the list may not be exhaustive). Event names are camelCase for compound resources (`bankAccount.new`, `virtualAccount.complete`), so match them exactly.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.new` | A customer is created | Create the customer in your database |
| `customer.update` | A customer changes (for example KYC status) | Unlock features after approval |
| `customer.delete` | A customer is deleted | Clean up local records |
| `bankAccount.new` | A bank account is added | Show the account as payable |
| `blockchainWallet.new` | A blockchain wallet is added | Record the payout address |
| `blockchainWallet.update` | A blockchain wallet changes | Refresh the stored wallet |
| `tos.accept` | A customer accepts the terms of service | Record consent |
| `payin.new` | A payin starts | Show a pending deposit |
| `payin.update` | A payin changes status | Update progress |
| `payin.complete` | A payin completes | Credit the user |
| `payout.new` | A payout starts | Show a pending withdrawal |
| `payout.update` | A payout changes status | Update progress |
| `payout.complete` | A payout completes | Mark the withdrawal as paid |
| `virtualAccount.new` | A virtual account is created | Show deposit details |
| `virtualAccount.complete` | A virtual account is completed | Mark it as ready |
| `transfer.new` | A transfer starts | Show a pending transfer |
| `transfer.update` | A transfer changes | Update progress |
| `transfer.complete` | A transfer completes | Reconcile balances |
| `wallet.new` | A wallet is created | Store the wallet |
| `wallet.update` | A wallet changes | Refresh the stored wallet |
| `wallet.inbound` | A wallet receives funds | Credit incoming deposits |
| `limitIncrease.new` | A limit increase is requested | Track the request |
| `limitIncrease.update` | A limit increase changes | Notify the customer |
| `payable.new` | A payable is created | Show the invoice |
| `payable.update` | A payable changes | Update the invoice |
| `payable.complete` | A payable is paid | Mark the invoice as paid |

## Event Payload Structure

The body is flat JSON: `webhook_event` followed by the resource's own fields. There is no wrapper object.

```json
{
  "webhook_event": "payin.complete",
  "id": "pi_000000000000",
  "status": "completed",
  "customer_id": "cu_000000000000"
}
```

A real `payin.complete` also carries amounts, fees, bank details and tracking objects.

## Full Event Reference

For the complete list of events, see [BlindPay's webhook documentation](https://blindpay.com/docs/learn/webhooks).
