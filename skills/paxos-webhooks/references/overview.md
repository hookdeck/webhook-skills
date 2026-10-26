# Paxos Webhooks Overview

## What Are Paxos Webhooks?

Paxos webhooks deliver asynchronous events from the Paxos Platform to an HTTPS POST endpoint you register (a "webhook consumer"). You create the webhook in Dashboard under **Developer > Webhooks**, choose the event types, an auth type (API Key or OAuth) and a rate limit (1-100 requests per second, default 10).

Paxos **does not sign** webhook events. Events are also **thin**: the payload identifies the event but does not carry the full object. Fetch it with the authenticated Get Event API using the event `id`. This skill covers the **API Key** auth type; OAuth (client credentials) is not covered.

Each entity can have at most 10 active webhooks, names must be unique, and webhooks can't be updated (create a new one and delete the old one).

## Payload Fields

| Field | Description | Example |
|-------|-------------|---------|
| `id` | Event ID; use it with Get Event and for deduplication | `bd019f1c-89a7-4372-9d21-eaad9280dc41` |
| `type` | Event type | `identity.approved` |
| `source` | Always `com.paxos` | `com.paxos` |
| `time` | When the event was created (RFC 3339) | `2025-01-01T14:30:02Z` |
| `object` | Always `event` | `event` |
| `is_test` | `true` only for events sent with the Dashboard Test feature | `false` |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `identity.approved` | An identity verification is approved | Enable the customer |
| `identity.denied` | An identity verification is denied | Notify the customer |
| `identity.documents_required` | Additional documents are required | Request documents |
| `identity.documents_accepted` | An EDD review is accepted | Resume onboarding |
| `identity.documents_denied` | An EDD review is denied | Escalate |
| `transfer.crypto_deposit.completed` | A crypto deposit completes | Credit the account |
| `transfer.wire_withdrawal.failed` | A wire withdrawal fails | Alert and retry |
| `orchestration.completed` | A stablecoin orchestration completes | Mark a mint, convert or redeem done |

## All Documented Event Types

- **Identity:** `identity.documents_required`, `identity.documents_accepted`, `identity.documents_denied`, `identity.approved`, `identity.denied`, `identity.disabled`, `identity.kyc_refresh.started`, `identity.kyc_refresh.completed`, `identity.kyc_refresh.expired`, `identity.control.created`, `identity.control.deleted`, `identity.tax_documentation.status_changed`
- **Transfers:** `transfer.<method>.<status>` where method is one of `act_deposit`, `act_withdrawal`, `banking_circle_intrabank_deposit`, `banking_circle_intrabank_withdrawal`, `bny_intrabank_deposit`, `bny_intrabank_withdrawal`, `crypto_deposit`, `crypto_withdrawal`, `cubix_deposit`, `cubix_withdrawal`, `rtp_deposit`, `scb_intrabank_deposit`, `scb_intrabank_withdrawal`, `wire_deposit`, `wire_withdrawal`, and status is `pending`, `completed` or `failed` (RTP has deposits only). `transfer.internal_transfer_debit.completed` and `transfer.internal_transfer_credit.completed` have no pending/failed variants.
- **Orchestrations:** `orchestration.processing`, `orchestration.pending`, `orchestration.rejected`, `orchestration.completed`, `orchestration.failed`, and granular `orchestration.status_details.pending_customer_approval`, `.conversion_in_progress`, `.destination_transfer_in_progress`, `.conversion_failed`, `.destination_transfer_failed`, `.policy_rejected`

## Delivery

At-least-once delivery. Any non-2xx response is retried with exponential backoff and jitter (first retry after about 5 seconds) for up to 24 hours. After that, recover missed events with the List Events API. Be idempotent on `id`, acknowledge fast (ideally under 500 ms), and keep a polling backstop.

## Full Event Reference

See the [Paxos Webhooks API Reference](https://docs.paxos.com/api-reference/webhooks/identity-approved), the [webhooks overview](https://docs.paxos.com/guides/webhooks/index) and [Retries and Limits](https://docs.paxos.com/guides/webhooks/retries-and-limits).
