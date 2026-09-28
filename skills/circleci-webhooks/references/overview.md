# CircleCI Webhooks Overview

## What Are CircleCI Outbound Webhooks?

CircleCI (circleci.com) is a CI/CD platform. Its **outbound webhooks** are HTTP
POSTs from CircleCI to *your* endpoint, sent when a **workflow** or a **job**
reaches a terminal state. The body is JSON.

They are configured **per project** (Project Settings → Webhooks, or the v2 API),
and are the supported way to build dashboards, ChatOps notifications, deployment
triggers, flaky-test trackers, and CI metrics pipelines without polling the API.

### Three things CircleCI webhooks are NOT

**Not Circle.** [Circle](https://circle.com) is the USDC / Circle Payments
Network / Circle Mint payments company. Circle signs with **ECDSA** and an
`X-Circle-Signature` header. CircleCI signs with **HMAC-SHA256** and a
`circleci-signature` header. Unrelated companies; never mix their headers,
schemes, or event names. Circle is covered by the separate
[`circle-webhooks`](https://github.com/hookdeck/webhook-skills/tree/main/skills/circle-webhooks)
skill.

**Not CircleCI *custom* webhooks.** Those run the opposite direction — a third
party POSTs to CircleCI to *trigger* a pipeline
([docs](https://circleci.com/docs/guides/orchestrate/custom-webhooks/)). Out of
scope here.

**Not the CircleCI API.** `Circle-Token` authenticates you calling CircleCI. The
webhook **Secret token** (API field `signing-secret`) verifies CircleCI calling
you. They are different secrets with different lifetimes.

## Event Types

There are **exactly two**. The v2 API's `events` enum is
`["workflow-completed", "job-completed"]`.

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `workflow-completed` | A workflow has reached a terminal state | Deploy on green, Slack/PagerDuty alerts on failure, DORA metrics, pipeline dashboards |
| `job-completed` | A job has reached a terminal state | Per-job timing and flakiness tracking, test-result ingestion, fine-grained status checks |

Do **not** invent other event types. There is no `workflow-started`,
`job-started`, `pipeline-created`, or any `pipeline-*` event.

### Status values

| Event | `status` enum |
|---|---|
| `workflow-completed` → `workflow.status` | `success`, `failed`, `error`, `canceled`, `unauthorized` |
| `job-completed` → `job.status` | `success`, `failed`, `canceled`, `unauthorized` |

**Jobs have no `error` status** — only workflows do. And in a `job-completed`
payload the `workflow` object **omits `status`** entirely; workflow status
belongs to workflow-level webhooks only.

### The ping event (community-observed)

The webhook form has a **Test Ping Event** button. The docs say only: *"The test
ping event has an abbreviated payload for ease of testing."* The `type` value
itself is **not in CircleCI's docs**. A community implementation
([circleci-hook](https://github.com/DavidS/circleci-hook)) logged a real one as
header `circleci-event-type: ping` with:

```json
{
  "type": "ping",
  "id": "92e0554a-837f-4086-913b-0dc7665d2a84",
  "happened_at": "2022-09-19T15:59:36.507435Z",
  "webhook": { "id": "d4ab06bc-eb79-463d-8aa4-47d066382d3b", "name": "fly.io" }
}
```

Treat this as **community-observed, not documented**. It is a *normal, signed*
POST — verify it like any other delivery, then return 200. Don't build logic on
fields beyond `id` and `type`.

## Event Payload Structure

### Common envelope (every event)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID string | **Event id — this is your dedupe key.** No delivery-id header exists |
| `type` | string | Same value as the `circleci-event-type` header |
| `happened_at` | ISO 8601 string | When the event occurred. **Not** a signing input — never reject on it |
| `webhook` | map | `{ id, name }` of the webhook that delivered this |

### Sub-entities

| Entity | Fields | Present in |
|---|---|---|
| `project` | `id`, `name`, `slug` (e.g. `github/circleci/webhook-service`) | both |
| `organization` | `id`, `name` | both |
| `workflow` | `id`, `name`, `created_at`, `url`, `stopped_at?`, `status?` | both (**`status` only on `workflow-completed`**) |
| `pipeline` | `id`, `number`, `created_at`, `trigger{type}`, `trigger_parameters?`, `vcs?` | both |
| `job` | `id`, `number`, `name`, `status`, `started_at`, `stopped_at?` | `job-completed` only |

### `pipeline.vcs` vs `pipeline.trigger_parameters`

**This is the payload trap.** Where the branch and commit live depends on the
project's VCS integration:

| Integration | Shape |
|---|---|
| **GitHub OAuth**, **Bitbucket Cloud** | `pipeline.vcs` — `{ provider_name, branch \| tag, revision, origin_repository_url, target_repository_url, commit{ subject, body, author{name,email}, authored_at, committer{name,email}, committed_at } }` |
| **GitLab**, **GitHub App** | **no `pipeline.vcs`.** Instead `pipeline.trigger_parameters` with nested `circleci`, `git` (`branch`, `tag`, `ref`, `checkout_sha`, `checkout_url`) and `gitlab` (`commit_title`, `commit_message`, `commit_author_name`, `commit_sha`, `web_url`, ...) maps. The reference says the `gitlab` map is present for GitLab *and* GitHub App triggers; it only publishes a GitLab sample, so read these fields defensively |

A handler that does `payload.pipeline.vcs.branch` will throw on GitLab and
GitHub App pipelines. Read both shapes:

```javascript
function extractVcsInfo(pipeline = {}) {
  if (pipeline.vcs) {
    return {
      branch: pipeline.vcs.branch ?? null,
      tag: pipeline.vcs.tag ?? null,
      revision: pipeline.vcs.revision ?? null,
      subject: pipeline.vcs.commit?.subject ?? null,
    };
  }
  const git = pipeline.trigger_parameters?.git ?? {};
  const gitlab = pipeline.trigger_parameters?.gitlab ?? {};
  return {
    branch: git.branch || gitlab.branch || null,
    tag: git.tag || null,                         // "" on branch builds
    revision: git.checkout_sha || gitlab.commit_sha || null,
    subject: gitlab.commit_title || null,         // commit text is in `gitlab`, not `git`
  };
}
```

### Open maps

CircleCI: *"New fields may be added to maps in the webhook payload without
considering it a breaking change."* Parse leniently — use optional access, don't
assert an exact key set, and don't fail on unknown fields.

## Sample: `workflow-completed` (GitHub OAuth pipeline)

```json
{
  "id": "3888f21b-eaa7-38e3-8f3d-75a63bba8895",
  "type": "workflow-completed",
  "happened_at": "2021-09-01T22:49:34.317Z",
  "webhook": {
    "id": "cf8c4fdd-0587-4da1-b4ca-4846e9640af9",
    "name": "Sample Webhook"
  },
  "project": {
    "id": "84996744-a854-4f5e-aea3-04e2851dc1d2",
    "name": "webhook-service",
    "slug": "github/circleci/webhook-service"
  },
  "organization": {
    "id": "f22b6566-597d-46d5-ba74-99ef5bb3d85c",
    "name": "circleci"
  },
  "workflow": {
    "id": "fda08377-fe7e-46b1-8992-3a7aaecac9c3",
    "name": "build-test-deploy",
    "created_at": "2021-09-01T22:49:03.616Z",
    "stopped_at": "2021-09-01T22:49:34.170Z",
    "url": "https://app.circleci.com/pipelines/github/circleci/webhook-service/130/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3",
    "status": "success"
  },
  "pipeline": {
    "id": "1285fe1d-d3a6-44fc-8886-8979558254c4",
    "number": 130,
    "created_at": "2021-09-01T22:49:03.544Z",
    "trigger": { "type": "webhook" },
    "vcs": {
      "provider_name": "github",
      "origin_repository_url": "https://github.com/circleci/webhook-service",
      "target_repository_url": "https://github.com/circleci/webhook-service",
      "revision": "1dc6aa69429bff4806ad6afe58d3d8f57e25973e",
      "commit": {
        "subject": "Description of change",
        "body": "More details about the change",
        "author": { "name": "Author Name", "email": "author.email@example.com" },
        "authored_at": "2021-09-01T22:48:53Z",
        "committer": { "name": "Committer Name", "email": "committer.email@example.com" },
        "committed_at": "2021-09-01T22:48:53Z"
      },
      "branch": "main"
    }
  }
}
```

## Sample: `job-completed`

Same envelope, plus a `job` object — and note `workflow` has **no `status`**:

```json
{
  "id": "8bd71c28-4969-3677-8940-3e3a61c46660",
  "type": "job-completed",
  "happened_at": "2021-09-01T22:49:34.279Z",
  "webhook": { "id": "cf8c4fdd-0587-4da1-b4ca-4846e9640af9", "name": "Sample Webhook" },
  "project": { "id": "84996744-a854-4f5e-aea3-04e2851dc1d2", "name": "webhook-service", "slug": "github/circleci/webhook-service" },
  "organization": { "id": "f22b6566-597d-46d5-ba74-99ef5bb3d85c", "name": "circleci" },
  "workflow": {
    "id": "fda08377-fe7e-46b1-8992-3a7aaecac9c3",
    "name": "welcome",
    "created_at": "2021-09-01T22:49:03.616Z",
    "stopped_at": "2021-09-01T22:49:34.170Z",
    "url": "https://app.circleci.com/pipelines/github/circleci/webhook-service/130/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3"
  },
  "pipeline": { "id": "1285fe1d-d3a6-44fc-8886-8979558254c4", "number": 130, "created_at": "2021-09-01T22:49:03.544Z", "trigger": { "type": "webhook" }, "vcs": { "provider_name": "github", "branch": "main", "revision": "1dc6aa69429bff4806ad6afe58d3d8f57e25973e" } },
  "job": {
    "id": "8b91f9a8-7975-4e60-916c-f0152ccbc937",
    "name": "test",
    "started_at": "2021-09-01T22:49:28.841Z",
    "stopped_at": "2021-09-01T22:49:34.170Z",
    "status": "success",
    "number": 136
  }
}
```

## Headers

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `user-agent` | `CircleCI-Webhook/1.0` |
| `circleci-event-type` | The event type, e.g. `workflow-completed` or `job-completed` |
| `circleci-signature` | Comma-separated versioned list, e.g. `v1=<64-char hex>`. Sent **"When present"** — i.e. when a Secret token is configured |

**No delivery-id header. No timestamp header.** The header names are lowercase in
the docs; Node lowercases incoming header names anyway, and Python/FastAPI header
lookup is case-insensitive.

## Deduplication

CircleCI: *"Webhook requests may be duplicated."* There is no delivery id, so
**dedupe on the payload's top-level `id`**. Store processed ids and drop repeats.

The retry schedule is **not documented**, so pick a generous retention window
(24 hours+) rather than trying to match an unpublished backoff.

## Delivery, Retries, and Limits

| | |
|---|---|
| Method | HTTP `POST`, JSON body |
| Success | Any **2xx** |
| Timeout | **10 seconds** (current) |
| On failure | Non-2xx or timeout is retried *"at a later time"*. **Count and schedule are not documented** |
| Duplicates | Explicitly possible — dedupe on payload `id` |
| Limit | **5 outbound webhooks per project** |
| Permission | **Org admin** required to create/manage webhooks |
| URL | **HTTPS only** |

Verify, enqueue, and return 2xx immediately; do the real work after responding.

## Full Event Reference

- [Outbound webhooks guide](https://circleci.com/docs/guides/integration/outbound-webhooks/)
- [Outbound webhooks reference (payload schemas)](https://circleci.com/docs/reference/outbound-webhooks-reference/)
