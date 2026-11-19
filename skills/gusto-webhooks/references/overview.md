# Gusto Webhooks Overview

## What Gusto Sends

Gusto Embedded Payroll sends a `POST` with a JSON event when something changes for a company connected to your application. Many API calls are asynchronous: submitting a payroll, for example, finishes later, and `payroll.paid` is sent "when payroll credits have been generated and payments will be made".

```json
{
  "uuid": "f7397a24-57ad-4fae-b011-d258e8232900",
  "event_type": "company.provisioned",
  "resource_type": "Company",
  "resource_uuid": "5df911a0-e8e9-412d-8aaf-a46ad193dd96",
  "entity_type": "Company",
  "entity_uuid": "5df911a0-e8e9-412d-8aaf-a46ad193dd96",
  "timestamp": 1671058841
}
```

| Field | Meaning |
|---|---|
| `uuid` | Event ID: dedupe on it |
| `event_type` | `<entity>.<action>` |
| `resource_type` / `resource_uuid` | Always the `Company` |
| `entity_type` / `entity_uuid` | The resource whose state changed |
| `timestamp` | Unix seconds |

A single API request can generate several events. The [Events API](https://docs.gusto.com/embedded-payroll/reference/get-events) lists all events whatever your subscriptions, which is useful for reconciliation.

## Subscription Types and Events

From [Webhook Events](https://docs.gusto.com/embedded-payroll/docs/webhook-events):

| Subscription type | Events |
|---|---|
| BankAccount | `created`, `updated`, `deleted` |
| Company | `provisioned`, `deprovisioned`, `partner_authorized`, `migrated`, `updated`, `onboarded`, `approved`, `needs_approval`, `marked_as_high_risk_business`, `marked_as_marijuana_business`, `suspended`, `suspended_effective`, `unsuspended`, `payroll_transfer_completed` |
| CompanyBenefit | `created`, `updated`, `deleted` |
| Contractor | `created`, `updated`, `onboarded`, `deactivated`, `deactivation_effective`, `deactivation_cancelled`, `reactivated`, `reactivation_effective`, `reactivation_cancelled`, `deleted` |
| ContractorPayment | `created`, `cancelled` |
| ContractorPaymentGroup | `created`, `cancelled` |
| Document | `created`, `updated`, `signed` |
| Employee | `created`, `updated`, `onboarded`, `marked_for_self_onboarding`, `terminated`, `termination_effective`, `termination_cancelled`, `rehired`, `rehire_effective`, `rehire_cancelled`, `deleted`, `invited_to_partner_portal` |
| HomeAddress, WorkAddress | `created`, `updated`, `deleted` |
| EmployeeBenefit, EmployeeJobCompensation | `created`, `updated`, `deleted` |
| ExternalPayroll | `created`, `updated`, `deleted` |
| FastAchConfig | `activated`, `deactivated` |
| Form | `created`, `updated`, `signed` |
| GeneratedDocument | `generated`, `failed` |
| Location | `created`, `updated` |
| Notifications | `created`, `resolved` |
| Payroll | `created`, `updated`, `deleted`, `calculated`, `submitted`, `processed`, `paid`, `reversed`, `partially_reversed`, `cancelled`, `processing_failed` |
| PaySchedule | `created`, `updated` |
| Signatory | `created`, `updated`, `deleted`, `marked_for_invite` |
| TimeOffRequest | `created`, `updated`, `deleted` |

`company.provisioned` means an OAuth connection now exists between the company and your app. It's always sent, even without a Company subscription.

## Delivery and Retries

| Topic | Behaviour |
|---|---|
| Acknowledge | A `2xx` within 10 seconds |
| Retries | Up to 16 times over 3 days, with exponential backoff |
| Order | Gusto's legacy doc says webhooks aren't guaranteed to arrive in order: compare `timestamp` before overwriting newer data |
| Activity | Each subscription's page in the Developer Portal shows recent events |
