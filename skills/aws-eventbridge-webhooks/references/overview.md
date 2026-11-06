# Amazon EventBridge Webhooks Overview

## What Are EventBridge API Destinations?

An EventBridge *API destination* is an HTTPS endpoint invoked as the target of an event bus rule
or a pipe. When an event matches the rule's event pattern, EventBridge sends it to your URL. The
destination uses a *Connection* that defines the authorization method and credentials. Any HTTP
method except CONNECT and TRACE can be used; PUT and POST are the most common. A Custom Event Bus
subscriber uses the same API destinations.

This skill covers Connections with **Basic** authorization. API Key and OAuth Connections are out
of scope. Requests are not signed: there is no signature or timestamp header.

## Request Headers

| Header | Value |
|--------|-------|
| `Authorization` | `Basic base64(username:password)` (populated from the Connection) |
| `User-Agent` | `Amazon/EventBridge/ApiDestinations` (cannot be overridden) |
| `Content-Type` | `application/json; charset=utf-8` unless you set one |

## Event Types

Dispatch on `source` + `detail-type`.

| `source` | `detail-type` | Triggered When |
|----------|---------------|----------------|
| `aws.ec2` | `EC2 Instance State-change Notification` | An EC2 instance changes state |
| `aws.s3` | `Object Created` | An object is created in a bucket with EventBridge notifications on |
| `com.example.orders` | `OrderCreated` | Your own application publishes a custom event |

AWS service events use an `aws.` source. For custom events the source is yours (it can't start
with `aws.`) and `detail-type` is a free-form string.

## Event Payload Structure

Without an input transformer a rule sends the event envelope:

```json
{
  "version": "0",
  "id": "7bf73129-1428-4cd3-a780-95db273d1602",
  "detail-type": "EC2 Instance State-change Notification",
  "source": "aws.ec2",
  "account": "123456789012",
  "time": "2015-11-11T21:29:54Z",
  "region": "us-east-1",
  "resources": ["arn:aws:ec2:us-east-1:123456789012:instance/i-abcd1111"],
  "detail": { "instance-id": "i-0123456789", "state": "RUNNING" }
}
```

With an [input transformer](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html)
the body is whatever the template builds (JSON or plain text), so don't assume the envelope.
AWS doesn't describe a body for GET or DELETE requests, so handle an empty one. A pipe uses an
input template to shape what it sends, so don't assume the envelope there either.

## Delivery and Retries

- EventBridge times out requests after **5 seconds**; respond quickly and process asynchronously.
- It retries `401`, `407`, `409`, `429` and `5xx` responses (event buses: up to 24 hours and 185
  attempts by default). Other `4xx` responses are not retried. It honors `Retry-After`.
- Failed events go to a dead-letter queue if one is configured, otherwise they are dropped.
- AWS states no delivery guarantee for rule targets, but timed-out requests are retried, so the
  same event can arrive twice. Make handlers idempotent (use the envelope `id`).

## Full Event Reference

See [API destinations](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html)
and [connection authorization](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-target-connection-auth.html).
