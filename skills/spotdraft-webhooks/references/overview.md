# SpotDraft Webhooks Overview

## What SpotDraft Sends

SpotDraft is a contract lifecycle management (CLM) platform. Webhooks notify your endpoint about review, signature, execution and repository activity on contracts. You choose activities when you register the endpoint (the API calls this `only_for_activities`).

SpotDraft's [Webhooks page](https://developer.spotdraft.com/docs/webhooks) lists the `only_for_activities` values. The contract lifecycle ones:

| Activity | When it fires |
|---|---|
| `CONTRACT_CREATED` | A new contract is created |
| `CONTRACT_DATA_UPDATED` | Contract data changes |
| `CONTRACT_VERSION_UPLOADED` | A new contract version is uploaded |
| `CONTRACT_SENT_TO_COUNTERPARTY` | The contract is sent for counterparty review or redlining |
| `CONTRACT_REVIEW_REQUESTED` / `CONTRACT_REVIEW_COMPLETED` | Internal review is requested / completed |
| `CONTRACT_SIGNATURE_REQUESTED` | The contract is marked or sent for signature |
| `CONTRACT_SIGNATURE_DECLINED` | A signatory declines to sign |
| `CONTRACT_SIGNED` | A required signatory completes signing |
| `CONTRACT_EXECUTED` | All required signatures are complete |
| `CONTRACT_VOIDED` / `CONTRACT_DELETED` | The contract is voided / deleted |
| `CONTRACT_PROCESS_METRIC_UPDATED` | Workflow metrics change |

The page also lists `CONTRACT_MARK_FOR_EXECUTION`, `CONTRACT_UNMARK_FOR_EXECUTION`, `CONTRACT_ENTITY_UPDATED` and `CONTRACT_ACTIVITY_LOG_COMMENT_CREATED`; approvals and structured data (`CONTRACT_APPROVAL_REQUESTED`, `CONTRACT_APPROVAL_COMPLETED`, `CONTRACT_EXTERNAL_METADATA_CREATED` / `_UPDATED`, `CONTRACT_KEY_POINTER_CREATION` / `_UPDATION`); counterparties (`COUNTER_PARTY_CREATED` / `_UPDATED`, `COUNTER_PARTY_CONTACT_CREATED` / `_UPDATED`, `COUNTER_PARTY_ADDRESS_CREATED` / `_UPDATED`); and email events (`POSTMARK_EMAIL_EVENT`, `SIGNING_EMAIL_DELIVERED` / `_OPENED` / `_NOT_DELIVERED` / `_LINK_CLICKED`, the same four `REDLINING_EMAIL_*` values, and `CONTRACT_SIGNATURE_REQUESTED_NOTIFICATION_SENT`).

## What's Documented

| Topic | Documented? |
|---|---|
| Method and body | `POST` with a JSON payload |
| Signature | `X-SD-WEBHOOK-CONTENT-HASH`, hex HMAC-SHA512 of the raw body, base64-decoded `hmac_key` |
| Activity list | Yes: [Webhooks](https://developer.spotdraft.com/docs/webhooks), about 40 `only_for_activities` values |
| Payload fields | Not in the webhook guides; they refer to the API reference |
| Delivery ID header | Not named |
| Retries | Retried at 5, 10, 20, 40, 80, then 160 minutes after each failed attempt (non-2xx, timeout or connection failure) |
| Timeouts | 5 seconds to connect, 60 seconds for a response |
| Disablement | After 6 consecutive failed deliveries; re-enable under Settings -> Developer settings -> Webhooks |
| Logs | In the app: successes kept 30 days, failures 90 days |
| Timestamp / replay window | None |
| Test vector | None |

SpotDraft's endpoint guide says "For new integrations, verify X-SD-WEBHOOK-CONTENT-HASH", which suggests an older mechanism exists; it isn't documented. Use the content hash.

## Recommended Handling

SpotDraft's guides recommend: verify the hash against the raw body before any processing, persist the raw payload and headers, return `2xx` quickly, and deduplicate "by delivery id or payload fingerprint". The examples use a SHA-256 of the raw body as the fingerprint.
