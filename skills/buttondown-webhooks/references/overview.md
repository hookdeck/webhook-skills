# Buttondown Webhooks Overview

## What Are Buttondown Webhooks?

Buttondown is a newsletter publishing platform. Whenever something happens to a newsletter (a subscriber signs up, an email finishes sending, an automation is invoked), Buttondown creates an event, and a webhook delivers it as an HTTP `POST` with a JSON body to your URL. Delivery is at least once and unordered, so make handlers idempotent.

A webhook has a URL, the event types it listens to, and an optional signing key. Create one in the Buttondown app (Events & webhooks) or through the API.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscriber.created` | A new subscriber is created | Add to your CRM, send a welcome |
| `subscriber.confirmed` | A subscriber confirmed their enrollment (without double opt-in, right after `subscriber.created`) | Start onboarding |
| `subscriber.unsubscribed` | A subscriber manually unsubscribed | Sync suppression lists |
| `email.sent` | An email finished its delivery | Cross-post, notify a team |
| `automation.invoked` | An automation is manually invoked (for example by a webhook or API call) | Trigger downstream work |

Other documented events, logged as unhandled by the examples, include `subscriber.paid`, `subscriber.churned`, `subscriber.bounced`, `subscriber.complained`, `subscriber.opened`, `subscriber.clicked`, `subscriber.updated`, `subscriber.tags.changed`, `email.created`, `email.updated`, `email.deleted`, `email.send.started`, `email.status.changed`, `advertising_slot.inquiry`, `advertising_slot.purchased`, `export.completed`, `note.created`, `mention.created`, `date.day.started`, `date.week.started`, `date.month.started`, `date.year.started`, and integration events with the `bigcommerce.`, `memberful.`, `patreon.`, `shopify.` and `stripe.` prefixes. The `date.*` events fire at midnight UTC.

## Event Payload Structure

```json
{
  "event_type": "subscriber.confirmed",
  "data": {
    "newsletter": "13121cd6-0dfc-424c-bb12-988b0a32fcb3",
    "subscriber": "ac79483b-cd28-49c1-982e-8a88e846d7e7"
  }
}
```

`event_type` is top level. `data` carries ids, which you can look up through the Buttondown API; its fields vary by event.

## Delivery and Retries

Only a `2xx` response counts as success; redirects, `4xx`, `5xx` and timeouts fail. A failed delivery is retried up to 5 times, about 5 minutes apart. A webhook that fails on 5 consecutive events is disabled and Buttondown emails you. No response timeout is documented, so respond quickly and do slow work afterwards.

## Full Event Reference

See [Buttondown's webhook documentation](https://docs.buttondown.com/api-webhooks-introduction) for the complete list of event types.
