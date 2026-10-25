# Wiza Webhooks Overview

## What Are Wiza Webhooks?

Wiza is a B2B contact data platform. Its API runs contact lookups (individual reveals)
asynchronously, and when one completes Wiza POSTs the result to your webhook URL. The request body
is JSON and is **not signed**; it carries an `x-auth-key` header with the SHA-256 hash of your API
key instead (see [verification.md](verification.md)).

## Event Types

| `type` | `status.code` | Triggered When | Common Use Cases |
|--------|---------------|----------------|------------------|
| `individual_reveal` | `200` | A reveal finishes | Store emails and profile data, update the CRM |
| `individual_reveal` | `400` | A reveal fails | Mark the lookup failed, alert, retry |

`individual_reveal` is the only `type` this skill handles. Unknown types are acknowledged with `200`.

## Event Payload Structure

```json
{
  "status": { "code": 200, "message": "Single reveal finished" },
  "type": "individual_reveal",
  "data": { "id": 123456, "status": "finished", "is_complete": true, "email": "stephen@wiza.co" }
}
```

(Abridged from the docs' Individual Reveal payload.)

- `status.code`: `200` for finished, `400` for failed; `status.message` describes it
- `type`: `individual_reveal`
- `data`: the reveal result, the same fields the GET endpoint returns; `data.id` is the reveal's id

There is no top-level `id`.

## Delivery

- Wiza sends `POST` requests with a JSON body.
- A non-2xx response is retried up to 3 times, so make handlers idempotent (key on `data.id`).
- The webhook URL is the default set in **Settings > API**, or a per-request `callback_url`.

## Full Event Reference

See [Wiza's webhook documentation](https://docs.wiza.co/using-the-api/webhooks).
