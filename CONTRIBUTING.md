# Contributing to Webhook Skills

Thank you for your interest in contributing! This project builds a comprehensive collection of webhook integration skills for AI coding agents, and community contributions are essential to its success.

**All contributions are welcome** — whether you use AI tools, write code manually, or contribute documentation improvements.

## Ways to Contribute

| Contribution | Description |
|--------------|-------------|
| **Add a provider skill** | Create a webhook skill for a new provider (Twilio, SendGrid, Linear, etc.) |
| **Improve existing skills** | Fix bugs, update documentation, add missing event types |
| **Add framework examples** | Add examples for Flask, Hono, Deno, or other frameworks |
| **Report issues** | Found a bug or inaccuracy? [Open an issue](https://github.com/hookdeck/webhook-skills/issues) |
| **Request providers** | [Suggest a provider](https://github.com/hookdeck/webhook-skills/issues/new?labels=provider-request) you'd like to see covered |

## Quick Start: AI-Assisted Contribution (Recommended)

The fastest way to create a new provider skill is using our AI-powered generator. It researches the provider's documentation, generates code, runs tests, and iterates on failures automatically.

### Prerequisites

- **Node.js 18+**
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-cli)** — Install and authenticate with `claude login`
- **GitHub token** — Set `GITHUB_TOKEN` or `GH_TOKEN` in your environment for PR creation

> **Note:** The generator currently uses Claude CLI. Future versions may support additional AI providers.

### Generate a New Skill

```bash
# 1. Clone and setup
git clone https://github.com/hookdeck/webhook-skills.git
cd webhook-skills
cd scripts/skill-generator && npm install && cd ../..

# 2. Generate a skill (with documentation URL for best results)
./scripts/generate-skills.sh generate "providername=https://docs.provider.com/webhooks"

# 3. Review the generated code in .worktrees/providername/

# 4. When satisfied, create a PR
./scripts/generate-skills.sh generate "providername=https://docs.provider.com/webhooks" --create-pr
```

The generator will:
1. Research the provider's webhook documentation
2. Create SKILL.md with accurate verification details
3. Generate examples for Express, Next.js, and FastAPI
4. Write and run tests, iterating on failures
5. Optionally push and create a pull request

See [Generator Reference](#generator-reference) below for all options.

## Manual Contribution

Prefer to write code yourself? Follow these steps:

### 1. Understand the Structure

Each provider skill follows this structure:

```
skills/{provider}-webhooks/
├── SKILL.md              # Entry point with frontmatter
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

- **Signature verification method** — Algorithm (HMAC-SHA256, RSA), encoding, header names
- **Common webhook events** — The 5-8 most commonly used events
- **Gotchas** — Raw body requirements, timestamp validation, etc.

### 3. Create Your Skill

```bash
# Create directory structure
mkdir -p skills/{provider}-webhooks/{references,examples/{express,nextjs,fastapi}}

# Copy from an existing skill as a template
cp -r skills/stripe-webhooks/SKILL.md skills/{provider}-webhooks/
cp -r skills/stripe-webhooks/references/* skills/{provider}-webhooks/references/
```

### 4. Write the Code

See [AGENTS.md](AGENTS.md) for detailed guidelines on:
- SKILL.md frontmatter format
- Reference file templates
- Example code structure and conventions
- Signature verification best practices

**Key requirements:**
- Use current stable dependency versions (Next.js 15+, Express 4.21+)
- Test scripts must exit after running (`vitest run`, not `vitest`)
- Prefer manual signature verification over SDK methods
- Include comprehensive tests

### 5. Test Your Skill

```bash
# Run tests for each framework
cd skills/{provider}-webhooks/examples/express && npm install && npm test
cd ../nextjs && npm install && npm test
cd ../fastapi && pip install -r requirements.txt && pytest
```

### 6. Submit a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/{provider}-webhooks`
3. Commit your changes with a descriptive message
4. Push and open a PR

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
| `--create-pr [type]` | Push and create PR (`true` or `draft`) | No PR |
| `--parallel <n>` | Max concurrent generations | 2 |
| `--model <model>` | Claude model | claude-opus-4-20250514 |
| `--max-iterations <n>` | Max test/fix cycles | 3 |
| `--base-branch <branch>` | Branch to create from | main |
| `--skip-tests` | Skip test execution | false |
| `--skip-review` | Skip AI review phase | false |
| `--config <file>` | YAML config file | — |
| `--dry-run` | Preview without executing | false |

**Examples:**

```bash
# Generate with documentation URL
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr

# Multiple providers in parallel
./scripts/generate-skills.sh generate \
  "sendgrid=https://docs.sendgrid.com/webhooks" \
  "mailgun=https://documentation.mailgun.com/webhooks" \
  --parallel 2 --create-pr=draft

# Preview what would happen
./scripts/generate-skills.sh generate "linear" --dry-run
```

### Review Command

Review and improve existing skills:

```bash
./scripts/generate-skills.sh review [providers...] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--working-dir <path>` | Review in specific directory | Creates worktree |
| `--create-pr [type]` | Create PR with fixes | No PR |
| `--max-iterations <n>` | Max fix cycles | 3 |
| `--parallel <n>` | Max concurrent reviews | 2 |
| `--model <model>` | Claude model | claude-opus-4-20250514 |
| `--branch-prefix <prefix>` | Branch name prefix | improve |
| `--config <file>` | YAML config file | — |
| `--dry-run` | Preview without executing | false |

**Examples:**

```bash
# Review and fix an existing skill
./scripts/generate-skills.sh review stripe --create-pr

# Continue from a failed generation
./scripts/generate-skills.sh review deepgram \
  --working-dir .worktrees/deepgram \
  --create-pr
```

### Common Workflows

#### 1. Generate a New Skill (End-to-End)

```bash
# Generate skill with documentation for best results
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr

# What happens:
# 1. Creates worktree in .worktrees/twilio
# 2. Claude researches docs and generates skill
# 3. Runs tests, iterates on failures (up to 3 times)
# 4. Reviews for accuracy, fixes issues
# 5. Pushes and creates PR
# 6. Cleans up worktree on success
```

#### 2. Generate Multiple Skills in Parallel

```bash
# Generate 3 providers with max 2 running concurrently
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  "sendgrid=https://docs.sendgrid.com/webhooks" \
  "mailgun=https://documentation.mailgun.com/webhooks" \
  --parallel 2 \
  --create-pr=draft

# Creates draft PRs for each provider
```

#### 3. Preview Without Executing (Dry Run)

```bash
# See what would happen without making changes
./scripts/generate-skills.sh generate "linear" --dry-run
```

#### 4. Retry After a Failed Generation

If generation fails (tests won't pass, Claude times out, etc.), the worktree is preserved:

```bash
# Check what's in the worktree
ls -la .worktrees/

# Review the failed skill, fix issues, and create PR
./scripts/generate-skills.sh review twilio \
  --working-dir .worktrees/twilio \
  --create-pr

# What happens:
# 1. Uses existing worktree (doesn't create new one)
# 2. Runs tests
# 3. AI reviews and fixes any issues
# 4. If review passes, pushes and creates PR
```

#### 5. Review and Improve an Existing Skill

```bash
# Review a skill that's already in the repo
./scripts/generate-skills.sh review stripe --create-pr

# Checks for:
# - Outdated dependencies
# - Documentation accuracy
# - Test coverage
# - Code consistency
```

#### 6. Manual Review Without PR Creation

```bash
# Generate without creating PR - inspect results first
./scripts/generate-skills.sh generate "clerk"

# Review the generated code
ls .worktrees/clerk/skills/clerk-webhooks/

# If satisfied, create PR manually
cd .worktrees/clerk
git push -u origin HEAD
gh pr create --title "feat: add clerk-webhooks skill"
```

#### 7. Clean Up Worktrees

```bash
# List all worktrees
git worktree list

# Remove a specific worktree
git worktree remove .worktrees/twilio

# Remove all worktrees (be careful!)
rm -rf .worktrees && git worktree prune
```

### Configuration File

For batch operations, use a YAML config:

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
      webhooks: https://docs.sendgrid.com/webhooks
```

```bash
./scripts/generate-skills.sh generate --config providers.yaml --create-pr
```

---

## Code Guidelines

For detailed technical guidelines, see [AGENTS.md](AGENTS.md). Key points:

### Dependencies

Always use current stable versions:
- **Next.js:** 15.x+
- **Express:** 4.21.x+
- **FastAPI:** 0.115.x+
- **Vitest:** 2.x+

### Test Scripts

Tests must run once and exit (for CI):
```json
"test": "vitest run"   // ✓ Correct
"test": "vitest"       // ✗ Hangs in watch mode
```

### Signature Verification

Prefer manual verification over SDK methods — it's more reliable and educational.

---

## Getting Help

- **Questions?** [Start a discussion](https://github.com/hookdeck/webhook-skills/discussions)
- **Found a bug?** [Open an issue](https://github.com/hookdeck/webhook-skills/issues)
- **Need a provider?** [Request it](https://github.com/hookdeck/webhook-skills/issues/new?labels=provider-request)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
