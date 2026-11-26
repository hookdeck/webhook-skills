# BaseLinker Webhooks Overview

## What Are BaseLinker Webhooks?

**BaseLinker** (rebranded **Base.com**) is a Polish multichannel e-commerce
platform: order management, warehouse and inventory, and integrations with
marketplaces, online stores and couriers.

**BaseLinker publishes no webhook documentation whatsoever.** This is the single
most important fact about this integration, and everything below is written
around it:

- The public API at [api.baselinker.com](https://api.baselinker.com/) is strictly
  **request/response** — ~195 methods, all POSTed to a single `connector.php`
  endpoint. There is no `addWebhook` / `setWebhook` / `subscribe` method.
- Change tracking in the documented API is done by **polling**:
  `getJournalList` (orders), `getOrderReturnJournalList` (returns),
  `getInventoryProductLogs` (catalogue).
- Neither the **English** nor the **Polish** help centre documents an outbound
  webhook, a callback URL, or a "send HTTP request" automatic action.

An outbound callback nevertheless exists — it is simply **undocumented**. What is
known about it comes from observed traffic, not from a specification.

## The Wire Format (observed)

Every delivery is an **HTTP `HEAD` request**. A HEAD request has **no body** by
definition, so the entire payload rides in the **query string**:

```
HEAD /webhooks/baselinker?order_id=42&state=packed HTTP/1.1
Host: your-app.example.com
```

Consequences that drive the whole handler:

- **Never read the body.** `req.body`, `await request.json()`, and
  `await request.body()` yield nothing (or throw). Do not mount a JSON body
  parser on this route.
- **Read the parsed query params instead:** `req.query` (Express),
  `request.nextUrl.searchParams` (Next.js), typed query args or
  `request.query_params` (FastAPI).
- **Query values are always strings.** Coerce numerics explicitly
  (`Number(order_id)` / `int(order_id)`) and validate the result.
- **Respond with a bare, bodyless `200`.**
  [RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2) forbids
  a body on a HEAD response.

## Observed Query Params

| Param | Observed example | Notes |
|-------|------------------|-------|
| `order_id` | `42` | The BaseLinker order identifier. A **string** on the wire. |
| `state` | `packed` | An opaque state string accompanying the change. |

**These two are the only params actually observed**. Treat this table as **observed examples — not a documented
or exhaustive parameter list**:

- **Do not assume either param is present.** Guard for absence.
- **Do not invent additional param names.** No `event`, no `status_id`, no
  `timestamp`, no `order_status_id` — none of those have been observed.
- **There is no event-type discriminator.** `state` is not an event name and not a
  documented enum. Do not build a `switch` over a fixed list of `state` values as
  if it were an event catalogue; handle the value you get and log anything you do
  not recognise.

Because the delivery carries no body, it tells you *that* something changed, not
*what changed*. Fetch the detail from the API (below).

## There Is No Signature

No HMAC, no signature header, no timestamp, no replay window, no shared secret,
and no handshake/challenge step. See
[verification.md](verification.md) for the evidence and for what to do instead.

Note that **`X-BLToken` is BaseLinker's *request* auth header** — the token *you*
send when calling the BaseLinker API. It never appears on an inbound delivery and
is **not** a webhook signature.

## Background: Automatic Actions System Events

BaseLinker's **Automatic Actions** system is where order-side automation is
configured, and its "system events" list is the best available picture of what
state changes exist in the product:

order fetched · order paid · order confirmed · order status set · shipment
created · shipment deleted · courier parcel status changed · invoice issued ·
receipt issued · return created · return accepted · return completed · return
rejected · PickPack collecting · PickPack packing · marketplace cancellation.

> **These are panel UI labels, not confirmed wire values.** They are listed here
> purely as background on what kinds of changes happen in BaseLinker. **Do not
> turn them into event-name constants**, do not map them to `state` values, and
> do not branch on them in a handler. Source:
> [Automatic actions — system events for orders](https://base.com/en-EN/help/knowledgebase/automatic-actions-system-events-for-orders/).

## Fetching Order Detail After a Callback

Acknowledge the HEAD first, then enrich out-of-band using the documented API. All
calls are `POST https://api.baselinker.com/connector.php`, form-encoded, with your
token in the `X-BLToken` header (100 requests/minute):

```bash
curl -X POST https://api.baselinker.com/connector.php \
  -H 'X-BLToken: YOUR_API_TOKEN' \
  -d 'method=getOrders' \
  --data-urlencode 'parameters={"order_id":42}'
```

## Polling Is Still the Complete Surface

Since the callback is undocumented, unauthenticated and of unknown coverage,
**treat it as a low-latency hint, not as a guarantee**. For complete change
tracking, keep polling the documented journals:

| Method | Covers | Cursor |
|--------|--------|--------|
| `getJournalList` | Order events (created, paid, invoice issued, package created, status change, package status change, …) — last 3 days | `last_log_id` |
| `getOrderReturnJournalList` | Return events | `last_log_id` |
| `getInventoryProductLogs` | Catalogue/product changes | date range |

`getJournalList` reports numeric `log_type` values and **must be enabled in the
account's API settings**, otherwise it returns an empty list.

## Idempotency

Deduplicate on `order_id` + `state` (plus your own receive timestamp) so a
redelivered or duplicated HEAD does not action the same change twice. There is no
delivery id in the payload to dedupe on — if you route through Hookdeck, the
`x-hookdeck-request-id` correlation id is available in the response header. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [BaseLinker API reference](https://api.baselinker.com/) — the documented,
  request/response API (no webhook methods)
- [Automatic actions — system events for orders](https://base.com/en-EN/help/knowledgebase/automatic-actions-system-events-for-orders/)
  — panel UI background only
- [RFC 9110 §9.3.2 (HEAD)](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
  — why the response must not carry a body
