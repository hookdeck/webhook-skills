# DealHub Webhooks Overview

## What Are DealHub Webhooks?

DealHub (CPQ / quote-to-revenue) publishes webhooks for its main business
entities: Quotes, Versions, Users and DealRooms, plus system and async events.
When an event happens, DealHub sends an HTTP POST with a JSON payload to the
HTTPS endpoint you configured
([Webhooks Overview](https://developers.dealhub.io/docs/webhooks-overview)).

The event name is in the payload's `event` field. `version` and `user` events
also carry an `action` field that says what changed.

## Common Event Types

### Quote entity events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `draftQuote` | A quote is created and saved as a draft, or an existing draft is modified | Mirror drafts in the CRM; `newly_created_quote` tells create from update |
| `primaryQuote` | A user or the system marks a quote as Primary | Update the opportunity's primary quote. Only the new primary is sent; infer that the old one lost the flag |
| `quotePendingApproval` | A quote requiring approval is submitted, and again as each approver approves | Approval dashboards, notifications |
| `quoteReady` | A quote is fully approved, or submitted with no approval needed | Notify the rep it can be shared |
| `quoteRejected` | An approver rejects the quote | Alert the rep |
| `quoteRecalled` | A user recalls (cancels) the quote | Close related tasks |
| `quotePublished` | The quote is published to a DealRoom | Track buyer engagement |
| `quoteUnpublished` | A user unpublishes the DealRoom | Track buyer engagement |
| `quoteWon` | The quote is signed (in DealRoom or externally) | Provisioning, billing, BI sync via the Get Quote API |

### Version and user events (with `action`)

| Event | `action` values | Triggered When |
|-------|-----------------|----------------|
| `version` | `created`, `activated`, `reactivated` | An admin creates/duplicates, activates or reactivates a configuration version |
| `user` | `created`, `modified`, `deleted` | A user is created, updated or deleted |

### System & async events

| Event | Triggered When |
|-------|----------------|
| `productsUpload` | An SFTP product file upload or Open API upload completes; `upload_status` is `success` or `error`. Sent once per affected draft version |
| `crmImport` | A CRM Import (buyer account & contact migration) request completes |
| `Failure WebHook v1` | An asynchronous API request (e.g. duplicate or activate a version) fails |

### DealRoom events

All DealRoom activity arrives as `"event": "DEALROOM_EVENT"`. The specific
activity is the key of the `action_summary` object, for example
`DEAL_VIEW`, `DEAL_SIGN`, `DEAL_CO_SIGN` or `DEAL_BOX_FILE_ADDED`. See the
[DealRoom Webhook Events Reference](https://developers.dealhub.io/docs/dealroom-webhook-events-reference)
for the full list.

## Event Payload Structure

Every payload includes a standard `event_info` object:

- `webhook_id` — the webhook configuration
- `event_id` — unique per event notification; **use it as your idempotency key**
- `api_version` — currently `1.0`
- `request_id` — only for events triggered by an async API call (e.g. `productsUpload`)

Most entity payloads also include `execution_date` (GMT,
`yyyy-mm-dd hh:mm:ss`), `executed_by` (login, or `SYSTEM`) and
`impersonated_by`. Fields with no value are **omitted** from the payload.

Example `draftQuote` (from DealHub's docs):

```json
{
  "event": "draftQuote",
  "status": "Draft",
  "quote_upgrade_required": false,
  "newly_created_quote": true,
  "external_opportunity_id": "786865656565",
  "external_customer_id": "65545425413",
  "dealhub_opportunity_id": "2323232565685498",
  "dealhub_quote_id": "6563232565685498",
  "primary_quote": false,
  "executed_by": "john.smith@mydomain.com",
  "execution_date": "2021-10-22 16:39:08",
  "sync_flag": true,
  "quote_summary": {
    "currency": "USD",
    "total_list_price": 4600.00,
    "total_net_price": 3000.00,
    "total_discount": 34.78,
    "sales_discount": 34.78
  },
  "additional_data": [{ "q1": "some text" }, { "q2": "red;green;blue" }]
}
```

Quote `status` values: `Draft`, `ApprovalProcess`, `ReadyToBeSent`,
`Rejected`, `Recalled`, `Published`, `Won`. `additional_data` carries up to
five playbook answers you map per version (multi-select answers are
semicolon-separated).

Example `version`:

```json
{
  "event": "version",
  "action": "created",
  "status": "draft",
  "version_id": "786865656565",
  "version_name": "some name",
  "execution_date": "2021-10-22 16:39:08",
  "executed_by": "john.smith@mydomain.com"
}
```

The documented `Failure WebHook v1` example contains only `error_code` and
`error_description` (no `event` field), so the examples identify it by those
fields.

## Full Event Reference

- [Webhooks Overview](https://developers.dealhub.io/docs/webhooks-overview)
- [Quote Webhook Events Reference](https://developers.dealhub.io/docs/quote-webhook-events-reference)
- [Version, User & System Webhook Events Reference](https://developers.dealhub.io/docs/version-user-webhook-events-reference)
- [DealRoom Webhook Events Reference](https://developers.dealhub.io/docs/dealroom-webhook-events-reference)
