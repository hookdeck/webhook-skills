# Affonso Webhooks Overview

## What Are Affonso Webhooks?

Affonso is an affiliate-program platform for SaaS. It sends an HTTP POST with a JSON body to your HTTPS endpoint when affiliates, referrals, transactions (sales and commissions), payouts, or coupons change. Each endpoint has its own signing secret and its own list of subscribed events (all events, or a selection).

## Common Event Types

The type is in the body's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `affiliate.created` | A new affiliate signs up | Welcome email, CRM record |
| `affiliate.confirmed` | An affiliate is confirmed (`ACTIVE`) | Enable the affiliate's links or perks |
| `referral.lead` | A referred visitor becomes a lead | Attribute signups |
| `referral.converted` | A referral converts to a customer | Link `customerId` to the affiliate |
| `transaction.created` | A sale and its commission are recorded | Revenue and commission tracking |
| `transaction.approved` | A commission is approved | Accounting |
| `transaction.paid` | A commission is paid | Reconcile payments |
| `transaction.rejected` | A commission is rejected (for example a refund) | Reverse accruals |
| `payout.paid` | A payout to an affiliate completes | Notify the affiliate, bookkeeping |
| `payout.failed` | A payout fails | Alert finance, retry flow |

All 21 documented events:

- Affiliate: `affiliate.created`, `affiliate.confirmed`, `affiliate.updated`, `affiliate.deleted`
- Referral: `referral.lead`, `referral.converted`, `referral.updated`, `referral.deleted`
- Transaction: `transaction.created`, `transaction.updated`, `transaction.approved`, `transaction.paid`, `transaction.rejected`, `transaction.deleted`
- Payout: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.deleted`
- Coupon: `coupon.created`, `coupon.deleted`

The example handlers act on the ten in the table and log the rest as unhandled (still returning 200).

## Event Payload Structure

Every event shares one envelope; `data` depends on the event family.

```json
{
  "id": "evt_abc123",
  "type": "transaction.created",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "data": {
    "transactionId": "txn_xyz789",
    "referralId": "ref_abc123",
    "affiliateId": "aff_def456",
    "saleAmount": 99.0,
    "saleCurrency": "USD",
    "saleStatus": "COMPLETE",
    "commissionAmount": 29.7,
    "commissionCurrency": "USD",
    "commissionStatus": "PENDING",
    "incentiveType": "COMMISSION",
    "holdPeriodDays": 30,
    "invoiceId": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

- `id` is unique per event; use it to drop duplicates.
- Affiliate events carry `affiliateId`, `affiliateProgramId`, `trackingId`, `status`, `email`, `name`, `externalUserId`, `metadata`, `groupId`.
- Referral events carry `referralId`, `affiliateId`, `affiliateProgramId`, `trackingId`, `status` (`LEAD`, `CUSTOMER`), `email`, `customerId`, `ip`, `referrer`.
- Payout events carry `payoutId`, `affiliateId`, `affiliateProgramId`, `invoiceNumber`, `amount`, `status` (`COMPLETED`, `FAILED`), `isManagedPayout`, `paidAt`.

## Delivery and Retries

- Respond with any 2xx within 10 seconds. The docs show `{ "received": true }`.
- A non-2xx status, or no response within 10 seconds, counts as failed.
- Failed deliveries are retried with exponential backoff for up to 48 hours: 11 attempts in all, then the delivery is marked failed.
- Acknowledge first and process asynchronously for slow work.

## Full Event Reference

For the complete payloads, see [Affonso's webhook documentation](https://docs.affonso.io/webhooks) (affiliate, referral, transaction, payout and coupon event pages).
