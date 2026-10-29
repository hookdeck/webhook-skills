# Scaleway Topics and Events Webhooks Overview

## What Is Scaleway Topics and Events?

Scaleway Topics and Events is a publish/subscribe service "based on the AWS SNS protocol". Scaleway built it in-house: it "does not have any dependencies on the AWS SNS infrastructure". Publishers send messages to a **topic**, and the topic pushes them to its **subscriptions**: HTTP/HTTPS endpoints, Scaleway Serverless Functions and Containers, or Scaleway Queues. This skill covers the HTTP/HTTPS subscribers, which receive `POST` requests.

Topics live in a region. `fr-par` and `nl-ams` have published trust chains, and they're the regions Hookdeck accepts. ARNs look like `arn:scw:sns:fr-par:<project-id>:<topic-name>`.

## The Envelope

Every delivery is a JSON envelope. Scaleway documents the confirmation:

```json
{
  "Type": "SubscriptionConfirmation",
  "Token": "<REDACTED-CONFIRMATION-TOKEN>",
  "MessageId": "<REDACTED-MESSAGE-ID>",
  "TopicArn": "arn:scw:sns:fr-par:<REDACTED-ID>:MyTopic",
  "Message": "You have chosen to subscribe to the topic arn:scw:sns:fr-par:<REDACTED-ID>:MyTopic.\nTo confirm the subscription, visit the SubscribeURL included in this message.",
  "Timestamp": "2022-06-29T10:03:34Z",
  "SignatureVersion": "1",
  "Signature": "<REDACTED-SIGNATURE>",
  "SigningCertURL": "https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_[certSerialNumber].crt",
  "SubscribeURL": "<THE-CONFIRMATION-LINK>"
}
```

Scaleway doesn't show a `Notification`. Following the SNS protocol it implements, expect:

```json
{
  "Type": "Notification",
  "MessageId": "…",
  "TopicArn": "arn:scw:sns:fr-par:<project-id>:MyTopic",
  "Subject": "optional, set by the publisher",
  "Message": "the published message, always a string",
  "Timestamp": "…",
  "SignatureVersion": "1",
  "Signature": "…",
  "SigningCertURL": "https://messaging.s3.fr-par.scw.cloud/…",
  "UnsubscribeURL": "…"
}
```

Field notes:

- `Message` is whatever the publisher passed to `Publish`. It's often JSON, but it's a string either way: parse it yourself and check types.
- `Subject` is present only when the publisher set one (Scaleway supports `Subject` on `Publish`).
- `MessageAttributes` and `MessageDeduplicationId` are supported on `Publish`; `MessageStructure` isn't.
- `RawMessageDelivery` isn't supported, so there's always an envelope and always a signature.

## Message Types

| `Type` | Meaning | Signed fields |
|--------|---------|---------------|
| `SubscriptionConfirmation` | Confirm the subscription by GETting `SubscribeURL` | Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type |
| `Notification` | A message published to the topic | Message, MessageId, Subject (if present), Timestamp, TopicArn, Type |
| `UnsubscribeConfirmation` | SNS sends this after an unsubscribe; Scaleway doesn't document it | Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type |

## Delivery Guarantees

- **Standard topics** "offer an at-least-once message delivery system … it is possible under rare circumstances that the same message may be received more than once." They deliver in order on a best-effort basis only.
- **FIFO topics** guarantee "that messages are delivered in order and without duplication".
- "messages sent to topics with no subscriptions are automatically deleted."

Deduplicate on `MessageId` and answer 2xx quickly.

## What Scaleway Doesn't Document

- A `Notification` example, and any HTTP headers (`x-amz-sns-message-type` among them).
- The retry schedule, request timeout and source IPs for HTTP/S deliveries. `DeliveryPolicy` isn't supported.
- The `Content-Type` of deliveries.
- Whether `UnsubscribeConfirmation` messages are sent.
- Whether the confirmation message is sent when you create the subscription or when you choose **Confirm subscription** in the console (see [setup.md](setup.md)).

## Full Reference

- [How to create and manage subscriptions](https://www.scaleway.com/en/docs/topics-and-events/how-to/create-manage-subscriptions/)
- [Verifying webhook signatures](https://www.scaleway.com/en/docs/topics-and-events/reference-content/verifying-webhooks/)
- [Supported SNS actions and attributes](https://www.scaleway.com/en/docs/topics-and-events/reference-content/topics-and-events-support/)
- [Using Go, Python or Node.js with Topics and Events](https://www.scaleway.com/en/docs/topics-and-events/api-cli/python-node-topics-events/)
- [Concepts](https://www.scaleway.com/en/docs/topics-and-events/concepts/)
