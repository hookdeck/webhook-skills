# Medplum Webhook Events

Receive signed Medplum FHIR Subscription notifications.

## Events and Payloads

The example scenarios cover `create`, `update`, `delete`. These are subscription operations, not strings in the notification body. Route FHIR resources by resourceType and handle an empty delete body.

The body is a FHIR resource; dispatch on resourceType. Nothing in the body says whether it was created or updated. Medplum's [server code](https://github.com/medplum/medplum/blob/1f2c185cb97e93b4f1decbf19a19ea41ab39e8d0/packages/server/src/workers/subscription.ts) also sends `X-Medplum-Interaction` (`create`, `update` or `delete`) and `X-Medplum-Subscription` (the Subscription ID) on every rest-hook request, though Medplum's docs don't list them. Delete notifications contain {}. X-Medplum-Deleted-Resource supplies the resource type/id. None of these headers is signed, because the HMAC covers only the body. Reconcile them with application state before acting; these examples do not trust those headers as authenticated identifiers.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Use the Subscription extensions to configure retry behaviour. Queue accepted work durably and keep clinical data out of logs. Signatures are optional at the sender, but these examples require signing to be enabled.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://www.medplum.com/docs/subscriptions)
- [Verification](https://www.medplum.com/docs/subscriptions/subscription-extensions#signatures)
- [Deletions](https://www.medplum.com/docs/subscriptions/subscription-extensions#subscriptions-for-delete-events)
