# Setting Up Pennylane Webhooks

## Prerequisites

- Pennylane API access with a token that has the `companies:webhook_subscriptions:all` scope (every subscription endpoint needs it), plus the read scope for each event's resource (`customer_invoices`, `dms_files`, `supplier_invoices`)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

Subscriptions are created through the webhook subscription endpoints of the Pennylane API (see [Subscribing and Managing Subscriptions](https://pennylane.readme.io/docs/subscribing-and-managing-subscriptions-new) for the exact path for your API version). The body takes a `callback_url` and an `events` array:

```json
{
  "callback_url": "https://example.com/webhooks/pennylane",
  "events": ["customer_invoice.e_invoicing_status_updated", "dms_file.created", "supplier_invoice.e_invoicing_received"]
}
```

- `callback_url` must be a valid HTTPS URL.
- Unknown event names, a duplicate subscription (same token, same URL, overlapping events) and exceeding the per-token limit return `422`. The same event can go to several different URLs.
- A company-bound token creates company-scoped subscriptions; a client-credentials token creates app-wide ones. See [Subscriber types & company scoping](https://pennylane.readme.io/docs/authorization-new).

## Get Your Signing Secret

The create response includes a `secret`. **Pennylane shows it only once** and it cannot be retrieved later, so store it right away as `PENNYLANE_WEBHOOK_SECRET`. Use it exactly as returned; don't decode it.

## Managing Subscriptions

List / Get show `enabled`, `disabled_at`, `disabled_reason` (`permanent_error`, `repeated_failure`, `manual`), `last_failure_status` and `consecutive_failures`. Update changes the URL or events and sets `enabled` (`false` pauses without an email; `true` re-enables and clears the failure counters). Delete stops deliveries permanently.

## Local Development

```bash
npx hookdeck-cli listen 3000 pennylane --path /webhooks/pennylane
```

Use the Hookdeck URL as the `callback_url`, then trigger a real change (for example create a DMS file) to receive an event.
