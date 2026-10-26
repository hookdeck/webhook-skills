# Tray.io Webhooks Overview

## What Are Tray.io "Webhooks"?

Tray.io (now tray.ai) is an automation platform. It has no built-in outbound webhook with a fixed
format. Instead, a workflow calls your endpoint with the **HTTP Client connector**, which "allows
you to make calls to any third-party API endpoints". Tray's docs note it is often paired with the Webhook Trigger to build connectors for services Tray
doesn't cover; this skill covers the case where *your* server is the receiver.

Because the workflow builder configures the step, you decide:

- the method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- the headers, including the secret header that authenticates the call
- the body (JSON, form data, binary) and the `Content-Type`

## Authentication, Not Signing

Requests are unsigned. Add a header in the HTTP Client step whose value comes from a Generic Service
Authentication (`$.auth.<field>`), and compare it on your side. Tray's docs say not to hard-code
credentials in the properties panel, so the `$.auth` method also keeps the value obscured in logs.

## Payload and Event Names (user-defined)

Tray documents no payload schema and no event types for this connector: the body is whatever the
workflow sends. This skill suggests an `event` field in a body you build yourself; the examples
handle these illustrative values, which are not Tray names:

| Event (illustrative) | Meaning (your choice) |
|-------|-----------------------|
| `record.created` | A record was created in the source system |
| `record.updated` | A record was changed |
| `record.deleted` | A record was removed |

## Example Payload

```json
{
  "event": "record.created",
  "data": { "id": "rec_123", "name": "Acme" }
}
```

A workflow may also send an empty body (for example a `GET`), or a non-JSON body. The examples
accept an empty body and return `400` for a non-empty body that isn't a JSON object.

## Content-Type Default

Tray sets `Content-Type` from the body you provide and falls back to
`application/x-www-form-urlencoded` if no body type is selected. Choose a JSON body type so the
examples can parse it.

## Full Reference

See Tray's [HTTP Client documentation](https://tray.ai/documentation/connectors/core/http-client).
