# Setting Up BambooHR Webhooks

## Prerequisites

- A BambooHR account
- An **HTTPS** endpoint (BambooHR does not deliver to plain HTTP). For local work, use `npx hookdeck-cli listen 3000 bamboohr --path /webhooks/bamboohr` and the HTTPS URL it prints.

## Option 1: Global Webhook (Settings)

1. As an admin (or a custom access level user with webhooks permission), open **Account Settings** and click **Webhooks**.
2. Add a webhook and enter your endpoint URL.
3. Choose the fields to **monitor** from the predefined list (a change to any of them triggers the webhook).
4. Choose which fields are **posted** in the payload, and optionally rename them.
5. Choose the data structure: **Event-Based** (recommended; `employee.created` / `employee.updated` / `employee.deleted`, where `employee.updated` needs at least one monitored field) or **Field-Based** (the batched `employees` payload with posted fields).
6. Choose the format: JSON (recommended) or HTML form.
7. Save, then copy the generated **private key**. It is your `BAMBOOHR_WEBHOOK_SECRET`.

Custom fields can be monitored; fields in custom tables are not supported.

## Option 2: Permissioned Webhook (API)

Call the **Create Webhook** endpoint (`POST /api/v1/webhooks`) with an API key or OAuth token. The webhook can only see fields that user's access level allows.

For an **Event-Based** webhook, list the events (`format` is required; `monitorFields` is required with `employee.updated`):

```json
{
  "name": "My event webhook",
  "url": "https://example.com/webhooks/bamboohr",
  "format": "json",
  "events": ["employee.created", "employee.updated", "employee.deleted"],
  "monitorFields": ["firstName", "jobTitle"]
}
```

Other events are `company.updated`, `company.deleted` and `company-integrations.updated`. You can't mix these with the legacy `employee_with_fields.*` events on one webhook. (BambooHR's guide page writes `employee.update` in one sentence; the API's event list uses `employee.updated`.)

Omitting `events` creates a **Field-Based** webhook (legacy `employee_with_fields.*` events) that posts the fields you choose:

```json
{
  "name": "My new webhook",
  "monitorFields": ["employeeNumber", "firstName"],
  "postFields": {
    "employeeNumber": "Employee #",
    "firstName": "First name",
    "lastName": "Last name",
    "17": "Job title"
  },
  "url": "https://example.com/webhooks/bamboohr",
  "format": "json",
  "frequency": { "minute": 30 },
  "limit": { "times": 5, "seconds": 1200 }
}
```

The response includes `privateKey`. **This is the only time it is returned**: save it. To get a new key, create a new webhook and delete the old one. Use the **List monitor fields** and **List Fields** endpoints to find field IDs and aliases. Permissioned webhooks stop working if their creator's account is deactivated.

## Configure Your Application

```bash
BAMBOOHR_WEBHOOK_SECRET=<private key>
```

The key is used as a plain UTF-8 string (not hex- or base64-decoded).

## Testing

Make a change to a monitored field (or create or delete an employee) and watch the request arrive in the Hookdeck CLI web UI. BambooHR retries 5xx responses, so return `401` for a bad signature rather than `500`.
