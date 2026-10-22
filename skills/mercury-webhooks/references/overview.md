# Mercury Webhooks Overview

## What Are Mercury Webhooks?

Mercury is a business banking platform. Its Webhooks API pushes an HTTP POST with a JSON body to your HTTPS URL when a transaction or an account balance changes, instead of you polling the Events API. Each delivery has the same shape as an Events API event, following the JSON Merge Patch standard (RFC 7396). Endpoints are created and managed through the API (`/webhooks`), not a dashboard form.

## Common Event Types

These are the `eventTypes` you subscribe to when creating the endpoint. Omit `eventTypes` to receive all of them. **They are not in the delivered body**; see "How Do I Tell Events Apart?" below.

| Subscribed event | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `transaction.created` | A new transaction is created in your account | Ledger sync, incoming payment alerts |
| `transaction.updated` | An existing transaction is modified (for example `pending` → `sent`) | Settlement tracking, reconciliation |
| `checkingAccount.balance.updated` | Available, current, and/or in-flight balance of a checking account changes | Low-balance alerts |
| `savingsAccount.balance.updated` | Same, for a savings account | Treasury dashboards |
| `treasuryAccount.balance.updated` | Same, for a treasury account | Treasury dashboards |
| `creditAccount.balance.updated` | Same, for a credit account | Credit utilisation |
| `investmentAccount.balance.updated` | Same, for an investment account | Portfolio tracking |

## How Do I Tell Events Apart?

The body has `resourceType` and `operationType`. Dispatch on `` `${resourceType}.${operationType}` ``.

- `resourceType`: `transaction`, `checkingAccount`, `savingsAccount`, `treasuryAccount`, `investmentAccount`, `creditAccount`
- `operationType`: `create`, `update`, `delete` (the [Events API](https://docs.mercury.com/reference/events) values; note they are not `created`/`updated`)

So a delivery for the subscribed `transaction.created` has `resourceType: "transaction"`, `operationType: "create"`, and `checkingAccount.balance.updated` arrives as `checkingAccount` + `update`.

## Event Payload Structure

```json
{
  "id": "bfa85eaa-afab-11f0-8fea-17d650f2306e",
  "resourceType": "transaction",
  "resourceId": "1d3042b6-af63-11f0-89d2-3503f2fcfef7",
  "operationType": "update",
  "resourceVersion": 2,
  "occurredAt": "2025-01-01T00:00:00.000000Z",
  "changedPaths": ["status", "postedAt"],
  "mergePatch": { "postedAt": "2025-01-01T00:00:00.000000+00:00", "status": "sent" },
  "previousValues": { "postedAt": null, "status": "pending" }
}
```

- `id`: unique event UUID. Use it for idempotency.
- `resourceId`: the transaction or account that changed.
- `changedPaths`: which fields changed. `mergePatch` holds only those fields with their new values; `previousValues` the old ones (`null` for creates).

## Delivery and Retries

- Respond with a 2xx within 5 seconds. A timeout or non-2xx marks the delivery failed.
- Mercury retries up to 10 times with exponential backoff over about a day. A 4xx is not retried, except 429.
- Delivery is at-least-once, so deduplicate on the event `id`.
- A webhook disabled after consecutive delivery failures can be reactivated by setting its `status` to `active` (Update webhook endpoint).

## Full Event Reference

See [Mercury Webhooks](https://docs.mercury.com/reference/webhooks), [Create a webhook endpoint](https://docs.mercury.com/reference/createwebhook) and [Events](https://docs.mercury.com/reference/events).
