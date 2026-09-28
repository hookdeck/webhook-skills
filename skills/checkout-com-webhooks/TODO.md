# TODO - Known Issues and Improvements

*Last updated: 2026-09-28*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Suggestions

- [ ] Dispute lifecycle completeness: the Event types page also lists dispute_arbitration_evidence_submitted, dispute_arbitration_lost, dispute_arbitration_sent_to_scheme, dispute_arbitration_won, dispute_evidence_acknowledged_by_scheme and request_for_information_received. A one-line note that arbitration and RFI events exist would help anyone building a full dispute workflow.
- [ ] The Gateway family also includes payment_retry_scheduled, payment_optimized, batch_successful / batch_unsuccessful and bank_account_updated. They are correctly left out of the "common" table, but payment_retry_scheduled may be worth a mention alongside the ordering advice.
- [ ] The documented payment_captured payload carries `data.balances` (total_captured, available_to_refund, ...). Pointing handlers at `data.balances` as the authoritative totals would strengthen the "upsert state, don't require a predecessor" advice.
- [ ] Live verification against a real sandbox delivery has not been done yet (no account was available). Recompute the digest against a real `Cko-Signature` and record the result here.
