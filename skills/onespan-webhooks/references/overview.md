# OneSpan Webhooks Overview

## What Are OneSpan Sign Callback Notifications?

OneSpan Sign calls them Callback Event Notifications. When an event happens to a package (called
a "transaction" in the New User Experience), OneSpan Sign sends an HTTP POST with a JSON body
to the callback URL you registered, so you don't have to poll for status.

Callbacks carry **no signature**. The only authentication is the callback key you register,
sent as `Authorization: Basic {callbackKey}` (see [verification.md](verification.md)). By
default all event types are disabled; you opt in to each one.

The docs say to return a `2xx` before the callback request times out (20 seconds, which "could
vary between different instances") and to use asynchronous processing for slow work. They do
not publish a general retry schedule or an event ID, so make handlers idempotent (dedupe on
`packageId` + `name` + `documentId` + `sessionUser`).

## What Events Does OneSpan Send?

The event type is the `name` field. Event names below are from the Setting Up Callback
Notifications page.

| Event | Triggered When |
|-------|----------------|
| `PACKAGE_CREATE` | A package is created (also fires when a DRAFT package is re-requested into DRAFT) |
| `PACKAGE_ACTIVATE` | A package moves from DRAFT or DELETED to SENT |
| `PACKAGE_DEACTIVATE` | A package moves from SENT to DRAFT |
| `PACKAGE_COMPLETE` | A package finishes signing; with several signers `sessionUser` is the last signer |
| `PACKAGE_DECLINE` | A recipient declines to sign; `message` is the reason (max 4000 chars) |
| `PACKAGE_EXPIRE` | A package passes its expiration date |
| `PACKAGE_ARCHIVE` | A package is archived |
| `PACKAGE_TRASH` | A package is moved to the trash (status TRASH) |
| `PACKAGE_RESTORE` | A trashed package is restored to its previous state |
| `PACKAGE_DELETE` | A package is deleted from OneSpan Sign |
| `PACKAGE_ATTACHMENT` | A signer uploads an attachment; `message` is the attachment name |
| `PACKAGE_READY_FOR_COMPLETE` | A DO_NOT_AUTOCOMPLETE package needs the sender to complete it |
| `PACKAGE_DISPUTE` | A Recipient Specifier disputes (declines) a specification |
| `DOCUMENT_SIGNED` | A document is signed, or Consent/Disclosure agreements are accepted; `documentId` is set (e.g. `default-consent`) |
| `DOCUMENT_VIEWED` | A document is viewed |
| `SIGNER_COMPLETE` | A signer completes all their documents |
| `SIGNER_LOCKED` | A signer is locked out after repeated SMS/Q&A authentication failures |
| `ROLE_REASSIGN` | A signer delegates to another signer; `newRoleId` is set |
| `KBA_FAILURE` | A KBA authentication failure |
| `EMAIL_BOUNCE` | An email bounced; `message` is the bounce type (`BOUNCE`, `COMPLAINT`, `OOTO`, `ATTACHMENTREJECTED`, `CONTENTREJECTED`, `MAILBOXFULL`, `MESSAGETOOLARGE`) |
| `COBROWSE_REQUEST` | A signer requests a co-browse session (extra fields `phone`, `comment`, `selectedSupportBusinessHours`) |
| `RECORDINGS_READY` | Virtual Room recordings are ready to download |
| `TEMPLATE_CREATE` | A template is created |
| `EDEPOSIT_SUCCESS` | Documents were deposited to eOriginal |
| `EDEPOSIT_FAILURE` | An unrecoverable eOriginal deposit failure |
| `EDEPOSIT_FAILURE_ATTEMPT` | Deposit failed but automated retries continue |

Doc inconsistencies to be aware of: the `EDEPOSIT_FAILURE_ATTEMPT` row's sample payload shows
`"name": "EDEPOSIT_ATTEMPT_FAILURE"`, and the `PACKAGE_DISPUTE` sample uses `creationDate`
instead of `createdDate`. Treat `name` as an open string and don't assume the list is closed.

## Event Payload Structure

```json
{
  "@class": "com.silanis.esl.packages.event.ESLProcessEvent",
  "name": "PACKAGE_COMPLETE",
  "sessionUser": "e00696ec-d6f5-4feb-89c5-a5ce002a6c66",
  "packageId": "5n4obeO8jYoPp126Cm-Y3fxdfbo=",
  "message": null,
  "documentId": null,
  "createdDate": "2018-06-30T20:15:01.038Z"
}
```

| Field | Description |
|-------|-------------|
| `name` | The event type |
| `sessionUser` | Sender ID for sender-triggered events, signer ID for signer-triggered ones (max 255 chars); `null` for eDeposit events |
| `packageId` | Package ID (max 255 chars), used to download the signed documents |
| `documentId` | Set for document events, otherwise `null` or absent |
| `message` | Event detail (decline reason, bounce type, attachment name), otherwise `null` or absent |
| `createdDate` | ISO 8601 string in most samples; epoch milliseconds in the eDeposit samples |

Set the signer's Custom Id (SDK) or Signer Id (REST) when you create the signer and store it,
so `sessionUser` maps back to your records.

## Full Event Reference

https://docs.onespan.com/docs/setting-up-callback-notifications
