# Bayou Energy Webhooks Overview

## What Are Bayou Energy Webhooks?

[Bayou Energy](https://www.bayou.energy) retrieves customers' utility bills and interval data through an API. Webhooks tell your app when new data is available or when a customer needs to act, so you don't have to poll. Bayou POSTs JSON to your company's single webhook URL, and every delivery is signed per the Standard Webhooks spec (see [verification.md](verification.md)).

## Envelope

```json
{ "event": "<event name>", "object": { ... } }
```

`event` is the event type. `object` is the bill (bill events) or the customer (customer events). The envelope has no event ID or timestamp, so use the `webhook-id` header for deduplication.

## Common Event Types

The docs list these seven events. The list may not be exhaustive.

| Event | Triggered When | `object` | Common Use Cases |
|-------|----------------|----------|------------------|
| `new_bill` | A new bill was discovered | Bill (`id`, `external_id`, `status`, `customer_id`, `billing_period_from/to`, `total_amount`, `meters`, ...) | Store the bill, notify the customer |
| `updated_bill` | A bill was updated | Bill | Refresh stored bill data |
| `bills_ready` | Initial bill discovery finished for a customer | Customer (`id`, `external_id`, `bills_parsed`) | Start analysis once history is loaded |
| `intervals_ready` | Initial interval discovery finished for a customer | Customer (`id`, `external_id`, `first_interval_discovered`, `last_interval_discovered`, `available_data`) | Fetch interval data |
| `customer_has_filled_credentials` | A customer successfully shared their utility credentials | Customer (`id`, `external_id`, `utility`, `has_filled_credentials`, `has_filled_credentials_on`, `utility_data_velocity`) | Mark onboarding as connected. Not sent if the credentials are marked invalid |
| `new_unparsed_bill` | A bill was discovered but couldn't be parsed yet | Bill (`id`, `external_id`, `status: "unparsed"`, `utility`, `utility_data_velocity`, `file_url`) | Track bills that will be parsed later. `file_url` is a short-lived pre-signed link |
| `customer_must_reauthenticate` | A customer must share credentials again | Customer (`id`, `external_id`, `reason`, `onboarding_token`, `onboarding_link`) | Send the customer back to the onboarding form |

`customer_must_reauthenticate` carries a `reason` of `credentials_are_invalid` (email or password no longer valid) or `mfa_factor_has_expired` (the MFA code expired and a new one is needed).

## Example Payloads

```json
{
  "event": "customer_has_filled_credentials",
  "object": {
    "id": 12345,
    "external_id": "MSCOTT123",
    "utility": "con_edison",
    "has_filled_credentials": true,
    "has_filled_credentials_on": "2022-07-01T14:05:00Z",
    "utility_data_velocity": "Instant"
  }
}
```

```json
{
  "event": "customer_must_reauthenticate",
  "object": {
    "id": 12345,
    "external_id": "MSCOTT123",
    "reason": "credentials_are_invalid",
    "onboarding_token": "ABCDEF0123456_ABCDEF0123456_ABCDEF0123456",
    "onboarding_link": "https://bayou.energy/companies/12345/sign_up?key=ABCDEF0123456"
  }
}
```

## Delivery

- One webhook URL per company, set in the dashboard.
- Deliveries are sent whether or not you verify signatures.
- Bayou doesn't document a retry policy or response timeout. Respond `2xx` fast and process asynchronously.
- Bayou's docs say `customer_must_reauthenticate` can be tested with a fake customer on Bayou's fake utility (see the [fake customer docs](https://docs.bayou.energy/docs/speculoos)).

## Full Event Reference

For the complete list of events and payloads, see [Bayou's webhook documentation](https://docs.bayou.energy/reference/list-of-webhooks).
