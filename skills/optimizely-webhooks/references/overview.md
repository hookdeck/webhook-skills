# Optimizely Webhooks Overview

## What Are Optimizely Webhooks?

Optimizely Feature Experimentation can send project webhooks (Settings → Webhooks) to your HTTPS endpoint with a `POST`. A webhook fires when the datafile of an environment updates, and for the change-history entity/action pairs you select on the webhook. This skill covers Feature Experimentation only, not Web Experimentation or the CMS products.

The docs do not describe timeouts or retries, so respond quickly with `200` and process asynchronously.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `project.datafile_updated` | An environment's datafile is republished | Re-fetch the datafile from `data.cdn_url` so SDKs see new flags and rules |
| `project.ruleset_updated` | A flag ruleset changes (change history) | Audit logging, notifying a team channel |

The subscribable change-history events are published only as an entity × action table (Attribute, Audience, Flag, Rule, … × Create, Update, Archive, Delete) without wire names. Only the two values above are documented by name; log any other `event` value.

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

For change-history events, `data` is an **array** of change records, each with `change_type` and `entity.type`. The examples in this skill use an illustrative record shape for `project.ruleset_updated`; check a real delivery in Hookdeck's request inspector for the full field set.

## Full Event Reference

See [Configure webhooks](https://docs.developers.optimizely.com/feature-experimentation/docs/configure-webhooks) in the Optimizely docs.
