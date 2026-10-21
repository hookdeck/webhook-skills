# Stytch Webhooks Overview

## What Are Stytch Webhooks?

Stytch webhooks keep your own database in sync with changes that happen in Stytch outside your system (for example an Organization created in the Dashboard or a Member provisioned by SCIM). You register one or more endpoint URLs in the Stytch Dashboard and choose which event types each receives. Delivery is powered by [Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual), so requests carry `svix-id`, `svix-timestamp`, and `svix-signature` headers.

## How Are Event Types Named?

Event types follow `source.object_type.action`:

| Part | Values |
|------|--------|
| `source` | `direct` (API/SDK call), `dashboard` (Stytch Dashboard), `scim` (SCIM provisioning) |
| `object_type` | `organization`, `member`, `saml_connection`, `oidc_connection`, `scim_connection`, `user` (Consumer projects) |
| `action` | `create`, `update`, `delete` |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `direct.user.create` | A user is created via API/SDK (Consumer) | Create a local user record |
| `direct.user.update` | A user is updated via API/SDK (Consumer) | Refresh profile data |
| `direct.organization.create` | An Organization is created via API/SDK (B2B) | Provision a tenant |
| `direct.member.update` | A Member is updated via API/SDK (B2B) | Re-fetch the Member and sync |
| `direct.saml_connection.delete` | A SAML connection is deleted (B2B) | Alert admins, clean up SSO config |
| `dashboard.organization.create` | An Organization is created in the Dashboard | Provision a tenant |
| `scim.member.update` | A Member is updated through SCIM | Sync directory changes |

## Event Payload Structure

```json
{
  "project_id": "project-live-123-...",
  "event_id": "event-live-456-...",
  "action": "UPDATE",
  "object_type": "member",
  "source": "SCIM",
  "id": "member-live-123-...",
  "timestamp": "2024-03-07T18:49:32.760777783Z",
  "member": { "...": "full entity" }
}
```

- `action` is `CREATE`, `UPDATE`, or `DELETE`; `source` is `DIRECT`, `DASHBOARD`, or `SCIM`.
- There is no combined `type` field: build it as `source.object_type.action` lowercased.
- CREATE and UPDATE events include the full entity under a key named after `object_type`. DELETE events carry only `id`.
- `timestamp` has nanosecond precision and is not necessarily unique.

## Ordering and Retries

Webhooks have no ordering guarantee. Stytch recommends using the event as a signal and pulling the current state from the API (for example `GET /v1/b2b/organizations/{organization_id}/member` after `direct.member.update`). Svix disables an endpoint if every attempt fails for 5 days.

## Full Event Reference

See [Stytch's webhook documentation](https://stytch.com/docs/workspace-management/webhooks) and the Webhooks page of the Stytch Dashboard for the complete event catalog and schemas.
