# Zuora Callout Notifications Overview

## What Are Zuora Callouts?

Zuora's documentation calls callouts "also known as webhooks": event-based API calls that Zuora
makes out to other systems. You create a **callout template** tied to a standard or custom event
(Billing, Finance, Payments or System categories) and Zuora sends a request to the template's URL
each time the event fires. This skill covers callout notifications from Events and Notifications,
not Workflow callouts.

## What Does a Callout Look Like?

| Part | Details |
|------|---------|
| Method | Set on the template: `POST` (default), `GET`, `PUT`, `PATCH` or `DELETE` |
| URL | Must be `https://` (port 443 by default), up to 1000 characters; merge fields allowed, e.g. `https://example.com/zuora/{{DataSource.Account.Id}}` |
| Body | The merge fields selected on the template (custom request body); nothing if empty |
| Auth | `Authorization: Basic base64(username:password)` when the template uses Username/Password |
| Headers | Zuora adds `Zuora-Request-Id`, `X-Amzn-Trace-Id` and `Zuora-Notification-Id`, plus any custom headers on the template |

`Zuora-Request-Id` changes on every attempt (including retries after a timeout).
`Zuora-Notification-Id` stays the same across retries of one notification, so it is a good
idempotency key.

## Event Payload Structure

**Zuora adds no event field.** The body is only what the template author puts there. The examples
in this skill assume an illustrative JSON body:

```json
{ "event": "PaymentProcessed", "accountId": "2c92c0f8...", "invoiceNumber": "INV00000123" }
```

| Illustrative `event` | Template attached to | Common use |
|----------------------|----------------------|------------|
| `PaymentProcessed` | A payment-processed event | Mark an invoice paid in your system |
| `InvoicePosted` | An invoice-posted event | Send or sync the invoice |

These strings are conventions you write into each template, not names defined by Zuora. Zuora's
guidance is that callout data is non-sensitive, typically an ID, and the receiver then
authenticates back to the Zuora API to fetch the details.

## Delivery, Timeouts and Retries

- **Timeout:** 25 seconds in total (10 s to connect, 15 s for data transfer). It can't be changed.
  Respond fast and do the work asynchronously.
- **Success:** respond with HTTP `200`. Anything else is a failure.
- **Retried** only for response codes `1xx`, `403`, `408`, `429`, `5xx` and negative codes, and
  only if **Retriable** is ticked on the template (default 3 attempts, 30 minutes apart; configurable).
  A `401` or `400` is not retried, so a wrong credential drops that notification.
- **Optional success parsing:** with "Confirm success by parsing response content", a `200` only
  counts if the response is `application/json` with `"success": true`. The examples return
  `{"received": true, "success": true}`.
- **Redirects** (`3xx`) are not followed.
- Notifications are processed in trigger order, but retries and concurrency mean delivery order
  is not guaranteed.

## Full Reference

- [Callout notification overview](https://docs.zuora.com/en/zuora-platform/extensibility/events-and-notifications/notifications/callout-notification-overview)
- [Create a callout template](https://docs.zuora.com/en/zuora-platform/extensibility/events-and-notifications/callout-templates/create-a-callout-template)
