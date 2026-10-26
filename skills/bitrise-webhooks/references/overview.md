# Bitrise Webhooks Overview

## What Are Bitrise Webhooks?

Bitrise can send **outgoing webhooks** to a URL you choose. The Release Management docs describe
HTTP POST requests with a JSON payload; the CI build docs don't publish the request format. There
are two families:

- **CI build events**: sent when a build is started and when it ends. Configured per project under
  Project settings > Integrations > Webhooks.
- **Release Management events**: sent for release automation events (versions, TestFlight, Google
  Play, App Store, approvals). Configured on a release or release preset. Connecting them to a
  Release Management project needs a standard license.

Webhooks are **not signed**. Authenticate them with a secret custom header you add to the
outgoing webhook (see [setup.md](setup.md) and [verification.md](verification.md)).

## Common Event Types

Release Management bodies have a `trigger_event` string. Selected events:

| Event | Triggered When | Extra fields |
|-------|----------------|--------------|
| `app_version_added` | An app version is added | `description`, `preset_template_id` |
| `testflight_upload_started` | A TestFlight upload starts | `file_name`, `version`, `version_code` |
| `testflight_upload_completed` | A TestFlight upload completes | `file_name`, `version`, `version_code` |
| `testflight_upload_failed` | A TestFlight upload fails | `file_name`, `version`, `version_code` |
| `testflight_processing_completed` | TestFlight finishes processing | `file_name`, `version`, `version_code` |
| `testflight_processing_failed` | TestFlight processing fails | `file_name`, `version`, `version_code` |
| `testflight_app_review_approved` | TestFlight app review approved | `testflight_beta_build_id` |
| `testflight_app_review_rejected` | TestFlight app review rejected | `testflight_beta_build_id` |
| `google_play_upload_completed` | A Google Play upload completes | `file_name`, `version`, `version_code` |
| `google_play_upload_failed` | A Google Play upload fails | `file_name`, `version`, `version_code` |
| `app_store_review_approved` | App Store review approved | `file_name`, `version`, `version_code` |
| `app_store_review_rejected` | App Store review rejected | `file_name`, `reason`, `version`, `version_code` |
| `app_store_release_completed` | App Store release completes | none |
| `google_play_release_completed` | Google Play release completes | none |

Other documented events include `release_description_changed`, `automation_added`,
`automation_removed`, `outgoing_webhook_added`, `stopped_managing_release`,
`release_candidate_build_selected`, `testflight_distribution_started`,
`google_play_upload_started`, `google_play_testing_track_release_completed`,
`approval_task_added`, `approval_task_completed`, `app_store_version_created`,
`app_store_review_submitted`, `phased_release_paused`, `google_play_release_started`,
`google_play_rollout_percentage_changed` and more.

## Event Payload Structure

Every Release Management webhook has these fields:

| Field | Notes |
|-------|-------|
| `trigger_event` | The event name above |
| `app_id`, `project_id`, `workspace_id` | Identifiers |
| `release_id`, `release_candidate_artifact_id`, `store_app_id` | Release identifiers |
| `triggered_by` | A user slug, or `Automation`, `Apple App Store`, `Google Play Store` |
| `triggered_at`, `sent_at` | Nanosecond-precision UNIX timestamps |
| `webhook_config_id` | The outgoing webhook configuration |
| `webhook_event_unique_id` | `WEBHOOK_ID@TRIGGER_TIMESTAMP_NANO`; use it for idempotency |

```json
{
  "trigger_event": "testflight_upload_completed",
  "release_id": "…",
  "app_id": "…",
  "triggered_by": "Automation",
  "webhook_event_unique_id": "…@1730000000000000000",
  "file_name": "MyApp.ipa",
  "version": "1.4.0",
  "version_code": "42"
}
```

**CI build event payloads are undocumented.** The docs only say a build event is a build being
started or ending, and publish no payload schema, field names or type field for them. The examples
therefore only check for a string `trigger_event` (Release Management); any other body is
acknowledged and its field names logged, without guessing at build fields. Look at a real delivery
in **Recent deliveries** for the exact fields your project gets.

## Full Event Reference

- [Outgoing webhooks in Release Management](https://docs.bitrise.io/en/release-management/releases/configuring-a-release/outgoing-webhooks-in-release-management) (full `trigger_event` list)
- [Adding outgoing webhooks](https://docs.bitrise.io/en/bitrise-platform/integrations/webhooks/adding-outgoing-webhooks) (CI build events)
