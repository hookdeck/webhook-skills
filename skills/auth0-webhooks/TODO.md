# TODO - Known Issues and Improvements

*Last updated: 2026-07-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/auth0-webhooks/references/setup.md**: Setup instructs users to select Content Format 'JSON Lines', claiming it 'delivers batched arrays'. This is incorrect: Auth0's JSON Lines format sends newline-delimited JSON objects, not a JSON array. All three example handlers parse the body as JSON (express.json() / request.json() / await request.json()), which yields an array ONLY when the stream's Content Format is 'JSON Array'. A user following this instruction would pick JSON Lines, the JSON parse would fail on the newline-delimited payload, the handler would return a non-2xx, and Auth0 would retry indefinitely.
  - Suggested fix: Change the Content Format guidance to recommend 'JSON Array' (which delivers the batched JSON array the examples parse). For example: '**Content Format** — select **JSON Array**; Auth0 then POSTs a single JSON array of log records, which the handlers in this skill parse directly. (JSON Lines sends newline-delimited objects and would not parse as an array.)'

### Minor

- [ ] **skills/auth0-webhooks/references/overview.md**: Line 37-38 says 'See the full list under "Full Event Reference" below', but the 'Full Event Reference' section (line 81) only contains external links, not an actual full list of codes. The cross-reference over-promises.
  - Suggested fix: Reword to 'See the full reference links below' (or similar), since the section links to Auth0's log event type codes page rather than enumerating them inline.
- [ ] **skills/auth0-webhooks/SKILL.md**: The frontmatter description characterizes 'sepft' as 'token exchange / MFA'. Per Auth0's log event type codes, sepft is 'Success Exchange (Password for Access Token)' — a password-grant token exchange, not an MFA event. The body table (line 70) and example code label it correctly; only the frontmatter's '/ MFA' aside is misleading.
  - Suggested fix: In the frontmatter description, drop the '/ MFA' qualifier so sepft is described as 'sepft (password-grant token exchange)' to match the table and example code.

## Suggestions

- [ ] The Next.js handler processes events synchronously before returning 200, while the Express handler responds first and processes after. This is correct for serverless (post-response work isn't guaranteed to run), but a one-line comment noting that slow work should be enqueued to a durable queue in production would help users avoid timeouts/retries.
- [ ] Consider adding a brief note in overview.md that log_id is a stable per-record identifier suitable for idempotency keys when Auth0 redelivers a batch on retry (it's already referenced, but tying it explicitly to the webhook-handler-patterns idempotency guidance would strengthen the cross-skill story).

