# Zift Signature Verification (There Is None) & Acknowledgement

## Why There Is No Signature to Verify

Zift notifications carry **no HMAC and no signature header**. This is confirmed
from the full rendered documentation, not merely "couldn't find it":

- No `X-Zift-Signature`, `webhook-signature`, or any provider signature header.
- **Not Standard Webhooks** — there is no `webhook-id` / `webhook-timestamp` /
  `webhook-signature` trio.
- No Basic Auth, bearer token, or API key on the delivery request.
- There is no signing secret to configure anywhere.

So there is **nothing to cryptographically verify**. Do not fabricate an HMAC
check — it would be checking a header Zift never sends.

> A tunnel/gateway in front of your endpoint (e.g. Hookdeck's Zift source)
> cannot cryptographically verify these deliveries either — there is no secret
> to verify against. Treat them as **unverified** and secure the transport
> instead.

## How to Secure an Endpoint With No Signature

Authenticity relies on the transport and endpoint secrecy:

1. **HTTPS only (required).** Serve the endpoint over TLS so the body cannot be
   read or tampered with in transit. Reject plain HTTP.
2. **Endpoint-URL secrecy.** Treat the URL path as a shared secret — use a long,
   unguessable path and don't log or expose it publicly.
3. **IP allowlisting (recommended).** Restrict inbound traffic to Zift's egress
   IP ranges at your load balancer / firewall / WAF. Request the ranges from
   Zift support. This is enforced in your infrastructure, not app code — the
   `ZIFT_ALLOWED_IPS` variable in the examples is informational.

Because there is no body signature, the raw request bytes are **not**
security-critical, so **ordinary JSON parsing is fine** (unlike HMAC providers,
where you must verify the raw body before parsing).

## The Acknowledgement Contract (the "Verification" That Matters)

With no signature, the one protocol requirement Zift enforces is the
**acknowledgement**. To confirm receipt, your endpoint MUST return a JSON body
echoing the received `notificationId`:

```json
{ "notificationId": 272638 }
```

- Zift accepts the id as an **int** (`272638`) or a **string** (`"272638"`) —
  echo it back in the form you received it (pass the value straight through).
- The **response body is the acknowledgement.** `200 OK`, an empty body, or
  `{"received": true}` are all treated as *not acknowledged*.

### Node / Express / Next.js

```javascript
// Echo the notificationId straight through — preserves int-vs-string.
function ackBody(payload) {
  return { notificationId: payload.notificationId };
}
```

### Python / FastAPI

```python
def ack_body(payload: dict) -> dict:
    # Echo the notificationId straight through — preserves int-vs-string.
    return {"notificationId": payload.get("notificationId")}
```

## Retry Behaviour on Missing Acknowledgement

If Zift does not receive the `{"notificationId": ...}` acknowledgement, it
retries at **+5 min, +15 min, +60 min, +24 h**, then marks the notification
**`Failed`** with no further redelivery. Retries mean the same event may arrive
more than once — dedupe on `notificationId` to stay idempotent.

## Common Gotchas

- **Returning "OK" instead of the id.** The most common mistake — a `200` with a
  non-acknowledgement body still triggers retries. You must echo
  `notificationId`.
- **Coercing the id type.** Don't force the id to a number or string; pass
  through what you received so the echoed value matches.
- **Looking for a signature header.** There isn't one — don't block deliveries
  waiting for `X-Zift-Signature`.
- **Missing `notificationId` in the payload.** Without it you can't acknowledge;
  return `400` so the misdelivery is visible rather than silently 200-ing.
- **Non-idempotent handling.** A retry can reprocess a chargeback or payment;
  dedupe first.

## Debugging Acknowledgement Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Zift keeps retrying / marks `Failed` | Response body isn't `{"notificationId": ...}` | Echo the exact received `notificationId` in a JSON body |
| Duplicate processing | Retries after a slow/failed ack | Dedupe on `notificationId` before side effects |
| Deliveries rejected | Waiting for a signature header | Remove any HMAC check — Zift sends none |
| Some events not arriving | Trigger not enabled for your integrator account | Ask Zift support to enable the trigger (see [setup.md](setup.md)) |
