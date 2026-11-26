# DocuSign Webhooks Overview

## What Are DocuSign Webhooks?

DocuSign delivers webhooks through **DocuSign Connect**. When an envelope or recipient changes state — sent, delivered, signed, declined, voided — Connect sends an HTTP POST to your configured endpoint instead of you polling the eSignature REST API.

Connect can be configured two ways:

- **Account-level** — in eSignature Admin (**Settings → Connect**), applies to all envelopes matching the trigger filters.
- **Per-envelope** — via the `eventNotification` object on the `POST envelopes` API call, scoped to a single envelope.

Modern configurations use JSON with **delivery mode SIM** (Send Individual Messages — one HTTP request per event) and **eventData version `restv2.1`**. The legacy XML SIM format was retired in May 2023.

## Common Event Types

DocuSign Connect event strings use a hyphenated `resource-action` format and appear in the JSON payload's top-level `event` field.

### Envelope events

| Event | Triggered When |
|-------|----------------|
| `envelope-sent` | The email with a link to the envelope is sent to a recipient |
| `envelope-resent` | The envelope is resent to a recipient |
| `envelope-delivered` | A recipient opened the envelope in the DocuSign signing site |
| `envelope-completed` | All recipients have completed the envelope (typically signed) |
| `envelope-declined` | A recipient declined to sign |
| `envelope-voided` | The sender voided the envelope |
| `envelope-corrected` | The envelope was corrected |
| `envelope-purge` | The envelope is scheduled for purge |
| `envelope-deleted` | The envelope was deleted |

### Recipient events

| Event | Triggered When |
|-------|----------------|
| `recipient-sent` | A notification was sent to a recipient |
| `recipient-resent` | A notification was resent to a recipient |
| `recipient-delivered` | A recipient opened their documents |
| `recipient-completed` | A recipient completed their actions (usually signing) |
| `recipient-declined` | A recipient declined to sign |
| `recipient-authenticationfailed` | A recipient failed an authentication check |
| `recipient-autoresponded` | DocuSign received a failed-delivery notification for a recipient email |
| `recipient-reassign` | A recipient reassigned signing to someone else |
| `recipient-finish-later` | A recipient chose "Finish Later" |
| `recipient-delegate` | Signing was delegated to another recipient |

## Event Payload Structure

A SIM / `restv2.1` JSON payload looks like:

```json
{
  "event": "envelope-completed",
  "apiVersion": "v2.1",
  "uri": "/restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}",
  "retryCount": 0,
  "configurationId": 123456,
  "generatedDateTime": "2024-01-15T10:30:00.0000000Z",
  "data": {
    "accountId": "00000000-0000-0000-0000-000000000000",
    "userId": "00000000-0000-0000-0000-000000000000",
    "envelopeId": "00000000-0000-0000-0000-000000000000",
    "envelopeSummary": {
      "status": "completed",
      "recipients": { }
    }
  }
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `event` | The Connect event string, e.g. `envelope-completed` |
| `data.envelopeId` | The envelope the event is about |
| `data.accountId` | The DocuSign account |
| `data.envelopeSummary` | Full envelope detail — **only present** if include options are enabled (see below) |
| `retryCount` | How many delivery attempts have been made for this message |

### Included data is opt-in

Recipient data, envelope documents, and tab (field) values are **only included** when the matching `eventData.include` options are enabled on the Connect configuration (e.g. `recipients`, `documents`, `tabs`). If your handler reads `data.envelopeSummary` and finds it missing, enable the corresponding include option.

## Headers

| Header | Description |
|--------|-------------|
| `X-DocuSign-Signature-1` … `-N` | Base64 HMAC-SHA256 of the raw body — one header per active HMAC key |
| `x-authorization-digest` | Names the algorithm, `HMACSHA256` |

## Delivery, Retries, and Failures

- DocuSign expects an HTTP **2xx** response. Any response `>= 400` (or a timeout) is treated as a failure.
- Failed deliveries are retried with **exponential backoff** starting at roughly 5 minutes and doubling, for up to **15 days**.
- Failed messages are listed in the Connect **Failures** log and can be **republished** manually from eSignature Admin or via the API.
- Because of retries, handlers must be **idempotent**. The body has no event ID, and `data.envelopeId` + `event` is not unique: every recipient's `recipient-completed` shares it, so include `data.recipientId` for recipient events, and treat repeatable events (`envelope-resent`, `recipient-resent`, `envelope-reminder-sent`) as new each time.

## Full Event Reference

For the complete list of events and payload options, see the [DocuSign Connect event triggers docs](https://developers.docusign.com/platform/webhooks/connect/event-triggers/) and the [Connect overview](https://developers.docusign.com/platform/webhooks/connect/).
