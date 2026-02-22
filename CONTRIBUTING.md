# Contributing to Webhook Skills

Thank you for your interest in contributing! This project builds a comprehensive collection of webhook integration skills for AI coding agents, and community contributions are essential to its success.

## Ways to Contribute

| Contribution | Description |
|--------------|-------------|
| **Add a provider skill** | Create a webhook skill for a new provider (Twilio, SendGrid, Linear, etc.) |
| **Improve existing skills** | Fix bugs, update documentation, add missing event types |
| **Add framework examples** | Add examples for Flask, Hono, Deno, or other frameworks |
| **Report issues** | Found a bug or inaccuracy? [Open an issue](https://github.com/hookdeck/webhook-skills/issues) |
| **Request providers** | [Suggest a provider](https://github.com/hookdeck/webhook-skills/issues/new?labels=provider-request) you'd like to see covered |

---

## AI-Assisted Skill Generation (Recommended)

The recommended way to create new provider skills is using our AI-powered generator. It researches the provider's documentation, generates code for Express/Next.js/FastAPI, runs tests, reviews for accuracy, and iterates on failures automatically.

### Prerequisites

- **Node.js 18+**
- **Python 3.9+** (for FastAPI examples)
- **AI CLI Tool** — One of the following:
  - [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) — Install and authenticate with `claude login` (default)
  - [Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-for-common-tasks/use-copilot-in-the-cli) — GitHub Copilot command-line tool
- **GITHUB_TOKEN** — For PR creation (optional but recommended)

```bash
# Clone and setup
git clone https://github.com/hookdeck/webhook-skills.git
cd webhook-skills
cd scripts/skill-generator && npm install && cd ../..

# Optional: Create .env with GitHub token for PR creation
echo "GITHUB_TOKEN=your_token_here" > scripts/skill-generator/.env
```

### The Generation Process

The generator follows a multi-phase process:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Research   │ ──▶ │  Generate   │ ──▶ │    Test     │ ──▶ │   Review    │
│  Provider   │     │    Code     │     │  Examples   │     │  Accuracy   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                  │                   │                   │
       │                  │                   │                   │
       ▼                  ▼                   ▼                   ▼
  Read official      Create SKILL.md,     npm test for      Verify against
  documentation      references/, and     each framework    provider docs
                     all examples
```

Each phase can iterate up to 3 times to fix issues. If issues remain within acceptable thresholds, the skill is accepted and remaining issues are tracked in `TODO.md`.

### Quick Start: Generate a New Skill

```bash
# Generate with documentation URL (recommended for best results)
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr

# What happens:
# 1. Creates Git worktree in .worktrees/twilio (isolated branch)
# 2. Claude researches the provided docs
# 3. Generates SKILL.md, references/, and examples/
# 4. Runs tests for Express, Next.js, and FastAPI
# 5. Reviews for accuracy, fixes issues
# 6. Creates a draft PR if within acceptance thresholds
# 7. Generates TODO.md with any remaining minor issues
```

### Providing Good Documentation URLs

The quality of generated skills depends heavily on the documentation you provide. **More specific URLs = better results.**

```yaml
# Good: Multiple specific documentation URLs
providers:
  - name: chargebee
    displayName: Chargebee
    docs:
      webhooks: https://www.chargebee.com/docs/2.0/events_and_webhooks.html
      verification: https://www.chargebee.com/docs/2.0/webhook_settings.html
      events: https://www.chargebee.com/docs/2.0/events_list.html
    notes: >
      Uses Basic Auth for webhook verification (username:password).
      Secret is base64 encoded in the Authorization header.

# Okay: Single webhook documentation URL
providers:
  - name: twilio
    docs:
      webhooks: https://www.twilio.com/docs/usage/webhooks

# Minimal: No docs (Claude will search)
providers:
  - name: linear
```

You can also provide reference implementations:

```yaml
providers:
  - name: chargebee
    docs:
      webhooks: https://www.chargebee.com/docs/2.0/events_and_webhooks.html
      reference_impl: https://github.com/hookdeck/chargebee-demo/tree/main
    notes: >
      See reference_impl for working TypeScript/Express example.
```

### Provider Documentation Registry

All providers and their official documentation URLs are tracked in `providers.yaml` at the repository root. When adding a new provider:

1. Add the provider entry to `providers.yaml` with documentation URLs
2. Generate the skill using the config: `./scripts/generate-skills.sh generate {provider} --config providers.yaml`
3. Update the README.md Provider Skills table
4. Add at least one scenario to `scripts/test-agent-scenario.sh`

**Validate locally before pushing:**

```bash
# Validate a specific provider has all required files and integration updates
./scripts/validate-provider.sh stripe-webhooks

# Validate all providers
./scripts/validate-provider.sh --all
```

The CI workflow `validate-provider-pr.yml` runs this same validation automatically for new provider PRs.

### Acceptance Thresholds

Skills are accepted if issues found are within these thresholds:

| Severity | Max Allowed | Description |
|----------|-------------|-------------|
| Critical | 0 | Verification failures, missing files, security issues |
| Major | 1 | Incorrect information, inconsistencies |
| Minor | 2 | Style issues, minor improvements |
| **Total** | **5** | Combined limit |

If a skill is accepted with issues, they're tracked in `skills/{provider}-webhooks/TODO.md` for future improvement.

### Using a Configuration File

For generating multiple skills or providing detailed documentation, use a YAML config:

```yaml
# providers.yaml
providers:
  - name: twilio
    displayName: Twilio
    docs:
      webhooks: https://www.twilio.com/docs/usage/webhooks
      verification: https://www.twilio.com/docs/usage/security
    notes: Uses X-Twilio-Signature header with HMAC-SHA1

  - name: sendgrid
    displayName: SendGrid
    docs:
      webhooks: https://docs.sendgrid.com/for-developers/tracking-events/event
      verification: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
    notes: Uses ECDSA signatures with public key verification
```

```bash
# Generate all providers from config
./scripts/generate-skills.sh generate --config providers.yaml --create-pr=draft
```

---

## Common Workflows

### 1. Generate a New Skill (Simple)

```bash
./scripts/generate-skills.sh generate "twilio" --create-pr
```

### 2. Generate with Documentation (Recommended)

```bash
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr
```

### 3. Generate Multiple Skills in Parallel

```bash
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  "sendgrid=https://docs.sendgrid.com/webhooks" \
  "mailgun=https://documentation.mailgun.com/webhooks" \
  --create-pr=draft
```

By default, all providers run in parallel. Use `--parallel <n>` to limit concurrency.

### 4. Use a Different CLI Tool

```bash
# Use Copilot instead of Claude
./scripts/generate-skills.sh generate "twilio" --cli copilot --create-pr
```

### 5. Preview What Would Happen (Dry Run)

```bash
./scripts/generate-skills.sh generate "linear" --dry-run
```

### 6. Resume After a Failed Generation

If generation fails (tests won't pass, API timeout, etc.), the worktree is preserved:

```bash
# Check what's in the worktree
ls -la .worktrees/

# Resume with the review command
./scripts/generate-skills.sh review twilio \
  --working-dir .worktrees/twilio \
  --create-pr
```

The review command will:
1. Use the existing worktree (won't create a new one)
2. Run tests to verify current state
3. AI reviews and fixes any issues
4. If within thresholds, pushes and creates PR

### 7. Update an Existing Skill

Use the review command to improve skills already in the repository. The recommended workflow uses `providers.yaml` as the source of truth:

**Step 1: Update providers.yaml with current documentation**

First, ensure `providers.yaml` has accurate and up-to-date documentation URLs for the provider:

```yaml
# providers.yaml (at repo root)
providers:
  - name: stripe
    displayName: Stripe
    docs:
      webhooks: https://docs.stripe.com/webhooks
      verification: https://docs.stripe.com/webhooks/signatures
      events: https://docs.stripe.com/api/events/types
    notes: >
      Check for any new event types. Verify signature verification
      is current with latest SDK changes.
```

**Step 2: Run the review command**

```bash
# Review and update a single provider
./scripts/generate-skills.sh review stripe --config providers.yaml --create-pr

# Review multiple providers at once
./scripts/generate-skills.sh review stripe shopify --config providers.yaml --create-pr

# Review all providers (periodic maintenance)
./scripts/generate-skills.sh review --config providers.yaml --create-pr
```

The review command will:
1. Read provider documentation URLs from `providers.yaml`
2. Run all example tests to verify current state
3. AI reviews the skill against the official documentation
4. Fixes any issues found (up to 3 iterations)
5. If within acceptance thresholds, creates a PR with the updates

**Tip:** When a provider updates their webhook documentation or changes their API, update `providers.yaml` first, then run the review to propagate changes to the skill.

### 8. Manual Review and PR Creation

```bash
# Generate without PR - inspect results first
./scripts/generate-skills.sh generate "clerk"

# Review the generated code
ls .worktrees/clerk/skills/clerk-webhooks/
cat .worktrees/clerk/skills/clerk-webhooks/SKILL.md

# If satisfied, create PR manually
cd .worktrees/clerk
git push -u origin HEAD
gh pr create --title "feat: add clerk-webhooks skill"
# Add a description (see "Pull Request Title and Description" below), e.g.:
# gh pr create --title "feat: add clerk-webhooks skill" --body "$(cat pr-description.md)"
```

When creating or updating a PR, use the title and description format in the next section.

### 9. Pull Request Title and Description

Use these conventions so PRs are consistent and easy to review.

**Title format (conventional commits):**

| Type of change | Title format | Example |
|----------------|--------------|---------|
| New provider skill | `feat: add {provider}-webhooks skill` | `feat: add clerk-webhooks skill` |
| Improvements / fixes to existing skill | `fix: improve {provider}-webhooks skill` | `fix: improve deepgram-webhooks skill` |

**Description structure:** Include the following so reviewers know what's in the PR and how to verify it.

1. **Summary** — One or two sentences: what this PR does (e.g. "Add webhook skill for Deepgram" or "Improvements to deepgram-webhooks skill").
2. **What's included** — For new or large PRs: SKILL.md, references (overview, setup, verification), examples (Express, Next.js, FastAPI) with test frameworks.
3. **Integration** — If applicable: README (Provider Skills table), `scripts/test-agent-scenario.sh` (scenario added).
4. **Testing** — How to run tests, e.g.:
   - `cd skills/{provider}-webhooks/examples/express && npm test`
   - `cd skills/{provider}-webhooks/examples/nextjs && npm test`
   - `cd skills/{provider}-webhooks/examples/fastapi && pytest test_webhook.py -v`
5. **Documentation reference** (optional) — Links to provider webhook docs used for the skill.
6. **Test plan** (optional) — Checklist for reviewers, e.g.:
   - [ ] Verify signature/authentication works correctly
   - [ ] Test with real webhook events (or note automated tests cover behavior)
   - [ ] Review documentation accuracy

For generator-created PRs, the body may also include **Generation details** (provider, tests passed, review passed, iterations, issues found/fixed). When editing an existing PR (e.g. after review), update the title and description to match these conventions if they don't already.

### 10. Clean Up Worktrees

```bash
# List all worktrees
git worktree list

# Remove a specific worktree
git worktree remove .worktrees/twilio

# Remove all worktrees
rm -rf .worktrees && git worktree prune
```

---

## Generator Reference

### Generate Command

```bash
./scripts/generate-skills.sh generate [providers...] [options]
```

**Arguments:**
- `providers` — Provider names, optionally with documentation URLs
  - Simple: `twilio`
  - With docs: `twilio=https://www.twilio.com/docs/usage/webhooks`

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--cli <tool>` | CLI tool to use (`claude`, `copilot`) | claude |
| `--working-dir <path>` | Generate in specific directory (skip worktree) | Creates worktree |
| `--no-worktree` | Generate in current directory (shorthand for `--working-dir .`) | Creates worktree |
| `--create-pr [type]` | Push and create PR (`true` or `draft`) | No PR |
| `--parallel <n>` | Max concurrent generations | All providers |
| `--model <model>` | Model to use | claude-opus-4-20250514 |
| `--max-iterations <n>` | Max test/fix cycles | 3 |
| `--base-branch <branch>` | Branch to create from | main |
| `--skip-tests` | Skip test execution | false |
| `--skip-review` | Skip AI review phase | false |
| `--config <file>` | YAML config file | — |
| `--dry-run` | Preview without executing | false |

### Review Command

```bash
./scripts/generate-skills.sh review [providers...] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--cli <tool>` | CLI tool to use (`claude`, `copilot`) | claude |
| `--working-dir <path>` | Review in specific directory (skip worktree) | Creates worktree |
| `--no-worktree` | Review in current directory (shorthand for `--working-dir .`) | Creates worktree |
| `--create-pr [type]` | Create PR with fixes | No PR |
| `--max-iterations <n>` | Max fix cycles | 3 |
| `--parallel <n>` | Max concurrent reviews | All providers |
| `--model <model>` | Model to use | claude-opus-4-20250514 |
| `--branch-prefix <prefix>` | Branch name prefix | improve |
| `--config <file>` | YAML config file | — |
| `--dry-run` | Preview without executing | false |

---

## Adding New CLI Tools

The generator supports a pluggable CLI adapter system. To add support for a new AI CLI tool:

1. **Create an adapter file** at `scripts/skill-generator/lib/cli-adapters/<tool>.ts`:

```typescript
import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

const DEFAULT_MODEL = 'your-model-name-here';
export const myToolAdapter: CliAdapter = {
  name: 'mytool',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    const model = options.model ?? DEFAULT_MODEL;
    
    return {
      command: 'mytool',  // The CLI command to execute
      args: [
        // Arguments specific to this CLI tool
        '--model', model,
        '--some-flag',
      ],
    };
  },
};
```

2. **Register the adapter** in `scripts/skill-generator/lib/cli-adapters/index.ts`:

```typescript
import { myToolAdapter } from './mytool';

const adapters: Map<string, CliAdapter> = new Map([
  ['claude', claudeAdapter],
  ['copilot', copilotAdapter],
  ['mytool', myToolAdapter],  // Add your adapter here
]);
```

3. **Use it** with the `--cli` flag:

```bash
./scripts/generate-skills.sh generate stripe --cli mytool
```

The adapter interface is simple — it just needs to return the command name and arguments. The generator handles stdin prompt passing, timeout, progress display, and output capture.

---

## Manual Contribution

Prefer to write code yourself? Follow these steps.

### 1. Understand the Structure

Each provider skill follows this structure:

```
skills/{provider}-webhooks/
├── SKILL.md              # Entry point with frontmatter
├── TODO.md               # Known issues (auto-generated, optional)
├── references/
│   ├── overview.md       # What webhooks are, common events
│   ├── setup.md          # Dashboard configuration
│   └── verification.md   # Signature verification details
└── examples/
    ├── express/          # Node.js + Express example
    ├── nextjs/           # Next.js App Router example
    └── fastapi/          # Python + FastAPI example
```

### 2. Research the Provider

Before writing code, gather:

- **Signature verification method** — Algorithm (HMAC-SHA256, RSA, ECDSA), encoding, header names
- **Standard Webhooks?** — Some providers use [Standard Webhooks](https://www.standardwebhooks.com/) (headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`)
- **Common webhook events** — The 5-8 most commonly used events with exact names
- **Gotchas** — Raw body requirements, timestamp validation, secret encoding

### 3. Create Your Skill

```bash
# Create directory structure
mkdir -p skills/{provider}-webhooks/{references,examples/{express,nextjs,fastapi}}

# Copy from an existing skill as a template
cp -r skills/stripe-webhooks/SKILL.md skills/{provider}-webhooks/
cp -r skills/stripe-webhooks/references/* skills/{provider}-webhooks/references/
```

### 4. Code Guidelines

See [AGENTS.md](AGENTS.md) for detailed technical guidelines. Key points:

**Dependencies:** Use current stable versions. The generator queries npm/pip for latest versions at generation time.

**Test Scripts:** Must run once and exit:
```json
"test": "vitest run"   // ✓ Correct
"test": "vitest"       // ✗ Hangs in watch mode
```

**Signature Verification:** Use the provider's official SDK when available; include manual verification as a fallback for frameworks the SDK doesn't support (e.g., FastAPI when only Node SDK exists).

**Event Names:** Must match official documentation exactly. Common mistakes:
- Underscores vs dots vs spaces (`spam_report` vs `spam.report` vs `spam report`)
- Past tense (`completed` vs `succeeded`)

### 5. Test Your Skill

```bash
cd skills/{provider}-webhooks/examples/express && npm install && npm test
cd ../nextjs && npm install && npm test
cd ../fastapi && pip install -r requirements.txt && pytest
```

### 6. Submit a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/{provider}-webhooks`
3. Commit your changes
4. Push and open a PR using the [PR title and description](#8-pull-request-title-and-description) format (e.g. `feat: add {provider}-webhooks skill` for new skills, `fix: improve ...` for improvements). New skills use `feat:` prefix, improvements to existing skills use `fix:`.

---

## Getting Help

- **Questions?** [Start a discussion](https://github.com/hookdeck/webhook-skills/discussions)
- **Found a bug?** [Open an issue](https://github.com/hookdeck/webhook-skills/issues)
- **Need a provider?** [Request it](https://github.com/hookdeck/webhook-skills/issues/new?labels=provider-request)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
