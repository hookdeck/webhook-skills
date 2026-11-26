# Setting Up Trunk Webhooks

## Prerequisites

- A Trunk organization with Merge Queue and/or Flaky Tests
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Trunk Webhook Endpoint?

Trunk's webhooks are powered by Svix, and you manage endpoints in the **Svix App Portal** embedded
in the Trunk web app.

1. Open the Trunk web app and go to **Merge Queue** > **Settings** > **Webhooks** (Merge Queue
   events), or **Settings** > **Organization** > **Webhooks** (Flaky Tests events).
2. Add an endpoint with your URL, e.g. `https://example.com/webhooks/trunk`.
3. Pick the events to receive. **Merge Queue's two families must each be subscribed explicitly**:
   enable the `pull_request.*` entries and the `pull_request_batch.*` entries. A useful start is
   `pull_request.merged`, `pull_request.failed`, `pull_request_batch.pending_failure` and
   `v2.test_case.status_changed`.
4. Return a `2xx` as soon as the signature checks out.

No challenge or validation request is documented.

## Where Do I Find the Signing Secret?

Each endpoint has its own signing secret, shown in the Svix App Portal. Trunk doesn't document its
format, but Svix secrets start with `whsec_`. Store the full value, prefix included:

```bash
TRUNK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Test Collection Events

Trunk's Flaky Tests page says every event carries a `test_collection` object with the collection's
ID and a link to it. The event catalog says repository-scoped `v2.test_case.status_changed` events
leave it out, so treat it as optional.

## How Do I Send a Test Event?

In the endpoint's **Testing** tab, pick an event type under **Send event** and click **Send Example**. For real events, open a PR in the merge queue or trigger a flaky-test detection.
Delivery attempts, response codes and replays are visible in the portal.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| Only `pull_request.*` events arrive | The endpoint isn't subscribed to the `pull_request_batch.*` family |
| Retries are rejected as "Timestamp too old" | The `svix` library enforces 5 minutes and retries keep the original timestamp: see `verification.md` |
