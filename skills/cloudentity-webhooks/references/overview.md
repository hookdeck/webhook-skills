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

SecureAuth sends each request as an HTTPS `POST` with `Content-Type: application/json`. One
request can carry several events:

```json
{
  "audit_events": [
    {
      "tenant_id": "...",
      "server_id": "...",
      "event_id": "...",
      "timestamp": "...",
      "context": null,
      "event_subject": "login",
      "action": "accepted",
      "metadata": { },
      "payload": { "login_accepted": { } }
    }
  ]
}
```

Each element has the same shape as an item from the list audit events API. `event_subject` and
`action` name the event, and `payload` holds one key named `<subject>_<action>` with the
event-specific data. `metadata` holds request context (IP, device, location) and identifiers, much
of it personal data. Iterate over `audit_events` and handle each entry on its own.

## Delivery

- Success is a 2xx within 2 seconds. Other statuses, redirects (not followed) and timeouts fail.
- A failed request is retried as a whole batch after 5 s, 30 s and 1 min, then every 5 min, up to
  20 attempts (about 80 minutes). After that, read missed events from the list audit events API.
- Delivery is at least once: deduplicate on `event_id`. Events can arrive out of order: compare
  `timestamp`.
- SecureAuth publishes its egress IPs per region on its SaaS platform IP allowlist page.

## Full Event Reference

See [Set up webhooks](https://docs.secureauth.com/iam/set-up-webhooks), the
[Admin API reference](https://docs.secureauth.com/iam/docs/api/admin#operation/listAuditEvents)
(`audit_events.payload` lists every payload key) and
[Integrating external logging solutions](https://docs.secureauth.com/iam/integrating-external-logging-solutions-with-secureauth-audit-events).
