# Dub Webhook Events

Receive Dub link, lead, sale and partner events.

## Events and Payloads

The example scenarios cover `link.created`, `lead.created`, `sale.created`. Use the documented discriminator described below.

The envelope contains id, event, createdAt and data. Dub uses the entire whsec_ string as a UTF-8 HMAC key. Do not strip the prefix or decode the remainder; this scheme does not use the Standard Webhooks signing format.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Acknowledge accepted events promptly and make changes idempotent using the delivery id. Store secrets only on the server.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://dub.co/docs/webhooks/introduction)
- [Verification](https://dub.co/docs/webhooks/verify-webhook-requests)
