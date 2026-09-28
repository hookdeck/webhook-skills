# TODO - Known Issues and Improvements

*Last updated: 2026-09-28*

These items were identified during review but are acceptable for merge.
Contributions to address these items are welcome.

## Hedged / unconfirmed facts

- [ ] **`ping` event type.** CircleCI's docs say only that "Test Ping Event" sends
  "an abbreviated payload". The `type: "ping"` value and its `{type, id,
  happened_at, webhook}` shape come from a community implementation
  (github.com/DavidS/circleci-hook), not from CircleCI. Confirm against a live
  delivery.
- [ ] **GitHub App `trigger_parameters`.** The reference says the `gitlab` map is
  present for GitLab *and* GitHub App pipelines, but only publishes a GitLab
  sample. `extractVcsInfo()` reads the documented GitLab fields; confirm the
  GitHub App shape against a live delivery.
- [ ] **No live verification yet.** The scheme is pinned by CircleCI's four
  documented known-answer vectors, but no real delivery has been captured.

## Suggestions

- [ ] The FastAPI handler's job-completed branch logs name and status but, unlike
  the Express and Next.js handlers, does not compute the job duration from
  started_at/stopped_at.
