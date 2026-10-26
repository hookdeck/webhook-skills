# Clemta Webhooks Overview

## What Are Clemta Webhooks?

Clemta is a US company-formation and compliance API for partners. When something happens to a company you created (formation progress, an EIN, a tax filing, a service order, a requirement for your customer, a published document, a deadline, an invoice), Clemta POSTs a JSON event to every endpoint you registered for it. Webhooks are the push counterpart to polling `GET /events`: both read the same event stream, so an event never exists as a delivery only.

Deliveries are signed per the [Standard Webhooks](https://www.standardwebhooks.com) specification with a per-endpoint `whsec_` secret.

## Event Payload Structure

```json
{
  "type": "company.status.changed",
  "data": {
    "object": { "object": "company", "id": "cmp_...", "status": "active" }
  }
}
```

- `type` is the event name; branch on it.
- `data.object` is the affected resource, in the shape it has on the API. Its own `object` field names the resource kind (for example `company`, `tax_filing`, `service_order`, `requirement`, `file`, `invoice`), so one handler can switch on `type` and read `data.object`.
- The payload is rendered at the API version pinned on the endpoint, or the workspace's webhook version when none is pinned.
- The event id is the `webhook-id` header, stable across retries. Use it as the idempotency key.

## Common Event Types

27 types are documented; the list may not be exhaustive, so ignore types you don't recognise.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `company.created` | A company you created was accepted | Store the company id |
| `company.status.changed` | A company moved between `in_progress`, `active` and `cancelled` | Update your customer's status; branch on status |
| `company.verified` | Every owner's identity document is in (once, before incorporation) | Tell the customer verification is done |
| `company.incorporated` | The state accepted the filing (once) | Mark the company as formed |
| `company.onboarding.completed` | A `pre_existing` company finished onboarding (once) | Counterpart of `company.incorporated` for companies formed elsewhere |
| `company.name.changed` | The legal name changed, typically to clear a state conflict | Refresh the stored name |
| `company.ein.assigned` | The IRS issued the EIN (once); payload carries `ein` | Store the EIN |
| `company.document.received` | An owner uploaded their identity document | Show progress |
| `company.entitlements.changed` | A tax-filing credit was added or consumed | Update remaining filings |
| `company.updated` | Entity type, state, name suffix, industry, shares, formation date, address or owners changed | Refresh the company record |
| `company.dissolved` | A dissolution order completed (once) | Close the account; renewals stop and open requirements close |
| `tax_filing.created` | A federal or state filing was opened (one right consumed) | Track the filing |
| `tax_filing.status.changed` | A filing's `status` or `progress` moved | Show filing progress |
| `service_order.status.changed` | An order was created or moved through fulfilment, including cancellation | Update the order; branch on status |
| `service_order.completed` | The order reached its final step; fires again if it reopens and completes once more | Deliver the result |
| `service_order.updated` | Options or price changed without your call (a reversed upgrade is credited back) | Refresh the order |
| `service_order.quoted` | A `quote_pending` order was priced | Accept before `quote.expires_at`; nothing bills until you do |
| `service_order.renewal_canceled` | Your renewal-cancellation request was approved | Show the `renewal_ends_at` date |
| `service_order.renewal_cancel_denied` | Your renewal-cancellation request was denied | Tell the customer it keeps renewing |
| `requirement.created` | Something is needed from you or your customer | Prompt the customer |
| `requirement.fulfilled` | A requirement was resolved; payload carries its response | Clear the task |
| `requirement.canceled` | An open requirement closed unfulfilled (declined signature, withdrawn ask); `cancel_reason` says why | Clear or escalate the task |
| `requirement.signature.viewed` | A signer opened a signature document (once per signer) | Progress only |
| `requirement.signature.signed` | A signer signed (once per signer) | Progress; `requirement.fulfilled` follows when the last signs |
| `file.created` | A document was published on one of your companies | Download it from the file's content endpoint |
| `calendar.reminder` | A compliance deadline is approaching (once per reminder point); payload has `due_at` and `remind_at` | Relay under your own brand; Clemta sends no mail to your customer |
| `invoice.finalized` | A month-end invoice was issued | Reconcile billing |

## Delivery Behaviour

- Respond `2xx` to acknowledge. Anything else, a timeout, or a `3xx` (redirects are not followed) is a failure.
- Failed deliveries are retried up to 20 times with jittered exponential backoff, 15 seconds to 6 hours apart.
- Events are delivered in order per endpoint on a best-effort basis, one at a time; an event that keeps failing is set aside after a few attempts. Don't rely on order, and deduplicate on `webhook-id`.
- `Retry-After` on `429` or `503` pushes the next attempt back.
- `410 Gone` disables the endpoint. An endpoint failing continuously for three days is disabled automatically; re-enabling resumes the queued deliveries.
- Missed events can be replayed from `GET /events`, which never expires events.

## Full Event Reference

For the complete list of events, see [Clemta's webhook documentation](https://docs.clemta.com/partner/webhooks).
