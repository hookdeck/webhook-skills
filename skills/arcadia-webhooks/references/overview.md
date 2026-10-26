# Arcadia Webhooks Overview

## What Are Arcadia Webhooks?

Arcadia is a utility data platform (Plug and Spark APIs). Its webhooks `POST` a JSON payload to a
URL you register whenever utility data changes: a credential's connection status changes, new
meter or account data arrives, existing data is updated or deleted, or a user has to complete an
MFA challenge. Requests are **not signed**. Arcadia can add a custom header (name and value) to
every webhook so you can confirm the sender; see [setup.md](setup.md).

Your endpoint must return a 2xx within 10 seconds.

## Common Event Types

| eventType | resource (example) | Triggered When | Common Use Cases |
|-----------|--------------------|----------------|------------------|
| `STATUS_CHANGE` | `CREDENTIAL` | A credential's status changes | Prompt the user to fix a broken connection |
| `NEW_DATA_AVAILABLE` | `METER` | New data is available | Fetch the new statements, meters or intervals |
| `EXISTING_DATA_UPDATED` | `METER` | Existing data is updated | Re-sync the affected records |
| `DATA_DELETED` | `BUSINESS_UNIT_DELETION` | A user deletes a business unit (`data` says where its accounts moved and how many) | Reassign or remove the business unit's accounts locally |
| `BUSINESS_UNIT_ASSIGNMENT` | `ROOT_BUSINESS_UNIT_ACCOUNT` | An account is assigned to a business unit | Update local ownership |
| `REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS` | `CREDENTIAL` | A real-time credential validation succeeds | Mark the connection ready |
| `REAL_TIME_CREDENTIAL_VALIDATION_FAILURE` | `CREDENTIAL` | A real-time credential validation fails | Ask the user to re-enter credentials |
| `MFA_CHALLENGE_METHOD` | `MFA_METHOD_PROMPT` | The user must choose an MFA method | Show the available `verificationMethods` |
| `MFA_CHALLENGE_CODE` | `MFA_CODE_PROMPT` | The user must supply an MFA code | Prompt for the code |

`resource` names the entity the event is about (`CREDENTIAL`, `ACCOUNT`, `STATEMENT`, `METER`, ...).
Dispatch on `eventType`, then on `resource` where one event type covers several resources.

## Event Payload Structure

```json
{
  "id": "whk_7606ece6-91cc-757d-b8bc-df676985fcfc",
  "eventType": "DATA_DELETED",
  "resource": "BUSINESS_UNIT_DELETION",
  "createdAt": "2024-02-21T00:00:00.000+00:00",
  "businessUnitIds": ["bus_fb71b140-b933-9c35-4a40-3aca987b6583"],
  "errors": [],
  "data": {
    "businessUnitId": "bus_69dc6270-0dbe-cd39-cadf-40f83ecfd416",
    "deletedAt": "2024-02-21T00:00:00.000+00:00",
    "movedToBusinessUnitId": "bus_fb71b140-b933-9c35-4a40-3aca987b6583",
    "totalAccountsMoved": 4
  }
}
```

- `id` - unique per webhook (`whk_...`); use it to de-duplicate
- `eventType`, `resource` - what happened, and to which entity
- `createdAt` - when the event was created
- `businessUnitIds` - business units the event applies to
- `errors` - any errors Arcadia reports for the event
- `data` - the entity (a credential, meter, account, ...) or event-specific fields. For
  credential events `data` is the credential; for MFA events it is `{ credential, ... }`.

## Full Event Reference

For the complete list of events and payloads, see the
[Arcadia webhooks documentation](https://docs.arcadia.com/reference/webhooks-overview).
