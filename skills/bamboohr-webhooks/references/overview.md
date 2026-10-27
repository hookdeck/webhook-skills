# BambooHR Webhooks Overview

## What Are BambooHR Webhooks?

BambooHR sends an HTTP `POST` to a URL you specify when employee records change (and, for Event-Based webhooks, when the company changes). BambooHR offers two ways to create a webhook:

- **Global webhooks**: configured by an admin (or a custom access level with webhooks permission) in Settings > Webhooks. They monitor a predefined list of standard fields.
- **Permissioned webhooks**: created through the API. They can monitor any field the creating user can access, and stop working if that user's account is deactivated.

BambooHR only delivers to **HTTPS** URLs.

Each webhook also has a data structure:

- **Event-Based** (BambooHR's recommendation): one event per request with a `type`, chosen as "Event-Based" in Settings or by subscribing to `employee.*` / `company.*` events in the API.
- **Field-Based**: the older batched `employees` payload with configurable posted fields (the API's legacy `employee_with_fields.*` events, which BambooHR marks deprecated but still supports). A webhook can't mix the two, and an API webhook created without `events` defaults to Field-Based.

Both use the same `X-BambooHR-Signature` scheme and private key: BambooHR documents one signing scheme for all webhooks, and the Create Webhook response returns a `privateKey` "used to verify the authenticity of incoming webhook payloads via HMAC-SHA256" whichever events are chosen.

## Event-Based Events

| `type` | Triggered When | `data` |
|--------|----------------|--------|
| `employee.created` | An employee record is created | `companyId`, `employeeId` |
| `employee.updated` | A monitored field changes (at least one monitor field is required) | `companyId`, `employeeId`, `changedFields` |
| `employee.deleted` | An employee record is deleted | `companyId`, `employeeId` |
| `company.updated` | Company information or status changes | `companyId` |
| `company.deleted` | The company status becomes `DELETED` or `CANCELLED` | `companyId` |
| `company-integrations.updated` | Company integration settings change | `companyId` |

Creating an employee fires `employee.created` and then `employee.updated`. Simultaneous changes may be consolidated into one `employee.updated`, though custom and standard field changes can arrive as two events. `changedFields` holds API field aliases (as returned by List Monitor Fields). `employee.created`, `employee.deleted` and `company-integrations.updated` skip permission checks; `employee.updated` on an API-created webhook doesn't fire if the creator lacks access to the changed monitored fields.

```json
{
  "type": "employee.updated",
  "timestamp": "2026-01-31T18:42:00+0000",
  "data": { "companyId": "12345", "employeeId": "67890", "changedFields": ["firstName"] }
}
```

`timestamp` is ISO 8601 (when the event occurred). The Form Post encoding sends the same fields as `type=employee.updated`, `data[companyId]=12345`, `data[changedFields][0]=firstName`. BambooHR positions these as lightweight notifications: fetch current data from the API with the IDs.

## Field-Based Actions

Field-Based payloads have no `type`. Each employee entry has an `action`:

| Action | Triggered When | Notes |
|--------|----------------|-------|
| `Created` | An employee record is created | `changedFields` and `fields` are empty |
| `Updated` | A monitored field on an employee changes | `changedFields` lists the changed fields |
| `Deleted` | An employee record is deleted | `changedFields` and `fields` are empty |

## Field-Based Payload Structure

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
- [Event-Based Webhooks](https://documentation.bamboohr.com/docs/event-based-webhooks)
- [Webhook event reference](https://documentation.bamboohr.com/reference/employee-created-webhook)
- [Global Webhooks](https://documentation.bamboohr.com/docs/global-webhooks)
- [Permissioned Webhooks](https://documentation.bamboohr.com/docs/permissioned-webhooks)
