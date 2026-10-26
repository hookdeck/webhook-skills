# Make Webhooks Overview

## What Are Make Webhooks?

[Make](https://www.make.com) (formerly Integromat) is a visual automation platform. Its
**HTTP > Make a request** module can call any HTTPS URL, which makes it the usual way to push
data from a Make scenario into your own application: "when a row is added / an order arrives /
a schedule fires, send it to my API".

This skill covers the receiving side of that request. (Make's own **Webhooks** app, with
custom webhooks, is the opposite direction: other services calling into Make.)

Things that differ from provider webhooks such as Stripe or GitHub:

- **No signature.** Make doesn't sign outgoing requests. You authenticate them with a secret
  sent through an **API key** keychain on the module. See [verification.md](verification.md).
- **No built-in event types.** The method, headers and body are whatever you configure in the
  module. Add an `event` field to the body so one endpoint can route several scenarios.
- **Method is your choice.** The module supports GET, HEAD, POST, PUT, PATCH, DELETE and
  OPTIONS, so a handler shouldn't assume POST, and a GET has no body.
- **HTTPS only.** Make rejects plain HTTP and self-signed certificates.
- **One request per bundle.** The module runs once for each bundle it receives, so an
  upstream module that outputs 50 bundles sends 50 requests.

## Suggested Payload Shape

Set **Body content type** to `application/json` and **Body input method** to `JSON string`
(or a data structure):

```json
{
  "event": "order.created",
  "id": "{{1.id}}",
  "data": {
    "order_id": "{{1.orderId}}",
    "email": "{{1.email}}"
  }
}
```

| Field | Purpose |
|-------|---------|
| `event` | Routes the request to a handler. You choose the names. |
| `id` | Unique per request; use it as an idempotency key. |
| `data` | The values mapped from earlier modules. |

## Example Event Types

These are the names the example handlers use. They are a convention, not Make-defined events;
rename them to fit your scenarios.

| Event | Sent When | Common Use Cases |
|-------|-----------|------------------|
| `order.created` | A scenario sees a new order | Fulfilment, invoicing |
| `lead.created` | A scenario captures a new lead | Add to CRM, notify sales |
| `scenario.completed` | A long-running scenario finishes | Mark a job done, notify the user |
| `scenario.failed` | An error-handler route reports a failure | Alerting, incident tracking |

## Full Reference

- [HTTP app](https://apps.make.com/http)
- [API key authentication type](https://apps.make.com/api-key-authentication-type)
