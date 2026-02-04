The following issues were found during review of the {{PROVIDER_KEBAB}}-webhooks skill. Fix each issue listed below.

{{DOCS_REFERENCE}}

## Issues to Fix

{{TODO_CONTEXT}}

{{ISSUES_JSON}}

## Instructions

1. **For each issue**, make the necessary corrections to the specified file
2. **After fixing**, briefly explain what you changed
3. **Do NOT introduce new issues** while fixing existing ones
4. **Maintain consistency** - if you change something in one file, update related files too
5. **Re-run tests** after making changes to ensure nothing broke

## Priority

Fix issues in this order:
1. **Critical** issues first - these will cause the skill to not work
2. **Major** issues next - these will confuse users
3. **Minor** issues last - these are nice-to-haves

## Verification

After fixing all issues, run the tests again:

```bash
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/express && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi && source venv/bin/activate && pytest test_webhook.py
```

Make sure all tests still pass after your fixes.
