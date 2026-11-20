# TODO - Known Issues and Improvements

*Last updated: 2026-11-20*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/strike-webhooks/references/overview.md**: receive-request.receive-pending / receive-request.receive-completed payloads also carry data.receiveId (the ID of the incoming payment; data.entityId is the receiveRequestId), per Strike's receive-request guide in https://docs.strike.me/llms-full.txt. The skill documents only data.entityId and data.changes, so integrators can't tell which receive on a reusable receive request (e.g. an on-chain address) triggered the event.
  - Suggested fix: In overview.md's field table and SKILL.md's payload notes, add data.receiveId (string, present on receive-request.* events; read defensively). Note that the specific receive can be found with GET /v1/receive-requests/{entityId}/receives by matching receiveId. Optionally have the examples log data.receiveId for receive-request.* events.

## Suggestions

- [ ] Strike's per-event examples (payment.updated, receive-request.*) omit deliverySuccess entirely, so mention in overview.md that it may be absent as well as null; the examples already don't rely on it.
- [ ] Strike's own receive-request example uses 7-digit fractional seconds in `created` (2024-10-14T10:24:47.0326505+00:00), which Python <3.11 datetime.fromisoformat rejects. Worth one line next to the existing 'parse it, don't assume a fixed format' note.

