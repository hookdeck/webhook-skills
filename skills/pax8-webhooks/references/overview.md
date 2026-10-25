# Pax8 Webhooks Overview

## What Are Pax8 Webhooks?

Pax8's partner **Webhooks API** (`https://api.pax8.com/api/v2/webhooks`) lets you subscribe to
platform events by **topic** and **action**. Pax8 sends the call "as soon as events or actions
happen", but it "may take up to 5 minutes" to reach your service.

This covers partner Webhooks API webhooks only, not Vendor Provisioner webhooks (those use a
Pax8-generated credential in a vendor-chosen header such as `pax8ApiTokenV1`).

Webhooks carry no signature. Pax8's FAQ: "Do you support HMAC signatures? Not yet." The only
authentication is the optional `authorization` value you set (see [verification.md](verification.md)).

## Which Topics and Actions Does Pax8 Send?

The Subscribing to Events page lists six categories, with event display names (not wire values):

| Category | Example events from the docs |
|----------|------------------------------|
| Client | Client Created, Client Updated, Client Deleted |
| Invoice | Invoice Created, Invoice Voided |
| Product | Product Created, Product Updated, Product Deleted |
| Quote | Quote Pending, Quote Ownership Taken, Quote Created, Quote Updated, Quote Customer Responded, Quote Expired, Quote Deleted, Line Items Added, Line Item Deleted, Line Items Updated |
| Subscription | Subscription Created, Subscription Updated, Subscription Cancelled, Subscription Vendor Mapping Updated, Subscription Commitment Term Updated, Subscription Purchase Order Updated |
| User | User Created, User Deleted, User Marked Active, User Marked Inactive, User Info Updated, User Account Reassigned, User Country Changed, User Account Name Changed, User Partner Type Changed, Company User Promoted to Partner User |

The only topic identifiers the docs show are `SUBSCRIPTION` and `PRODUCT`, and the only action
is `CREATE` (on `SUBSCRIPTION`). The examples assume `INVOICE`, `CLIENT`, `QUOTE` and `USER` for
the other categories; how the other display names map to actions is not documented. Pax8 adds topics
continuously, so call `GET /webhooks/topic-definitions` for the authoritative list of topics,
actions and filterable fields (for example `vendorId` with operator `IN`). Create calls
referencing anything not in that catalog are rejected.

Only one of each topic can be present in a single webhook subscription; create another
webhook to get different notifications for the same topic.

## Delivery Behavior

| Item | Value |
|------|-------|
| Method and body | `POST`, JSON |
| Timeout | No response within 10 seconds = failed |
| Attempts | 3 (initial + 2 automatic retries). The docs give the back-off as "10 s → 30 s → 60 s", three intervals for two retries, so the exact spacing is unclear |
| Final failure | Log status `FAILED`; logs kept for 30 days |
| Alerts | One email to `contactEmail` after `errorThreshold` consecutive failures (default 10, max 20) |
| Manual retry | `POST /webhooks/{webhookId}/logs/{logId}/retry` |
| Permissions | No events are emitted if the account lacks permission to the Events object |

## What Does a Pax8 Payload Look Like?

The documentation elides the `samplePayload`, so the body shape is not specified. This is an
**illustrative** payload used by the examples' tests; check a real delivery (or the test
endpoint `POST /webhooks/{id}/topics/{topic}/test`) for the actual fields:

```json
{ "topic": "SUBSCRIPTION", "action": "CREATE", "id": "00000000-0000-0000-0000-000000000000" }
```

The example handlers read `topic` and `action` if present as strings, and log anything else
as unclassified instead of failing.

## Full Reference

See Pax8's guide: https://devx.pax8.com/docs/how-to-use-webhook-apis
