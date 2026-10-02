# Polytomic Webhooks Overview

## What Are Polytomic Webhooks?

**Polytomic** (polytomic.com) is a data-movement platform: you build **models**
over a source, then run **Model Syncs** and **Bulk Syncs** that move data between
warehouses, SaaS apps and databases (reverse ETL).

Polytomic's single outbound-HTTP surface is the **Webhook connection used as a
sync destination** — "Webhooks — Destination" in the docs nav, and the only
webhook-related page in Polytomic's docs. The model is:

1. You add a **Webhook connection** (a destination), giving Polytomic a URL.
2. Polytomic gives you a **Secret**.
3. You point a **Model Sync** at that connection and select the fields you want.
4. On the sync's schedule, Polytomic **POSTs batches of changed records** to your
   URL.

**This is not event subscription.** There is no event-subscription UI, no
per-event-type toggles and no separate "platform events" API. Polytomic is not an
event producer in the usual sense — think *"receive Polytomic sync record
batches"*, not *"subscribe to Polytomic events"*.

## Common Event Types

There is **exactly one documented event type**.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync.records` | A Model Sync run has records to deliver — *"a list of the records changed since the last payload"* | Upserting synced rows into your own API/database, triggering downstream workflows per changed record, maintaining a mirror of a warehouse table |

Verbatim from the docs: *"This is an event type to help you distinguish new and
future hooks. You should only process webhooks you know about—for right now, that
is just the sync.records event."*

**Consequences for your router:**

- Switch on the top-level `event` field.
- Handle `sync.records`.
- Make the **default branch ignore unknown events and return 200**. The docs
  explicitly anticipate future types, and a 4xx/5xx would mark your customer's
  sync run as failed.

**Do not invent event names.** There is no `sync.started`, `sync.completed`,
`sync.failed`, `record.created` or anything else. None are documented.

## Event Payload Structure

The documented envelope, verbatim:

```json
{
  "event": "sync.records",
  "object": {
    "id": "1ea8f90a-b22e-4218-86d5-c3c109e1fbb7",
    "name": "Webhook HTTP Endpoint sync",
    "records": [
      {
        "hash": "b7421c6c57bd49f7",
        "fields": {
          "email": "nathan@polytomic.com",
          "last_login": "2020-12-02T00:00:00Z"
        }
      }
    ],
    "metadata": { }
  }
}
```

### Field by field

**`event`** — the event-type discriminator. Only `sync.records` is documented.

**`object`** — *"an envelope that will contain the payload, regardless of
event."* Always present.

**`object.id`** — the UUID of the **sync**, not of the delivery or the record.
*"It will match the value seen the URL bar when you have the corresponding sync
configuration open."* Useful for attributing a batch to a sync configuration.

**`object.name`** — the sync's name. *"This name matches the sync setup you
created in Polytomic. It can be useful for discriminating against data coming in
from different endpoints."*

**`object.records`** — *"a list of the records changed since the last payload."*

> **THE PAYLOAD IS A BATCH, NOT A SINGLE RECORD.** Every handler must loop. The
> default batch size is **100** ("Webhook batch size (default: 100)" under
> Advanced settings) and it is **user-configurable**, so never assume 1, and
> write for large batches.

**`object.records[].hash`** — *"a computed hash of the record's fields key/values
pairs, which may be useful for deduplicating incoming data."*

- Use it as an **idempotency key** (ideally scoped by `object.id`).
- **Never use it for authentication.** It is a content digest of the record,
  computed by Polytomic over data it is sending you — it proves nothing about the
  sender.
- The docs do **not** document its algorithm or length. `b7421c6c57bd49f7` is
  just an example; don't assume 16 hex characters, and don't try to recompute it.

**`object.records[].fields`** — *"contains each of the fields you selected to be
delivered."*

> **THE KEYS ARE USER-DEFINED.** `email` and `last_login` in the example are that
> customer's chosen fields, not a Polytomic schema. Your `fields` object has
> whatever keys *your* sync configuration selected.

Therefore:

- **Do not define a fixed typed model** over `fields`. Type it as
  `Record<string, unknown>` / `dict[str, Any]`.
- **Access defensively.** Any key may be absent; any value may be `null`.
- Validate the handful of keys you actually depend on, and tolerate the rest.

**`object.metadata`** — *"Any key-value pairs of metadata defined in the sync
configuration."* This comes from the **Advanced settings → Metadata** option,
whose default is `null`.

> So `metadata` may be **an object, `null`, or absent entirely**. Handle all
> three. The documented example shows `{ }`.

## Delivery Semantics

Several sync-level settings change what arrives, and they matter more than they
look:

- **Syncs are differential by default.** `records` normally holds only
  changes since the last payload. **"Always do a full sync" (default false)**
  re-delivers everything on every run.
- **The first run backfills the entire source.** *"The first time a Polytomic
  Model Sync runs, it will sync everything in the source."* **"Skip backfill on
  first sync" (default false)** turns that off. This is the single most common
  cause of an unexpectedly huge first batch.
- **Batch size is configurable** (default 100).

## Response Contract

Verbatim: *"On receipt of the payload, your API should return `200 OK`. Any 4xx or
5xx error will cause the sync to appear as a failure."*

- **No automatic retry policy and no retry schedule is documented.** Do not claim
  exponential backoff or a retry count — none is published.
- A non-2xx marks the **sync run** failed in Polytomic's sync history. Recovery
  is operational: fix the endpoint, then re-run or wait for the next schedule.
- Because failure is **sync-level**, **acknowledge with 200 immediately and
  process the batch asynchronously** — a slow downstream otherwise fails your
  customer's sync.
- **Still handle deliveries idempotently** (dedupe on `object.id` +
  `records[].hash`). Absent a documented retry policy you cannot assume
  at-most-once delivery either.

## Authentication, In One Line

**There is no signature.** The only authentication is a **static shared bearer
token** in `Authorization`, matching the connection Secret. See
[verification.md](verification.md).

## Full Event Reference

Polytomic documents webhooks on a single page:
[Webhooks — Destination](https://docs.polytomic.com/docs/webhooks-connections).
Every docs page is also retrievable as markdown by appending `.md`
(e.g. [webhooks-connections.md](https://docs.polytomic.com/docs/webhooks-connections.md)).
