# Survicate Webhook Events

Receive Survicate question answers and completed surveys.

## Events and Payloads

The example scenarios cover `questionAnswered`, `surveyCompleted`. Use the documented discriminator described below.

The envelope is {messageId, deliveryTries, event: {questionAnswered: {...}}} or the corresponding surveyCompleted key. Dispatch on keys inside event, not on event as a string. The receiver guards each nested value before use.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Use messageId when deduplicating deliveries. Acknowledge accepted events and avoid logging survey answers or personal data.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://developers.survicate.com/webhooks/)
- [Verification](https://developers.survicate.com/webhooks/security/)
- [Setup](https://developers.survicate.com/getting-started/#7-get-the-data-out)
