# TODO - Known Issues and Improvements

*Last updated: 2026-08-05*

These items were identified while authoring the skill from Vapi's documentation.
They are acceptable for merge; contributions to close them are welcome.

## Verified against live deliveries (2026-08-12)

- [x] **HMAC construction confirmed** by recomputing digests of real Vapi sandbox
  deliveries (secret `test`, SHA-256, hex, verbatim key). Signature header
  `x-signature` (bare digest). The **Payload Format** decides the signed content:
  - `{body}` → `HMAC-SHA256(rawBody, secret)` — recommended.
  - `{timestamp}.{body}` → `HMAC-SHA256(x-timestamp + "." + rawBody, secret)`,
    where `x-timestamp` is the send-time epoch-ms header. Verified it is **not**
    reproducible when the timestamp header is disabled (the signing value isn't
    delivered), and that the signing timestamp is the `x-timestamp` header, not
    `message.timestamp` (they differ ~40ms). `references/verification.md` carries
    both constructions + self-computed known-answer vectors.

Also confirmed live: the `{"message":{...}}` envelope with nested `message.type`
(`status-update`, `end-of-call-report` observed), `message.timestamp` as epoch-ms,
and the header set (`x-signature`, `x-timestamp`, empty `x-vapi-secret`,
`x-call-id`, `user-agent: axios/1.8.3`).

## Still open (not yet observed live)

- [ ] **Request/response payload shapes.** The four response types
  (`assistant-request`, `tool-calls`, `transfer-destination-request`,
  `knowledge-base-request`) are authored from docs — the live test call errored
  before invoking a tool, so the exact `toolCallList` entry shape
  (`function.name`/`arguments` vs flat `name`) and the required response bodies
  are not yet delivery-confirmed.
- [ ] **`assistant-request` ~7.5s timeout** is documented as a hard, fixed cap
  derived from the telephony provider's 15s limit. Confirm the exact budget in a
  live inbound call.

## Notes for reviewers

- The event type is nested at **`message.type`** (confirmed from
  `/server-url/events`). A Vapi CLI tutorial page shows a flatter shape with a
  top-level `type` and names like `call-started` / `function-call` — that is
  informal example code, **not** the wire format, and is intentionally not
  followed here.
- The `verifyVapiSignature` name in that same CLI snippet is a placeholder with no
  implementation or SDK export; the skill does not use it.
