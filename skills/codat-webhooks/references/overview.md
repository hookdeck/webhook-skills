# Codat Webhooks Overview

## What Are Codat Webhooks?

[Codat](https://www.codat.io) is a business data API (accounting, banking and commerce data). Its webhooks notify your systems when companies and connections are created or connected, when data reads finish, and when writes succeed.

Codat delivers webhooks through [Svix](https://www.svix.com), using the Standard Webhooks header names `webhook-id`, `webhook-timestamp` and `webhook-signature` (not `svix-*`). You manage endpoints (called consumers) in the Codat Portal under **Monitor > Webhooks > Events**.

This skill covers the current Svix-delivered webhooks. Codat's legacy rule-based webhooks are deprecated and not covered.

## Which Codat Webhook Events Are There?

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `company.created` | A company is created | Provision records for the new company |
| `connection.created` | A data connection is created for a company | Track onboarding progress |
| `connection.connected` | A connection becomes connected to the data source | Kick off the first data read |
| `read.completed` | A data read finishes | Fetch fresh data, update dashboards |
| `write.successful` | A write to the data source succeeds | Mark the push as complete in your system |

For the full list of event types, see [Codat's event types](https://docs.codat.io/using-the-api/webhooks/event-types).

## What Does a Codat Webhook Payload Look Like?

Each delivery is a JSON body describing one event, with the event type and event-specific details. The examples in this skill read the type from `eventType` (falling back to `type`) and the details from `payload`. Check the payload shape for each event type against [Codat's event types](https://docs.codat.io/using-the-api/webhooks/event-types) before relying on specific fields.

## Delivery Semantics

- `webhook-id` is the same on every delivery attempt of a message, so use it for idempotency.
- Retries are re-signed with a fresh `webhook-timestamp`.
- Respond with a `2xx` quickly and process asynchronously. Svix retries failed deliveries.

## Full Event Reference

- [Codat webhooks overview](https://docs.codat.io/using-the-api/webhooks/overview)
- [Event types](https://docs.codat.io/using-the-api/webhooks/event-types)
