# INGENIOUS.BUILD Webhooks Overview

## What Are INGENIOUS.BUILD Webhooks?

The Custom Accounting Integration in INGENIOUS.BUILD (construction project management) pushes
approved financial records out to a webhook URL you control. Middleware on your side (n8n, Retool,
Zapier, Jitterbit or a custom service) transforms the payload and calls your accounting system's
API. INGENIOUS.BUILD stays system-agnostic.

- One webhook URL per object type: Budgets, Budget Changes, Contracts, Contract Changes, Invoices.
  Fill in only the objects you sync.
- A webhook fires only when a user clicks **Sync to Accounting** on a record that meets your
  prerequisites (for invoices, typically internally approved).
- Webhooks only push data out. To load vendors, GL accounts, cost codes or projects into
  INGENIOUS.BUILD, use its Public API or CSV import.
- Requests are `POST` with a JSON body and are **not signed**. You authenticate them with an auth
  header you add to each webhook URL. See [setup.md](setup.md) and [verification.md](verification.md).

## Common Event Types

| `name` | `subject` | Triggered When | Common Use Cases |
|--------|-----------|----------------|------------------|
| `budget_exported_to_accounting` | `budget` | Sync to Accounting on a Budget | Create budget lines in the ERP |
| `budget_change_exported_to_accounting` | `budget_change` | Sync to Accounting on a Budget Change | Post a reallocation between cost codes |
| `contract_exported_to_accounting` | `contract` | Sync to Accounting on a Contract | Create a commitment / purchase order |
| `contract_change_exported_to_accounting` | `contract_change` | Sync to Accounting on a Contract Change | Amend a commitment |
| `invoice_exported_to_accounting` | `invoice` | Sync to Accounting on an Invoice | Create a vendor bill |

## Event Payload Structure

Every payload has the same top-level shape; dispatch on `name`:

```json
{
  "name": "invoice_exported_to_accounting",
  "subject": "invoice",
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "accounting_project_custom_id": "PROJ-001",
    "accounting_company_custom_id": "VEND-001",
    "invoice_number": "INV-123",
    "gross_value": "1000.00",
    "net_value": "950.00",
    "items": [{ "id": "...", "gross_value": "1000.00", "qty": 10, "accounting_cost_code_custom_id": "CC-001" }]
  }
}
```

`data` holds the record plus INGENIOUS-native IDs (`id`, `vendor_id`, `project_id`, ...) and
accounting identifiers (`accounting_project_id` / `_custom_id`, `accounting_company_id` /
`_custom_id`, `accounting_cost_code_id` / `_custom_id`, `accounting_entity_id` / `_custom_id`).
Set a `custom_id` on accounting objects in INGENIOUS.BUILD so these fields arrive self-contained.
Money values are strings.

## Full Event Reference

- [Custom Accounting Integration Setup Guide](https://help.ingenious.build/custom-accounting-integration-setup-guide-ingenious.build-help-center)
- [Webhook payloads](https://api.ingenious.build/page/webhook-payloads.md)
