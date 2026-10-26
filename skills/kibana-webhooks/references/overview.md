# Kibana Webhooks Overview

## What Are Kibana Webhooks?

The Kibana Webhook connector (used by alerting rule actions; not the Webhook - Case Management
connector) sends an HTTP request to a URL you choose when a rule action runs. Its authentication
type is `none`, `basic`, `SSL` or `OAuth 2.0`. With basic authentication, Kibana asks for a user
name and password and builds the `Authorization: Basic` header into every request.

Requests are not signed: there is no signature header, no timestamp and no HMAC.
Hookdeck's Kibana source verifies HTTP Basic auth. Custom headers and OAuth 2.0 are not covered
by it.

## Methods

`POST` (default), `PUT`, `PATCH`, `GET` and `DELETE` (generally available since 9.3). Hookdeck's
Kibana source pre-selects POST without managing the method, so allow any other method the
connector uses on the source too.

## Events

There are **no vendor event types**. The connector sends whatever body its rule action template
renders, so you define the payload. The examples treat this as an **illustrative** payload (not a
vendor schema):

| Illustrative `status` | Meaning in the examples |
|-----------------------|-------------------------|
| `recovered` | The rule recovered: the handler logs a recovery |
| any other value (e.g. `query matched`) | The rule action fired: the handler logs the alert |

## Payload Structure

```json
{"rule": "{{rule.name}}", "status": "{{alert.actionGroup}}", "context": "{{context.message}}"}
```

The `{{...}}` placeholders are mustache variables filled in by Kibana. GET and DELETE requests may
have an empty body. If the body isn't JSON, the examples keep it as raw text.

## Full Reference

See [Kibana's Webhook connector documentation](https://www.elastic.co/docs/reference/kibana/connectors-kibana/webhook-action-type).
