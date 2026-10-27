# Fingerprint Webhook Events

Receive Fingerprint identification results and Smart Signals.

## Events and Payloads

The example scenarios cover `identification`. These labels describe identification deliveries; they are not a field in the body.

Each delivery is an identification result, with event_id and identification in the current format. There is no event-name discriminator. Older webhook formats differ. Accept any matching v1 digest and ignore other signature versions.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Use event_id to identify a current-format delivery. Verify before using identification data for fraud decisions; signature verification alone does not prevent replay.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.fingerprint.com/docs/webhooks)
- [Verification](https://docs.fingerprint.com/docs/webhooks#webhook-signatures)
- [Sdk](https://github.com/fingerprintjs/node-sdk/blob/v7.9.0/src/webhook.ts)
