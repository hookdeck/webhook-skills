# Scalekit Webhooks Overview

## What Are Scalekit Webhooks?

[Scalekit](https://scalekit.com) provides authentication for B2B SaaS (organizations, SSO, SCIM directory sync, RBAC, sessions) and AI agents (connected accounts, tool calling). Its webhooks report organization, user, directory, SSO, role and permission, and connected-account events to your HTTPS endpoint. Each delivery is a `POST` with an `application/json` body, signed per [Standard Webhooks](https://www.standardwebhooks.com) (`webhook-id`, `webhook-timestamp`, `webhook-signature`). See [verification.md](verification.md).

## Event Payload Structure

```jsonc
{
  "spec_version": "1",
  "id": "evt_100000000000000001",        // unique per event; differs from webhook-id
  "object": "DirectoryUser",             // names the data's type; omitted on domain events
  "environment_id": "env_100000000000000001",
  "occurred_at": "2026-10-01T09:30:00.000Z",
  "organization_id": "org_100000000000000001", // not sent on user.* events
  "type": "organization.directory.user_created",
  "data": { "id": "diruser_100000000000000001", "email": "kai@example.com", "active": true }
}
```

(The example has `//` comments, so it is not strict JSON.) The event type is the top-level `type`; `object` names the data's type and is not the event type. Always check `type` before reading `data`.

## Common Event Types

The API reference documents 43 event types; the list may not be exhaustive.

| Event | Triggered When |
|-------|----------------|
| `organization.created` / `.updated` / `.deleted` | An organization changes |
| `organization.domain_created` / `.domain_deleted` | A domain is added or removed |
| `organization.domain_dns_verification_success` / `_failed` | Domain DNS verification finishes |
| `organization.directory_created` / `_enabled` / `_disabled` / `_deleted` | A SCIM directory changes state |
| `organization.directory.user_created` / `_updated` / `_deleted` | A directory user is provisioned, changed or removed |
| `organization.directory.group_created` / `_updated` / `_deleted` | A directory group changes |
| `organization.sso_created` / `_enabled` / `_disabled` / `_deleted` | An SSO connection changes |
| `user.signup` / `user.login` / `user.logout` | A user signs up, logs in or out |
| `user.organization_invitation` | A user is invited to an organization |
| `user.organization_membership_created` / `_updated` / `_deleted` | A membership changes |
| `role.created` / `role.updated` | A role changes |
| `connected_account.created` / `.updated` / `.deleted` / `.status_updated` | An AgentKit connected account changes (see the account events guide) |

The `connected_account.*` events are described in Scalekit's AgentKit [account events guide](https://docs.scalekit.com/agentkit/account-events.md). Thirteen more documented types are not listed here; see Scalekit's API reference. The example handlers log the events above and acknowledge anything else with `200`.

## Delivery and Ordering

At-least-once and possibly out of order. Dedupe on `webhook-id` or the top-level `id`, and compare `occurred_at` before overwriting newer data. See [setup.md](setup.md) for retries.

## Full Event Reference

[Scalekit webhook best practices](https://docs.scalekit.com/guides/webhooks-best-practices/) and the Scalekit API reference.
