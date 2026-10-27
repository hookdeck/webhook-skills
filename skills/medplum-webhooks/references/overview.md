# Medplum Webhook Events

Receive signed Medplum FHIR Subscription notifications.

## Events and Payloads

The example scenarios cover `create`, `update`, `delete`. These are subscription operations, not strings present in a notification. Route FHIR resources by resourceType and handle an empty delete body.

The body is a FHIR resource; dispatch on resourceType. There is no create/update/delete discriminator. Delete notifications contain {}. X-Medplum-Deleted-Resource supplies the resource type/id, but is unsigned because the HMAC covers only the body. Reconcile it with application state before acting; these examples do not trust that header as an authenticated identifier.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Use the Subscription extensions to configure retry behaviour. Queue accepted work durably and keep clinical data out of logs. Signatures are optional at the sender, but these examples require signing to be enabled.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://www.medplum.com/docs/subscriptions)
- [Verification](https://www.medplum.com/docs/subscriptions/subscription-extensions#signatures)
- [Deletions](https://www.medplum.com/docs/subscriptions/subscription-extensions#subscriptions-for-delete-events)
