# UKG Ready Webhooks Overview

## What Are UKG Ready Webhooks?

UKG Ready (formerly Kronos Workforce Ready) Webhook Subscriptions "automatically send
real-time data to an external system when a specific event occurs — such as when an employee is
hired or their account is updated." This covers **UKG Ready only**; UKG Pro webhooks are a
different product (Svix-style signed) and are not covered here.

Webhooks carry no signature. The only credential is the `Authorization` header
(see [verification.md](verification.md)).

## What Events Can I Subscribe To?

You create a subscription in Global Setup and pick a **Category** and **Event**. The docs give
these examples:

| Category / event | Meaning |
|------------------|---------|
| `ACCOUNT_CREATED` | An account is created (for example a new hire) |
| `ACCOUNT_UPDATED` | An account is updated ("Account Updated") |

The docs do not list every category, and the payload has no documented event-type field. Use
one endpoint per subscription, or tell subscriptions apart by the fields you selected.

## Payload

JSON with "the latest values of all selected fields". The webhook fires when any selected
field changes, and fires nothing if none of them change. The available fields are specific to
the selected event, and the shape is shown only in the app (the **Payload Preview** in the
subscription form). The examples in this skill use a clearly illustrative payload such as:

```json
{ "accountId": 1001, "firstName": "Ada", "email": "ada@example.com" }
```

## Delivery, Retries and Logs

- The HTTP method isn't stated in the docs; the examples accept `POST`.
- **Test Connection** only validates reachability; it sends no payload.
- Every webhook is logged: My Reports > System Reports > System Utilities > Webhook Events Log.
- Failed events are retried automatically each night, up to 5 attempts in all (manual retries
  from **Retry Failed Events** count too). The docs say certain HTTP response codes are ignored
  by the retry job. Make handlers idempotent.

## Full Reference

See the Webhooks User Guide: https://secure.saashr.com/ta/docs/rest/public/Webhooks_User_Guide.html
