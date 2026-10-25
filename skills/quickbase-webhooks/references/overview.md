# Quickbase Webhooks Overview

## What Are Quickbase Webhooks?

A Quickbase webhook is an HTTP request that Quickbase sends to a URL you choose when a record in a
table is added, modified or deleted. It is configured per table. You define the **When** (trigger
and optional filters) and the **Then** (the request itself). Quickbase does not sign the request
and does not add an event name; everything in the request except the trigger timing comes from
what you typed.

## Triggers

| Trigger (When) | API code (`WorkflowWhen`) | Fires When |
|----------------|---------------------------|------------|
| Record added | `a` (default) | A record is created in the table |
| Record modified | `m` | A record is changed |
| Record deleted | `d` | A record is deleted |

Any combination can be selected (the API accepts e.g. `mda`). Optional filters limit firing to
changes in selected fields, or to records matching field criteria after the change.

## What the Request Looks Like

| Part | Options |
|------|---------|
| Endpoint URL | Your URL; the API requires it to begin with `https://`. May contain field references and markers |
| HTTP method | `POST` (default), `GET`, `PUT`, `PATCH` or `DELETE` |
| Message format | `XML`, `JSON` or `RAW` |
| Message header | Up to 10 name/value pairs, e.g. `Content-Type: application/json` |
| Message body | A template you write, with field references and markers. UTF-8 encoded |

Because the body is your own template, there is no fixed payload schema. Add a literal such as
`"event": "record_added"` to it if your handler needs to tell triggers apart.

## Illustrative Payload

Not a Quickbase schema: the field names below are examples of what you might write in the template.

```json
{ "event": "record_modified", "record_id": 42, "table": "Projects" }
```

The examples in this skill dispatch on `event` with the values `record_added`, `record_modified`
and `record_deleted`, and acknowledge anything else (including XML, RAW text or an empty body).

## Authentication

No signature. Add a secret header in the Message header list and compare it on your endpoint. See
[verification.md](verification.md).

## Full Reference

- [Configure a webhook](https://help.quickbase.com/docs/configure-a-webhook)
- [API_Webhooks_Create](https://help.quickbase.com/docs/api-webhooks-create)
