# Coterie Webhooks Overview

## What Are Coterie Webhooks?

Coterie's Commercial Insurance API sends real-time requests from Coterie's servers to a
partner's servers so the partner can follow updates without polling. The docs say Coterie
"utilizes webhooks for three different actions; applications, quotes, and policies."

Webhooks carry no signature. The only authentication is the opt-in `Authentication` header
(see [verification.md](verification.md)). The docs do not describe retries, ordering or an
event ID, so make handlers idempotent.

## What Webhook Types Does Coterie Send?

The docs define no event-type strings and the payloads have no event-type field. The three
kinds are distinguished by their identifier key:

| Kind | Identifier key | Key fields (from the documented samples) |
|------|----------------|------------------------------------------|
| `application` | `applicationId` | `Status` (sample: `ReadyToQuote`), `BusinessName`, `ApplicationTypes` (e.g. `PL`, `BOP`), `ApplicationUrl`, `Metadata`, `Locations` |
| `quote` | `quoteId` | `PolicyType`, `Premium`, `MonthlyPremium`, `IsEstimate`, `isExpired`, `LineItems`, `applicationId`, `RatingEngine` |
| `policy` | `PolicyId` | `PolicyNumber`, `Status` (sample: `Pending`), `StatusDate`, `PolicyType`, `StartDate`, `EndDate`, `Premium`, `InsuranceCarrier`, `Locations` |

Only the status values `ReadyToQuote` (application) and `Pending` (policy) appear in the
docs; treat `Status` as an open string and don't assume a closed list.

Quote payloads include `applicationId` too, so classify on `quoteId` and `PolicyId` before
`applicationId`.

## Optional Headers

"All optional headers must be turned on by request only. Please work with your Coterie
contact to enable these."

| Header | Description |
|--------|-------------|
| `Authentication` | Static token authorizing Coterie in your system, sent as `Authentication: token {guid}` |
| `x-timeStamp` | Time of event in epoch milliseconds |
| `x-applicationId` | Coterie's application ID, for easy access with every message |
| `x-leadId` | Your own unique id, passed in the `Metadata` object and echoed in the header |

## Application `Metadata`

`Metadata` is a JSON string you supplied when creating the application (the sample holds
`partner_id`, `lead_id` and `customer_id`). Parse it yourself to map the webhook back to your
records.

## Full Reference

See Coterie's API documentation, Webhooks section: https://docs.coterieinsurance.com/
