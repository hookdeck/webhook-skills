# Optimizely Webhooks Overview

## What Are Optimizely Webhooks?

Optimizely Feature Experimentation can send project webhooks (Settings → Webhooks) to your HTTPS endpoint with a `POST`. A webhook fires when the datafile of an environment updates, for the change-history entity/action pairs you select on the webhook, and for change approval events. One webhook receives events for every environment in the project. This skill covers Feature Experimentation only, not Web Experimentation or the CMS products.

The docs do not describe timeouts or retries, so respond quickly with `200` and process asynchronously.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `project.datafile_updated` | An environment's datafile is republished | Re-fetch the datafile from `data.cdn_url` so SDKs see new flags and rules |
| `project.ruleset_updated` | A flag ruleset changes (change history) | Audit logging, notifying a team channel |
| `project.approval_created` | A change request is submitted for approval | Open a ticket for reviewers |
| `project.approval_updated` | A change request is approved, rejected or withdrawn | Update the ticket, trigger a deploy step |
| `project.approval_archived` | A resolved change request is archived | Close the ticket |

The approval events are documented on [Change approval webhooks](https://docs.optimizely.com/feature-experimentation/docs/QZ9N-change-approval-webhooks). The other subscribable change-history events are published only as an entity × action table (Attribute, Audience, Flag, Rule, … × Create, Update, Archive, Delete) without wire names. Only the five values above are documented by name; log any other `event` value.

## Event Payload Structure

Every payload has a top-level `event` string, a `timestamp` and a `project_id`. For `project.datafile_updated`, `data` is an object:

```json
{
  "project_id": 1234,
  "timestamp": 1468447113,
  "event": "project.datafile_updated",
  "data": {
    "revision": 1,
    "origin_url": "https://optimizely.s3.amazonaws.com/json/1234.json",
    "cdn_url": "https://cdn.optimizely.com/json/1234.json",
    "environment": "Production"
  }
}
```

For change-history and approval events, `data` is an **array** of change records, each with `change_type`, `entity` (with `type`) and a `changes` array of `property`/`before`/`after` diffs. Optimizely says change-history payloads match the "Retrieve changes for a project" REST response. The tests in this skill use a trimmed record (`change_type` and `entity.type` only) for `project.ruleset_updated`.

## Full Event Reference

See [Create webhooks](https://docs.optimizely.com/feature-experimentation/docs/configure-webhooks) and [Change approval webhooks](https://docs.optimizely.com/feature-experimentation/docs/QZ9N-change-approval-webhooks) in the Optimizely docs.
