# SpotDraft Webhooks Overview

## What SpotDraft Sends

SpotDraft is a contract lifecycle management (CLM) platform. Webhooks notify your endpoint about review, signature, execution and repository activity on contracts. You choose activities when you register the endpoint (the API calls this `only_for_activities`).

| Activity | When |
|---|---|
| `CONTRACT_CREATED` | A contract is created |
| `CONTRACT_SENT_TO_COUNTERPARTY` | A contract is sent to the counterparty |
| `CONTRACT_EXECUTED` | The contract is fully executed |

SpotDraft's reachable docs don't publish the full list of activities: these three appear in the [webhooks playbook](https://developer.spotdraft.com/docs/api-playbooks/receive-real-time-contract-events-via-webhooks)'s registration example (`only_for_activities`). The playbook says you can also receive review, signature, execution and repository events; check the activity values offered when you register the endpoint.

## What's Documented

| Topic | Documented? |
|---|---|
| Method and body | `POST` with a JSON payload |
| Signature | `X-SD-WEBHOOK-CONTENT-HASH`, hex HMAC-SHA512 of the raw body, base64-decoded `hmac_key` |
| Activity list | Not published in full; the playbook names three |
| Payload fields | Not in the webhook guides; they refer to the API reference |
| Delivery ID header | Not named |
| Retries and timeout | Not stated in the webhook guides (they link a general "Errors, Redirects, and Retries" page) |
| Timestamp / replay window | None |
| Test vector | None |

SpotDraft's endpoint guide says "For new integrations, verify X-SD-WEBHOOK-CONTENT-HASH", which suggests an older mechanism exists; it isn't documented. Use the content hash.

## Recommended Handling

SpotDraft's guides recommend: verify the hash against the raw body before any processing, persist the raw payload and headers, return `2xx` quickly, and deduplicate "by delivery id or payload fingerprint". The examples use a SHA-256 of the raw body as the fingerprint.
