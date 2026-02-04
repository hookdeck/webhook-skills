# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A community collection of webhook integration skills for AI coding agents. Skills provide step-by-step instructions for setting up webhook receivers, handling events, and integrating with the Hookdeck Event Gateway for reliable webhook infrastructure.

## Repository Structure

```
webhook-skills/
├── README.md                    # Installation guide and skills overview
├── AGENTS.md                    # This file
├── TESTING.md                   # Testing documentation
├── LICENSE
├── scripts/
│   ├── test-all-examples.sh     # Run all example tests
│   └── test-agent-scenario.sh   # Run agent integration tests
├── .github/
│   └── workflows/
│       └── test-examples.yml    # CI pipeline
│
└── skills/
    ├── stripe-webhooks/
    │   ├── SKILL.md
    │   ├── references/
    │   │   ├── overview.md          # What Stripe webhooks are, common events
    │   │   ├── setup.md             # Configure in Stripe dashboard
    │   │   └── verification.md      # Signature verification details
    │   └── examples/
    │       ├── express/
    │       │   ├── README.md        # Entry point for this example
    │       │   ├── package.json
    │       │   ├── .env.example
    │       │   └── src/             # Internal structure as needed
    │       │       └── index.js
    │       ├── nextjs/
    │       │   └── ...
    │       └── fastapi/
    │           └── ...
    │
    ├── shopify-webhooks/
    │   ├── SKILL.md
    │   ├── references/
    │   │   ├── overview.md
    │   │   ├── setup.md
    │   │   └── verification.md
    │   └── examples/
    │       ├── express/
    │       ├── nextjs/
    │       └── fastapi/
    │
    ├── github-webhooks/
    │   ├── SKILL.md
    │   ├── references/
    │   │   ├── overview.md
    │   │   ├── setup.md
    │   │   └── verification.md
    │   └── examples/
    │       ├── express/
    │       ├── nextjs/
    │       └── fastapi/
    │
    ├── webhook-handler-patterns/
    │   ├── SKILL.md
    │   └── references/
    │       ├── idempotency.md
    │       ├── error-handling.md
    │       ├── retry-logic.md
    │       └── frameworks/
    │           ├── express.md
    │           ├── nextjs.md
    │           └── fastapi.md
    │
    └── hookdeck-event-gateway/
        ├── SKILL.md
        ├── references/
        │   ├── 01-setup.md
        │   ├── 02-scaffold.md
        │   ├── 03-listen.md
        │   ├── 04-iterate.md
        │   ├── connections.md
        │   └── verification.md
        └── examples/
            ├── express/
            ├── nextjs/
            └── fastapi/
```

## Skill Types

This repository contains three types of skills:

### Provider Skills (stripe-webhooks, shopify-webhooks, github-webhooks)

Skills for receiving webhooks from specific providers. Each provider skill should cover:

1. **Endpoint setup** — Creating the webhook receiver route
2. **Signature verification** — Validating the webhook is authentic
3. **Event handling** — Parsing and processing specific event types
4. **Hookdeck integration** — Optional reliability layer via Event Gateway

### Pattern Skills (webhook-handler-patterns)

Framework-agnostic best practices applicable across any webhook integration:

- Idempotency patterns
- Error handling and retry logic
- Async processing with queues
- Framework-specific guidance (Express, Next.js, FastAPI)

### Infrastructure Skills (hookdeck-event-gateway)

Skills for setting up Hookdeck's Event Gateway with signature verification examples per framework.

## SKILL.md Format

Every SKILL.md must have YAML frontmatter followed by markdown instructions.

### Frontmatter Requirements

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars, lowercase, letters/numbers/hyphens only, must match directory name |
| `description` | Yes | Max 1024 chars, describes what the skill does and when to use it |
| `license` | No | Use `MIT` for this repo |
| `metadata` | No | Include `author: hookdeck`, `version`, and `repository` |

Use YAML multiline syntax (`>`) for longer descriptions with trigger phrases:

```yaml
---
name: stripe-webhooks
description: >
  Receive and verify Stripe webhooks. Use when setting up Stripe webhook
  handlers, debugging signature verification, or handling payment events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---
```

### Content Guidelines

- Keep SKILL.md under 500 lines / < 5,000 tokens
- Put detailed reference material in `references/` files
- **Links within the same skill:** Use relative paths (e.g. `references/verification.md`, `examples/express/`).
- **Links to another skill:** Use absolute GitHub URLs so links resolve when only one skill is installed. Use the `main` branch: `https://github.com/hookdeck/webhook-skills/blob/main/skills/{skill-name}/…` for a file, or `https://github.com/hookdeck/webhook-skills/tree/main/skills/{skill-name}` for the skill root.

### File References from SKILL.md

SKILL.md can reference two types of supporting content:

**`references/`** — Documentation files the agent loads into context on demand. These should be one level deep from SKILL.md (no reference chains like A → B → C).

```markdown
# Good - agent loads this file directly
See [verification details](references/verification.md) for common gotchas.

# Avoid - creates a reference chain
See [verification](references/stripe/auth/verification.md)
```

**`examples/`** — Pointers to self-contained example projects. SKILL.md references the example directory; each example has its own README as the entry point. The internal structure of examples can be as deep as a real project requires.

```markdown
# Good - points to the example, user follows its README
See the [Express example](examples/express/) for a complete implementation.

# Avoid - reaching into example internals from SKILL.md
See [the webhook handler](examples/express/src/handlers/stripe.js)
```

## Provider Skill Template

Provider skills (Stripe, Shopify, GitHub) should follow this structure:

```markdown
---
name: {provider}-webhooks
description: >
  Receive and verify {Provider} webhooks. Use when setting up {Provider} webhook
  handlers, debugging signature verification, or handling {common events}.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# {Provider} Webhooks

## When to Use This Skill

- Setting up {Provider} webhook handlers
- Debugging signature verification failures
- Understanding {Provider} event types and payloads

## Resources

- `overview.md` - What {Provider} webhooks are, common event types
- `setup.md` - Configure webhooks in {Provider} dashboard, get signing secret
- `verification.md` - Signature verification details and gotchas
- `examples/` - Runnable examples per framework

## Local Development

For local webhook testing, install Hookdeck CLI:

```bash
# Install via npm
npm install -g hookdeck-cli

# Or via Homebrew
brew install hookdeck/hookdeck/hookdeck
```

Then start the tunnel:

```bash
hookdeck listen 3000 --path /webhooks/{provider}
```

No account required. Provides local tunnel + web UI for inspecting requests.

## Related Skills

{List other relevant webhook skills from the skills/ directory. Include:
- Other provider webhook skills (e.g., stripe-webhooks, shopify-webhooks)
- webhook-handler-patterns for cross-cutting concerns
- hookdeck-event-gateway for production infrastructure}
```

### Key Sections Explained

**When to Use This Skill** — Concrete scenarios that help the agent decide when to activate this skill. Include common tasks developers ask for help with. Mirror how agents phrase questions (e.g., "How do I verify Stripe webhook signatures?").

**Resources** — A table of contents listing available reference files and examples. Tells the agent exactly what's available without loading everything.

**Local Development** — The Hookdeck CLI funnel. Position as "no account required" for frictionless adoption.

**Related Skills** — Cross-references to other skills in the repository. **CRITICAL for discoverability.**

When generating a new skill, search the `skills/` directory to find other existing skills and link to them. Always include:
- **Other provider webhook skills** — Creates semantic clustering for discovery
- **`webhook-handler-patterns`** — For idempotency, error handling, retry logic
- **`hookdeck-event-gateway`** — For production webhook infrastructure

Use **absolute GitHub URLs** for cross-skill links so they resolve when only one skill is installed: `https://github.com/hookdeck/webhook-skills/tree/main/skills/{skill-name}` with brief descriptions.

## Examples Structure

Each example is a self-contained project. The README.md is the entry point that SKILL.md references.

```
examples/{framework}/
├── README.md           # Entry point - setup and run instructions
├── package.json        # or requirements.txt for Python
├── .env.example        # Required environment variables
└── src/                # Internal structure as needed for a real project
    └── ...
```

### Example README Template

```markdown
# {Provider} Webhooks - {Framework} Example

Minimal example of receiving {Provider} webhooks with signature verification.

## Prerequisites

- Node.js 18+ (or Python 3.9+)
- {Provider} account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your {Provider} webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

{How to send a test webhook or use Provider's test mode}
```

### Example Code Guidelines

- Be idiomatic to the framework and language (Express examples should look like Express code, FastAPI should be Pythonic, Next.js should follow Next.js conventions)
- Include only the code needed to demonstrate webhook handling
- Add inline comments explaining key concepts (signature verification, event parsing)
- **Prefer manual signature verification** — SDK methods can have undocumented parameter names or change between versions; manual verification is more reliable and educational
- If showing SDK verification, **always verify the exact method signature against official docs** — parameter names like `secret` vs `webhookSecret` or header key formats can cause silent failures
- Show proper error handling (return appropriate status codes)
- Keep dependencies minimal (avoid adding SDK just for verification if manual works)

### Dependency Version Guidelines

**CRITICAL: Always use current/latest stable versions of dependencies.** AI training data contains older versions that may have security vulnerabilities.

- **Look up current versions** before adding dependencies to package.json or requirements.txt
- **For Next.js**: Use version 15.x or later (not 14.x which has known vulnerabilities)
- **For Express**: Use version 4.21.x or later
- **For FastAPI**: Use version 0.115.x or later
- **Never hardcode old versions** from memory — always verify against npm/pypi
- When in doubt, use `latest` or `^` prefix to allow minor updates

### Test Script Guidelines

**CRITICAL: Test scripts must run once and exit.** They will be run in CI and automated pipelines.

- **For vitest**: Use `"test": "vitest run"` (not just `vitest` which defaults to watch mode)
- **For jest**: Use `"test": "jest"` (exits by default, but avoid `--watch`)
- **For pytest**: Use `pytest` (exits by default)
- **Never use watch mode** in the default test script — it will hang in automated environments

**How to check current versions:**
```bash
# Node.js packages
npm view <package> version

# Python packages  
pip index versions <package>
```

**Common outdated versions to avoid:**
- `next@14.x` → use `next@15.x` or later
- `express@4.18.x` → use `express@4.21.x` or later
- `fastapi@0.100.x` → use `fastapi@0.115.x` or later

## References Structure

Reference files in `references/` are documentation the agent loads on demand. Keep them focused and flat (no nested directories).

### Common Reference Files for Provider Skills

Provider skills should include these reference files that follow the developer journey:

**`overview.md`** — What these webhooks are and when they fire

```markdown
# {Provider} Webhooks Overview

## What Are {Provider} Webhooks?

{Brief explanation of how {Provider} uses webhooks}

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `{event.type}` | {description} | {use cases} |
| `{event.type}` | {description} | {use cases} |

## Event Payload Structure

{Common payload fields across events}

## Full Event Reference

For the complete list of events, see [{Provider}'s webhook documentation]({url}).
```

**`setup.md`** — Configure webhooks in the provider dashboard

```markdown
# Setting Up {Provider} Webhooks

## Prerequisites

- {Provider} account with {required access level}
- Your application's webhook endpoint URL

## Get Your Signing Secret

1. Go to {Provider} Dashboard → {path}
2. {Steps to get signing secret}

## Register Your Endpoint

1. {Steps to add webhook endpoint}
2. Select events to receive: {recommended events}

## Test Mode vs Live Mode

{Provider-specific guidance on testing}
```

**`verification.md`** — Signature verification implementation details

```markdown
# {Provider} Signature Verification

## How It Works

{Explanation of {Provider}'s signature scheme}

## Implementation

{Code showing verification with official SDK}

## Common Gotchas

- {Gotcha 1: e.g., raw body parsing}
- {Gotcha 2: e.g., timestamp tolerance}
- {Gotcha 3: e.g., header naming}

## Debugging Verification Failures

{Common errors and how to fix them}
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Skill directory | kebab-case | `stripe-webhooks` |
| SKILL.md | Uppercase | `SKILL.md` |
| References | kebab-case.md, flat (no subdirectories) | `overview.md`, `setup.md`, `verification.md` |
| Example directories | lowercase | `express`, `nextjs`, `fastapi` |

## Contributing a New Provider Skill

### Checklist

Use this checklist when creating a new provider skill:

#### Core Files
- [ ] `skills/{provider}-webhooks/SKILL.md` - Main skill file with frontmatter
- [ ] `skills/{provider}-webhooks/references/overview.md` - Webhook concepts, common events
- [ ] `skills/{provider}-webhooks/references/setup.md` - Dashboard configuration
- [ ] `skills/{provider}-webhooks/references/verification.md` - Signature verification details

#### Examples (each framework)
- [ ] `examples/express/package.json`
- [ ] `examples/express/.env.example`
- [ ] `examples/express/README.md`
- [ ] `examples/express/src/index.js`
- [ ] `examples/express/test/webhook.test.js`
- [ ] `examples/nextjs/package.json`
- [ ] `examples/nextjs/.env.example`
- [ ] `examples/nextjs/README.md`
- [ ] `examples/nextjs/app/webhooks/{provider}/route.ts`
- [ ] `examples/nextjs/test/webhook.test.ts`
- [ ] `examples/nextjs/vitest.config.ts`
- [ ] `examples/fastapi/requirements.txt`
- [ ] `examples/fastapi/.env.example`
- [ ] `examples/fastapi/README.md`
- [ ] `examples/fastapi/main.py`
- [ ] `examples/fastapi/test_webhook.py`

#### Integration
- [ ] Update `README.md` - Add skill to Provider Skills table
- [ ] Update `scripts/test-agent-scenario.sh` - Add test scenarios for the new provider
- [ ] Update `.github/workflows/test-examples.yml` - Add provider to all three test matrices (express, nextjs, fastapi)
- [ ] Run example tests: `cd examples/express && npm test`
- [ ] Run agent test: `./scripts/test-agent-scenario.sh {provider}-express --dry-run`

### Provider Research (Do This First)

Before creating any files, research the provider's webhook implementation. **Always verify against the provider's official documentation** — third-party examples and AI training data may be outdated.

Gather this information:

```markdown
## Provider: {ProviderName}

### Signature Verification
- Algorithm: (e.g., HMAC-SHA256, RSA)
- Encoding: (e.g., hex, base64)
- Header name(s): (e.g., X-Provider-Signature, Stripe-Signature)
- Secret format: (e.g., whsec_xxx, starts with sk_)

### SDK Verification Method (if using SDK)
- Package name: (e.g., stripe, @octokit/webhooks)
- Method signature: (exact parameters and their names)
- Example: `provider.webhooks.verify({ payload, headers: {id, timestamp, signature}, webhookSecret })`

### Manual Verification (recommended for examples)
- Signed content format: (e.g., "{timestamp}.{payload}", "{header}.{payload}")
- Signature comparison: (timing-safe, base64 decode, etc.)

### Events
- Common events: (list 5-8 most common)
- Event payload structure: (key fields)

### Gotchas
- (e.g., "Must use raw body, not parsed JSON")
- (e.g., "Timestamp tolerance is 5 minutes")
- (e.g., "Header names are lowercase in some frameworks")
```

**Why manual verification is often better for examples:**
- SDK APIs change and documentation may be outdated
- Manual verification is more educational (shows exactly how it works)
- Fewer dependencies (don't need full SDK just for verification)
- Works consistently across all languages/frameworks

### Step-by-Step Process

1. **Research the provider** (see "Provider Research" above) — verify all details against official docs
2. Create `skills/{provider}-webhooks/` directory
3. Add SKILL.md following the provider skill template:
   - Frontmatter with name, description, license, metadata
   - "When to Use This Skill" section
   - "Essential Code" section with inline examples (show both SDK and manual verification)
   - "Common Event Types" table
   - "Environment Variables" section
   - "Local Development" section with Hookdeck CLI
   - "Reference Materials" section
   - "Related Skills" section
4. Add reference files in `references/`:
   - `overview.md` - What the webhooks are, common events
   - `setup.md` - Dashboard configuration, signing secret
   - `verification.md` - Signature verification details (include manual verification code)
5. Create examples for Express, Next.js, and FastAPI in `examples/`
   - **Prefer manual signature verification** over SDK methods (more reliable, educational, fewer dependencies)
   - Include comprehensive tests for each example
6. Run example tests locally: `cd examples/express && npm test` (repeat for each framework)
7. Update integration files:
   - `README.md` - Add skill to Provider Skills table
   - `scripts/test-agent-scenario.sh` - Add test scenarios
   - `.github/workflows/test-examples.yml` - Add provider to test matrices
8. Test with agent: `./scripts/test-agent-scenario.sh {provider}-express --dry-run`

## Skill Discoverability

Skills are discovered by agents through semantic search and keyword matching. Optimize for discoverability by following these guidelines.

### SKILL.md Optimization

**Lead with clear trigger phrases** in the description frontmatter:

```yaml
description: >
  Receive and verify Stripe webhooks. Use when setting up Stripe webhook
  handlers, debugging Stripe signature verification, or handling Stripe
  payment events like checkout.session.completed.
```

Include:
- Provider name (Stripe, GitHub, Shopify)
- Action words (receive, verify, validate, handle, debug)
- Specific event names (checkout.session.completed, push, pull_request)

**"When to Use This Skill" section** — Mirror how agents phrase questions:

```markdown
## When to Use This Skill

- How do I receive Stripe webhooks?
- How do I verify Stripe webhook signatures?
- How do I handle checkout.session.completed events?
- Why is my Stripe webhook signature verification failing?
```

**Repeat key terms naturally** throughout the SKILL.md:
- `webhook` (6-10 times)
- `signature verification`
- Provider name
- Specific event types
- `raw body` (common gotcha)

### Related Skills Section (REQUIRED)

Every SKILL.md must include a Related Skills section at the end. This creates semantic clustering that helps retrieval systems.

**When generating a skill, search the `skills/` directory** to discover existing skills and link to all of them:

```markdown
## Related Skills

- [other-provider-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/other-provider-webhooks) - Brief description
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
```

Always include:
- **All other provider skills** found in `skills/` (creates semantic clustering)
- **`webhook-handler-patterns`** — For cross-cutting concerns
- **`hookdeck-event-gateway`** — For production infrastructure

Use **absolute GitHub URLs** (`https://github.com/hookdeck/webhook-skills/tree/main/skills/{skill-name}`) so links resolve when only one skill is installed.

### Recommended: webhook-handler-patterns (for provider and infrastructure skills)

Provider skills (e.g. stripe-webhooks, shopify-webhooks) and the hookdeck-event-gateway skill should include a **Recommended: webhook-handler-patterns** section before Related Skills. This tells users and agents to install the patterns skill alongside the provider skill, and links to the key references with absolute GitHub URLs so the content is reachable even when only the provider skill is installed:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

### Naming Conventions for Discoverability

Use literal, provider-first naming:

| Good | Avoid |
|------|-------|
| `stripe-webhooks` | `payment-handler` |
| `github-webhooks` | `repo-events` |
| `webhook-handler-patterns` | `best-practices` |

Agents search like: "Stripe webhook skill", not "payment handler skill".

### Reference File Optimization

Use question-style headers in reference files:

```markdown
# How to Verify Stripe Webhook Signatures

## Why Signature Verification Matters

## Common Signature Verification Errors

## How to Debug Verification Failures
```

This matches how agents reason and search.

### Example Code Best Practices

When writing example code, follow these defensive patterns:

**Handle edge cases gracefully:**
```javascript
// GOOD - handles buffer length mismatch
return signatures.some(sig => {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;  // Different lengths = invalid
  }
});

// AVOID - throws on length mismatch
return crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expectedSignature)
);
```

**Always validate inputs:**
```javascript
// Check for missing headers before processing
if (!signatureHeader) {
  return res.status(400).send('Missing signature header');
}
```

**Return appropriate status codes:**
- `200` - Successfully processed
- `400` - Invalid request (missing headers, invalid JSON, invalid signature)
- `500` - Server error (unexpected exceptions)

**Use realistic test secrets:**
```javascript
// Document the secret format in tests so future maintainers understand it
// Example: Svix-style secrets are 'whsec_' + base64-encoded key
process.env.WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5';  // base64 of "test_secret_key"
```

**Generate valid test signatures:**
```javascript
// Tests should generate real signatures using the same algorithm as the provider
function generateTestSignature(payload, secret) {
  // Match the provider's exact signing algorithm
  const timestamp = Math.floor(Date.now() / 1000);
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signedContent).digest('base64');
}
```

## Testing

See [TESTING.md](TESTING.md) for comprehensive testing documentation.

### Quick Test Commands

**Run example tests:**
```bash
# All examples
./scripts/test-all-examples.sh

# Single example
cd skills/{provider}-webhooks/examples/express && npm test
```

**Run agent integration test:**
```bash
# Dry run (shows what would happen)
./scripts/test-agent-scenario.sh {provider}-express --dry-run

# Full test (requires Claude CLI)
./scripts/test-agent-scenario.sh {provider}-express
```

### Adding Test Scenarios

When adding a new provider skill, add scenarios to `scripts/test-agent-scenario.sh`:

```bash
# In the usage() function, add:
echo "  {provider}-express   - {Provider} webhook handling in Express"

# In get_scenario_config(), add:
{provider}-express)
    PROVIDER="{provider}"
    FRAMEWORK="express"
    SKILL_NAME="{provider}-webhooks"
    PROMPT="Add {Provider} webhook handling to my Express app. I want to handle {common_event} events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
    ;;
```

## Reviewing a Provider Skill or PR

When reviewing a provider skill (e.g. from a pull request or before merging):

### Step 1: Run Automated Review (Primary)

First, checkout the PR branch and run the automated review:

```bash
# Checkout the PR branch
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
git checkout pr-<PR_NUMBER>

# Run automated review (runs tests + AI review against provider docs)
./scripts/generate-skills.sh review {provider} --no-worktree
```

This runs all example tests and uses Claude to review the skill against provider documentation for accuracy. See [CONTRIBUTING.md](CONTRIBUTING.md) for acceptance thresholds (0 critical, ≤1 major, ≤2 minor issues).

### Step 2: Verify Integration (Not Covered by Automation)

The automated review checks skill content and tests, but does **not** verify integration with repository infrastructure. Manually confirm:

1. **README.md** — Provider added to Provider Skills table
2. **scripts/test-agent-scenario.sh** — At least one scenario added (e.g. `{provider}-express`) in both `usage()` and `get_scenario_config()`
3. **.github/workflows/test-examples.yml** — Provider added to all three test matrices (express, nextjs, fastapi)

### Step 3: Spot-Check Skill Content

Verify SKILL.md has required sections:
- Frontmatter with name, description, license, metadata
- "When to Use This Skill" section
- "Resources" or "Reference Materials" section
- "Related Skills" with **absolute GitHub URLs** (`https://github.com/hookdeck/webhook-skills/tree/main/skills/{skill-name}`)
- For provider skills: "Recommended: webhook-handler-patterns" section

### Quick Commands

```bash
# Run tests for a specific skill
cd skills/{provider}-webhooks/examples/express && npm test
cd skills/{provider}-webhooks/examples/nextjs && npm test
cd skills/{provider}-webhooks/examples/fastapi && pytest test_webhook.py -v

# Run all example tests
./scripts/test-all-examples.sh
```

Ensure test scripts exit properly (e.g. `"test": "vitest run"` not `"vitest"`).

## Related Resources

- [Agent Skills Specification](https://agentskills.io)
- [Skills Directory](https://skills.sh)
- [Hookdeck Documentation](https://hookdeck.com/docs)
- [Hookdeck CLI Reference](https://hookdeck.com/docs/cli)