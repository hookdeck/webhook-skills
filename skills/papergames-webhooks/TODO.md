# TODO - Known Issues and Improvements

*Last updated: 2026-11-05*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/papergames-webhooks/references/setup.md**: Setup says to 'Sign in to the developer tools at developers.papergames.io' and lists the developer account as being at developers.papergames.io (lines 7 and 13). developers.papergames.io is the docs site. The official Getting Started page puts the developer tools (API keys, webhook management) at papergames.io: https://papergames.io/en/developers/apikeys, with webhooks under /en/developers/webhooks. The Express, Next.js and FastAPI READMEs repeat the same claim (lines 12 and 58/60).
  - Suggested fix: In setup.md, point Prerequisites and step 1 to the developer tools at https://papergames.io/en/developers/apikeys (register with email or social login), and say webhook management is at https://papergames.io/en/developers/webhooks. Keep developers.papergames.io as the documentation link only. Make the same change in examples/{express,nextjs,fastapi}/README.md.

### Minor

- [ ] **skills/papergames-webhooks/examples/nextjs/README.md**: Copy-paste wording: the Next.js and Express READMEs say the handler verifies 'by hand with Node/Python built-ins', but each example uses only one language. The FastAPI README has the same wording.
  - Suggested fix: Say 'with Node's built-in crypto module' in the Express and Next.js READMEs and 'with Python's hmac/hashlib' in the FastAPI README.

## Suggestions

- [ ] Express uses express.raw({ type: '*/*' }) rather than the conventional { type: 'application/json' }. This is deliberate, covered by a test and explained in verification.md, so no change is needed. Mention it in a short code comment so reviewers don't 'fix' it back.
- [ ] The Express handler would return 500 if players[] contained a null entry (playerLabel reads player.externalId), while FastAPI filters out non-dict entries. Optionally add players.filter((p) => p && typeof p === 'object') in Express and Next.js for consistency.
- [ ] vitest prints an ESM-in-CommonJS warning for vitest.config.ts. Renaming it to vitest.config.mts or adding "type": "module" to the Next.js package.json would silence it.

