# Nium Webhooks Overview

## What Are Nium Webhooks?

Nium uses webhooks to tell your application about events on the Nium platform. You give Nium
the URL of your endpoint (`https://<customerHost:Port>/webhook` in Nium's examples) and Nium
sends a `POST` for each event. The body usually carries just enough detail to identify the event;
use the Nium APIs to fetch full details.

Webhooks are unsigned. Nium can add a **static, client-specified header** to every request
(`x-partner-key` is the docs' example name; the name and value are agreed at client setup). Every
request also has an `x-request-id` header, unique per event and **reused on redelivery**.

## How Do I Tell Events Apart?

The body has a `template` field naming the event, for example:

```json
{
  "customerHashId": "0de1e512-e0d7-4eca-ad41-dd39325facc2",
  "walletHashId": "e83cca77-8b63-4a25-b580-1d872380ef29",
  "systemReferenceNumber": "RT1343085439",
  "template": "REMIT_TRANSACTION_PAID_WEBHOOK"
}
```

**RFI webhooks are different:** they have no `template`. The body carries an `rfiDetails` object
and `rfiDetails.status` tells you the event (`RFI_REQUESTED`, `RFI_RESPONDED`, `RFI_CLOSED`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CUSTOMER_STATUS_WEBHOOK` | A customer's `status` or `subStatus` changes | Onboarding progress, RFI follow-up, suspensions |
| `CUSTOMER_ODD_STATUS_WEBHOOK` | Ongoing due diligence status changes | Compliance tracking |
| `CARD_CLIENT_KYB_STATUS_WEBHOOK` | The client's KYB status is not complete | Go-live gating |
| `REMIT_TRANSACTION_INITIATED_WEBHOOK` | A payout is initiated | Mark payout in flight |
| `REMIT_TRANSACTION_PAID_WEBHOOK` | A payout is paid | Settle the payout in your ledger |
| `REMIT_TRANSACTION_REJECTED_WEBHOOK` | A payout is rejected | Release funds, notify the sender |
| `REMIT_TRANSACTION_RETURNED_WEBHOOK` | A payout is returned | Refund the sender |
| `FX_CONVERSION_COMPLETED_WEBHOOK` | An FX conversion settles | Update wallet balances |
| `FX_CONVERSION_FAILED_WEBHOOK` | An FX conversion fails | Alert, retry |
| `FX_CONVERSION_CANCELLED_WEBHOOK` | An FX conversion is cancelled | Release the quote |
| `CARD_POS_APPROVED_WEBHOOK` | A POS card transaction is approved | Record authorizations |
| `CARD_ATM_APPROVED_WEBHOOK` | An ATM transaction is approved | Record withdrawals |
| `CARD_WALLET_FUNDING_WEBHOOK` | A card wallet receives funds | Credit balances |
| `VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK` | A virtual account is assigned | Show account details |
| `INCOMING_FUNDS_WEBHOOK` | Funds arrive for a wallet | Reconcile deposits |
| `RFI_REQUESTED` | Nium raises an RFI (`rfiDetails.status`) | Ask the customer to respond |
| `RFI_RESPONDED` | A response to an RFI is submitted | Mark as answered |
| `RFI_CLOSED` | Nium cancels an RFI (`rfiDetails.status`) | Stop chasing |

Other templates in Nium's docs include `CARD_ACTIVATION_CARD_WEBHOOK`, `CARD_ADD_ON_CARD_WEBHOOK`,
`CARD_SET_PIN_WEBHOOK`, `CARD_TEMPORARY_BLOCK_WEBHOOK`, `CARD_PERMANENT_BLOCK_WEBHOOK`,
`CARD_SETTLEMENT_CREDIT_WEBHOOK`, `CARD_SETTLEMENT_DEBIT_WEBHOOK`, `CARD_TRANSACTION_REVERSAL_WEBHOOK`,
`CARD_INSUFFICIENT_FUNDS_DECLINED_WEBHOOK`, `CARD_VTS_PROVISION_WEBHOOK`,
`REMIT_TRANSACTION_SENT_TO_BANK_WEBHOOK`, `REMIT_TRANSACTION_EXPIRED_WEBHOOK`,
`REMIT_TRANSACTION_CANCELLED_WEBHOOK`, `REMIT_TRANSACTION_DELAYED_WEBHOOK`,
`REMIT_TRANSACTION_AWAITING_FUNDS_WEBHOOK`, `REMIT_TRANSACTION_SUBSTATUS_UPDATE_WEBHOOK`,
`FUND_TRANSFER_BETWEEN_WALLETS_WEBHOOK`, `DIRECT_DEBIT_TRANSACTION_RETURN_WEBHOOK`,
`NOC_RECEIVED_WEBHOOK`, `USER_STATUS_WEBHOOK` and `VIRTUAL_ACCOUNT_ASSIGNMENT_FAILED_WEBHOOK`.
Add a `case` for the ones you subscribe to; unknown templates should still get a `200`.

## Event Payload Structure

Fields vary per event. Common ones: `customerHashId`, `walletHashId`, `clientHashId`,
`systemReferenceNumber` (payouts, conversions), `transactionAmount` / `transactionCurrency`
(cards, payouts), and `template`. RFI events carry `clientHashId`, `customerHashId` and an
`rfiDetails` object (`rfiId`, `status`, `query`, `rfiExpiry`, ...).

## Delivery and Retries

- Default: **at most once**. A timeout or any non-200 response is not retried.
- Optional: ask your Nium representative to enable retries for specific events. Nium then retries
  up to 20 times, one every 5 minutes (about 100 minutes in total).
- Every delivery has an `x-request-id` header; a redelivery repeats the original value, so use it
  to ignore duplicates.

## Full Event Reference

See Nium's [Notifications and Webhooks](https://docs.nium.com/docs/developers/notifications-and-webhooks)
documentation and its per-category pages (Platform, Payouts, Payins, Issuing and Card, RFI).
