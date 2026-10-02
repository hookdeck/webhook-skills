# Sentry Webhooks Overview

## What Are Sentry Webhooks?

Sentry (sentry.io) is the error-monitoring and application-performance
platform. Its **Integration Platform** lets you register an integration that
receives HTTP POSTs when things happen in your organization: an issue is
created or resolved, an alert fires, someone comments, a Seer run completes, a
mobile build finishes processing.

Two kinds of integration emit these webhooks:

- **Internal integration** — scoped to one organization, created in a few
  clicks, no install flow. This is the common case and what you want if you are
  wiring Sentry into your own systems.
- **Public integration** — distributable to other organizations, with an
  install flow. The first traffic you receive is `installation.created`.

Both are configured under **Settings → Developer Settings**, and both sign
deliveries the same way: HMAC-SHA256 over the raw body, keyed with the
integration's **Client Secret**.

Self-hosted Sentry runs the same code, so everything here applies unchanged on
a self-hosted host; only the domain differs.

> **Not Sentry Insurance (sentry.com)**, not the Sentry login/identity
> products, and **not `@sentry/*` SDK ingest** — events your app POSTs *to*
> Sentry at `/api/{project}/store/` go the other direction and use DSN keys.

## How Do I Tell Which Event a Sentry Webhook Is?

**This is the question that trips up every first Sentry integration.** The JSON
body has **no `type` field and no `event` field** — only `action`, a bare verb
like `"created"`. The resource lives in the **`Sentry-Hook-Resource` HTTP
header**.

```
event token = Sentry-Hook-Resource header  +  "."  +  body.action
```

So `Sentry-Hook-Resource: issue` with `{"action": "created"}` is
`issue.created`. A handler that switches on a body field alone will never fire.

## Headers on Every Delivery

| Header | Value | Use |
|---|---|---|
| `Content-Type` | `application/json` | — |
| `Request-ID` | Per-request uuid4 hex | **Idempotency / dedupe key** — the body has none |
| `Sentry-Hook-Resource` | The resource that fired | **First half of the event token** |
| `Sentry-Hook-Timestamp` | UNIX **seconds**, `str(int(time()))` | Loose replay dampener only — **not signed** |
| `Sentry-Hook-Signature` | Lowercase hex HMAC-SHA256 digest | Authenticity |

UI-component external requests send the digest as **`Sentry-App-Signature`**
instead. Accept both names. Header names are case-insensitive over HTTP;
Sentry's docs show them title-cased, Node and Starlette lowercase them.

## Event Payload Structure

Every Integration Platform delivery is a flat JSON object with four common
keys (`AppPlatformEventBody`):

```json
{
  "action": "created",
  "installation": { "uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de" },
  "data": { "issue": { "id": "100", "title": "ZeroDivisionError" } },
  "actor": { "type": "user", "id": 1, "name": "Meredith Heller" }
}
```

| Key | Meaning |
|---|---|
| `action` | The verb only. The resource is in the header. |
| `installation.uuid` | Maps the delivery to an installation. |
| `data` | Resource-specific, **and customizable via UI components**. Optional-chain everything. |
| `actor` | `{type: "user" \| "application", id, name}`. |
| `text` | **Optional.** A human-readable `"Sentry {resource}.{action}: {url}"` summary added for some alert deliveries (`include_text_summary`). |

### `actor.id` is a string *or* a number

When Sentry itself triggers the action, `actor` is literally:

```json
{ "type": "application", "id": "sentry", "name": "Sentry" }
```

`id` is the **string** `"sentry"`. When another integration acts, `id` is that
app's uuid. Type it as `string | number`, never as a number.

## Common Event Types

Event tokens are `{resource}.{action}`. Subscriptions in the Sentry UI are
selected **per resource**, not per event — subscribing to a resource delivers
**all** of its actions.

| Event | Triggered When | Common Use Cases |
|---|---|---|
| `installation.created` | A public integration is installed | Provision the tenant, store the installation uuid |
| `installation.deleted` | A public integration is uninstalled | Tear down, revoke tokens |
| `issue.created` | A new issue is created | Open a ticket, notify a channel |
| `issue.resolved` | An issue is resolved | Close the linked ticket |
| `issue.assigned` | An issue is assigned | Mirror ownership into your tracker |
| `issue.unresolved` | A resolved/archived issue regresses | Reopen the ticket, page on-call |
| `issue.ignored` | An issue is archived/ignored | Snooze the ticket. **Docs call this `archived`** |
| `error.created` | Any error event is recorded | Custom pipelines. **Business plan+**, very high volume |
| `comment.created` | A comment is added to an issue | Sync discussion into your tracker |
| `comment.updated` | A comment is edited | Keep the mirror current |
| `comment.deleted` | A comment is deleted | Remove the mirror |
| `event_alert.triggered` | An **issue alert** rule fires | Route alerts, enrich with your own context |
| `activity_alert.triggered` | A `seer_*` activity alert fires | Follow a Seer run through an alert rule |
| `metric_alert.critical` | A metric alert enters critical | Page on-call |
| `metric_alert.warning` | A metric alert enters warning | Notify a channel |
| `metric_alert.resolved` | A metric alert resolves | Clear the incident |
| `seer.pr_created` | Seer opens a fix PR | Request review, link the PR to the issue |
| `preprod_artifact.size_analysis_completed` | A mobile build's size analysis finishes | Gate on app-size regressions |
| `preprod_artifact.build_distribution_completed` | A build becomes distributable | Notify testers |

### Full resource → action matrix

| `Sentry-Hook-Resource` | Actions |
|---|---|
| `installation` | `created`, `deleted` |
| `issue` | `created`, `resolved`, `assigned`, `unresolved`, `ignored` |
| `error` | `created` *(Business plan and above only)* |
| `comment` | `created`, `updated`, `deleted` |
| `event_alert` | `triggered` |
| `activity_alert` | `triggered` |
| `metric_alert` | `critical`, `warning`, `resolved`, `open` |
| `seer` | `root_cause_started`, `root_cause_completed`, `solution_started`, `solution_completed`, `coding_started`, `coding_completed`, `pr_created`, `pr_ready_for_review`, `iteration_started`, `iteration_completed` |
| `preprod_artifact` | `size_analysis_completed`, `build_distribution_completed` |

Three naming traps in that table:

1. **`event_alert` is the issue-alert resource.** The header value is
   `event_alert`; the docs page is titled "Issue Alerts". A handler keyed on
   `"issue_alert"` will never fire.
2. **`issue.ignored` is the wire token**, though the docs call the action
   `archived`. `issue.archived` is retained as an equivalent alias for
   subscriptions stored before the rename — **handle both, drop neither**.
3. **`metric_alert.open`** exists in Sentry's `SentryAppEventType` /
   `MetricAlertActionType` enums but is **not** in the docs' list of three.
   Handle it; it is undocumented, not imaginary. Likewise
   `seer.pr_ready_for_review`, `seer.iteration_started` and
   `seer.iteration_completed` are in the server enum but absent from the docs
   page's list of seven.

### Not subscribable: UI-component external requests

`select_options.requested`, `external_issue.created`, `external_issue.linked`
and `alert_rule_action.requested` are **request/response calls Sentry makes to
your integration** to populate and submit UI components — not webhooks you
subscribe to. They matter here for exactly one reason: they send the signature
in **`Sentry-App-Signature`**, which is why your verifier must accept that
header name too.

## Payload Shapes Per Resource

### `issue.*`

`data.issue` is the serialized issue.

- `status` — `resolved` | `unresolved` | `ignored` (archived)
- `substatus` — `archived_until_escalating`, `archived_until_condition_met`,
  `archived_forever`, `escalating`, `ongoing`, `regressed`, `new`
- `statusDetails` — resolution/archival specifics: `inRelease`,
  `inNextRelease`, `inCommit`, `ignoreCount`, `ignoreWindow`,
  `ignoreUserCount`, `ignoreUserWindow`, `ignoreDuration`
- `issueCategory` — includes `error`, `outage` (uptime and cron monitors) and
  feedback
- `issueType` — more specific, e.g. `uptime_domain_failure`,
  `monitor_check_in_failure`

`issue.created` currently fires for the **`OUTAGE`, `ERROR` and `FEEDBACK`**
categories, so an `issue.created` is not necessarily an error — branch on
`issueCategory` before assuming a stack trace exists.

### `event_alert.triggered`

- `data.event` — a **full Sentry event**: `exception`, `stacktrace`, `metadata`,
  `platform`, `release`, plus `issue_id`, `url`, `web_url`, `issue_url`
- `data.event.tags` — **an array of `[key, value]` PAIRS**, not an object:
  `[["browser", "Chrome 75.0.3770"], ["level", "error"]]`
- `data.triggered_rule` — a string, the label of the rule that fired
- `data.issue_alert.settings` — the saved configuration for routing the alert
  within your service (from an alert-rule-action UI component)

Stack frames are ordered **oldest → most recent**.

### `error.created`

- `data.error.url`, `data.error.web_url`, `data.error.issue_url`,
  `data.error.issue_id`
- `data.error.user` when user identification is configured

**Business or Enterprise plan only**, and it fires for *every* error event.
Expect volume orders of magnitude above `issue.created`.

### `comment.*`

```json
{
  "action": "created",
  "data": {
    "comment": "adding a comment",
    "project_slug": "sentry",
    "comment_id": 1234,
    "issue_id": 100,
    "timestamp": "2022-03-02T21:51:44.118160Z"
  },
  "installation": { "uuid": "eac5a0ae-60ec-418f-9318-46dc5e7e52ec" },
  "actor": { "type": "user", "id": 1, "name": "colleen" }
}
```

### `metric_alert.*`

- `data.metric_alert` — the **incident** that triggered the alert
- `data.metric_alert.alert_rule` — the rule configuration
- `data.description_text` — human-readable description
- `data.description_title` — human-readable title
- `data.web_url` — URL for the incident

### `activity_alert.triggered`

- `data.activity.type` — a `seer_*` activity: `seer_root_cause_started`,
  `seer_root_cause_completed`, `seer_solution_started`,
  `seer_solution_completed`, `seer_coding_started`, `seer_coding_completed`,
  `seer_pr_created`, `seer_pr_iteration_started`, `seer_pr_iteration_completed`
- `data.activity.details` — type-dependent payload
- `data.issue` — the serialized issue that triggered the alert
- `data.alert` — `{title, url, web_url, settings}`

### `seer.*`

- `data.run_id` (integer) — unique id for the Seer analysis run
- `data.group_id` (integer) — the Sentry issue being analyzed

Together these two correlate every event in a run. Completed events add:

- `root_cause` — `one_line_description`, `five_whys`, `reproduction_steps`,
  `relevant_repo`
- `solution` — `one_line_summary`, `steps` (each `{title, description}`)
- `code_changes` — **keyed by repository `owner/name`**; each value a list of
  file-level changes `{diff, path, type: "M" | "A" | "D", added, removed}`
- `pull_requests` — array of `{pull_request: {pr_number, pr_url, pr_id}, repo_name, provider}`
  (the PR fields are **nested** under `pull_request`; `repo_name` and
  `provider` sit on the outer object)

### `preprod_artifact.*`

**These payloads use camelCase**, a casing break from the snake_case used
everywhere else in Sentry's webhooks:

- `buildId`, `organizationSlug`, `projectSlug`
- `appInfo` — app id, name, version, build number, artifact type, upload/build
  timestamps
- `gitInfo` — repository and branch metadata, present when the build is linked
  to a repo
- `downloadSize`, `installSize` — bytes, size analysis only
- `errorCode` (nullable), `errorMessage`
- `state` — `COMPLETED` | `FAILED`

**A `*_completed` action can still mean failure.** Branch on `state`, never on
the action name.

## Idempotency

The body carries **no delivery id**. Use the **`Request-ID` header** (a
per-request uuid4 hex) as your dedupe key.

This matters more than usual for Sentry: because `Sentry-Hook-Timestamp` is not
part of the signed string, a byte-for-byte replay of a captured body and
signature is **cryptographically valid forever**. Deduplication on `Request-ID`
is the real replay protection — a timestamp tolerance check is at best a cheap
dampener.

## Delivery: 1 Second, and No Retries

- **Respond within 1 second.** Sentry: *"Webhooks should respond within 1
  second. Otherwise, the response is considered a timeout."* Server-side this
  is the adjustable `sentry-apps.webhook.timeout.sec` option with a hard
  timeout alarm; treat 1s as the contract. Verify, enqueue, return 2xx, work
  afterwards.
- **Sentry does not retry.** There is no documented retry schedule for
  Integration Platform webhooks.
- **Repeated failures disable your webhook.** Failures trip a **circuit breaker
  per integration** and can disable the webhook entirely, with an email to the
  integration owner (`_notify_webhook_disabled` / `SentryAppWebhookDisabled`).
- **So a dropped delivery is genuinely lost.** Design for it: ack fast, process
  asynchronously, and **backfill via the Sentry API** (list issues, incidents,
  comments) rather than hoping for a redelivery.
- Past deliveries are inspectable under the integration's **Dashboard /
  webhook requests** view, which records the response status code.

## Other Sentry Webhook Surfaces

Three distinct mechanisms exist. Only the first is covered by this skill's
verifier.

| | Integration Platform | Service hooks | Legacy WebHooks plugin |
|---|---|---|---|
| Where | Settings → Developer Settings | API, behind `projects:servicehooks` | Project → Legacy Integrations → WebHooks |
| Signature header | `Sentry-Hook-Signature` | `X-ServiceHook-Signature` | **none** |
| Other headers | `Request-ID`, `Sentry-Hook-Resource`, `Sentry-Hook-Timestamp` | `X-ServiceHook-Timestamp`, `X-ServiceHook-GUID` | — |
| Key | Integration **Client Secret** | The **service hook's own `secret`** | — |
| Events | `issue.*`, `event_alert.triggered`, … | `event.created`, `event.alert` | Alert rule firings |
| Payload | `{action, installation, data, actor}` | `{project, group, event}` | Flat `{id, project, logger, level, culprit, message, url, triggering_rules, event}` |

**Service hooks** use the same primitive (HMAC-SHA256 hex over the payload) with
a different header and a different key. **The legacy WebHooks plugin is
completely unsigned** and no longer in the docs — there is nothing to verify on
that path. If you need authenticity, move to an internal integration.

## Full Event Reference

- [Webhooks](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/)
- [Issues](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issues/)
- [Issue Alerts](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issue-alerts/)
- [Metric Alerts](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/metric-alerts/)
- [Activity Alerts](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/activity-alerts/)
- [Errors](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/errors/)
- [Comments](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/comments/)
- [Seer](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/seer/)
- [Pre-production Artifacts](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/preprod-artifacts/)
- [Installation](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/installation/)
