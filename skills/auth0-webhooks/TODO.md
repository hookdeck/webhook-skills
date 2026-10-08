# TODO - Known Issues and Improvements

*Last updated: 2026-10-08*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Suggestions

- [ ] The Next.js handler processes events synchronously before returning 200, while the Express handler responds first and processes after. This is correct for serverless (post-response work isn't guaranteed to run), but a one-line comment noting that slow work should be enqueued to a durable queue in production would help users avoid timeouts/retries.
- [ ] Consider adding a brief note in overview.md that log_id is a stable per-record identifier suitable for idempotency keys when Auth0 redelivers a batch on retry (it's already referenced, but tying it explicitly to the webhook-handler-patterns idempotency guidance would strengthen the cross-skill story).

