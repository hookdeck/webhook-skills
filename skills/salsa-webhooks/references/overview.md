# Salsa Webhooks Overview

## What Are Salsa Webhooks?

[Salsa](https://docs.salsa.dev) is an embedded payroll API. It uses webhooks to tell you about changes in your
account: employers and workers being created or updated, onboarding status changes, payroll runs needing
input or being confirmed, workers being paid, and documents being uploaded. You register a **webhook
endpoint** with `POST /webhook-endpoints`, and Salsa sends each event to its `endpointUrl` as a JSON `POST`
signed with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers.

Events come in two categories, shown in `attributes.category`:

- **`LIFECYCLE`**: changes to employers, workers, payroll runs, payments and documents
- **`NOTIFICATION`**: reminders and notices, such as `Notification.workerPayday`

## Common Event Types

More than 70 event types are documented in Salsa's
[Webhook Events reference](https://docs.salsa.dev/reference/webhookevent), and the list may not be exhaustive.
The name is `data.type` in the JSON body. The examples handle these:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Employer.created` | An employer is created | Store the employer ID, start onboarding |
| `Employer.updated` | An employer is updated | Keep your records in sync |
| `Employer.onboardingStatus` | An employer's onboarding status changes | Unlock features when onboarding completes |
| `Worker.created` | A worker is created | Store the worker |
| `Worker.updated` | A worker is updated | Keep your records in sync |
| `Worker.onboardingStatus` | A worker's onboarding status changes | Prompt the worker to finish onboarding |
| `PayrollRun.awaitingInput` | A payroll run needs compensation data | Send all compensation data you have for the listed workers |
| `PayrollRun.statusChanged` | A payroll run's status changes | Track run progress |
| `Notification.workerPayday` | The day a worker is paid (sent at 1pm or 11pm UTC) | Notify the worker |
| `Notification.employerPayrollRunConfirmation` | A payroll run is confirmed | Notify the employer |
| `Document.uploaded` | A document is uploaded | Fetch the new document |
| `AccountingConfiguration.created` | An accounting configuration is created | Sync accounting settings |
| `AccountingConfiguration.updated` | An accounting configuration is updated | Sync accounting settings |

Other documented events the examples log as unhandled include:

- **Employer:** `Employer.deleted`, `Employer.awaitingRiskInsights`, `Employer.Address.created`,
  `Employer.Address.updated`, `Employer.Address.deleted`, `Employer.AccountStanding.statusChanged`,
  `Employer.AccountStanding.requirementsChanged`, `Employer.PayWorkersReadiness.statusChanged`,
  `Employer.PayWorkersReadiness.requirementsChanged`, `Employer.TaxesSetup.updated`,
  `Employer.PayType.created`, `Employer.PayType.updated`, `Employer.PayType.deleted`,
  `Employer.TimeOffType.created`, `Employer.WorkerPayGroup.created`
- **Payroll history:** `Employer.PayrollHistory.required`, `Employer.PayrollHistory.provided`,
  `Employer.PayrollHistory.importCompleted`, `Employer.PayrollHistory.statusChanged`
- **Bank accounts and signatories:** `EmployerBankAccount.created`, `EmployerBankAccount.updated`,
  `EmployerBankAccount.deleted`, `EmployerBankAccount.Verification.statusChanged`, `EmployerSignatory.created`,
  `WorkerBankAccount.created`, `WorkerBankAccount.updated`, `WorkerBankAccount.deleted`
- **Workers:** `Worker.deleted`, `Worker.PaymentsReadiness.statusChanged`, `Worker.TaxesSetup.updated`,
  `Worker.Termination.statusChanged`, `WorkerContract.created`, `WorkerPayDistribution.updated`,
  `WorkerPaymentAdjustment.created`, `WorkerPersonalInformation.created`, `WorkerPersonalInformation.updated`
- **Payroll runs and payments:** `PayrollRun.deleted`, `PayrollRun.EmployerFunding.statusChanged`,
  `PayrollRun.WorkerDisbursement.MoneyMovementTransaction.statusChanged`,
  `Notification.Payment.employerFundingFailed`, `Notification.Payment.workerDisbursementFailed`,
  `Notification.Payment.workerDisbursementScheduled`
- **Other notifications:** `Notification.employerPaydayReminder`, `Notification.employerPayrollOperation`,
  `Notification.employerPayrollHistoryRequired`, `Notification.Employer.taxRateUpdatedFromAgency`
- **Documents:** `Document.deleted`

## Event Payload Structure

Every delivery has the same envelope. `data.type` is the event name and `data.attributes` is the event object,
whose fields depend on the event:

```json
{
  "data": {
    "type": "Employer.created",
    "attributes": {
      "employerId": "er_123",
      "externalId": "abc"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `data.type` | Event name, such as `Employer.created` |
| `data.attributes` | The event object, with the entity IDs involved |
| `data.attributes.category` | `LIFECYCLE` or `NOTIFICATION`, per each event's reference schema |

Salsa publishes this shape and the per-event schemas in each event's reference page, but no full body examples.
Check the reference page of an event before relying on a field other than the IDs above.

The delivery headers carry the message ID and signature:

| Header | Contents |
|--------|----------|
| `webhook-id` | Unique message identifier, the same when an event is resent |
| `webhook-timestamp` | Unix seconds of the delivery attempt |
| `webhook-signature` | Space-separated `v1,<base64>` signatures |

## Delivery Behavior

| Property | Value |
|----------|-------|
| Retry schedule | Immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours |
| Timeout | Not stated |
| Disabled endpoints | No delivery attempts |
| Duplicates | A resent event keeps its `webhook-id`, so dedupe on it |
| Sandbox | Behaves like production, except `Notification.workerPayday` isn't sent there for Direct Deposit workers |

Return `2xx` quickly and process asynchronously. For example, an event that fails three times and then
succeeds is delivered roughly 35 minutes and 5 seconds after the first attempt.

## Full Event Reference

For the schema of every event, see Salsa's [Webhook Events reference](https://docs.salsa.dev/reference/webhookevent)
and the [Consume webhooks guide](https://docs.salsa.dev/docs/consuming-webhooks).
