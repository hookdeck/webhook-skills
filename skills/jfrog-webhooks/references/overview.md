# JFrog Webhooks Overview

## What Are JFrog Webhooks?

JFrog platform webhooks (Artifactory, plus Xray, Distribution and AppTrust events) send an
HTTP `POST` with a JSON body to a URL you configure when something happens, such as an
artifact deployed to a repository or a build uploaded. You choose a **domain** (the subsystem
that emits the event), one or more **event types** and, where relevant, the repositories or
build patterns to watch. You can also use custom webhooks with your own headers and payload
template.

In token mode (the default) JFrog sends the webhook's secret token as-is in the
`X-JFrog-Event-Auth` header. See [verification.md](verification.md).

## Common Event Types

| domain | event_type | Triggered When | Common Use Cases |
|--------|------------|----------------|------------------|
| `artifact` | `deployed` | An artifact is deployed to a repository | Trigger scans, notify teams |
| `artifact` | `deleted` | An artifact is deleted | Clean up downstream indexes |
| `artifact` | `moved` | An artifact is moved between repositories | Track promotion |
| `docker` | `pushed` | A Docker/OCI image tag is pushed | Roll out a new image |
| `build` | `uploaded` | A build is uploaded | Start release pipelines |
| `build` | `promoted` | A build is promoted | Deploy a promoted build |

Other documented domains and events:

| domain | event_type values |
|--------|-------------------|
| `artifact` | `copied`, `cached` |
| `artifact_property` | `added`, `deleted` |
| `docker` | `deleted`, `promoted` |
| `build` | `deleted` |
| `release_bundle` | `created`, `signed`, `deleted` |
| `distribution` | `distribute_started`, `distribute_completed`, `distribute_aborted`, `distribute_failed`, `delete_started`, `delete_completed`, `delete_failed` |
| `destination` | `received`, `delete_started`, `delete_completed`, `delete_failed` |
| `user` | `locked` |
| `release_bundle_v2` | `release_bundle_v2_started`, `release_bundle_v2_failed`, `release_bundle_v2_completed` |
| `xray_scan_status` | `done`, `failed`, `partial`, `not_supported` |
| `app_trust` | entry/exit gate, release, version and application events |

Curation events use a different payload shape; see JFrog's docs.

## Event Payload Structure

```json
{
  "domain": "artifact",
  "event_type": "deployed",
  "data": {
    "repo_key": "sample_repo",
    "path": "sample_dir/sample.txt",
    "name": "sample.txt",
    "sha256": "sample_checksum",
    "size": 0
  },
  "subscription_key": "test",
  "jpd_origin": "https://<your_origin>",
  "source": "jfrog/<your_source>",
  "userContext": { "id": "johndoe", "isToken": false, "realm": "internal" }
}
```

`data` varies by event: `artifact moved` adds `source_repo_path` and `target_repo_path`,
`docker pushed` adds `image_name`, `tag`, `platforms` and `image_type`, and `build` events carry
`build_name`, `build_number`, `build_started` and `build_repo`.

## Full Event Reference

See [JFrog's webhook event types](https://docs.jfrog.com/integrations/docs/webhook-event-types)
and the [webhooks guide](https://docs.jfrog.com/integrations/docs/webhooks).
