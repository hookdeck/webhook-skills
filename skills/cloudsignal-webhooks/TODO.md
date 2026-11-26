# TODO - Known Issues and Improvements

*Last updated: 2026-11-26*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [x] **skills/cloudsignal-webhooks/references/overview.md** (fixed 2026-11-26: the example is now the v2.1 reference's ItemShipped body, and test fixtures use its ISO 8601 datetime): The example payload's datetime value uses a space-separated format ('2026-07-28 10:30:00') that does not match CloudSignal's real payloads. The official v2.0 docs show ISO 8601 with timezone offset (e.g. '2017-01-21T13:23:42+00:00'), and the v1.1→v2.0 changelog explicitly notes datetime was updated to ISO 8601. This is non-functional (datetime is only logged) but the example should reflect the true wire format.
  - Suggested fix: Change the datetime example to ISO 8601, e.g. "datetime": "2026-07-28T10:30:00+00:00", and update the same value in the SKILL.md/overview payloads and the test fixtures (express test/webhook.test.js, nextjs test/webhook.test.ts, fastapi test_webhook.py) for consistency.

## Suggestions

- [x] (2026-11-26: it is on no reference page but is in the official Node SDK's allowedTypes; kept and labelled SDK-only. v2.1 also added ItemDeliveryStarted, ItemDeliveryCompleted and ItemDeliveryFailed, now handled.) Verify the 'CloudprinterOrderCanceled' signal type against the live v2.0 webhooks page — the official page enumerates 8 item/order signals and I could not confirm an order-level cancel signal there. If Cloudprinter does not emit it, the extra switch case is harmless dead code, but the docs table's claim of 'nine signal types' would be inaccurate.
- [ ] The example directories contain committed node_modules/, venv/, .next/, __pycache__/, and .pytest_cache/ artifacts (skills/cloudsignal-webhooks/examples/**). These are currently untracked but present in the worktree — add a .gitignore or clean them before committing so the skill doesn't ship ~2MB of build artifacts.
- [x] (2026-11-26: now GLS, as in the docs) Consider updating the ItemShipped example's shipping_option to a realistic value — the official docs example uses a carrier code like 'GLS' rather than 'standard'.

