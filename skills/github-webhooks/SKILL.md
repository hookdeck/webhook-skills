---
name: github-webhooks
description: >
  Receive and verify GitHub webhooks. Use when setting up GitHub webhook
  handlers, debugging signature verification, or handling repository events
  like push, pull_request, issues, or release.
license: MIT
metadata:
  author: hookdeck
  version: "1.0.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# GitHub Webhooks

## When to Use This Skill

- Setting up GitHub webhook handlers
- Debugging signature verification failures
- Understanding GitHub event types and payloads
- Handling push, pull request, or issue events

## Resources

- [references/overview.md](references/overview.md) - What GitHub webhooks are, common event types
- [references/setup.md](references/setup.md) - Configure webhooks in GitHub, set secret
- [references/verification.md](references/verification.md) - Signature verification details and gotchas
- [examples/](examples/) - Runnable examples per framework

## Examples

| Framework | Path | Description |
|-----------|------|-------------|
| Express | [examples/express/](examples/express/) | Node.js with Express |
| Next.js | [examples/nextjs/](examples/nextjs/) | Next.js App Router |
| FastAPI | [examples/fastapi/](examples/fastapi/) | Python with FastAPI |

## Local Development

For local webhook testing, use Hookdeck CLI:

```bash
brew install hookdeck/hookdeck/hookdeck
hookdeck listen 3000 --path /webhooks/github
```

No account required. Provides local tunnel + web UI for inspecting requests.

## Related Skills

- `webhook-handler-patterns` - Cross-cutting patterns (idempotency, retries, framework guides)
- `hookdeck-event-gateway` - Production infrastructure (routing, replay, monitoring)
