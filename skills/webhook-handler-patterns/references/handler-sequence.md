# Webhook Handler Sequence

Every webhook handler should follow the same order of operations. Getting the sequence wrong leads to verification failures, security issues, or duplicate processing.

## The Three Stages

Do these in order:

1. **Verify signature first** — Validate the request is from the provider before trusting any payload.
2. **Parse payload second** — Only after verification, parse or construct the event object.
3. **Handle idempotently third** — Process the event using the provider’s event ID to avoid duplicates.

Do not parse the body before verifying. Do not process the event before checking idempotency.

## Why Order Matters

### Verify before parse

Signature verification uses the **raw request body**. If you parse JSON first (e.g. `express.json()` or `request.json()`), the body is consumed or transformed and verification will fail. Provider skills and framework guides cover how to get the raw body per stack (e.g. `express.raw()`, `request.text()`, `await request.body()`).

Verifying first also prevents malicious or malformed payloads from being treated as valid events.

### Parse after verify

Once the signature is valid, it’s safe to parse the payload (or use the provider SDK’s construct method, which often does both). You then have a typed or structured event to work with.

### Handle idempotently

Providers deliver at least once. Retries and replays mean the same event can arrive more than once. Check whether you’ve already processed this event ID before performing side effects. See [idempotency.md](idempotency.md) for patterns.

## Skeleton (any framework)

```text
1. Read raw body (do not parse yet)
2. Get signature header
3. Verify signature → if invalid, return 4xx and stop
4. Parse/construct event from verified body
5. Get event ID from payload or headers
6. If event ID already processed → return 2xx (acknowledge duplicate)
7. Process event (side effects)
8. Record event ID as processed
9. Return 2xx
```

## Where to get details

- **Stage 1 (verify):** Use the provider skill for your source (e.g. [Stripe](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks), [Shopify](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks), [GitHub](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks)). Each has a `verification.md` with algorithm, headers, and raw-body requirements.
- **Stage 2 (parse):** Handled in the same provider examples (e.g. `stripe.webhooks.constructEvent()` returns a parsed event).
- **Stage 3 (idempotent handle):** [idempotency.md](idempotency.md) — event IDs, dedup table, and return behavior for duplicates.

For framework-specific raw body and middleware order, see [frameworks/express.md](frameworks/express.md), [frameworks/nextjs.md](frameworks/nextjs.md), and [frameworks/fastapi.md](frameworks/fastapi.md).
