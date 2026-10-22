# Check Webhooks Overview

## What Are Check Webhooks?

[Check](https://www.checkhq.com) is a payroll API. It sends an HTTP POST to your endpoint when something changes asynchronously: payroll lifecycle moves, payment processing, bank account validation, employee onboarding. You register an endpoint as a Webhook Config, and every active config receives every webhook.

Your endpoint must accept POST and return a 2XX within 5 seconds. Check recommends returning 2XX even for events you ignore, and fetching the current object from the API instead of trusting the payload, which may be stale.

## Payload Structure

```json
{
  "event": "status_change",
  "data": { "id": "pyt_vIFHhvyGN47ej1upyIT8", "status": "paid", "parent_type": "payroll" }
}
```

- `event` - what happened (`created`, `updated`, `deleted`, `status_change`)
- `data` - the serialized object, following the config's `api_version` when set, else the account default
- The resource type is sent in the `Check-Topic` header, not the body
- The ping test webhook is the only one without the wrapper: `{"message": "Test webhook"}`

## Headers

| Header | Description |
|--------|-------------|
| `Check-Signature` | Hex HMAC-SHA256 of the raw body |
| `Check-Topic` | Topic, e.g. `payroll`, `payment`, `employee` |
| `Check-WebhookEvent-ID` | Unique ID for idempotency |
| `Check-Live` | `true` for live, `false` for sandbox |

Deprecated `X-...` equivalents (such as `X-Live`) are also sent for now.

## Common Event Types

| Topic | Event | Triggered When | Common Use Cases |
|-------|-------|----------------|------------------|
| `payroll` | `created` | A payroll is created | Track new payrolls |
| `payroll` | `updated` | A payroll is updated (API 2025-01-01+) | Sync status and totals |
| `payroll` | `status_change` | Payroll status changes (deprecated in API 2025-01-01) | Legacy status tracking |
| `payment` | `status_change` | Payment becomes processing, paid, failed or refunded | Funding failures, reconciliation |
| `employee` | `created` | An employee is created | Sync employee records |
| `employee` | `updated` | An employee is updated, including termination | Keep profile and SSN validation in sync |
| `bank_account` | `created`, `updated`, `deleted` | Bank account changes | Validation results |
| `company` | `created`, `updated` | Company changes | Onboarding state |
| `contractor` | `created`, `updated`, `deleted` | Contractor changes | Sync contractors |

Other topics include `workplace`, `benefit`, `company_benefit`, `post_tax_deduction`, `earning_code`, `pay_schedule`, `company_filing`, `tax_package`, `net_pay_split`, `fulfillment`, `notification` and `correction`.

## Retries and Deactivation

- Live: retries for up to four days with exponential backoff, from 10 seconds up to 6 hours
- Sandbox: 10 attempts in total
- A live config with no 2XX for 7 days (sandbox: 24 hours) is deactivated; reactivate it with the update webhook config endpoint

## Full Event Reference

See [Webhook event types](https://docs.checkhq.com/docs/webhook-event-types) and [Working with webhooks](https://docs.checkhq.com/docs/working-with-webhooks).
