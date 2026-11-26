# Payt Webhooks Overview

## What Are Payt Webhooks?

Payt (paytsoftware.com) is accounts-receivable and credit-management software. Webhooks are switched on per
administration, all at once or per event, and report changes to invoices, debtors, debt-collection cases,
payment plans and PSP (payment service provider) transactions. Each delivery is a `POST` with a JSON body.

## Payload Structure

```json
{
  "event": {
    "event_name": "invoice_created",
    "context": { "id": 1, "resource_type": "invoice", "invoice_number": "2011-1", "amount_open": "1000", "currency_code": "EUR", "debtor": { "id": 1, "debtor_code": "1" } },
    "event_time": "2018-06-05T09:48:55.314159Z"
  }
}
```

Dispatch on `event.event_name`. `context` is the object the event is about; its `resource_type` says
what it is (`invoice`, `credit_case`, `bundled_reminder`, ...). Most contexts carry `debtor` and `administration`.

## Event Types

### Invoices

| Event | Triggered when |
|-------|----------------|
| `invoice_created` | An invoice is imported for the first time |
| `invoice_paid` | The open amount reaches zero |
| `invoice_closed` | The invoice is both sent and paid |
| `invoice_reopened` | The invoice is no longer paid |
| `invoice_payment_created` | The amount the debtor must pay changes (payment, administration, interest or collection costs) |
| `invoice_paused` / `invoice_resumed` | The invoice flow is paused by the user / resumed |
| `invoice_blocked` | The invoice flow is blocked for some reason |
| `invoice_step_performed` | An invoice step is performed |
| `invoice_call_reminder_performed` | A call reminder is performed |
| `invoice_to_debt_collection` | The invoice is marked ready for debt collection |
| `invoice_new_comment` | A new reaction on an invoice |
| `invoice_email_bounced` / `invoice_letter_returned` / `invoice_sms_failed` / `invoice_ubl_failed` | Sending the invoice by email, post, SMS or UBL failed |
| `incoming_ubl_received` | An incoming invoice UBL is received |

### Debt collection cases

| Event | Triggered when |
|-------|----------------|
| `case_created` | A debt collection case is created |
| `case_paid` | The case is fully paid |
| `case_invoice_amount_paid` | All invoices in the case are paid, but not the collection costs or interest |
| `case_reopened` | The case is no longer closed |
| `case_step_performed` | A case step is performed (`name`: `summons`, `summons_reminder`, `second_summons`, `second_summons_reminder`, `notice_of_default`, `prejudiciary`) |
| `case_to_bailiff` | The case is forwarded to a bailiff |
| `case_new_comment` | A new reaction on a case |
| `case_email_bounced` / `case_letter_returned` | Sending the case by email or post failed |

### Reminders, debtors and communication

| Event | Triggered when |
|-------|----------------|
| `bundled_reminder_sent` | A bundled reminder is sent |
| `bundled_reminder_invoice_performed` | An invoice is mentioned in a bundled reminder |
| `bundled_reminder_email_bounced` / `bundled_reminder_letter_returned` | Sending a bundled reminder by email or post failed |
| `credit_limit_exceeded` | A debtor's open amounts exceed the credit limit |
| `debtor_new_comment` | A new reaction on a debtor |
| `debtor_email_address_provided` / `debtor_email_address_removed` | An email address was added to / removed from a debtor |
| `email_bounced` | An email sent to a debtor bounced (any type) |
| `label_added` / `label_removed` | A label was added to or removed from a debtor, invoice or case |
| `message_created` | A message was created (by the debtor, a user or automatically) |
| `note_created` | An internal note was created |
| `todo_list_item_created` / `todo_list_item_updated` / `todo_list_item_deleted` | A task was created, updated or deleted |

### Payment plans and PSP

| Event | Triggered when |
|-------|----------------|
| `payment_plan_created` / `payment_plan_updated` / `payment_plan_deactivated` / `payment_plan_finished` | A payment plan changes (same payload, only `event_name` differs) |
| `payment_plan_term_expired` | A payment plan term expired |
| `psp_mandate_created` / `psp_mandate_revoked` | A PSP mandate is signed or revoked |
| `psp_transaction_successful` | A new PSP transaction is registered |
| `psp_transaction_charged_back` | A PSP transaction received a chargeback |
| `psp_transaction_refunded` | A PSP transaction is (partially) refunded |

### Creditworthiness

| Event | Triggered when |
|-------|----------------|
| `creditworthiness_changed` | Creditworthiness information changed (only when monitoring is enabled for the administration) |

## Delivery and Retries

- Any `2xx` within 10 seconds counts as delivered. A timeout or any other status is a failed attempt.
- Up to 10 retries at increasing intervals, spread over roughly 4 days and 16 hours. Frequent failures deactivate the webhook and Payt emails the webhook's developer addresses; you reactivate it yourself. While the webhook is active, failed requests can be retried manually from its settings page.
- Events are sent asynchronously, so order is not guaranteed: `invoice_closed` can arrive before `invoice_created`.
- Events can be delivered more than once. The `X-PAYT-DELIVERY` header (a UUID) stays the same when a delivery is retried, so Payt says to use it to detect duplicates. Don't key on `event_time`: Payt says simultaneous events most likely share a timestamp, and one action can send several `invoice_payment_created` events for the same invoice.
- If an event references an object you don't have yet, Payt suggests answering `404` so the event is retried later.

## Full Event Reference

See [Payt's events documentation](https://docs.paytsoftware.com/webhooks/events) and the [triggers page](https://docs.paytsoftware.com/webhooks/triggers) for what causes each event.
