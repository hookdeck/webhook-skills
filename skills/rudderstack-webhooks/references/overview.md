# RudderStack Webhooks Overview

## What Are RudderStack Webhooks?

RudderStack is a customer data platform. Its **HTTP Webhook destination** forwards the events
it collects from a source (web, mobile, cloud, warehouse and so on) to an endpoint you control
as HTTP requests. There is no signature: authentication is the HTTP Basic auth credential you
configure on the destination (see [verification.md](verification.md)).

The destination lets you choose the HTTP method (default `POST`), the body format (JSON, XML
or form), custom headers, path and query parameters, and optional batching. RudderStack adds
`user-agent: RudderLabs` to every request.

## What Event Types Does RudderStack Send?

With the default **Send the event payload as is** setting, the body is the RudderStack event and
the `type` field says which kind:

| `type` | Meaning | Key fields |
|--------|---------|------------|
| `track` | A user action | `event` (the event name), `properties`, `userId`, `anonymousId` |
| `identify` | A user and their traits | `userId`, `anonymousId`, `traits` |
| `page` | A web page view | `name`, `properties` (e.g. `url`) |
| `screen` | A mobile screen view | `name`, `properties` |
| `group` | A user joining a group or account | `groupId`, `traits` |
| `alias` | Two identities merged | `userId`, `previousId` |

The docs also list `record` and `audienceList` message types (warehouse and audience sources);
the examples log them as unhandled.

## Payload Shapes to Expect

- **As is (default):** a single JSON event object with common fields such as `messageId`,
  `timestamp`, `context` and `integrations`.
- **Custom mappings:** if you turn off "Send the event payload as is", the body is whatever
  your mappings emit, so `type` may be absent.
- **Batching:** a JSON array of events, `[{Event1},{Event2},...]`, up to 100 per request,
  flushed after at most 5 seconds. JSON body format only.
- **Other body formats:** XML and form bodies aren't JSON; the examples parse JSON only.
- **Method:** can be `POST`, `PUT`, `PATCH`, `GET` or `DELETE`, and a `GET` has an empty body.

## Full Reference

See the [HTTP Webhook destination setup guide](https://www.rudderstack.com/docs/destinations/http-webhook/setup-guide/).
