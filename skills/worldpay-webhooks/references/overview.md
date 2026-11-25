# Worldpay Webhooks Overview

## What Are Worldpay Webhooks?

Worldpay (worldpay.com, developer docs at docs.worldpay.com) is a card acquirer and payment processor. It was spun out of FIS in 2024 and acquired by Global Payments in January 2026. Older names for the same company are "Worldpay from FIS", Vantiv and Litle. Worldline is a different company with its own webhook scheme.

Hookdeck's `WORLDPAY` source type covers two webhook families:

| Family | Shape | Authentication | Acknowledgement |
|---|---|---|---|
| **Access Worldpay event webhooks** (primary, and what this skill's code handles) | JSON, `Content-Type: application/vnd.worldpay.events-v1.hal+json` | `Event-Signature` hex HMAC-SHA256 (opt-in), plus a client certificate and a published IP list | HTTP `200` within 10 seconds; the body is ignored |
| **WPG (Worldpay Payments Gateway / Corporate Gateway) XML order notifications** (secondary) | `text/xml`, root element `<paymentService>` | Not signed. The channel itself is authenticated, with a TLS client certificate and/or reverse DNS | HTTP `200` with the literal body `[OK]` |

Two other Worldpay products use the same `Event-Signature` scheme as Access events, but they are not what the `WORLDPAY` source type is documented for:

- **Account Payouts event webhooks** (`/access/products/account-payouts/`). Its HMAC page is the one that says outright that the signature is "hex output".
- **Hosted Payment Pages (HPP) webhooks**, which you configure yourself in the Worldpay dashboard.

The Worldpay for Platforms merchant-boarding event notifications (capital, equipment, merchant accounts, transaction batches) are a separate family and are out of scope.

## How Are Access Worldpay Events Delivered?

- **Configuration goes through your Implementation Manager.** "Contact your Worldpay Implementation Manager to add your webhook URL and enable or disable the events based on your requirement." There is no self-service endpoint registration for Access events.
- **Acknowledge with `200`.** "If a `200` event confirmation response is not received within 10 seconds, we retry the event until the confirmation is received."
- **Retry schedule.** "Retry intervals increase based on the number of attempts, the time intervals increase starting 30 seconds to 2 hours per event." Retries stop after a `200` or "after one week of attempting to send the event."
- **Retries are head-of-line blocking.** The docs warn: "Not acknowledging can cause delays (or loss) of subsequent events in the queue." A slow or failing handler holds up later events as well as the current one. Return `200` first and process asynchronously.
- **There is no event-type header.** Route on the body.

## Event Payload Structure

From the Access Worldpay events OpenAPI 3.1 spec (`/access/_bundle/products/events/@v1/openapi.yaml`):

```json
{
  "eventId": "bb55ca5a-e05c-47e1-8e94-e88bac1a0a17",
  "eventTimestamp": "2018-06-13T14:18:13.407",
  "eventDetails": {
    "classification": "payment",
    "downstreamReference": "3378792436",
    "transactionReference": "Memory265-13/08/1876",
    "type": "sentForAuthorization",
    "date": "2018-06-13",
    "amount": { "value": 100, "currencyCode": "EUR" },
    "_links": { "...": "HAL links to the related payment resource" }
  }
}
```

| Field | Notes |
|---|---|
| `eventId` | "The unique identifier for the event." Retries reuse it, so it is your **dedupe key**. |
| `eventTimestamp` | "Date of event." The spec example `2018-06-13T14:18:13.407` has **no timezone designator**. Don't assume RFC 3339 or UTC; parse it leniently. |
| `eventDetails.classification` | "The event category, this can either be payout, payment or chargeback." |
| `eventDetails.type` | "Event status. For example, `cancelled` or `sentForAuthorization`." |
| `eventDetails.amount.value` | Integer minor units: "a whole number with an exponent of 2, e.g. 250 would be 2.50". `currencyCode` is a string such as `EUR`. |
| `eventDetails.transactionReference` | "The transaction reference you supplied in the payment." |
| `eventDetails.downstreamReference` | "A reference you can use for reconciliation purposes." The payout schemas don't include it, so treat it as optional. |
| `eventDetails._links` | HAL links back to the payment or payout resource. Present on payment and chargeback events, absent from the payout schemas. Treat it as optional. |

Card `authorized` events add more fields, such as `orderReference`, `paymentId`, `commandId`, `riskFactors`, `paymentInstrument` and `scheme`. `tokenCreated` is a `oneOf` across four variants (Card, Klarna (recurring), iDEAL, SEPA), so **its `eventDetails` shape depends on the payment method**. No single token payload is canonical.

## How Do I Route Events? (classification + type)

`eventDetails.type` alone is **not unique**: `refused` exists as both a payment event and a payout event. Route on the pair `(eventDetails.classification, eventDetails.type)`.

## Event Types

There are 26 events, taken from the OpenAPI spec's operations (tag = `classification`, summary = `type`), read 2026-11-25. Descriptions are quoted or condensed from the spec.

### `payment` (20)

| `type` | Triggered when |
|---|---|
| `sentForAuthorization` | Worldpay has asked the card issuer for permission to process the payment |
| `authorized` | The payment was approved and the funds are reserved in the customer's account |
| `sentForSettlement` | You or Access Worldpay requested to take the reserved funds into your Worldpay account |
| `settled` | Worldpay has received the funds and is preparing to transfer them to your bank account (only in certain use cases) |
| `settlementFailed` | The settlement couldn't be processed, and no funds were transferred (only in certain use cases) |
| `settlementInstructed` | A settlement instruction was received (Pix only) |
| `settlementRejected` | A settlement failure instruction was received (Pix only) |
| `cancelled` | You stopped the transaction before it was sent for settlement |
| `cancelledByCustomer` | The customer cancelled the payment (Klarna only) |
| `error` | The payment wasn't completed. **Also used for payout-related failures.** |
| `expired` | The authorization period ended before a settlement or cancel request was made |
| `requestExpired` | The payment request expired because the customer was inactive (APMs only) |
| `refused` | A third party declined the payment request |
| `sentForRefund` | You requested funds to be sent back to the customer. **Basic disbursement payouts also trigger this event.** |
| `refunded` | The card issuer received the refund request (only in certain use cases) |
| `refundFailed` | The refund couldn't be processed and the funds were returned to your account |
| `chargedBack` | A chargeback instruction was received (Klarna only) |
| `tokenCreated` | An APM token was created. The shape varies by payment method |
| `topUpAccepted` | A top-up request was accepted (Pix only) |
| `topUpRejected` | A top-up request failed (Pix only) |

### `payout` (5)

| `type` | Triggered when |
|---|---|
| `requested` | Access Payouts received your Fast Access disbursement request |
| `pending` | The request was sent to Visa Direct and a response is pending. This usually resolves within 45 minutes |
| `approved` | Visa Direct approved the disbursement |
| `refused` | The Fast Access disbursement request was refused |
| `disbursed` | The disbursement was paid out |

### `chargeback` (1)

| `type` | Triggered when |
|---|---|
| `informationRequested` | The customer disputed the payment, and the issuer requested information while the funds are held. "This event is only available in certain use cases. Please speak to your Worldpay Implementation Manager for more details." |

### Why Don't I Receive All 26?

Availability depends on your **business line** (Enterprise, SMB (Worldpay eCommerce), Marketplaces), on your **payment methods**, and on which events your Implementation Manager **enabled for your endpoint**. Several events are only for Enterprise and Marketplaces. `tokenCreated` for cards is SMB-only.

### Where the Docs Disagree

- The human-readable "Supported events" table at `/access/products/events/overview` lists only 23 rows. It **omits** `settlementInstructed`, `settlementRejected`, `requestExpired`, `topUpAccepted` and `topUpRejected`, although all five have their own OpenAPI operation and doc page. This skill follows the OpenAPI spec. The table is still the only place that breaks events down per payment method (for example `authorized - iDEAL` or `sentForSettlement - Pix`) and per business line.
- The same table labels three payout events `refusedPayout`, `requestedPayout` and `approvedPayout`. Those are the OpenAPI **operationIds**, not wire values. The spec's `summary` and the payout schema's `type` example use the bare `refused`, `requested` and `approved`, so match on the bare forms.

## Full Event Reference

- [Access Worldpay events](https://docs.worldpay.com/access/products/events)
- [Event-Signature header](https://docs.worldpay.com/access/products/events/signature)
- [Supported events table](https://docs.worldpay.com/access/products/events/overview)
- [OpenAPI spec](https://docs.worldpay.com/access/_bundle/products/events/@v1/openapi.yaml)
