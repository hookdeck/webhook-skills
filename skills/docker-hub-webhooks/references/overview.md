# Docker Hub Webhooks Overview

## What Are Docker Hub Webhooks?

A **Docker Hub repository webhook** is configured on a single repository on
[hub.docker.com](https://hub.docker.com) and fires when something is pushed to
it. From the official docs:

> You can use webhooks to cause an action in another service in response to a
> push event in the repository. Webhooks are POST requests sent to a URL you
> define in Docker Hub.

That is the entire contract: a repository, a destination URL, and a JSON POST on
push.

### What this is *not*

Several unrelated Docker-adjacent things also emit "webhooks" or "events". None
of them share this payload, this trigger, or this (non-existent) auth model, so
do not borrow code between them:

| Not covered here | Why it's different |
|------------------|--------------------|
| Docker Build Cloud | A build service, not a registry repository webhook |
| Docker Scout integrations | Outbound integrations with their own configuration |
| Self-hosted `distribution` registry notifications | `config.yml` `notifications:` endpoints, a completely different envelope, and *does* support custom headers |
| GitHub Container Registry `registry_package` webhooks | A GitHub webhook, signed with `X-Hub-Signature-256` |
| Docker Engine events (`docker events`) | A local daemon event stream, not an HTTP webhook |

## Common Event Types

**There is exactly one trigger, and there is no event type field.**

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| *(push — unnamed)* | A push event occurs in the repository. The DHI docs phrase the same trigger as "whenever a new image tag is pushed or updated". | Trigger a deploy or CI job, mirror the image to an internal registry (ECR, Artifact Registry, GHCR), run vulnerability scanning, sign or promote the image, notify a chat channel |

The payload carries **no** `event`, `type`, or `action` field, and the request
carries **no** `X-...-Event` header. This is the single most common mistake when
writing a Docker Hub handler:

```javascript
// WRONG — no such field exists. `payload.event` is always undefined.
switch (payload.event) { /* ... */ }

// RIGHT — route on what is actually in the payload.
if (payload.repository.repo_name === 'myorg/myapp' && payload.push_data.tag === 'latest') {
  // ...
}
```

The only payload-shape variation is the presence of `dhi_metadata` (see below),
and that is a repository property, not an event type.

## Event Payload Structure

The documented example payload, verbatim from the docs:

```json
{
  "callback_url": "https://registry.hub.docker.com/u/svendowideit/testhook/hook/2141b5bi5i5b02bec211i4eeih0242eg11000a/",
  "push_data": {
    "pushed_at": 1417566161,
    "pusher": "trustedbuilder",
    "tag": "latest"
  },
  "repository": {
    "comment_count": 0,
    "date_created": 1417494799,
    "description": "",
    "dockerfile": "#\n# BUILD ...",
    "full_description": "Docker Hub based automated build from a GitHub repo",
    "is_official": false,
    "is_private": true,
    "is_trusted": true,
    "name": "testhook",
    "namespace": "svendowideit",
    "owner": "svendowideit",
    "repo_name": "svendowideit/testhook",
    "repo_url": "https://registry.hub.docker.com/u/svendowideit/testhook/",
    "star_count": 0,
    "status": "Active"
  }
}
```

### Which fields can you actually rely on?

**The documented example is old.** Its values date from 2014, it uses
`registry.hub.docker.com` URLs, and `dockerfile` / `is_trusted` are artefacts of
the retired Automated Builds feature. Rely only on the fields below, treat every
one as possibly absent or null, and **ignore unknown fields** rather than
asserting on them.

| Field | Type | Notes |
|-------|------|-------|
| `push_data.tag` | string | The tag that was pushed. The single most useful field. |
| `push_data.pusher` | string | The Docker Hub username that pushed. |
| `push_data.pushed_at` | integer | **UNIX seconds.** Inferred from the 10-digit example value — the docs do not state the unit in words. |
| `repository.repo_name` | string | `namespace/name`, e.g. `svendowideit/testhook`. |
| `repository.namespace` | string | The owning user or organization. |
| `repository.name` | string | Repository name without the namespace. |
| `repository.is_private` | boolean | |
| `repository.repo_url` | string | Link back to the repository. |
| `repository.date_created` | integer | **UNIX seconds**, same inference as `pushed_at`. |
| `callback_url` | string | **Legacy and unsupported.** See below. |
| `dhi_metadata` | object | Mirrored DHI repositories only. See below. |

**There is no image digest in `push_data`.** If you need the digest — and you
should, if you are going to deploy what was pushed — fetch it from the Docker
Hub API or the registry. See
[verification.md](verification.md#re-confirm-against-docker-hub).

Do **not** assume undocumented fields such as `push_data.images` or
`media_type`. They are not in the documented payload.

## The Legacy `callback_url` Field

The docs say, verbatim:

> The `callback_url` field is a legacy field and is no longer supported.

**Ignore it. Never POST to it.**

### Why it's there at all

Older versions of the Docker docs contained a "Validate a webhook callback"
section. It described POSTing a body like
`{"state": "success"|"failure"|"error", "description": ..., "context": ..., "target_url": ...}`
to the `callback_url` in order to continue a **webhook chain** — a feature where
a second webhook only fired once the first had reported success.

Docker removed that section in [docker/docs#20565](https://github.com/docker/docs/pull/20565)
(Aug 2024), and added the explicit "legacy" note in
[docker/docs#23955](https://github.com/docker/docs/issues/23955) /
[#23962](https://github.com/docker/docs/pull/23962) (Jan 2026). The issue
reporter found that calling the URL with either GET or POST returned 404.
Webhook chains are gone with it.

The field is **still present in the documented example payload**, so your
handler must tolerate it and do nothing with it. The example test suites assert
that the handler makes **no outbound request** when `callback_url` is present.

## `dhi_metadata`: Mirrored Docker Hardened Image Repositories

Pushes to a mirrored [Docker Hardened Image](https://docs.docker.com/dhi/)
repository — one mirrored into your organization's namespace, where the repo
name is prefixed `dhi-` (e.g. `my-org/dhi-python`) — include an extra top-level
`dhi_metadata` object. Verbatim:

> Docker Hub adds `dhi_metadata` only to pushes on mirrored DHI repositories.
> Webhooks on other repositories deliver the standard payload.

### It is a map keyed by digest, not a single object

> DHI changelogs are generated per architecture, so `dhi_metadata` is a map
> keyed by the architecture-specific manifest digest. A multi-platform image
> push contains an entry for each platform that has a changelog. **Match the
> digest key against the platform you care about instead of assuming a single
> entry.**

### Per-platform entry fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | integer | Version of the `dhi_metadata` schema. |
| `change_categories` | array of strings | High-level summary of what changed. |
| `previous_version` | object | The prior build this one is compared against. Contains `tag` and `digest`. |
| `changes` | object | Detailed diff versus the previous version. |

### `changes` object

| Field | Type | Each entry has |
|-------|------|----------------|
| `vulnerabilities_fixed` | array | `cve_id`, `severity`, `package`, `fixed_in_version` |
| `packages_updated` | array | `name`, `type`, `old_version`, `new_version` |
| `packages_added` | array | `name`, `type`, `version` |
| `packages_removed` | array | `name`, `type`, `version` |
| `environment_variables_changed` | array | `change`, `key`, and `from_value` or `to_value` as applicable |
| `labels_changed` | array | Same shape as environment variable changes |
| `configuration_changed` | array | Changes to other image configuration, e.g. the entrypoint |

> When a change type has no entries, its array is present but empty, shown as `[]`.

### `change_categories` values

| Value | Meaning |
|-------|---------|
| `vulnerability_fix` | The build resolves one or more CVEs. See `changes.vulnerabilities_fixed`. |
| `version_upgrade` | One or more packages changed version. See `changes.packages_updated`. |
| `other` | Package, environment variable, label or configuration changes that fall into neither category above. |

A build can have more than one category — a build that fixes a CVE *and* bumps a
package version returns both `vulnerability_fix` and `version_upgrade`. **A
build with no changes at all returns an empty array.**

### Documented example

```json
{
  "dhi_metadata": {
    "sha256:04639747b6d72bcf1d0322f2a5b122ee76d963e31bb4a070891b25f15a5001c5": {
      "schema_version": 1,
      "change_categories": ["vulnerability_fix", "version_upgrade"],
      "previous_version": {
        "tag": "2-compat-fips-dev",
        "digest": "sha256:1738aa35838f520431c898b85d7cd60da71d8f997965287db4f3be27c1df32a1"
      },
      "changes": {
        "vulnerabilities_fixed": [
          {
            "cve_id": "CVE-2019-9192",
            "severity": "low",
            "package": "glibc",
            "fixed_in_version": "2.41-12+deb13u4+dhi0"
          }
        ],
        "packages_updated": [
          {
            "name": "glibc",
            "type": "deb",
            "old_version": "2.41-12+deb13u4",
            "new_version": "2.41-12+deb13u4+dhi0"
          }
        ],
        "packages_added": [],
        "packages_removed": [],
        "environment_variables_changed": [],
        "labels_changed": [
          {
            "change": "changed",
            "key": "com.docker.dhi.chain-id",
            "from_value": "sha256:4567092c648d813b8c4c60c7d100fc34df817dd5cb4c7968e9a5c43bafb9e7a5",
            "to_value": "sha256:62d4e2090951e812a87fb599db362677f72dee095f85889ea56df63c0999b02a"
          }
        ],
        "configuration_changed": []
      }
    }
  }
}
```

### Signed attestation ≠ signed webhook

Docker generates this data from a **signed changelog attestation**, retrieved at
delivery time:

> Each DHI build produces a signed changelog attestation. At webhook delivery
> time, Docker Hub retrieves the changelog for the pushed image and embeds it in
> the payload as `dhi_metadata`.

**That does not make the webhook verifiable.** The POST is still unsigned, and
the `dhi_metadata` object as delivered carries no signature you can check. If
you need the attestation's guarantees, fetch and verify the attestation itself
from the registry — don't trust the embedded copy.

## Delivery Behaviour

- **Transport:** HTTP POST, JSON body.
- **Handshake:** none. No challenge, no echo, no verification request, no
  special test event. Docker Hub simply POSTs on push.
- **Delivery history:** per webhook, under **Menu options → View History**,
  showing whether each POST succeeded or failed.
- **Retry policy, timeout and request headers** (`User-Agent`, the exact
  `Content-Type` value) are **not documented**. Do not code against specific
  numbers or header values. Handle deliveries idempotently regardless — dedupe
  on `repo_name` + `tag` + `pushed_at`.

## Full Event Reference

- [Docker Hub webhooks](https://docs.docker.com/docker-hub/repos/manage/webhooks/)
- [Automate syncing with webhooks (DHI)](https://docs.docker.com/dhi/how-to/mirror/#automate-syncing-with-webhooks)
