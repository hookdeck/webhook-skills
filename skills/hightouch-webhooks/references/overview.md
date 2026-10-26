# Hightouch Webhooks Overview

## What Are Hightouch Webhooks?

Hightouch is a reverse ETL platform: it queries your warehouse, watches the results for
**added**, **changed** and **removed** rows, and pushes them to destinations. The **HTTP Request
destination** sends those changes to any URL as an HTTP request, so your endpoint acts as a
webhook receiver. (The older Webhook destination is deprecated.)

You configure everything in the Hightouch app:

- **Destination**: a base URL, optional headers (tick **Secret** to hide and encrypt a value) and
  an optional custom certificate.
- **Sync**: which triggers fire a request (rows added, changed, removed), and for each trigger an
  endpoint (static or Liquid-templated), HTTP method, payload and batching.

## Triggers

Hightouch has no event-type strings. A sync has up to three triggers, each with its **own method,
URL and payload**, and nothing in the request says which trigger fired. The examples map the
method back to a trigger name; this is a convention, not something Hightouch sends.

| Trigger | Typical method | Example handler name | Typical use |
|---------|----------------|----------------------|-------------|
| Rows added | `POST` | `row_added` | Create the record |
| Rows changed | `PUT` or `PATCH` | `row_changed` | Update the record |
| Rows removed | `DELETE` | `row_removed` | Delete the record |

Supported methods are `GET`, `POST`, `PUT`, `PATCH` and `DELETE`. A `GET` or an intentionally
empty payload has no body, so handlers must accept an empty body. If you'd rather not depend on
the method, add a field such as `"trigger": "row_added"` to each trigger's Liquid payload.

## Payload Structure

There is no fixed schema. The body is what you write:

- **Formats:** JSON, XML, URL-encoded form, or empty. The examples parse JSON.
- **Liquid templates** inject model columns: `{{row.email}}`. Quote strings inside JSON
  (`"email": "{{row.email}}"`).
- **Single row:** `{"id": "cus_123", "email": "alice@example.com"}`
- **Batching** (default batch size 100): the template loops over `rows`, so the body is typically
  an array, or an object wrapping one:

```json
{ "users": [ { "id": "cus_123", "email": "alice@example.com" }, { "id": "cus_456", "email": "bob@example.com" } ] }
```

## Delivery Notes

- Rate limits, concurrency limits and error handling are configured per sync in Hightouch.
- Syncs can be retried (see Hightouch's "Sync retries" docs), so make handlers idempotent (see
  webhook-handler-patterns).
- Hightouch publishes its outbound IP addresses in its networking docs, but the secret header is
  the credential this skill checks.

## Full Reference

- [Hightouch HTTP Request destination](https://hightouch.com/docs/destinations/http-request)
