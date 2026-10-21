# HiBob (Bob) Webhooks Overview

## What Are Bob Webhooks?

Bob (HiBob) is an HR platform. Bob webhooks let you subscribe to system events and receive an HTTP `POST` with a JSON body whenever one occurs, for example when an employee is created. Webhooks v2 (open since January 21, 2025) sends reduced payloads, delivers events in order, and retries failures for up to 3 days. The payload contains metadata and IDs; use Bob's API to fetch the full data.

## Common Event Types

The event name is the `type` field in the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `employee.created` | An employee is created | Provision accounts |
| `employee.updated` | An employee field is updated | Sync profile data |
| `employee.deleted` | An employee is deleted | Remove records |
| `employee.joined` | Employee granted access, once the lifecycle entry is effective | Onboarding |
| `employee.left` | Employee terminated or on Garden leave, once effective | Offboarding |
| `employee.activated` / `employee.inactivated` | Access enabled / employee on leave or terminated | Access control |
| `employee.temporaryLeave` | Employee set to temporary leave | Leave workflows |
| `employee.access.revoked.immediately` | Termination with "Revoke access immediately" | Immediate deprovisioning |
| `table.entry.created` / `table.entry.updated` | Entry added/updated in an employee table | Work, salary history sync |
| `timeoff.request.requested` | A time off request is submitted | Notify approvers |
| `timeoff.request.approved` | A time off request is approved | Calendar sync |
| `timeoff.request.declined` | A request is declined | Notify employee |
| `timeoff.request.cancelled` | A request is cancelled | Calendar sync |
| `timeoff.request.deleted` | A request is deleted | Calendar sync |
| `timeoff.request.updated` | A request is updated | Calendar sync |
| `timeoff.request.imported` | A request is created from import | Bulk sync |
| `timeoff.request.setEndDate` | An end date is set on a request | Calendar sync |
| `todo.assign` / `todo.changedStatus` | A task is assigned / changes status | Task workflows |
| `documents.eSign.completed` | A document eSign completes | Document archiving |
| `workforcePlanning.position.created` / `.updated` | Position created/updated | Headcount planning |
| `workforcePlanning.positionOpening.created` / `.updated` / `.deleted` | Position opening changes | Recruiting |
| `workforcePlanning.positionBudget.created` / `.updated` | Position budget changes | Budgeting |

Deleting an employee table entry does not trigger an event. Note there is no `timeoff.request.created`; submission is `timeoff.request.requested`.

## Event Payload Structure

| Field | Description |
|-------|-------------|
| `companyId` | The company ID |
| `version` | Webhook version (`v2`) |
| `type` | Event type, for example `employee.created` |
| `triggeredBy` | Backend ID of the employee who triggered it, or `system` |
| `triggeredAt` | When the event occurred |
| `data` | Event-specific data (entity IDs such as `employeeId`, changed field IDs) |

## Delivery and Retries

Respond `200` (within 10 seconds). On errors or timeouts Bob retries with exponential backoff for up to 3 days, emailing Bob Admins after 1, 24, and 48 hours. After 72 hours of failure the webhook becomes `Inactive` and must be reactivated in Bob. Events are kept for at least two working days.

## Full Event Reference

See [Getting started with Webhooks](https://apidocs.hibob.com/reference/getting-started-webhooks) and the Webhooks section of each module in the Bob API reference.
