# Xtremepush Webhooks Overview

## What Are Xtremepush Webhooks?

Xtremepush is a customer engagement and messaging platform. Its Webhooks integration notifies an endpoint of campaign message events per recipient (send, delivery, open, unsubscribe, failure, and so on), plus subscription changes. You choose the events and the authentication type when you add the webhook in the Xtremepush dashboard.

The docs don't name the HTTP method, so accept any common one (the examples take GET, POST, PUT, PATCH and DELETE) and verify the signature before anything else.

## Which Events Does the Handler Dispatch On?

Dispatch on the body's top-level `event` field. These are the event types documented for the default body:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message_send` | A campaign message is sent to a recipient | Delivery funnels, send logs |
| `message_delivery` | A campaign message is delivered to a recipient | Delivery confirmation, engagement analytics |

Xtremepush reports other message and subscription activity too, so keep a default branch that logs and acknowledges unknown events. The examples handle `message_send` and `message_delivery`.

## Payload Structure

The default body has three top-level fields:

```json
{
  "event": "message_send",
  "time": 1689343556,
  "properties": {}
}
```

- `event`: the event type string
- `time`: when the event happened
- `properties`: the event's details

**Each message event's payload can be edited per connection ("Custom format")**, so a customised connection may rename or drop `event`. The default format is what the examples and this skill record. Treat every parsed field as untrusted: check that the body is an object and that `event` is a string and `properties` an object before reading into them, so an unexpected shape is ignored rather than raising a 500.

## Delivery

Respond within 5 seconds or the delivery may fail. No retry policy is documented; "Notify on error" emails your team periodically while failures continue. Return `200` as soon as the signature is verified and do slow work asynchronously.

## Full Event Reference

For the complete list of events and fields, see [Xtremepush's webhooks documentation](https://docs.xtremepush.com/docs/webhooks-integration).
