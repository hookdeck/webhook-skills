# Maximizer Webhooks Overview

## What Are Maximizer Webhooks?

Maximizer CRM sends near-real-time HTTP `POST` requests to a **target** (your endpoint) when
records change. Only **organization-level** webhooks are supported: a subscription delivers events
for all entries of an object, not just one user's. You need the Administrator role to manage
targets and subscriptions through the Webhooks API (`https://api.maximizer.com/webhooks`).

Webhooks are **not signed**. Authentication is a header you add to the target (see
[verification.md](verification.md)). A static credential proves the sender, not the body, and gives
no replay protection.

## Delivery Rules

- Targets must answer `200 OK` within **2 seconds**.
- On a timeout or any other status, Maximizer makes two more attempts after a short delay, then
  discards the webhook (three attempts total).
- A Maximizer instance can have at most **10 targets**.
- Subscriptions are unique per target + `Entity` + `Op`; a subscription can carry AND-ed filters.

## Common Events

An event is the combination of the object (`Entity`) and the operation (`Op`).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `AbEntry` + `Create` | A contact (address book entry) is created | Add the contact to a mailing or billing system |
| `AbEntry` + `Update` | A contact changes | Keep external contact records in sync |
| `AbEntry` + `Delete` | A contact is deleted | Remove or archive the external record |
| `Opportunity` + `Create` | An opportunity is created | Open a deal elsewhere |
| `Opportunity` + `Update` | An opportunity changes (including stage changes) | Notify the team, update forecasts |
| `Opportunity` + `Delete` | An opportunity is deleted | Close the matching deal |
| `Lead` + `Create` | A lead is created | Route to sales |
| `Lead` + `Update` | A lead changes | Sync status |
| `Lead` + `Delete` | A lead is deleted | Remove the lead |

The Postman collection's Payloads folder also has examples for `LeadDefault`, `InteractionLog` and
`InteractionLogDefault` (each `Create`, `Update`, `Delete`) and `Export` + `Read` (AbEntry and
Opportunity exports), all in the same envelope. Those are the only documented entities. The
subscription API describes `Entity` as "AbEntry, Opportunity, etc" and `Op` as "Create, Update,
Delete, etc", so treat the list as a floor and log anything unexpected.

## Payload Structure

The body is a JSON **array** of webhook objects (a request can carry more than one).

```json
[
  {
    "Id": "d81f9d6e-8afc-4fa4-9052-2af207494e5d",
    "Timestamp": "2024-09-20T00:01:29.5149836Z",
    "ProcessedTimestamp": "2024-09-20T00:02:45.8974002Z",
    "WorkspaceId": "108F314C-6787-4EE6-BE49-C0E0C651F039",
    "SourceId": "1a0dde7c-743f-4b55-a2bf-e7738393a8e5",
    "Recipients": [],
    "Options": null,
    "Entity": "Opportunity",
    "Data": {
      "Op": "Update",
      "Original": { "Key": "...", "SalesStageSetupName": "Qualified" },
      "New": { "Key": "...", "SalesStageSetupName": "Presentation" },
      "Version": "1.1"
    }
  }
]
```

| Field | Meaning |
|-------|---------|
| `Id` | Unique webhook ID (use it for idempotency) |
| `Timestamp` / `ProcessedTimestamp` | When the event was generated / forwarded |
| `WorkspaceId` | The Maximizer database the event came from |
| `Entity` | Object name, such as `AbEntry`, `Opportunity`, `Lead` |
| `Data.Op` | Operation: `Create`, `Update`, `Delete` (the `Op` is inside `Data`, not top level) |
| `Data.Original` | Previous data; null on create |
| `Data.New` | Changed data; null on delete. On update it holds only the changed fields |
| `Data.Version` | Object version in the Octopus API (major.minor); code against a major version |

## Full Event Reference

See [Maximizer's webhook documentation](https://developer.maximizer.com/docs/webhooks) and the
[Create a target](https://developer.maximizer.com/reference/post_v1-targets) reference.
