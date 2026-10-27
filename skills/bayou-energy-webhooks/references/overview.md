# Bayou Energy Webhooks Overview

## What Are Bayou Energy Webhooks?

[Bayou Energy](https://bayou.energy) is a utility-data API that retrieves customers' utility bills and interval data. Bayou sends an HTTP `POST` with a JSON body to your webhook URL when it discovers or updates a bill, when the initial bill and interval pulls for a customer finish, and when a customer's utility credentials need attention. There is one webhook URL per company, and every webhook goes to it.

Every delivery is signed per the [Standard Webhooks](https://www.standardwebhooks.com/) spec (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Bayou sends deliveries whether or not you verify them.

## Common Event Types

The docs list these seven webhooks. The list may not be exhaustive, so ignore unknown `event` values and still return `200`.

| Event | `object` is | Triggered When | Common Use Cases |
|-------|-------------|----------------|------------------|
| `new_bill` | Bill | A new bill was discovered | Store the bill, update usage dashboards |
| `updated_bill` | Bill | A bill was updated | Refresh stored bill data |
| `bills_ready` | Customer | The initial bill discovery finished for a customer | Fetch the customer's bills, finish onboarding |
| `intervals_ready` | Customer | The initial interval discovery finished for a customer | Fetch intervals, start load analysis |
| `customer_has_filled_credentials` | Customer | A customer successfully shared their utility credentials (not sent if the credentials are marked invalid) | Mark the customer as connected |
| `new_unparsed_bill` | Bill | A bill was discovered but couldn't be parsed yet | Show a "processing" state, wait for `updated_bill` |
| `customer_must_reauthenticate` | Customer | A customer must share their credentials again | Send the customer to `onboarding_link` |

## Event Payload Structure

Every payload is `{ "event": "<name>", "object": { ... } }`.

**Bills** (`new_bill`, `updated_bill`, and each entry of `bills_parsed`) carry `id`, `external_id`, `status` (`unlocked`, `unparsed`...), `customer_id`, `customer_external_id`, `utility`, `account_number`, `billed_on`, `billing_period_from` / `billing_period_to`, `past_due`, `outstanding_balance`, `total_amount`, electricity and gas consumption and amounts, and a `meters` array.

```json
{ "event": "new_bill",
  "object": { "id": 12345, "external_id": "BILL_123", "status": "unlocked", "customer_id": 123456,
              "customer_external_id": "MSCOTT123", "utility": "con_edison", "total_amount": 12000,
              "meters": [ { "id": "XYZ98765", "type": "electric", "consumption": 900 } ] } }
```

**`bills_ready`**: `object` is the customer (`id`, `external_id`) with a `bills_parsed` array of bills.

**`intervals_ready`**: `object` has `id`, `external_id`, `first_interval_discovered`, `last_interval_discovered` and `available_data.account_numbers[].meters[].periods[]`.

**`customer_has_filled_credentials`**: `id`, `external_id`, `utility`, `has_filled_credentials`, `has_filled_credentials_on`, `utility_data_velocity`.

**`new_unparsed_bill`**: `id`, `external_id`, `status: "unparsed"`, `customer_id`, `customer_external_id`, `utility`, `utility_data_velocity`, and a short-lived pre-signed `file_url`.

**`customer_must_reauthenticate`**: `id`, `external_id`, `reason` (`credentials_are_invalid` or `mfa_factor_has_expired`), `onboarding_token`, `onboarding_link`.

There is no event ID or event timestamp in the payload. Dedupe on the `webhook-id` header. Treat `file_url` and `onboarding_token` as secrets and keep them out of logs.

## Full Event Reference

For the complete list and payloads, see [Bayou's available webhooks](https://docs.bayou.energy/reference/list-of-webhooks).
