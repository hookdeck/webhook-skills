# Cloudentity (SecureAuth) Webhooks Overview

## What Are Cloudentity Webhooks?

Cloudentity is now SecureAuth (cloudentity.com redirects to secureauth.com). In SecureAuth Connect
you can register a webhook in a workspace (**Extensions > Webhooks**) so third-party applications
react to platform events in real time instead of polling. When a subscribed event occurs, the
platform sends an HTTP request to your URL. The same audit events appear in the workspace's
**Audit Logs**.

Typical uses from the docs: deprovision a user downstream on `user.deleted`, forward events to a
SIEM, notify systems on consent changes, and trigger workflows on sign-in or MFA events.

## How Are Requests Authenticated?

Webhooks are not signed. Each request includes an `X-API-Key` header with the unique Webhook API
Key, which is shown once when the webhook is created. See [verification.md](verification.md).

## Common Event Types

Events available depend on the server type (workspace, organization, admin, system); the
**Subscribed events** list shows only what applies. Identifiers use `subject.action`; the payload
delivers the matching field as `subject_action` (for example `user_deleted`).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.created` | A user is created | Create a CRM record |
| `user.updated` | A user is updated | Sync profile data |
| `user.deleted` | A user is deleted | Deprovision downstream accounts |
| `user.authenticated` | A user authenticates | Sign-in audit trail |
| `group.created` | A group is created | Mirror groups |
| `login.accepted`, `login.failed` | A sign-in succeeds or fails | Security monitoring |
| `consent.created`, `consent.accepted`, `consent.rejected`, `consent.revoked` | Open Banking, CDR or FDX consent changes | Notify downstream systems |
| `client.created` | An application is created | Configuration audit |

Other documented events: `group.updated`, `group.deleted`, `credential.created`,
`credential.updated`, `otp.sent`, `otp.accepted`, `password.updated`, `password.requested`,
`password.confirmed`, `access_token.issued`, `authorization_code.issued`, `scopes.granted`,
`saml_assertion.issued`, `dcr.created`, `dcr.rejected`, `organization.created`,
`organization.updated`, `organization.deleted`, `schema.created`, `pool.created`,
`service.created`, `server.created`, `role.granted`.

## Event Payload Structure

SecureAuth sends audit events in JSON batches:

```json
{
  "audit_events": [
    { "tenant_id": "example", "server_id": "demo", "event_id": "a6ea34a8ef24cfdb74da4ff9f3cb693e" },
    { "tenant_id": "example", "server_id": "demo", "event_id": "474cf3eeaf2a4f34a8e2dbf9c69b7ddf" }
  ]
}
```

The docs elide the remaining fields and don't name the field that carries the event type. The
webhooks page says the payload "delivers the matching field in subject_action form", and the
external-logging guide charts `audit_events.payload.login_failed.cause`, which suggests each audit
event has a `payload` object with one key named for the event (`login_failed`). The examples
dispatch on that key; it is inferred, so confirm it against a real delivery. Iterate over
`audit_events` and handle each entry on its own.
The HTTP method isn't stated in the docs; treat it as `POST` with a JSON body.

## Full Event Reference

See [Set up webhooks](https://docs.secureauth.com/iam/set-up-webhooks) and
[Integrating external logging solutions](https://docs.secureauth.com/iam/integrating-external-logging-solutions-with-secureauth-audit-events).
