# TODO - Known Issues and Improvements

*Last updated: 2026-11-24*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/worldline-webhooks/references/overview.md**: The Direct quote 'we strongly recommend not building your business operations around it' is attributed to the online/offline event distinction (overview.md:122; SKILL.md:120 says it 'advises against building business logic on the distinction'). On the Direct webhooks page the sentence refers to the incremental payment.id change logic: 'The payment.id can change after each maintenance operation following an incremental logic. However, as this is not the case in some specific scenarios, we strongly recommend not building your business operations around it.'
  - Suggested fix: Reword both places: 'The page says payment.id changes after each maintenance operation "following an incremental logic", but not in every scenario, and "strongly recommend[s] not building your business operations around it".' Keep the merchantReference correlation advice.
- [ ] **skills/worldline-webhooks/examples/fastapi/README.md**: The README says Python 3.9+, but requirements.txt pins fastapi>=0.165.0, which declares Requires-Python >=3.11.
  - Suggested fix: Change the prerequisite to 'Python 3.11+'.

## Suggestions

- [ ] The brief (written on the same date) says the Connect GET echo stays in your own handler behind Hookdeck. The skill's claim that Hookdeck answers it for WORLDLINE sources is correct per hookdeck/http-ingestion cloudflare/src/common/platforms/worldline.ts, so keep the skill's wording and update the brief/prompt template instead.
- [ ] The Next.js .env.example ends with two stacked comment lines ('# Port the example server listens on' / '# Next.js dev server runs on port 3000') and no PORT value; consider keeping only the second line.

