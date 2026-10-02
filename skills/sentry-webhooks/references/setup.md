# Setting Up Sentry Webhooks

## Prerequisites

- A Sentry organization, and a role that can reach **Settings → Developer
  Settings** (Manager or Owner).
- Your application's webhook endpoint URL, reachable over **HTTPS**.
- For `error.created`: a **Business or Enterprise** plan.

## Internal or Public Integration?

Sentry's Integration Platform webhooks come from an integration you create, not
from a per-project webhook form.

| | **Internal integration** | **Public integration** |
|---|---|---|
| Scope | Your organization only | Installable by any organization |
| Install flow | None — active immediately | Users install it; you get `installation.created` |
| Use when | Wiring Sentry into your own systems (**the common case**) | Shipping an integration for others |
| First traffic | Webhooks start once a URL and resources are set | `installation.created` |

Everything below applies to both; the only difference is which button you click
and whether you handle `installation.*`.

## Create the Integration

1. Go to **Settings → Developer Settings** in Sentry
   (`https://sentry.io/settings/{org-slug}/developer-settings/`).
2. Click **Create New Integration** and choose **Internal Integration** (or
   **Public Integration**).
3. Give it a **Name**.
4. Set **Webhook URL** to your endpoint, e.g.
   `https://your-app.example.com/webhooks/sentry`.
5. Make sure **Alert Rule Action** is enabled if you want this integration to
   appear as a target in issue-alert rules (that is what produces
   `event_alert.triggered` and populates `data.issue_alert.settings`).
6. Under **Permissions**, grant at least read access to the resources you want
   events for — Sentry will not let you subscribe to a webhook resource you
   lack permission to read. Issues read for `issue.*`/`error.*`, Event read for
   alerts, and so on.
7. Under **Webhooks**, tick the **resources** you want (see below).
8. **Save Changes.**

## Select Resources, Not Events

The checkbox list is **per resource**, not per event. Ticking a resource
subscribes you to **every action** of that resource.

| Tick this resource | And you receive |
|---|---|
| `installation` | `installation.created`, `installation.deleted` |
| `issue` | `issue.created`, `issue.resolved`, `issue.assigned`, `issue.unresolved`, `issue.ignored` |
| `error` | `error.created` — **Business plan+, very high volume** |
| `comment` | `comment.created`, `comment.updated`, `comment.deleted` |
| `event_alert` | `event_alert.triggered` — **this is the issue-alert resource** |
| `activity_alert` | `activity_alert.triggered` |
| `metric_alert` | `metric_alert.critical`, `.warning`, `.resolved`, `.open` |
| `seer` | all ten `seer.*` events |
| `preprod_artifact` | `preprod_artifact.size_analysis_completed`, `.build_distribution_completed` |

**Start with `issue` and `comment`.** Do not tick `error` unless you genuinely
want every error event — it is a firehose, it requires a Business plan, and
Sentry's 1-second response budget plus absence of retries makes it an
unforgiving first subscription.

## Get Your Client Secret

The HMAC key is the integration's **Client Secret**:

**Settings → Developer Settings → *your integration* → Client Secret**

```bash
SENTRY_CLIENT_SECRET=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90
```

Use it **exactly as displayed**, as raw UTF-8 bytes. No base64 decode, no hex
decode, no prefix to strip.

It is **not**:

- the **Client ID** (that is the public half of the OAuth pair),
- an **auth token** / API token (`sntrys_…`, used for calling Sentry's API),
- a **DSN** (`https://…@o0.ingest.sentry.io/0`, used by `@sentry/*` SDKs to
  send events *to* Sentry).

Internal integrations also show a **token** on the same page — that token is for
making API calls back to Sentry (useful for backfilling after a dropped
delivery), not for verifying webhooks.

> **Rotating the secret** invalidates signatures immediately. Support both the
> old and new value during a rotation window if you cannot afford dropped
> deliveries — Sentry does not retry.

## There Is No Handshake

Sentry sends **no challenge, no validation request and no echo-the-token
step**. Nothing has to be confirmed before deliveries start:

- **Internal integration** — webhooks begin flowing as soon as the URL and
  resources are saved and something happens in the org.
- **Public integration** — the first delivery is `installation.created` when
  someone installs it.

Do not write a branch for a handshake.

## Alert Rules: Wiring `event_alert.triggered`

Subscribing to `event_alert` is necessary but not sufficient — an **issue alert
rule** must actually target your integration:

1. **Alerts → Create Alert → Issues**.
2. Define the conditions.
3. Under **Then perform these actions**, add **Send a notification via** → your
   integration.
4. Save.

If your integration declares an *alert-rule-action* UI component, the
configuration a user fills in there arrives as `data.issue_alert.settings` on
every `event_alert.triggered`.

Metric alerts (**Alerts → Create Alert → Metrics**) work the same way and
produce `metric_alert.*`.

## Test a Delivery

Sentry has no "send test webhook" button for Integration Platform webhooks.
Trigger a real one instead — the fastest options:

| Event | How to trigger |
|---|---|
| `issue.resolved` | Open any issue → **Resolve** |
| `issue.ignored` | Open any issue → **Archive** |
| `issue.assigned` | Assign an issue to yourself |
| `comment.created` | Add a comment to an issue |
| `issue.created` | Send a new, previously-unseen error from your app |
| `event_alert.triggered` | Create an issue alert targeting your integration with a loose condition |

Resolving and re-opening an issue is the cheapest round trip for checking your
signature verification end to end.

## Inspect Past Deliveries

**Settings → Developer Settings → *your integration* → Dashboard** shows the
webhook requests view: recent deliveries with the response status code your
endpoint returned. This is where you confirm whether a delivery was attempted
at all and what Sentry saw back.

Because Sentry **does not retry**, this view is diagnostic only — you cannot
replay from it. Backfill a missed event through Sentry's API instead.

## Self-Hosted Sentry

Self-hosted Sentry runs the same code, so the scheme is identical: same
`Sentry-Hook-*` headers, same HMAC-SHA256 hex over the raw body, same Client
Secret as the key. Only the domain changes — create the integration under
`https://your-sentry.example.com/settings/{org-slug}/developer-settings/`.

The 1-second response budget is the `sentry-apps.webhook.timeout.sec` option,
which a self-hosted operator can raise. Don't rely on that: write the handler
to the 1-second contract.

## Hookdeck

A `SENTRY` source type is being added to Hookdeck
([hookdeck/core#5771](https://github.com/hookdeck/core/pull/5771), open at the
time of writing). It is an alias on the generic HMAC controller with exactly
the config this skill describes: **HMAC-SHA256, hex encoding, signature header
`sentry-hook-signature`, a single secret** (the dashboard labels it *Client
Secret*), signed content = the raw body. Until it ships, pick the generic HMAC
source type and set those values yourself.

It covers `Sentry-Hook-Signature` only. The UI-component external requests that
carry `Sentry-App-Signature` are synchronous request/response calls Sentry
makes to the component's own path — select-options and issue-link requests
expect a JSON reply that Sentry validates — so a Hookdeck source cannot
usefully sit in front of them. If you want the fire-and-forget
`alert_rule_action.requested` through Hookdeck, use a generic HMAC source with
`sentry-app-signature` as the header.

For local development:

```bash
npx hookdeck-cli listen 3000 sentry --path /webhooks/sentry
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI where you can read each request's raw body,
`Sentry-Hook-Resource` and `Sentry-Hook-Signature`. Paste the printed URL into
your integration's **Webhook URL**, then resolve an issue. (Use `8000` for the
FastAPI example.)

## The Other Two Webhook Surfaces

If you have inherited a Sentry integration that doesn't match this skill, check
which surface it actually uses — there are three and they are not
interchangeable.

### Service hooks (legacy, feature-flagged)

Created via the API behind the `projects:servicehooks` feature flag, not in the
UI. Headers are `X-ServiceHook-Signature`, `X-ServiceHook-Timestamp` and
`X-ServiceHook-GUID`. Same primitive — HMAC-SHA256 hex over the payload — but
keyed with the **service hook's own `secret`**, not the integration Client
Secret. Events are `event.created` and `event.alert`; the payload is
`{"project": {...}, "group": {...}, "event": {...}}`.

### Legacy "WebHooks" plugin

**Project Settings → Legacy Integrations → WebHooks** (the `webhooks:enabled`
project option). Deliveries are **completely unsigned** — there is no signature
header and nothing to verify. The payload is flat:

```json
{
  "id": "...", "project": "...", "project_name": "...", "project_slug": "...",
  "logger": "...", "level": "error", "culprit": "...", "message": "...",
  "url": "...", "triggering_rules": ["..."], "event": { }
}
```

It is no longer in Sentry's docs. **Do not build an HMAC verifier for it** —
there is no secret. If you need authenticity on this path, migrate to an
internal integration.
