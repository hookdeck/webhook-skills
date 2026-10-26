# Vern Webhooks Overview

## What Are Vern Webhooks?

[Vern](https://vern.so) is an AI data-onboarding (spreadsheet import) platform. When a workbook
is exported with the **Webhook** option, Vern POSTs the cleaned rows to an endpoint you control.
Set the endpoint up once and every future export streams to your app. Delivery is powered by
[Svix](https://www.svix.com), which signs each request following Standard Webhooks with the
`svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body, one batch per delivery |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`; non-2xx is retried by Svix on a backoff schedule |
| Delivery | At-least-once; `svix-id` is stable across retries |
| Challenge | None |

## Events

| Event | When it fires |
|-------|---------------|
| `workbook.production.export` | A production export from a workbook |
| `workbook.preview.export` | A staging/preview export from a workbook |

These are the two documented events (the list may not be exhaustive). Subscribe each endpoint to
one or both. Vern recommends separate endpoints for preview and production so test data never
reaches your live database.

**The body carries no event name**, and Vern documents no header that carries it. Both events
deliver the same payload, and `version` is the export mode, not the event. The only way to tell
preview from production is which endpoint received the delivery.

## Payload Formats

The `version` field says which shape you received: `1.0` is flat, `2.0` is nested. The export
dialog's flat/nested choice decides it.

### Flat (`version` 1.0)

```json
{
  "version": "1.0",
  "workbook_id": "wb_abc123",
  "external_id": "your-external-id",
  "batch": { "id": "batch_a1b2c3d4e5f6", "index": 0, "total": 3, "size": 150, "timestamp": "2026-05-12T12:00:00.000Z" },
  "sheets": [
    {
      "id": "sheet_001",
      "name": "Contacts",
      "row_count": 150,
      "start_row_index": 0,
      "end_row_index": 149,
      "data": [
        { "First Name": "Jane", "Last Name": "Doe", "Email": "jane@example.com", "errors": [], "row_index": 0 }
      ]
    }
  ]
}
```

Each sheet is its own array of row objects: your column keys, an `errors` array and a
`row_index`. `external_id` is the value you passed when creating the company (or `null`).
`start_row_index` / `end_row_index` (0-based, inclusive) say which rows of the sheet this batch
holds.

### Nested (`version` 2.0)

```json
{
  "version": "2.0",
  "workbook_id": "wb_abc123",
  "company_name": "Acme Corp",
  "external_id": "your-external-id",
  "export_mode": "nested",
  "batch": { "id": "batch_a1b2c3d4e5f6", "index": 0, "total": 2, "size": 50, "timestamp": "2026-05-12T12:00:00.000Z" },
  "root_sheets": ["Departments"],
  "data": {
    "Departments": [
      {
        "Department Name": "Engineering",
        "errors": [],
        "row_index": 0,
        "children": { "Employees": [ { "Name": "Jane Doe", "errors": [], "row_index": 0, "children": {} } ] }
      }
    ]
  }
}
```

Child sheets are nested under their parents using link rules. `data` is keyed by root sheet name,
and every record has a `children` object keyed by child sheet name. Circular link rules are
handled by treating back-edges as references, so there is no infinite recursion.

## Batching

Large exports split across batches to stay within payload limits. Each delivery is one batch.

| Field | Description |
|-------|-------------|
| `batch.id` | Shared across all batches of the same export |
| `batch.index` | 0-based index of this batch |
| `batch.total` | Number of batches |
| `batch.size` | Records in this batch |
| `batch.timestamp` | ISO 8601 creation time |

- **Flat (1.0)** batches by size: about 256 KB target, 512 KB ceiling. A large sheet splits
  across batches using `start_row_index` / `end_row_index`.
- **Nested (2.0)** batches by root record count: up to 50 roots per batch. A root and all its
  descendants always arrive together.

To reassemble: group by `batch.id`, order by `batch.index` (batches can arrive in any order),
and treat `batch.index === batch.total - 1` as the last one. For flat, concatenate each sheet's
`data` arrays in index order. For nested, concatenate each root sheet's `data` arrays.

## Delivery Notes

- **Deduplicate on `svix-id`.** Retries can deliver the same batch twice.
- Return `200` quickly and do heavy work asynchronously. Keep the raw payload until you have
  fully processed it.
- Match `external_id` back to your customer record.
- Failed deliveries are visible in the Svix portal, where you can inspect the exact payload and
  replay them. A replay reuses the original message.

## Full Reference

See Vern's [webhook documentation](https://docs.vern.so/help-center/send/webhooks).
