# BambooHR Webhooks Overview

## What Are BambooHR Webhooks?

BambooHR sends an HTTP `POST` to a URL you specify when monitored employee fields change. BambooHR offers two types:

- **Global webhooks**: configured by an admin (or a custom access level with webhooks permission) in Settings > Webhooks. They monitor a predefined list of standard fields.
- **Permissioned webhooks**: created through the API. They can monitor any field the creating user can access, and stop working if that user's account is deactivated.

BambooHR only delivers to **HTTPS** URLs.

## Actions

BambooHR has no event-type header or field named `type`. Each employee entry has an `action`:

| Action | Triggered When | Notes |
|--------|----------------|-------|
| `Created` | An employee record is created | `changedFields` and `fields` are empty |
| `Updated` | A monitored field on an employee changes | `changedFields` lists the changed fields |
| `Deleted` | An employee record is deleted | `changedFields` and `fields` are empty |

## Payload Structure

JSON (recommended):

```json
{
  "employees": [
    {
      "id": "40351",
      "action": "Updated",
      "timestamp": "2025-08-18T21:38:50Z",
      "changedFields": ["Employee #"],
      "fields": { "Employee #": "9", "First Name": "Robert" }
    },
    { "id": "40546", "action": "Deleted", "timestamp": "2025-08-19T21:38:50Z", "changedFields": [], "fields": {} }
  ]
}
```

- `id`: the BambooHR employee ID.
- `timestamp`: ISO 8601 time the employee change occurred (not the signing timestamp).
- `changedFields`: names of the fields that triggered the notification (a field ID if the field isn't in the posted data).
- `fields`: the data for the fields you chose to post. Field names are configurable. Permissioned webhooks wrap each value, e.g. `{ "value": "358304" }`.

Form-encoded payloads use bracketed keys such as `employees[40351][action]=Updated` and `employees[40351][changedFields][0]=Employee+%23`.

Employees are **batched**: several can arrive in one `POST`, so always loop over `employees`. Ignore fields you don't recognize; BambooHR may add context later.

## Headers

| Header | Description |
|--------|-------------|
| `X-BambooHR-Signature` | Hex HMAC-SHA256 of the raw body followed by the timestamp header value |
| `X-BambooHR-Timestamp` | When the request was sent |

## Retries

Up to 5 retries on network errors or 5xx responses (not 4xx), at about 0, 5, 10, 20 and 40 minutes, each with 0-30 seconds of random jitter. No request timeout is documented.

## Full Reference

- [Webhooks](https://documentation.bamboohr.com/docs/webhooks)
- [Global Webhooks](https://documentation.bamboohr.com/docs/global-webhooks)
- [Permissioned Webhooks](https://documentation.bamboohr.com/docs/permissioned-webhooks)
