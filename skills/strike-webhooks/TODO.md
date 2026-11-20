# TODO - Known Issues and Improvements

*Last updated: 2026-11-20*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

None outstanding.

The review's one minor finding — that `receive-request.receive-pending` /
`receive-request.receive-completed` also carry `data.receiveId` — was confirmed
verbatim against Strike's receiving-payments walkthrough
(https://docs.strike.me/walkthrough/receiving-payments: "The `entityId`
corresponds to the `receiveRequestId`, while the `receiveId` is the ID of the
incoming payment") and fixed: `SKILL.md`, `references/overview.md` and all three
examples now document and surface it.

The two review suggestions were confirmed from the same examples and also fixed:
`deliverySuccess` is absent (not just null) from Strike's per-event examples, and
`created` can carry seven fractional-second digits
(`2024-10-14T10:24:47.0326505+00:00`), which `datetime.fromisoformat` rejects
before Python 3.11.

## Open questions

- [ ] **`webhookVersion: "v2"`.** Strike's OpenAPI accepts `v2` on subscriptions
      and events, but no page documents how a v2 payload differs, and the API is
      served only under `/v1/*`. The skill pins `v1` and makes a non-`v1` event
      loud rather than guessing at the shape. Worth revisiting if Strike
      publishes v2.
- [ ] **Sandbox host.** Strike documents a full sandbox environment
      (https://docs.strike.me/sandbox) but the examples' `STRIKE_API_BASE` is
      left unset rather than naming a sandbox hostname, which was not confirmed
      from the docs.
