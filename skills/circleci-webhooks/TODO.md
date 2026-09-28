# TODO - Known Issues and Improvements

*Last updated: 2026-09-28*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/circleci-webhooks/examples/fastapi/main.py**: hmac.compare_digest(v1, expected) is called with str arguments, where v1 is attacker-controlled. Starlette decodes header values as latin-1, so a raw non-ASCII byte in circleci-signature (e.g. `v1=\xe9`) yields a str with a non-ASCII char and compare_digest raises `TypeError: comparing strings with non-ASCII characters is not supported`. The exception is uncaught, so a malformed request returns 500 instead of 400 — CircleCI then retries it indefinitely, exactly the failure mode the skill warns about for Node's timingSafeEqual. Reproduced against the real handler. The inline comment above the call ('both sides are hex, hence ASCII, so there is no TypeError risk') is factually wrong: only `expected` is guaranteed hex; `v1` is whatever the client sent. The same bug is duplicated in the SKILL.md and references/verification.md Python snippets. No test covers it (45 pytest tests pass without exercising a non-ASCII header).
  - Suggested fix: Compare bytes instead of str — bytes comparison has no ASCII restriction: `return hmac.compare_digest(v1.encode("utf-8"), expected.encode("utf-8"))` (verified to return False rather than raise on the `v1=\xe9` input). Correct the misleading comment to say the header value is untrusted and may be non-ASCII, and apply the identical change to the Python snippets in SKILL.md and references/verification.md. Add a pytest case asserting a non-ASCII signature header returns 400, not 500.

### Minor

- [ ] **skills/circleci-webhooks/SKILL.md**: The JavaScript verification snippet's pair parser omits the `if (eq === -1) continue;` guard that both examples/express/src/index.js and references/verification.md have. When indexOf returns -1, `p.slice(0, i)` becomes `p.slice(0, -1)` and `p.slice(i + 1)` becomes `p.slice(0)`, so a malformed pair with no '=' is silently treated as a versioned pair. Verified: on the header `v1x,v1=GOOD` the snippet selects `['v1', 'v1x']` and therefore rejects a valid signature that appears later in the list. Not a bypass (the bogus value can never match a 64-char hex digest), but it is both a correctness bug and drift from the example code the checklist requires SKILL.md to mirror.
  - Suggested fix: Restore the guard so the snippet matches the example, e.g. change the map/find chain to filter out pairs with no '=': `.map((p) => { const i = p.indexOf('='); return i === -1 ? null : [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }).find((e) => e && e[0] === 'v1')?.[1]`, or replace the chain with the same `for` loop used in examples/express/src/index.js.

## Suggestions

- [ ] No TODO.md exists for this skill. Consider adding one recording the two items that are deliberately hedged rather than resolved: the `ping` event type is community-observed (github.com/DavidS/circleci-hook) and absent from CircleCI's docs, and the Hookdeck `CIRCLECI` source type is still unmerged (hookdeck/core#5669), so `npx hookdeck-cli listen 3000 circleci` may not resolve the source type until that lands.
- [ ] The FastAPI handler's job-completed branch logs name and status but, unlike the Express and Next.js handlers, does not compute the job duration from started_at/stopped_at. Harmless, but the three frameworks otherwise mirror each other closely enough that the gap reads as an oversight.
- [ ] examples/fastapi/venv/, examples/*/node_modules/, and .pytest_cache/ are present on disk but correctly covered by .gitignore, so nothing stray will be committed — worth a quick `git add -n` check before opening the PR since the whole skill directory is still untracked.

