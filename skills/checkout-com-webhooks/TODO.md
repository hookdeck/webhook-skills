# TODO - Known Issues and Improvements

*Last updated: 2026-09-28*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/checkout-com-webhooks/references/setup.md**: The 'Option B — Workflows API' curl example uses the wrong shape for conditions[].events. It sends an ARRAY of objects (`"events": [{ "source": "gateway", "id": [...] }]`), but Checkout.com's documented request body and its own official SDK tests both use an OBJECT keyed by event source: `"events": { "gateway": [...], "dispute": [...] }`. Copy-pasting this curl will be rejected by POST /workflows, and it also implies a non-existent per-source `id` field. Verified on the 'Configure your webhook server' docs page and in checkout-sdk-node's workflows tests (which use the object form alongside `signature: { method: 'HMACSHA256', key: '8V8x0dLK%AyD*DNS8JJr' }`, so the signature block in the skill is correct).
  - Suggested fix: Replace the conditions block with the documented object-map form, and split the events by source so the dispute events are not sent under `gateway`:

    "conditions": [
      {
        "type": "event",
        "events": {
          "gateway": [
            "payment_approved",
            "payment_captured",
            "payment_declined",
            "payment_refunded"
          ],
          "dispute": [
            "dispute_received",
            "dispute_evidence_required"
          ]
        }
      }
    ],

Keep the `actions[]` block as-is.

### Minor

- [ ] **skills/checkout-com-webhooks/SKILL.md**: SKILL.md says the Event types page lists '~150' events and references/overview.md says 'roughly 150'. The current page lists closer to 180 across the 13 groups (the group list itself — Authentication, Balances, Compliance, Disputes, Fraud, Gateway, Identities, Issuing, Network tokens, Platforms, Real-Time Account Updater, Reports, Settlements — is exactly right). The same '~150 event types' figure is repeated in a comment in all three example handlers.
  - Suggested fix: Soften the count to a range that will not drift — e.g. 'lists over 150 events' / 'more than 150 events' — in SKILL.md, references/overview.md, and the `default:` branch comment in examples/express/src/index.js, examples/nextjs/app/webhooks/checkout-com/route.ts and examples/fastapi/main.py.
- [ ] **skills/checkout-com-webhooks/examples/express/package.json**: dotenv is pinned at ^17.4.2; the current stable is 18.0.4 (one major behind). Every other dependency matches current stable exactly: express 5.2.1, jest 30.5.2, supertest 7.3.0 (^7.2.2 resolves into it), next 16.3.6, vitest 5.0.2, typescript 7.0.2, fastapi>=0.141.1, pytest>=9.1.1, httpx>=0.28.1.
  - Suggested fix: Bump to "dotenv": "^18.0.4".

## Suggestions

- [ ] Optional, for completeness of the dispute lifecycle: the Event types page also lists dispute_arbitration_evidence_submitted, dispute_arbitration_lost, dispute_arbitration_sent_to_scheme, dispute_arbitration_won, dispute_evidence_acknowledged_by_scheme and request_for_information_received. The skill's nine dispute events are all correct; adding a one-line note that arbitration and RFI events exist would help anyone building a full dispute workflow.
- [ ] Also optional: the Gateway family includes payment_retry_scheduled, payment_optimized, batch_successful/batch_unsuccessful and bank_account_updated. These are correctly excluded from the 'common' table, but payment_retry_scheduled is worth a mention given the skill's (correct) emphasis on not driving a state machine off arrival order.
- [ ] The real documented payment_captured payload carries `source: "gwc_notifier1"` and `data.balances` / `data.event_links` / `data.processed_on`, and no `_links`. SKILL.md already says `source` appears on some events; noting that `data.balances` is where the authoritative captured/refundable totals live would strengthen the 'upsert state, don't require a predecessor' advice.
- [ ] SKILL.md's inline-code shape is correct — verification core only (~25 lines of Node), with the examples pointer block present immediately after it and matching the example handlers byte for byte in algorithm, header parse and timing-safe compare.

