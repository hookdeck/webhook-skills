# Setting Up BaseLinker Webhooks

## Start Here: There Is No Webhook Page

**BaseLinker publishes no webhook documentation.** No endpoint registry, no
event-subscription list, no signing-secret screen and no "test webhook" button is
documented anywhere, in either the English or Polish Help Centre. The documented
API (`api.baselinker.com`, ~195 methods over `connector.php`) is request/response
only; nothing in it registers a callback URL.

> **Scope of that claim.** It is about the *documentation*, which was searched
> exhaustively. It is **not** a claim about what the panel contains — this skill
> was written without account access, so the panel was never inspected. If your
> panel does expose a webhook or HTTP-request feature, it is undocumented, and
> what you find there beats anything below.

So setup is not "paste your URL into the webhooks page". It is:

1. Prepare a receiver that speaks **HTTP HEAD** and reads **query params**.
2. Get BaseLinker to call that URL. **This is the one step this skill cannot
   fully specify** — see step 2 below.
3. Because there is **no signature**, protect the endpoint by other means.

## Prerequisites

- A BaseLinker / Base.com account with access to **Automatic Actions**.
- A publicly reachable **HTTPS** endpoint that answers `HEAD` (not just `GET` or
  `POST`).
- A BaseLinker **API token** (Account settings → API) if you want to fetch order
  detail after a callback. This token is sent as the `X-BLToken` **request**
  header on *your* outbound API calls — it is **not** a webhook signature and
  never arrives on an inbound delivery.

## 1. Prepare the Receiver

Your endpoint must:

- Register a **HEAD** route — `app.head(...)` in Express, an exported `HEAD`
  function in a Next.js App Router route handler, `@app.head(...)` in FastAPI.
  (Express's `app.get()` will also answer HEAD, but register `app.head()`
  explicitly so the intent survives refactoring.)
- **Not** mount a JSON body parser on the route. There is no body.
- Read everything from the parsed query string. Observed params are `order_id`
  (e.g. `42`) and `state` (e.g. `packed`) — observed examples, not a documented or
  exhaustive list, so guard for absence and coerce numerics explicitly.
- Reply with a **bare bodyless `200`**
  ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)).

See [examples/express/](../examples/express/),
[examples/nextjs/](../examples/nextjs/), and
[examples/fastapi/](../examples/fastapi/) for runnable receivers.

## 2. Point BaseLinker at the URL

> **The unresolved step.** BaseLinker documents **no action that calls a URL** —
> not in the Automatic Actions reference, not anywhere in either Help Centre. So
> this section cannot tell you which control to click, and does not pretend to.
> What is established is only the *shape* of what arrives (HEAD + query string). Confirm in your own panel
> that an outbound-HTTP action exists before building against this; if it does
> not, the callback is not available to your account and `getJournalList` polling
> (step 5) is the supported path.

Automatic Actions is the only subsystem where an order state change can trigger
anything, so it is where such an action would live. Attach it to the system
event(s) you care about —
order fetched, order paid, order confirmed, status set, shipment created/deleted,
courier parcel status changed, invoice/receipt issued, returns created/accepted/
completed/rejected, PickPack collecting/packing, marketplace cancellation.

> Those event names are **panel UI labels**, not wire values. They tell you which
> product changes can trigger automation; they are **not** strings that appear in
> the callback and must not become constants in your handler.

Put the whole payload you want in the URL's query string, since that is the only
channel available on a HEAD request:

```
https://your-app.example.com/webhooks/baselinker?order_id=[order_id]&state=packed
```

The `[order_id]` form is **illustrative**: BaseLinker documents no URL-calling
action and no placeholder/macro syntax, so substitute whatever placeholder your
panel actually offers (or hard-code the value if it offers none).

## 3. Secure the Endpoint (BaseLinker Won't)

There is **no signature, no secret, and no handshake** — see
[verification.md](verification.md). Compensate with:

- **URL secrecy** — a long, unguessable path segment
  (`/webhooks/baselinker/8f3c9a…`). Don't log full URLs.
- **Network controls** — HTTPS only, a WAF or rate limit in front of the route,
  and an IP allowlist if you can establish one for your account (BaseLinker
  publishes none).
- **Your own URL token** — append a random query param to the URL you register
  (`&token=<random>`) and compare it timing-safely in the handler. This is *your*
  secret coming back to you, not provider authentication, and it is visible in the
  URL and in any proxy logs. The examples support it via `BASELINKER_URL_TOKEN`.

## 4. Store Your API Token

```bash
BASELINKER_API_TOKEN=your_api_token   # X-BLToken request header, for getOrders
BASELINKER_URL_TOKEN=                 # optional, your own URL query token
```

Fetch detail after acknowledging the callback:

```bash
curl -X POST https://api.baselinker.com/connector.php \
  -H 'X-BLToken: YOUR_API_TOKEN' \
  -d 'method=getOrders' \
  --data-urlencode 'parameters={"order_id":42}'
```

Rate limit: 100 requests/minute.

## 5. Keep Polling as the Source of Truth

The callback is undocumented and its coverage is unspecified, so treat it as a
low-latency hint and keep `getJournalList` (cursor: `last_log_id`, last 3 days,
**must be enabled in the account's API settings**) as the complete change feed.
See [overview.md](overview.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 baselinker --path /webhooks/baselinker
```

No account required — the CLI creates a guest account on first run and gives you a
public HTTPS URL plus a UI to inspect and replay deliveries. Use `8000` instead of
`3000` for the FastAPI example.

Simulate a delivery against a local receiver with `curl -I` (which sends HEAD):

```bash
curl -I 'http://localhost:3000/webhooks/baselinker?order_id=42&state=packed'
```

## Hookdeck Source Configuration

When you create a **Baselinker** Source in Hookdeck:

- **HEAD** must be allowed on the source ([custom methods](https://hookdeck.com/docs/sources#custom-methods)).
- Its auth schema (`SourceConfigBaselinkerAuth`) is
  `{ "properties": {}, "additionalProperties": false }` — it accepts **no secret
  at all**, because there is nothing to verify.
- Since a HEAD response cannot carry a body, Hookdeck returns the request id in
  the **`x-hookdeck-request-id` response header**. Use it to correlate a delivery with its
  dashboard entry.

## Testing

- Trigger the underlying change in BaseLinker (move an order to the status your
  automatic action watches) and confirm a HEAD lands on your endpoint.
- Replay a captured request from the Hookdeck dashboard/CLI to re-run your handler
  without touching real orders.
- If nothing arrives, remember there is no delivery-log page in BaseLinker to
  check — put a proxy (Hookdeck CLI or dashboard) in front so you can see the raw
  request.

## Full Documentation

- [BaseLinker API reference](https://api.baselinker.com/)
- [Automatic actions — system events for orders](https://base.com/en-EN/help/knowledgebase/automatic-actions-system-events-for-orders/)
