# BoldSign Webhooks Overview

## What Are BoldSign Webhooks?

BoldSign sends an HTTP POST with a JSON body to your HTTPS URL when documents, authentication steps, sender identities, or templates change. There are two kinds:

- **Account-level** webhooks fire for documents sent from the web app or the API.
- **App-level** webhooks fire for documents sent through a specific OAuth app (the payload's `event.clientId` identifies it).

Each webhook has its own signing secret and its own list of subscribed events. An optional "Listen to Team user's events" setting extends delivery to events triggered by team users.

## Common Event Types

The type is in `event.eventType` in the body (and in the `X-BoldSign-Event` header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Sent` | A signature request is sent to recipients | Track outgoing requests |
| `Viewed` | A recipient views the document | Engagement tracking, sales follow-up |
| `Signed` | A recipient signs the document | Per-signer progress |
| `Completed` | Signing is completed by all recipients | Download the signed PDF, update your records |
| `Declined` | A recipient declines | Alert the sender, restart the flow |
| `Revoked` | The sender revokes the request | Cancel downstream work |
| `Expired` | The request expires without completion | Reminders, resend |

Other document events: `Edited`, `EditFailed`, `Reassigned`, `SignerSaved`, `DeliveryFailed`, `SendFailed`, `DraftCreated`, `Reminder`.
Authentication events: `AuthenticationFailed`, `IdentityVerificationInitiated`, `IdentityVerificationSucceeded`, `IdentityVerificationFailed`, `KBAInitiated`, `KBASucceeded`, `KBAFailed`.
Sender identity events: `SenderIdentityCreated`, `SenderIdentityUpdated`, `SenderIdentityDeleted`, `SenderIdentityRevoked`, `SenderIdentityVerified`, `SenderIdentityDenied`.
Template events: `TemplateCreated`, `TemplateEdited`, `TemplateCreateFailed`, `TemplateDraftCreated`, `TemplateSendFailed`.

Setup also sends a one-off `Verification` event (see [setup.md](setup.md)).

## Event Payload Structure

```json
{
  "event": {
    "id": "afceddb1-2eed-4301-ae14-8b96a6b0393a",
    "created": 1669959514,
    "eventType": "Signed",
    "clientId": "e4ca1621-bbc7-4c9a-9e81-81d107589690",
    "environment": "Test"
  },
  "context": { "eventType": "Signed", "actor": { "userType": "Signer", "id": "..." } },
  "data": {
    "object": "document",
    "documentId": "26b8695f-46d0-4cd4-ba1a-c5a0d595c849",
    "messageTitle": "API Test Document",
    "status": "InProgress",
    "senderDetail": { "name": "...", "emailAddress": "..." },
    "signerDetails": [ { "signerName": "...", "status": "Completed" } ]
  }
}
```

- `event.id` is unique per event; use it to drop duplicates.
- `event.environment` is `Test` (sandbox) or `Live`.
- `data` is a document, sender identity, or template object depending on the event.

## Delivery and Retries

Your endpoint must return `200` within **10 seconds**. Otherwise BoldSign retries after 1 minute, 15 minutes, 45 minutes, 1 hour, 8 hours, and 24 hours. After that the webhook is monitored for 7 days and then disabled if it keeps failing (it re-enables itself if the endpoint recovers, or you can re-enable it manually). Duplicates can happen, including from manual resends in Webhook History, so make handlers idempotent.

## Full Event Reference

For the complete list of events and sample payloads, see [BoldSign's webhook documentation](https://developers.boldsign.com/webhooks/available-events/).
