# BVNK Webhooks Overview

## What Are BVNK Webhooks?

BVNK (bvnk.com) provides stablecoin and fiat payment infrastructure. When something happens in your BVNK account, such as a pay-in, a payout, a refund or a status change, BVNK sends an HTTP `POST` with the event details to the URL you registered in the BVNK Portal (Integrations → Webhooks). The URL must use HTTPS on port 443 with a valid certificate.

## Common Event Types

The event name is in the body's `event` field (a colon-separated URN). No header carries it.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment:v2:payin:status-change` | A pay-in changes status | Mark orders paid, update balances |
| `bvnk:payment:channel:created` | A payment channel is created | Track new deposit addresses or channels |
| `bvnk:payment:channel:transaction-confirmed` | A transaction on a channel is confirmed | Credit a customer |
| `bvnk:payment:channel:transaction-on-hold` | A channel transaction is put on hold | Compliance review (enabled on request) |
| `bvnk:payment:crypto:transaction-on-hold` | A crypto transaction is put on hold | Compliance review (enabled on request) |
| `bvnk:ledger:report:ready` | A ledger report is ready | Download the CSV from `data.url` |
| `platform:accounts:customer:created` | A customer is created | Sync customer records |
| `platform:accounts:customer:status-change` | A customer's status changes | KYC/KYB workflow updates |
| `bvnk:customers:status-change` | A customer's status changes (customers API) | KYC/KYB workflow updates |

Other documented customer events include `platform:accounts:customer:agreement-status-change`, `platform:accounts:customer:associate-status-change`, `platform:accounts:customer:associate-deleted`, `platform:accounts:customer:document-status-change`, `platform:accounts:customer:associate-document-status-change`, `platform:accounts:customer:data-updated`, `platform:accounts:customer:initialized`, `bvnk:customers:agreements:status-change`, `bvnk:customers:associates:status-change`, `bvnk:customers:documents:status-change` and `bvnk:customers:associates:documents:status-change`. BVNK documents 28 event types in total; the rest are in its Webhooks API Reference. The examples handle a few and log the rest.

BVNK's legacy "Standard" webhooks use `"source": "payment", "event": "statusChanged"` instead. They sign differently and fail verification.

## Event Payload Structure

```json
{
  "event": "bvnk:ledger:report:ready",
  "eventId": "0198a8bb-7d56-79ef-92b2-2aed247c21b4",
  "timestamp": "2025-08-14T13:18:36.374620938Z",
  "data": {
    "id": "8d942264-e27e-44d9-a048-5ed66ac5129f",
    "url": "https://.../transaction/8d942264-....csv?X-Amz-...",
    "type": "TRANSACTION",
    "status": "READY"
  }
}
```

`eventId` is unique per event: use it to deduplicate retries. The shape of `data` varies by event.

## Delivery

Return `200` within 10 seconds. Otherwise BVNK retries with growing delays (capped at 15 minutes), up to 100 attempts. Do your processing after acknowledging, and do not update transactions after you receive the final webhook for them.

## Full Event Reference

For the complete list of events and payloads, see [BVNK's webhook documentation](https://docs.bvnk.com/bvnk/get-started/create-webhook-listener).
