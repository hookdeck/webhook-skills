# Thought Industries Webhook Events

Receive Thought Industries learning notifications.

## Events and Payloads

The example scenarios cover `courseCompletion`, `courseEnrollment`, `quizAttempt`. Use the documented discriminator described below.

Read event for the trigger kind, such as courseCompletion or quizAttempt. The X-Ti-Hook-Signature value has a sha256= prefix. Keep learner details out of routine request logs.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 200 promptly after accepting the event. Deduplicate repeated notifications using a stable event identifier when available, or an application key based on the documented event fields.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://developer.thoughtindustries.com/docs/webhooks/)
- [Verification](https://developer.thoughtindustries.com/docs/webhooks/)
