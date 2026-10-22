# Flagsmith Webhooks Overview

## What Are Flagsmith Webhooks?

Flagsmith (feature flags and remote config, Cloud or self-hosted) can POST JSON to your URL in three situations:

- **Environment webhooks** — a flag changes or is deleted in an environment.
- **Audit log webhooks** — every action in the admin application is streamed to you (configured at organisation level).
- **Identity webhooks** — the Get Identity Flags endpoint evaluated an identity; you receive the full set of flags, traits and segments for that user (useful for analytics and A/B test attribution).

All three sign the body the same way when you set a secret (see [verification.md](verification.md)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `FLAG_UPDATED` | A flag's enabled state or value changes in an environment | Cache invalidation, change notifications, deploy tooling |
| `FLAG_DELETED` | A flag is deleted | Clean up references, alert owners |
| `AUDIT_LOG_CREATED` | Any logged admin action (flags, segments, environments, identities) | Compliance trail, security monitoring, CI/CD hooks |

Identity webhooks carry no `event_type`; recognise them by the top-level `identity` key.

`NEW_VERSION_PUBLISHED` also exists in Flagsmith's source (feature versioning v2) but isn't listed in the docs, so treat it as an unknown event and return 200.

## Event Payload Structure

Environment and audit-log webhooks:

```json
{
  "event_type": "AUDIT_LOG_CREATED",
  "data": {
    "created_date": "2020-02-23T17:30:57.006318Z",
    "log": "New Flag / Remote Config created: my_feature",
    "author": { "id": 3, "email": "user@domain.com", "first_name": "Kyle", "last_name": "Johnson" },
    "environment": null,
    "project": { "id": 6, "name": "Project name", "organisation": 1 },
    "related_object_id": 6,
    "related_object_uuid": null,
    "related_object_type": "FEATURE"
  }
}
```

`FLAG_UPDATED` data includes `changed_by`, `timestamp`, `new_state` and `previous_state` (each a feature state with `enabled`, `feature_state_value` and a `feature` object). Audit log `related_object_type` is one of `FEATURE`, `FEATURE_STATE`, `SEGMENT`, `ENVIRONMENT`, `CHANGE_REQUEST`, `EDGE_IDENTITY`, `IMPORT_REQUEST`, `EF_VERSION`, `FEATURE_HEALTH`, `RELEASE_PIPELINE`; check both `related_object_id` and `related_object_uuid`.

Identity webhook:

```json
{
  "identity": "user_test",
  "flags": [{ "enabled": true, "feature": { "id": 2, "name": "gggg" }, "feature_state_value": null }],
  "segments": [{ "id": 1, "member": true, "name": "test_segment" }],
  "traits": [{ "id": 5, "trait_key": "aaa", "trait_value": "bbb" }]
}
```

## Full Event Reference

- [Webhook (identity) integration](https://docs.flagsmith.com/third-party-integrations/webhook)
- [Audit log webhooks](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/audit-logs)
