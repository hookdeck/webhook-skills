# Marqeta Webhooks Overview

## What Marqeta Sends

A JSON `POST` to the webhook's URL with a Basic auth header, any custom headers you configured (up to three), and `X-Marqeta-Signature` when the webhook has a secret.

## Batched Payloads

Marqeta batches notifications of the same type, up to 10 per message, under one key:

| Key | Notifications |
|---|---|
| `transactions` | Authorizations, clearings, refunds, GPA credits and debits, and other transaction events |
| `cardtransitions` | Card state changes (`cardtransition.*`) |
| `usertransitions` / `businesstransitions` | Account holder state changes |
| `chargebacktransitions` | Dispute state changes |
| `digitalwallettokentransitions` | Digital wallet token state changes |
| `cardactions` | Card actions such as PIN changes |
| `directdeposittransitions` | Direct deposit state changes |
| `pings` | The health check: `[{"token":"marqeta","payload":"healthcheck"}]` |

Marqeta identifies each transaction by a unique transaction token and each event by a unique event token: dedupe on the notification's `token`. Notifications can arrive out of order: use `created_time`.

Stand-in processing (STIP) sends informative transaction notifications with `standin_by` and `standin_reason`. They don't change the cardholder's balance.

## Event Types

Subscribe with the webhook's `events` array: a single type, `<base>.*` for a base type (not subcategories), or `*` for all. The wildcard doesn't include L2 and L3 card data events. See Marqeta's [Event Types](https://www.marqeta.com/docs/core-api/event-types).

## Retries

From the docs:

- Anything other than HTTP **200** is a messaging failure. Return exactly `200`.
- Marqeta resends a failed message 10 times, with backoff in powers of four (4 s, 16 s, 64 s, ...) up to an interval of just over 12 days.
- A failed ping isn't resent.
- Duplicates are possible, so make processing idempotent.

Marqeta doesn't publish fixed source IP addresses. Ask your Marqeta representative if you need an allowlist.
