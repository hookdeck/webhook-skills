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

| Topic | Actions you will typically see | Triggered when |
|-------|-------------------------------|----------------|
| `SUBSCRIPTION` | `CREATE`, `UPDATE` | Billing subscription events occur |
| `INVOICE` | `CREATE`, `UPDATE` | Invoice and billing events occur |
| `CLIENT` | `CREATE`, `UPDATE` | A client (company) is created or changed |
| `PRODUCT` | `CREATE`, `UPDATE` | A catalog product visible to the account changes |
| `QUOTE` | `CREATE`, `UPDATE` | A quote is created or changed |
| `USER` | `CREATE`, `UPDATE` | A user is created or changed |

The docs show only `SUBSCRIPTION` with the `CREATE` action explicitly. Pax8 adds topics
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
| Attempts | 3 (initial + 2 automatic retries, back-off 10 s, 30 s, 60 s) |
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
