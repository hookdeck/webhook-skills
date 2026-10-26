# YouCanBookMe Webhooks Overview

## What Are YouCanBookMe Webhooks?

YouCanBookMe sends webhooks through **notification actions**. You add a webhook action to a
booking page's notifications and choose the trigger: a booking is made, rescheduled or cancelled,
a reminder, a follow-up, or a no-show. The action sends an HTTP request to a URL you supply, with a
method, request headers and body you configure. Which plans include webhooks differs between help
articles, so check the current plan.

Requests are **unsigned**. Authenticate them with a secret Request Header you add yourself. See
[verification.md](verification.md).

> The triggers and methods above match YouCanBookMe's
> [More information on Webhooks](https://support.youcanbook.me/hc/en-us/articles/17321777608727-More-information-on-Webhooks)
> article. On plans, the help articles conflict:
> [Passing data to other systems](https://support.youcanbook.me/hc/en-us/articles/17321754662807-Passing-data-to-other-systems)
> says "This feature is available on All plans", while More information on Webhooks says "This
> feature is available on the Professional and Teams plans".

## Triggers and the `event` Field

Nothing in the request identifies the trigger unless your body template does. This skill's
examples assume you add an `event` field with one of these values (illustrative, chosen by you):

| `event` | Notification action | Common Use Cases |
|---------|---------------------|------------------|
| `booking_made` | A booking is made | Create a CRM contact, calendar entry or ticket |
| `booking_rescheduled` | A booking is rescheduled | Move the matching record |
| `booking_cancelled` | A booking is cancelled | Cancel downstream work, free a resource |
| `reminder` | A reminder fires | Send an SMS or chat nudge |
| `follow_up` | A follow-up fires | Trigger a survey or thank-you |
| `no_show` | A no-show is recorded | Flag the contact, offer rebooking |

## Payload Structure

The body is whatever you write, typically JSON with shorthand codes that YouCanBookMe replaces
with booking data:

```json
{
  "event": "booking_made",
  "email": "{EMAIL}",
  "start": "{START-ISO}"
}
```

Check the help articles for the full list of shorthand codes. The method is also yours to pick
(`POST`, `PUT`, `PATCH`, `DELETE` or `GET`), and a `GET` has no body, so handlers must accept
all of them and tolerate an empty body.

## Full Reference

See the [YouCanBookMe webhook documentation](https://support.youcanbook.me/hc/en-us/articles/17321777608727-More-information-on-Webhooks).
