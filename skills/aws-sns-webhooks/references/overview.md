# AWS SNS Webhooks Overview

## What Are AWS SNS Webhooks?

[Amazon Simple Notification Service (SNS)](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)
is a pub/sub messaging service. When you subscribe an **HTTP** or **HTTPS**
endpoint to an SNS topic, SNS delivers messages to that endpoint as HTTP `POST`
requests — this is the "webhook" delivery mechanism for SNS.

Unlike shared-secret HMAC providers (Stripe, GitHub, Shopify), SNS proves
authenticity with an **RSA signature over specific message fields**, verified
against AWS's **public X.509 certificate**. There is no shared signing secret.

## Message Types

Every request carries an `x-amz-sns-message-type` HTTP header (and a matching
`Type` field in the JSON body). There are three types:

| `Type` | Triggered when | What your handler does |
|--------|----------------|------------------------|
| `SubscriptionConfirmation` | You create an HTTP/S subscription | Verify signature, then GET `SubscribeURL` to confirm — SNS sends no notifications until you do |
| `Notification` | A message is published to the subscribed topic | Verify signature, read `Subject` / `Message`, process |
| `UnsubscribeConfirmation` | The subscription is deleted | Verify signature; re-subscribe if the unsubscribe was unexpected |

> **Note:** These three type strings are the "events" of SNS delivery. SNS does
> not define business-level event names — your application's semantics live
> inside the `Message` string of a `Notification` (often JSON your publisher
> chose to send).

## Envelope Fields

The POST body is a JSON envelope sent with `Content-Type: text/plain; charset=UTF-8`.

**`Notification`:**

| Field | Description |
|-------|-------------|
| `Type` | `"Notification"` |
| `MessageId` | Unique ID for this message (use for idempotency) |
| `TopicArn` | ARN of the topic the message was published to |
| `Subject` | Optional subject line (present only if the publisher set one) |
| `Message` | The published message body (a string; often JSON) |
| `Timestamp` | ISO 8601 time the message was published |
| `SignatureVersion` | `"1"` (SHA1) or `"2"` (SHA256) |
| `Signature` | Base64 RSA signature over the canonical string |
| `SigningCertURL` | HTTPS URL of the X.509 cert (`sns.<region>.amazonaws.com`) |
| `UnsubscribeURL` | URL to unsubscribe this endpoint |

**`SubscriptionConfirmation`** and **`UnsubscribeConfirmation`** replace
`Subject` / `UnsubscribeURL` with:

| Field | Description |
|-------|-------------|
| `Token` | Token for `ConfirmSubscription` (valid for two days) |
| `SubscribeURL` | GET this URL to confirm the subscription |

## Relevant HTTP Headers

| Header | Present on | Purpose |
|--------|-----------|---------|
| `x-amz-sns-message-type` | all | `SubscriptionConfirmation` / `Notification` / `UnsubscribeConfirmation` |
| `x-amz-sns-message-id` | all | Same as `MessageId`; use for de-duplication |
| `x-amz-sns-topic-arn` | all | The topic ARN |
| `x-amz-sns-subscription-arn` | `Notification`, `UnsubscribeConfirmation` | The subscription ARN |

## Raw Message Delivery (Gotcha)

If the subscription has **raw message delivery** enabled
(`RawMessageDelivery=true`), SNS strips the JSON envelope and POSTs the raw
`Message` payload directly, adding an `x-amz-sns-rawdelivery: true` header.

In raw mode **there is no `Signature` to verify** — the envelope (and its
signing fields) is gone. If you need signature verification, keep raw delivery
**off**. If you use raw delivery, authenticate another way (e.g. a private
endpoint, network controls, or a shared secret you add via message attributes).

## Delivery Retries

Your endpoint must return a `2xx` status within **~15 seconds** or SNS treats the
attempt as failed and retries. The default HTTP/S delivery policy retries across
several backoff phases (customizable via a delivery policy). Configure a
`RedrivePolicy` to send exhausted messages to an SQS **dead-letter queue**.

Because retries can redeliver a message you already processed, **de-duplicate on
`MessageId`** (the `x-amz-sns-message-id` header).

## Full Event Reference

- [Sending Amazon SNS messages to HTTP/HTTPS endpoints](https://docs.aws.amazon.com/sns/latest/dg/sns-http-https-endpoint-as-subscriber.html)
- [Parsing message formats](https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html)
