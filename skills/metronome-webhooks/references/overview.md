# Metronome Webhooks Overview

## What Are Metronome Webhooks?

Metronome (metronome.com) is a usage-based billing platform. If you configure a webhook URL, Metronome sends an HTTP `POST` with a JSON body to that URL when certain events occur: threshold alerts, contract, commit and credit changes, invoice events, subscription changes, billing-integration problems and marketplace metering issues. Metronome may add new fields to existing shapes without notice, so ignore fields you don't use.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `alerts.spend_threshold_reached` | A spend threshold alert fires | Notify the customer, throttle |
| `alerts.low_remaining_credit_balance_reached` | Remaining credit balance drops below a threshold | Trigger a top-up |
| `alerts.low_remaining_commit_balance_reached` | Remaining commit balance drops below a threshold | Alert the account owner |
| `alerts.usage_threshold_reached` | A usage threshold alert fires | Usage warnings |
| `alerts.invoice_total_reached` | An invoice total threshold is reached | Flag the invoice for review |
| `contract.create` | A contract is created | Provision the customer |
| `contract.start` | A contract starts | Activate entitlements |
| `contract.edit` | A contract is edited | Sync changes |
| `contract.end` | A contract ends | Revoke entitlements |
| `contract.archive` | A contract is archived | Clean up |
| `commit.create` | A commit is created | Track prepaid commitments |
| `credit.create` | A credit is created | Track granted credits |
| `invoice.finalized` | An invoice is finalized | Record the receivable |
| `invoice.void` | An invoice is voided | Reverse bookkeeping |
| `invoice.billing_provider_error` | Sending an invoice to the billing provider failed | Alert the integration owner |
| `subscription.start` | A subscription starts | Activate access |
| `subscription.end` | A subscription ends | Revoke access |

Other documented types in the same families include `commit.edit`, `commit.archive`, `commit.segment.start`, `commit.segment.end`, `credit.edit`, `credit.archive`, `credit.segment.start`, `credit.segment.end`, `integration.issue` and the `marketplaces.*_metering_disabled` events (34 documented in total).

## Event Payload Structure

Two shapes exist. Both carry `id` (unique per event: use it to deduplicate) and `type`.

Threshold, invoice, integration and marketplace events nest their data under `properties`:

```json
{
  "id": "fc00bd44-8d4b-4913-9b7c-fd1f8da61e62",
  "type": "invoice.finalized",
  "properties": {
    "invoice_id": "de99894e-f9ce-4b6c-92b0-f4ec0d09b6f1",
    "customer_id": "3c9e87ba-0e49-44a3-9aa9-6917f8da3491",
    "invoice_finalized_date": "2024-02-20T15:50:07.457Z"
  }
}
```

Contract, commit, credit and subscription events are flat:

```json
{
  "id": "fca7b4ef-6187-51d5-a9d9-b57f40117728",
  "type": "contract.create",
  "timestamp": "2025-09-12T20:20:04Z",
  "environment_type": "PRODUCTION",
  "contract_id": "33d206f6-7455-49f6-857d-2172c37db68d",
  "customer_id": "1ed86915-97f1-4d92-8fa6-763c0235093a"
}
```

## Delivery

- Method: `POST`, JSON body.
- A response status above `299` is retried with exponential backoff, up to a 15-minute cadence, until accepted or two days after the first attempt (about 200 retries).
- Duplicates are possible: deduplicate on `id`.

## Full Event Reference

For the complete list of events, see [Metronome's webhook documentation](https://docs.metronome.com/guides/platform-configuration/setup-webhooks).
