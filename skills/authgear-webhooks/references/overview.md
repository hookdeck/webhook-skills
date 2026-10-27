# Authgear Webhook Events

Receive Authgear non-blocking user and identity events.

## Events and Payloads

The example scenarios cover `user.created`, `user.authenticated`, `user.deleted`. Use the documented discriminator described below.

Read the top-level type. An identity object's type describes the identity, not the event. Blocking hooks require a synchronous decision response and are outside this receiver's scope.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 2xx for accepted non-blocking events. Keep business processing idempotent and acknowledge events you intentionally ignore.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.authgear.com/integrate/events-hooks/webhooks)
- [Verification](https://docs.authgear.com/integrate/events-hooks/webhooks#verifying-signature)
