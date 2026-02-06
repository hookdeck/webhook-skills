# Testing Webhook Skills

This document covers two types of validation:
1. **Code Example Tests** - Automated tests verifying example applications work
2. **Agent Integration Tests** - Manual/automated validation that AI agents can use these skills effectively

## Code Example Testing

### Running Tests Locally

Each example includes tests for signature verification. Run them individually:

**Express examples:**
```bash
cd skills/stripe-webhooks/examples/express
npm install
npm test
```

**FastAPI examples:**
```bash
cd skills/stripe-webhooks/examples/fastapi
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pytest test_webhook.py
```

**Next.js examples:**
```bash
cd skills/stripe-webhooks/examples/nextjs
npm install
npm test
```

### Running All Tests

Use the test runner script to run all examples:

```bash
./scripts/test-all-examples.sh
```

### CI Pipeline

Tests run automatically on PR and push to main via GitHub Actions. See `.github/workflows/test-examples.yml`.

---

## Agent Integration Testing

### Purpose

Validate that AI agents (Cursor, Claude, Copilot) can successfully use these skills to:
1. Find relevant skills when asked about webhooks
2. Read and follow skill instructions
3. Generate working code that matches expected patterns
4. Handle edge cases correctly (raw body, signature verification)

### Test Scenarios

#### Scenario 1: Stripe Webhook Setup (Express)

**Setup:**
1. Create a new Express project: `npm init -y && npm install express`
2. Install the skill: `npx skills add hookdeck/webhook-skills --skill stripe-webhooks`

**Prompt:**
> "Add Stripe webhook handling to my Express app. I want to handle payment_intent.succeeded events."

**Expected Behaviors:**
- [ ] Agent reads `stripe-webhooks/SKILL.md`
- [ ] Agent references `references/verification.md` for signature details
- [ ] Generated code uses `express.raw({ type: 'application/json' })` middleware
- [ ] Generated code calls `stripe.webhooks.constructEvent()`
- [ ] Generated code handles the specific event type requested
- [ ] Generated code returns 200 on success, 400 on verification failure

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill discovery (read SKILL.md) | 1 | |
| Correct verification method | 2 | |
| Raw body handling | 2 | |
| Error handling (status codes) | 1 | |
| Code runs without errors | 2 | |
| Tests pass | 2 | |
| **Total** | **10** | |

---

#### Scenario 2: Shopify Webhook Setup (Next.js)

**Setup:**
1. Create a Next.js project: `npx create-next-app@latest my-app --typescript`
2. Install the skill: `npx skills add hookdeck/webhook-skills --skill shopify-webhooks`

**Prompt:**
> "Add a Shopify webhook endpoint to handle orders/create events in my Next.js app."

**Expected Behaviors:**
- [ ] Agent reads `shopify-webhooks/SKILL.md`
- [ ] Agent creates a route handler at `app/webhooks/shopify/route.ts`
- [ ] Generated code reads raw body with `request.text()`
- [ ] Generated code verifies HMAC SHA-256 signature (base64)
- [ ] Generated code uses `crypto.timingSafeEqual()` for comparison
- [ ] Generated code handles the X-Shopify-Topic header

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill discovery | 1 | |
| Correct file location (App Router) | 1 | |
| Correct verification (base64 HMAC) | 2 | |
| Raw body handling | 2 | |
| Error handling | 1 | |
| Code runs | 2 | |
| Tests pass | 1 | |
| **Total** | **10** | |

---

#### Scenario 3: GitHub Webhook Setup (FastAPI)

**Setup:**
1. Create a FastAPI project with main.py
2. Install the skill: `npx skills add hookdeck/webhook-skills --skill github-webhooks`

**Prompt:**
> "Add a GitHub webhook endpoint to my FastAPI app. I need to handle push and pull_request events."

**Expected Behaviors:**
- [ ] Agent reads `github-webhooks/SKILL.md`
- [ ] Generated code reads raw body with `await request.body()`
- [ ] Generated code verifies X-Hub-Signature-256 header
- [ ] Generated code uses hex-encoded HMAC SHA-256
- [ ] Generated code uses `hmac.compare_digest()` for timing-safe comparison
- [ ] Generated code handles multiple event types via X-GitHub-Event header

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill discovery | 1 | |
| Correct verification (hex SHA-256) | 2 | |
| Raw body handling | 2 | |
| Event type routing | 1 | |
| Error handling | 1 | |
| Code runs | 2 | |
| Tests pass | 1 | |
| **Total** | **10** | |

---

#### Scenario 4: Hookdeck Event Gateway Webhooks Setup

**Setup:**
1. Existing Express app with webhook endpoint
2. Install the skill: `npx skills add hookdeck/webhook-skills --skill hookdeck-event-gateway-webhooks`

**Prompt:**
> "I'm receiving webhooks through Hookdeck. Add signature verification for Hookdeck's signature."

**Expected Behaviors:**
- [ ] Agent reads `hookdeck-event-gateway-webhooks/SKILL.md`
- [ ] Agent references `references/verification.md`
- [ ] Generated code verifies `x-hookdeck-signature` header
- [ ] Generated code uses base64-encoded HMAC SHA-256
- [ ] Generated code logs or uses `x-hookdeck-event-id` for idempotency

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill discovery | 1 | |
| Correct header (x-hookdeck-signature) | 1 | |
| Correct verification (base64) | 2 | |
| Raw body handling | 2 | |
| Error handling | 1 | |
| Code runs | 2 | |
| Tests pass | 1 | |
| **Total** | **10** | |

---

#### Scenario 5: Idempotency Implementation

**Setup:**
1. Existing webhook handler
2. Install the skill: `npx skills add hookdeck/webhook-skills --skill webhook-handler-patterns`

**Prompt:**
> "My webhook handler is processing duplicate events. How do I make it idempotent?"

**Expected Behaviors:**
- [ ] Agent reads `webhook-handler-patterns/SKILL.md`
- [ ] Agent references `references/idempotency.md`
- [ ] Generated code extracts event ID from payload
- [ ] Generated code checks for previously processed events
- [ ] Generated code stores processed event IDs
- [ ] Generated code returns success for duplicate events (doesn't reprocess)

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill discovery | 1 | |
| Event ID extraction | 2 | |
| Duplicate check logic | 2 | |
| Storage pattern | 2 | |
| Safe handling of duplicates | 2 | |
| Pattern correctness | 1 | |
| **Total** | **10** | |

---

#### Scenario 6: Framework-Specific Debugging

**Setup:**
1. Express app with failing webhook verification
2. Install patterns skill

**Prompt:**
> "My Stripe webhook signature verification is failing. The webhook works in Postman but not in my Express app."

**Expected Behaviors:**
- [ ] Agent reads `webhook-handler-patterns/references/frameworks/express.md`
- [ ] Agent identifies the raw body parsing issue
- [ ] Agent explains `express.raw()` vs `express.json()` ordering
- [ ] Agent provides corrected middleware configuration
- [ ] Solution addresses the specific Express gotcha

**Evaluation:**
| Criterion | Points | Result |
|-----------|--------|--------|
| Skill/reference discovery | 2 | |
| Correct diagnosis (body parsing) | 3 | |
| Correct solution | 3 | |
| Clear explanation | 2 | |
| **Total** | **10** | |

---

### Running Manual Tests

#### Protocol

1. **Create fresh environment**
   - New directory with minimal starter code
   - Install required skill(s)

2. **Configure agent access**
   - Ensure skill files are in agent's context (project-local or global)
   - For Cursor: Verify skills appear in @ mentions

3. **Execute prompt**
   - Use exact prompt from scenario
   - Record agent's response and actions

4. **Evaluate results**
   - Check each expected behavior
   - Score against rubric
   - Note any issues or deviations

5. **Document findings**
   - Record score
   - Note what worked/didn't
   - Capture any agent feedback or errors

#### Recording Template

```markdown
## Test Run: [Scenario Name]
Date: YYYY-MM-DD
Agent: [Cursor/Claude/Copilot]
Tester: [Name]

### Environment
- Project type: [Express/Next.js/FastAPI]
- Skills installed: [list]

### Agent Actions
1. [What agent read/did first]
2. [Subsequent actions]
...

### Generated Code
[Paste generated code here]

### Behavior Checklist
- [x] Behavior 1
- [ ] Behavior 2 (note: what went wrong)
...

### Score
| Criterion | Points | Result |
|-----------|--------|--------|
| ... | ... | ... |
| **Total** | **10** | **X** |

### Notes
[Any observations, issues, or improvements needed]
```

---

### Metrics to Track

After multiple test runs, aggregate:

1. **Skill Discovery Rate**: % of runs where agent found and read relevant skill
2. **Pattern Compliance**: % of expected code patterns present in output
3. **Functional Success**: % of generated code that passes tests
4. **Time to Completion**: Average time for agent to complete task
5. **Error Rate**: % of runs with syntax errors or crashes

### Success Criteria

For skills to be considered effective:
- Skill discovery rate > 90%
- Pattern compliance > 80%
- Functional success > 70%
- Generated code should pass example tests when run

---

## Running Agent Tests with Scripts

The repository includes a script to automate agent test scenarios:

```bash
# List available providers and frameworks
./scripts/test-agent-scenario.sh --help

# Run a test scenario (dry-run to see what would happen)
./scripts/test-agent-scenario.sh stripe express --dry-run

# Run actual test (requires Claude CLI)
./scripts/test-agent-scenario.sh stripe express

# Test with other providers/frameworks
./scripts/test-agent-scenario.sh shopify nextjs
./scripts/test-agent-scenario.sh github fastapi
./scripts/test-agent-scenario.sh hookdeck-event-gateway express
```

### How It Works

1. Creates a fresh project directory in `/tmp/webhook-skills-agent-test/`
2. Initializes the project based on framework (Express, Next.js, or FastAPI)
3. Installs the relevant skill via `npx skills add`
4. Runs Claude CLI with a context-aware prompt
5. Saves results to `test-results/` for manual evaluation

### Configuration

Test prompts and events are configured in `providers.yaml` at the repository root:

```yaml
providers:
  - name: stripe
    displayName: Stripe
    # ... docs, notes ...
    testScenario:
      events:
        - payment_intent.succeeded
        - checkout.session.completed
      # Optional custom prompt (uses default if not specified)
      # prompt: "Custom prompt with {Provider}, {framework}, {events} placeholders"
```

To add a new test scenario, add the `testScenario` field to the provider in `providers.yaml`.

---

## Automating Agent Tests (Future)

### Architecture

```
tests/agent/
├── scenarios/
│   ├── stripe-express-basic.json
│   ├── shopify-nextjs-basic.json
│   └── ...
├── templates/
│   ├── express-starter/
│   ├── nextjs-starter/
│   └── fastapi-starter/
├── evaluator.ts
└── runner.ts
```

### Scenario Format

```json
{
  "id": "stripe-express-basic",
  "name": "Stripe Webhook Setup (Express)",
  "template": "express-starter",
  "skills": ["stripe-webhooks"],
  "prompt": "Add Stripe webhook handling to my Express app...",
  "expectations": {
    "files_read": [
      "stripe-webhooks/SKILL.md",
      "stripe-webhooks/references/verification.md"
    ],
    "files_created": [
      "src/webhooks/stripe.js"
    ],
    "patterns": [
      "stripe.webhooks.constructEvent",
      "express.raw",
      "stripe-signature"
    ],
    "must_not_contain": [
      "express.json().*webhooks"
    ]
  },
  "functional_test": "npm test"
}
```

### Evaluation Logic

```typescript
interface EvaluationResult {
  skillDiscovery: boolean;
  patternsFound: string[];
  patternsMissing: string[];
  antiPatternsFound: string[];
  testsPass: boolean;
  score: number;
}

function evaluate(scenario: Scenario, agentOutput: AgentOutput): EvaluationResult {
  // Check files read
  const skillDiscovery = scenario.expectations.files_read.some(
    file => agentOutput.filesRead.includes(file)
  );
  
  // Check patterns in generated code
  const patternsFound = scenario.expectations.patterns.filter(
    pattern => agentOutput.generatedCode.includes(pattern)
  );
  
  // Run functional tests
  const testsPass = runTests(scenario.functional_test);
  
  // Calculate score
  const score = calculateScore(skillDiscovery, patternsFound, testsPass);
  
  return { skillDiscovery, patternsFound, patternsMissing, antiPatternsFound, testsPass, score };
}
```

This automation framework would enable continuous evaluation of skill effectiveness as the repository evolves.
