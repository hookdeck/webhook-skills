# SpotDraft Webhooks Overview

## What SpotDraft Sends

SpotDraft is a contract lifecycle management (CLM) platform. Webhooks notify your endpoint about review, signature, execution and repository activity on contracts. You choose activities when you register the endpoint (the API calls this `only_for_activities`).

| Activity | When |
|---|---|
| `CONTRACT_CREATED` | A contract is created |
| `CONTRACT_DATA_UPDATED` | Contract data changes |
| `CONTRACT_SENT_TO_COUNTERPARTY` | A contract is sent to the counterparty |
| `CONTRACT_SIGNATURE_REQUESTED` | A signature is requested |
| `CONTRACT_SIGNED` | A party signs |
| `CONTRACT_EXECUTED` | The contract is fully executed |
| `CONTRACT_PROCESS_METRIC_UPDATED` | A process metric changes |

## What's Documented

| Topic | Documented? |
|---|---|
| Method and body | `POST` with a JSON payload |
| Signature | `X-SD-WEBHOOK-CONTENT-HASH`, hex HMAC-SHA512 of the raw body, base64-decoded `hmac_key` |
| Payload fields | Not in the webhook guides; they refer to the API reference |
| Delivery ID header | Not named |
| Retries and timeout | Not stated in the webhook guides (they link a general "Errors, Redirects, and Retries" page) |
| Timestamp / replay window | None |
| Test vector | None |

SpotDraft's endpoint guide says "For new integrations, verify X-SD-WEBHOOK-CONTENT-HASH", which suggests an older mechanism exists; it isn't documented. Use the content hash.

## Recommended Handling

SpotDraft's guides recommend: verify the hash against the raw body before any processing, persist the raw payload and headers, return `2xx` quickly, and deduplicate "by delivery id or payload fingerprint". The examples use a SHA-256 of the raw body as the fingerprint.
