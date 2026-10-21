# Microsoft Dynamics 365 (Dataverse) Webhooks Overview

## What Are Dynamics 365 Webhooks?

Dynamics 365 (Dataverse) can send server events to an external HTTPS endpoint.
A webhook is a **service endpoint** (the `serviceendpoint` table, `contract`
value `8`) with one or more **steps** attached. Each step names a message (such
as `Create`), a table (such as `contact`), a pipeline stage and an execution
mode. When the step fires, Dataverse POSTs the execution context as JSON.

Webhooks can also be invoked from a plug-in or custom workflow activity, using
the endpoint's `ServiceEndpointId`, without registering a step.

Compared with Azure Service Bus integration, webhooks support synchronous and
asynchronous steps, but they only scale as far as your service can. There's no
queue in between.

## Common Event Types

The event is the `MessageName` field of the body (also sent in the
`x-ms-dynamics-request-name` header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Create` | A row is created in the registered table | Sync new contacts, leads or accounts to another system |
| `Update` | A row is updated, optionally only when the step's filtering attributes change | Keep a CRM mirror current, notify on status changes |
| `Delete` | A row is deleted | Remove or archive the record elsewhere |

Other messages can be registered too. This skill's handlers cover the three
above and acknowledge anything else with `200`.

## Request Headers

| Header | Value |
|--------|-------|
| Your HttpHeader key(s), e.g. `X-Webhook-Secret` | The credential you registered |
| `x-ms-dynamics-organization` | Domain name of the environment sending the request |
| `x-ms-dynamics-entity-name` | Logical name of the table in the context |
| `x-ms-dynamics-request-name` | Name of the event the step was registered for |
| `x-ms-correlation-request-id` | Tracking ID, also used for infinite-loop prevention |
| `x-ms-dynamics-msg-size-exceeded` | Sent only when the payload is over 256 KB |

## Event Payload Structure

The body is the JSON form of a
[`RemoteExecutionContext`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.remoteexecutioncontext).

| Field | Meaning |
|-------|---------|
| `MessageName` | The event: `Create`, `Update`, `Delete` |
| `PrimaryEntityName` | Logical name of the table, e.g. `contact` |
| `PrimaryEntityId` | GUID of the row |
| `InputParameters` | Array of `{key, value}`. `Target` holds the entity with its `Attributes` |
| `PreEntityImages` / `PostEntityImages` | Row snapshots, if you registered images |
| `Stage` | Pipeline stage number (`40` is PostOperation) |
| `Mode` | Execution mode (`1` is asynchronous in the docs' example) |
| `OperationId`, `CorrelationId` | IDs for the operation. `OperationId` + step id makes a dedupe key |
| `OwningExtension` | Reference to the registered step (`sdkmessageprocessingstep`) |
| `OrganizationName`, `OrganizationId`, `UserId`, `InitiatingUserId`, `BusinessUnitId` | Who and where |
| `ParentContext` | The parent operation's context, when there is one |

`Attributes` inside an entity are also `{key, value}` arrays. Lookup values are
`EntityReference` objects (`Id`, `LogicalName`), and dates use the
`/Date(milliseconds)/` form.

When the whole HTTP payload exceeds 256 KB, `ParentContext`, `InputParameters`,
`PreEntityImages` and `PostEntityImages` are removed. Some operations don't
include them anyway.

## Failure Handling

Dataverse reads only the response status code. The timeout is 60 seconds. A
non-2xx fails the operation, except `502`, `503` and `504`, which are retried
once.

## Full Event Reference

See Microsoft's [webhook documentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-webhooks)
and [Register a WebHook](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-web-hook).
