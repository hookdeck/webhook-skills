# Ardoq Webhooks Overview

## What Are Ardoq Webhooks?

Ardoq (ardoq.com) is an enterprise-architecture platform. Webhooks register custom callbacks that Ardoq calls with an HTTP `POST` whenever something changes. They are organization-wide:

- Ardoq enables webhooks per organization, on request.
- Only Ardoq admins can create them.
- A webhook's URL receives data for **every change across the organization**. It cannot be limited to specific workspaces, and payloads are not filtered by permissions, so the endpoint receives all change data, including confidential fields.

## Signed vs Unsigned Webhooks

Signing is optional in Ardoq but recommended, and it changes what is delivered:

| | Signed | Unsigned |
|---|--------|----------|
| Signature headers | `X-Ardoq-Signature-256`, `X-Ardoq-Timestamp` | None |
| Events | `component`, `reference`, `tag` only | Broader set, including field, report, dashboard and survey changes |
| HTTPS | Required, certificate verified | Not required, certificate not verified |

This skill covers signed webhooks. Adding a signing secret to an existing webhook is one-way: to remove signing, delete the webhook and create an unsigned one.

## Resource Types (signed webhooks)

| `resource-type` | Triggered When | Common Use Cases |
|-----------------|----------------|------------------|
| `component` | A component is changed | Sync architecture inventory into a CMDB or catalog |
| `reference` | A reference between components is changed | Keep dependency maps in sync |
| `tag` | A tag changes, such as adding or removing one on a component | Re-classify components, trigger governance workflows |

The `event-type` field says what happened. Ardoq's documentation shows `create` (in the tag sample) and does not list the other values, so handle unknown values defensively. **Webhooks do not support deletion events.**

## Event Payload Structure

```json
{
  "resource-type": "tag",
  "resource-id": "cf73fa1e257fdb6a576540e9",
  "event-type": "create",
  "organization": "a8574eb78e6293348cae2d0f",
  "organization-label": "usertesting",
  "data": {
    "name": "Test-tag",
    "components": ["e0a1be808bc264be4ed3fd2c"],
    "references": [],
    "_id": "cf73fa1e257fdb6a576540e9",
    "_version": 1,
    "ardoq": { "entity-type": "tag" }
  }
}
```

| Field | Meaning |
|-------|---------|
| `resource-type` | `component`, `reference` or `tag` on signed webhooks |
| `resource-id` | ID of the changed resource |
| `event-type` | What happened to it (e.g. `create`) |
| `organization` / `organization-label` | The Ardoq organization ID and label |
| `data` | The resource itself. A tag's `data` includes `name`, `components` and `references` (trimmed above; the docs sample also has timestamps and user fields) |

## Delivery

- Method: `POST`, JSON body.
- No retry or timeout policy is documented, and there is no delivery ID header. Acknowledge quickly and process asynchronously; build your own idempotency key (for example `resource-id` + `event-type` + `data._version`).

## Full Event Reference

See [Setting up Webhooks in Ardoq](https://help.ardoq.com/en/articles/44099-setting-up-webhooks-in-ardoq).
