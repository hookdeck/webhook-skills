# Tripletex Webhooks Overview

## What Are Tripletex Webhooks?

Tripletex WebHooks are event subscriptions. You register a `targetUrl` and an event name
(`object.verb`) through the API, and Tripletex sends an HTTP `POST` with a JSON body each time that
event happens. Subscriptions are managed under `/event` and `/event/subscription` in the
[OpenAPI docs](https://developer.tripletex.no/docs/documentation/webhooks/); there is no dashboard
UI. Webhooks are not signed; authenticate them with the custom header you set on the subscription.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invoice.charged` | A new invoice has been created and charged | Sync invoices, send to a payment or reporting system |
| `customer.create` / `customer.update` / `customer.delete` | A customer is created / updated / deleted | CRM sync |
| `order.create` / `order.update` / `order.delete` | An order is created / updated / deleted | Fulfilment, order mirroring |
| `product.create` / `product.update` / `product.delete` | A product is created / updated / deleted | Catalogue and inventory sync |
| `supplier.*`, `employee.*`, `account.*`, `project.*`, `contact.*`, `archiverelation.*`, `voucher.*` | create / update / delete of that object | Master-data sync, bookkeeping |
| `notification.sent` | A notification was sent to the employee (owner of the token) | Surface Tripletex notifications |
| `voucherstatus.ready` | A new voucher is ready to be processed from the voucher reception | Voucher processing |
| `closegroup.create` | A close group is created (postings matched/closed); also fires on automatic closes such as OCR matching of incoming payments | Reconciliation |
| `closegroup.delete` | A close group is deleted (postings reopened); `value` is `null` | Reverse a reconciliation |

You must subscribe to each verb individually (`order.create`, `order.update`, `order.delete`).
Events may include verbs beyond create/update/delete. Call `GET https://tripletex.no/v2/event` for
the current list.

## Event Payload Structure

```json
{ "subscriptionId": 42, "event": "product.create", "id": 1001, "value": { "id": 1001, "version": 0 } }
```

```json
{ "subscriptionId": 43, "event": "product.delete", "id": 1001, "value": null }
```

- `subscriptionId`: the subscription that produced the delivery
- `event`: `object.verb`
- `id`: id of the triggering object (the only identifier on deletes)
- `value`: the object DTO, optionally narrowed by the subscription's `fields` parameter; `null` for deletes

## Delivery

- Method `POST` to your `targetUrl`; any non-success response is retried with growing intervals over
  a span of 30 hours.
- A subscription that fails constantly for a week is set to `DISABLED_TOO_MANY_ERRORS`. A
  successful delivery resets the counter. Re-enable it with `PUT /event/subscription/{id}`.
- If an object changes several times in quick succession, versions may be skipped but the latest is
  sent. Compare `value.version` with what you hold, and keep a nightly sync as a safety net.

## Full Event Reference

See [Tripletex's webhook documentation](https://developer.tripletex.no/docs/documentation/webhooks/).
