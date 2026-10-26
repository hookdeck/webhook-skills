# ZITADEL Webhooks Overview

## What Are ZITADEL Webhooks?

ZITADEL is an open-source identity platform (cloud and self-hosted). Its **Actions v2** feature calls external HTTP endpoints, called **targets**, when something happens in the instance. A target of type `restWebhook` is a webhook: ZITADEL POSTs a JSON payload to your endpoint and only looks at the status code.

What you receive depends on the **execution** that links a condition to the target:

| Execution kind | Condition | Payload identifies it by |
|----------------|-----------|--------------------------|
| Event | `event` (an event type, e.g. `user.human.added`) | `event_type` |
| Request / response | `request` or `response` (a gRPC method) | `fullMethod` |
| Function | `function` (e.g. `preuserinfo`) | `function` |

Only targets with `payloadType` set to `PAYLOAD_TYPE_JSON` are signed with the `ZITADEL-Signature` header and covered by this skill. JWT and JWE payload types are verified against the instance's keys instead and aren't supported.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.human.added` | A human user is created | Sync users to a CRM, send a welcome email |
| `session.added` | A session is created | Audit logging, security notifications |

These are event types you can put in an execution's `event` condition. ZITADEL's events reference lists the rest.

## Event Payload Structure

Event executions:

```json
{
  "aggregateID": "336494809936035843",
  "aggregateType": "user",
  "resourceOwner": "336392597046099971",
  "instanceID": "336392597046034435",
  "version": "v2",
  "sequence": 1,
  "event_type": "user.human.added",
  "created_at": "2025-09-05T08:55:36.156333Z",
  "userID": "336392597046755331",
  "event_payload": {
    "userName": "mini@mouse.com",
    "firstName": "Minnie",
    "lastName": "Mouse",
    "email": "mini@mouse.com"
  }
}
```

ZITADEL's docs say `event_payload` is base64 encoded JSON, while their sample output shows it decoded. The examples accept either form.

Request/response executions carry `fullMethod` (for example `/zitadel.user.v2.UserService/CreateUser`), `instanceID`, `orgID`, `projectID`, `userID`, the `request` (and `response`), and the original `headers`. Function executions carry `function` (for example `function/preuserinfo`) plus `userinfo` and `user` objects.

Treat every field as untrusted, even after the signature checks out: check types before reading into nested values.

## Delivery

- Method: `POST`, JSON body.
- Each target has its own `timeout`.
- A `restWebhook` target uses only the status code of your response. A status outside 200-299 fails the execution, and interrupts it if the target has `interruptOnError`. An async target ignores both response and status.
- Retries are not documented. Put Hookdeck in front of the endpoint if you need retries and replay.

## Full Event Reference

See [ZITADEL: Test Actions Event](https://zitadel.com/docs/guides/integrate/actions/testing-event), [Test Actions Request](https://zitadel.com/docs/guides/integrate/actions/testing-request), [Test Actions Function](https://zitadel.com/docs/guides/integrate/actions/testing-function) and [Verify Payload Integrity](https://zitadel.com/docs/guides/integrate/actions/testing-request-signature).
