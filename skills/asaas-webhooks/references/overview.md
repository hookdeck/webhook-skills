# Asaas Webhooks Overview

## What Are Asaas Webhooks?

Asaas notifies your application with an HTTP `POST` (JSON body) whenever something changes on a
charge, subscription, transfer, invoice, and other resources. Each webhook receives only the
events you selected, and an account can register up to 10 webhooks with different URLs and event
sets. Delivery is **at least once**, so the same event can arrive more than once.

Webhooks are **not signed**. Authenticity comes from the `authToken` you set on the webhook,
which Asaas sends in the `asaas-access-token` header (see [verification.md](verification.md)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `PAYMENT_CREATED` | A new charge is generated | Record the charge in your system |
| `PAYMENT_UPDATED` | Due date or value of a charge changes | Sync charge details |
| `PAYMENT_CONFIRMED` | Payment made, balance not yet available | Show "paid, awaiting settlement" |
| `PAYMENT_RECEIVED` | Charge received, amount available in the account | Release goods, activate service |
| `PAYMENT_OVERDUE` | Charge overdue | Dunning, reminders |
| `PAYMENT_REFUNDED` | Charge refunded | Revoke access, update ledger |
| `PAYMENT_DELETED` | Charge removed | Cancel the open order |
| `SUBSCRIPTION_CREATED` | A new subscription is created | Start a recurring plan |
| `TRANSFER_DONE` | A transfer is completed | Confirm a payout |

## Full Event Lists

**Payment** (`payment` object): `PAYMENT_CREATED`, `PAYMENT_AWAITING_RISK_ANALYSIS`,
`PAYMENT_APPROVED_BY_RISK_ANALYSIS`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_AUTHORIZED`,
`PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`,
`PAYMENT_ANTICIPATED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`,
`PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`,
`PAYMENT_REFUND_DENIED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`, `PAYMENT_CHARGEBACK_REQUESTED`,
`PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`, `PAYMENT_DUNNING_REQUESTED`,
`PAYMENT_DUNNING_RECEIVED`, `PAYMENT_BANK_SLIP_CANCELLED`, `PAYMENT_BANK_SLIP_VIEWED`,
`PAYMENT_CHECKOUT_VIEWED`, `PAYMENT_SPLIT_CANCELLED`, `PAYMENT_SPLIT_DIVERGENCE_BLOCK`,
`PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED`, `PAYMENT_SPLIT_DONE`

**Subscription** (`subscription` object): `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`,
`SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_SPLIT_DISABLED`,
`SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK`, `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED`

**Transfer** (`transfer` object): `TRANSFER_CREATED`, `TRANSFER_PENDING`,
`TRANSFER_IN_BANK_PROCESSING`, `TRANSFER_BLOCKED`, `TRANSFER_DONE`, `TRANSFER_FAILED`,
`TRANSFER_CANCELLED`

**Invoice** (`invoice` object): `INVOICE_CREATED`, `INVOICE_UPDATED`, `INVOICE_SYNCHRONIZED`,
`INVOICE_AUTHORIZED`, `INVOICE_PROCESSING_CANCELLATION`, `INVOICE_CANCELED`,
`INVOICE_CANCELLATION_DENIED`, `INVOICE_ERROR`

Asaas also documents events for bill payments, anticipations, phone recharges, account status,
Checkout, balance blocks, internal movements, API keys, and Automatic Pix; see the docs below.

## Event Payload Structure

```json
{
  "id": "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  "event": "PAYMENT_RECEIVED",
  "dateCreated": "2024-06-12 16:45:03",
  "account": { "id": "47ed0d25-f9fb-4b35-b23a-d8895caf92b7", "ownerId": null },
  "payment": {
    "object": "payment",
    "id": "pay_080225913252",
    "customer": "cus_G7Dvo4iphUNk",
    "value": 100,
    "netValue": 94.51,
    "billingType": "CREDIT_CARD",
    "status": "RECEIVED"
  }
}
```

The top-level `id` identifies the event and is the key to dedupe on. Event time is `dateCreated`
(`YYYY-MM-DD HH:mm:ss`, no timezone).

## Full Event Reference

- [Introduction - Webhooks](https://docs.asaas.com/docs/about-webhooks)
- [Receive Asaas events at your webhook endpoint](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)
- [Payment events](https://docs.asaas.com/docs/payment-events)
