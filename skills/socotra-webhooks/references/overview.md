# Socotra Webhooks Overview

## What Are Socotra Webhooks?

[Socotra Insurance Suite](https://www.socotra.com) is a policy administration
platform. Webhooks are callbacks that tell your service in real time when
something happens in a tenant. You create one with a `POST` to the Create Webhook
endpoint of the Webhook API, giving the URL and the event types it should receive.

Webhooks and the Event Stream share the same `EventResponse` structure, so the
event types and payloads are the ones listed on Socotra's Event Definitions page.

## Common Event Types

Dispatch on the body's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `policy.account.create` | An account is created | Sync the customer to a CRM |
| `policy.quote.issue` | A quote is issued | Start fulfilment, notify the producer |
| `policy.quote.accept` | A quote is accepted | Kick off underwriting or payment |
| `billing.invoice.generate` | An invoice is generated | Send the invoice, update ledgers |
| `billing.payment.create` | A payment is created | Reconcile payments |
| `document.ready` | A generated document is ready | Fetch and deliver the document |

Other families include `policy.quote.*`, `billing.*` (invoices, payments,
disbursements, holds, delinquency), `document.*`, tasks, FNOL and producers.
Events defined in your configuration arrive as `custom.*`.

## Event Payload Structure

```json
{
  "locator": "9a8b7c6d-1111-2222-3333-444455556666",
  "requestId": "req-1",
  "userLocator": "user-1",
  "timestamp": 1695835536078,
  "type": "policy.quote.issue",
  "data": {}
}
```

`data` varies by event type. (The illustrative values above are not from Socotra's docs.)

## Delivery and Failure Handling

- Delivery times out after **10 000 ms**.
- **Retries are opt-in** per webhook through `failureHandling`: `triggers`
  (`4xx`, `5xx`, specific codes, `timeout`), 1 to 10 attempts (default 3 once a
  retry strategy is set), a linear or exponential interval, optional `suspend`,
  `divert` to the Diverted Events API, and an `alertEndpoint`.
- With no `failureHandling` the default is `triggers: ["4xx","5xx","timeout"]`,
  `divert: false`, `suspend: false`: **no retries**.

Respond quickly with a `2xx` and make your handler idempotent.

## Full Event Reference

See Socotra's [Event Definitions](https://docs.socotra.com/configuration/general-topics/event-definitions)
and [Webhooks](https://docs.socotra.com/configuration/general-topics/webhooks) pages.
