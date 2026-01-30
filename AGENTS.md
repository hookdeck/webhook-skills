# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A community collection of webhook integration skills for AI coding agents. Skills provide step-by-step instructions for setting up webhook receivers, handling events, and integrating with the Hookdeck Event Gateway for reliable webhook infrastructure.

## Repository Structure

```
webhook-skills/
├── README.md                    # Installation guide and skills overview
├── AGENTS.md                    # This file
├── LICENSE
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
  version: "1.0.0"
  repository: https://github.com/hookdeck/webhook-skills
---
```

### Content Guidelines

- Keep SKILL.md under 500 lines / < 5,000 tokens
- Put detailed reference material in `references/` files
- Use relative paths when referencing other files

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
  version: "1.0.0"
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

For local webhook testing, use Hookdeck CLI:

```bash
brew install hookdeck/hookdeck/hookdeck
hookdeck listen 3000 --path /webhooks/{provider}
```

No account required. Provides local tunnel + web UI for inspecting requests.

## Related Skills

- `webhook-handler-patterns` - Cross-cutting patterns (idempotency, retries, framework guides)
- `hookdeck-event-gateway` - Production infrastructure (routing, replay, monitoring)
```

### Key Sections Explained

**When to Use This Skill** — Concrete scenarios that help the agent decide when to activate this skill. Include common tasks developers ask for help with.

**Resources** — A table of contents listing available reference files and examples. Tells the agent exactly what's available without loading everything.

**Local Development** — The Hookdeck CLI funnel. Position as "no account required" for frictionless adoption.

**Related Skills** — Cross-references to other skills in the repository. Helps with discoverability and lets the agent suggest complementary skills.

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
- Use the provider's official SDK for signature verification
- Show proper error handling (return appropriate status codes)
- Keep dependencies minimal

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

1. Create `skills/{provider}-webhooks/` directory
2. Add SKILL.md following the provider skill template:
   - Frontmatter with name, description, license, metadata
   - "When to Use This Skill" section
   - "Resources" section listing available files
   - "Local Development" section with Hookdeck CLI
   - "Related Skills" section
3. Add reference files in `references/`:
   - `overview.md` - What the webhooks are, common events
   - `setup.md` - Dashboard configuration, signing secret
   - `verification.md` - Signature verification details
4. Create examples for Express, Next.js, and FastAPI in `examples/`
5. Test locally with `npx skills add ./skills/{provider}-webhooks --list`
6. Update root README.md to list the new skill

## Related Resources

- [Agent Skills Specification](https://agentskills.io)
- [Skills Directory](https://skills.sh)
- [Hookdeck Documentation](https://hookdeck.com/docs)
- [Hookdeck CLI Reference](https://hookdeck.com/docs/cli)