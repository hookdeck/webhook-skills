# Greenshades Webhooks Overview

## What Are Greenshades Webhooks?

Greenshades (greenshades.com) is a payroll, HR and tax platform. API clients subscribe to payroll and employee events per workspace through the webhook-subscription API (`POST /webhooks/subscriptions`, scope `GO.Api.WEBHOOK.write` or `full_access`). Each subscription has a `url`, an `hmacKey` (the HMAC-SHA256 signing key you choose) and a list of `subscribedEvents`.

Greenshades does not document a delivery, retry or timeout policy, the HTTP method used for deliveries, or the delivery body.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payRun.completed` | A pay run completes | Sync payroll totals, trigger accounting exports |
| `payRun.costReportingTransactions.completed` | Cost reporting transactions for a pay run complete | Post to a general ledger |
| `payRun.payRecord.voided` | A pay record is voided | Reverse downstream entries |
| `payRun.payRecords.completed` | Pay records for a pay run complete | Fetch pay records, send pay stubs |
| `paySchedule.updated` | A pay schedule changes | Refresh schedule data |
| `employee.added` | An employee is added | Provision accounts in other systems |
| `employee.updated` | An employee changes | Keep HR records in sync |
| `employee.directDeposit.updated` | Direct deposit settings change | Re-validate bank details |
| `employee.paySchedule.updated` | An employee's pay schedule assignment changes | Refresh assignments |
| `employee.earningCode.added` | An earning code is assigned to an employee | Sync compensation setup |
| `employee.earningCode.updated` | An employee's earning code changes | Sync compensation setup |
| `employee.earningCode.deleted` | An employee's earning code is removed | Sync compensation setup |

These 12 names are the `WebhookEvent` values of the create-subscription API.

## Event Payload Structure

The delivery body is not documented, so the field that carries the event name is unknown. The examples look for `eventName`, `event`, `type` or `name` and label that code illustrative. Send a test event or inspect a real delivery (Hookdeck's event view works well) and adjust `getEventName` / `get_event_name`.

Fetch full records from the Greenshades API using IDs found in the delivery rather than assuming the body is complete.

## Full Event Reference

See [Create a webhook event subscription](https://developer.greenshades.com/reference/createwebhooksubscription) and [Webhooks security](https://developer.greenshades.com/docs/security-1).
