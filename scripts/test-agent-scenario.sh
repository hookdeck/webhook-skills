#!/bin/bash

# Test Agent Scenario
# Runs a specific agent test scenario using Claude Code CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR="/tmp/webhook-skills-agent-test"
RESULTS_DIR="$ROOT_DIR/test-results"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <scenario> [options]"
    echo ""
    echo "Available scenarios:"
    echo "  stripe-express   - Stripe webhook handling in Express"
    echo "  shopify-nextjs   - Shopify webhook handling in Next.js"
    echo "  github-fastapi   - GitHub webhook handling in FastAPI"
    echo "  paddle-express   - Paddle webhook handling in Express"
    echo "  paddle-nextjs    - Paddle webhook handling in Next.js"
    echo "  paddle-fastapi   - Paddle webhook handling in FastAPI"
    echo "  hookdeck-express - Hookdeck Event Gateway in Express"
    echo ""
    echo "Options:"
    echo "  --dry-run    Show what would be done without executing"
    echo "  --verbose    Show more detailed Claude output"
    echo "  --sandbox    Run in Docker sandbox (safer, isolated environment)"
    exit 1
}

# Get scenario config
get_scenario_config() {
    local scenario=$1
    case $scenario in
        stripe-express)
            PROVIDER="stripe"
            FRAMEWORK="express"
            SKILL_NAME="stripe-webhooks"
            PROMPT="Add Stripe webhook handling to my Express app. I want to handle payment_intent.succeeded events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        shopify-nextjs)
            PROVIDER="shopify"
            FRAMEWORK="nextjs"
            SKILL_NAME="shopify-webhooks"
            PROMPT="Add a Shopify webhook endpoint to handle orders/create events in my Next.js app. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        github-fastapi)
            PROVIDER="github"
            FRAMEWORK="fastapi"
            SKILL_NAME="github-webhooks"
            PROMPT="Add a GitHub webhook endpoint to my FastAPI app. I need to handle push and pull_request events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        paddle-express)
            PROVIDER="paddle"
            FRAMEWORK="express"
            SKILL_NAME="paddle-webhooks"
            PROMPT="Add Paddle webhook handling to my Express app. I want to handle subscription.created and transaction.completed events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        paddle-nextjs)
            PROVIDER="paddle"
            FRAMEWORK="nextjs"
            SKILL_NAME="paddle-webhooks"
            PROMPT="Add a Paddle webhook endpoint to handle subscription events in my Next.js app. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        paddle-fastapi)
            PROVIDER="paddle"
            FRAMEWORK="fastapi"
            SKILL_NAME="paddle-webhooks"
            PROMPT="Add a Paddle webhook endpoint to my FastAPI app. I need to handle subscription.created and subscription.canceled events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        hookdeck-express)
            PROVIDER="hookdeck"
            FRAMEWORK="express"
            SKILL_NAME="hookdeck-event-gateway"
            PROMPT="Create an Express webhook handler that receives webhooks forwarded through Hookdeck Event Gateway. Hookdeck is a webhook proxy - it receives webhooks from providers and forwards them to my app, adding an x-hookdeck-signature header for verification. I need to verify this signature using HMAC SHA-256 with base64 encoding. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced."
            ;;
        *)
            return 1
            ;;
    esac
}

# Parse arguments
SCENARIO=""
DRY_RUN=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            SCENARIO="$1"
            shift
            ;;
    esac
done

if [ -z "$SCENARIO" ]; then
    usage
fi

if ! get_scenario_config "$SCENARIO"; then
    echo -e "${RED}Error: Unknown scenario '$SCENARIO'${NC}"
    usage
fi

echo "========================================"
echo -e "  ${BLUE}Agent Test: $SCENARIO${NC}"
echo "========================================"
echo ""
echo -e "Provider:  ${GREEN}$PROVIDER${NC}"
echo -e "Framework: ${GREEN}$FRAMEWORK${NC}"
echo -e "Skill:     ${GREEN}$SKILL_NAME${NC}"
echo -e "Prompt:    $PROMPT"
echo ""

# Setup test directory
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SCENARIO_DIR="$TEST_DIR/$SCENARIO-$TIMESTAMP"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] Would create: $SCENARIO_DIR${NC}"
else
    mkdir -p "$SCENARIO_DIR"
    mkdir -p "$RESULTS_DIR"
    cd "$SCENARIO_DIR"
    echo -e "Test directory: ${BLUE}$SCENARIO_DIR${NC}"
fi

# Initialize project based on framework
init_project() {
    case $FRAMEWORK in
        express)
            echo -e "\n${BLUE}Step 1: Initializing Express project...${NC}"
            if [ "$DRY_RUN" = true ]; then
                echo "[DRY RUN] npm init -y && npm install express"
            else
                npm init -y > /dev/null 2>&1
                npm install express > /dev/null 2>&1
                echo -e "${GREEN}Express project initialized${NC}"
            fi
            ;;
        nextjs)
            echo -e "\n${BLUE}Step 1: Initializing Next.js project...${NC}"
            if [ "$DRY_RUN" = true ]; then
                echo "[DRY RUN] npx create-next-app@latest . --typescript --yes"
            else
                npx create-next-app@latest . --typescript --app --no-src-dir --no-tailwind --eslint --no-import-alias --yes > /dev/null 2>&1
                echo -e "${GREEN}Next.js project initialized${NC}"
            fi
            ;;
        fastapi)
            echo -e "\n${BLUE}Step 1: Initializing FastAPI project...${NC}"
            if [ "$DRY_RUN" = true ]; then
                echo "[DRY RUN] python3 -m venv venv && pip install fastapi uvicorn"
            else
                python3 -m venv venv
                source venv/bin/activate
                pip install -q fastapi uvicorn python-dotenv
                cat > main.py << 'PYEOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ok"}
PYEOF
                echo -e "${GREEN}FastAPI project initialized${NC}"
            fi
            ;;
    esac
}

# Install the skill
install_skill() {
    echo -e "\n${BLUE}Step 2: Installing skill ($SKILL_NAME) via npx skills...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] npx skills add $ROOT_DIR --skill $SKILL_NAME --yes"
    else
        # Install skill properly using npx skills CLI
        # This ensures Claude will discover the skill in its expected location
        # Use timeout and redirect stdin to prevent any prompts
        local install_result
        install_result=$(timeout 60 npx skills add "$ROOT_DIR" --skill "$SKILL_NAME" --yes < /dev/null 2>&1) || true
        local exit_code=$?
        
        # Show last few lines of output
        echo "$install_result" | tail -5
        
        # Check if installation succeeded by looking for .claude/skills directory
        if [ -d ".claude/skills/$SKILL_NAME" ] || [ -L ".claude/skills/$SKILL_NAME" ]; then
            echo -e "${GREEN}Skill '$SKILL_NAME' installed successfully${NC}"
            echo -e "Installed to: $(pwd)/.claude/skills/$SKILL_NAME"
        elif [ $exit_code -eq 0 ]; then
            echo -e "${GREEN}Skill installation completed${NC}"
        else
            echo -e "${YELLOW}Warning: npx skills may have failed (exit: $exit_code), falling back to manual install${NC}"
            # Manual installation matching the expected structure
            mkdir -p .claude/skills .agents/skills
            cp -r "$ROOT_DIR/skills/$SKILL_NAME" ".agents/skills/"
            ln -sf "../../.agents/skills/$SKILL_NAME" ".claude/skills/$SKILL_NAME"
            echo -e "${GREEN}Skill manually installed to .claude/skills/$SKILL_NAME${NC}"
        fi
    fi
}

# Run Claude Code with the prompt
run_agent() {
    local result_file="$RESULTS_DIR/${SCENARIO}-${TIMESTAMP}.md"
    local log_file="$RESULTS_DIR/${SCENARIO}-${TIMESTAMP}.log"
    
    echo -e "\n${BLUE}Step 3: Running Claude Code agent...${NC}"
    echo -e "Prompt: ${GREEN}$PROMPT${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] cd $SCENARIO_DIR"
        echo "[DRY RUN] claude -p \"$PROMPT\""
        echo "[DRY RUN] Results would be saved to: $result_file"
        return
    fi
    
    echo -e "${YELLOW}Starting Claude Code (this may take a few minutes)...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local start_time=$(date +%s)
    
    # Run Claude with the prompt
    # -p for print mode (non-interactive)
    # --dangerously-skip-permissions to allow file writes without prompts
    cd "$SCENARIO_DIR"
    
    if [ "$VERBOSE" = true ]; then
        # Verbose mode shows more detailed output
        echo -e "${YELLOW}(Verbose mode enabled)${NC}"
        claude -p --verbose --dangerously-skip-permissions "$PROMPT" 2>&1 | tee "$log_file" || true
    else
        claude -p --dangerously-skip-permissions "$PROMPT" 2>&1 | tee "$log_file" || true
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "\n${BLUE}Agent finished in ${duration}s${NC}"
    
    # List generated files
    echo -e "\n${BLUE}Files in project:${NC}"
    find . -type f -not -path "./node_modules/*" -not -path "./venv/*" -not -path "./.git/*" -not -path "./.next/*" -not -name "package-lock.json" 2>/dev/null | sort | head -30
    
    # Save results summary
    cat > "$result_file" << EOF
# Agent Test Results: $SCENARIO

**Date:** $(date)
**Duration:** ${duration}s
**Directory:** $SCENARIO_DIR

## Configuration

- **Provider:** $PROVIDER
- **Framework:** $FRAMEWORK
- **Skill:** $SKILL_NAME

## Prompt

> $PROMPT

## Files Generated

\`\`\`
$(find . -type f -not -path "./node_modules/*" -not -path "./venv/*" -not -path "./.git/*" -not -path "./.next/*" -not -path "./.agents/*/node_modules/*" -not -path "./.agents/*/venv/*" -not -path "./.claude/*" -not -path "./.codex/*" -not -path "./.cursor/*" -not -name "package-lock.json" 2>/dev/null | sort)
\`\`\`

## Evaluation Checklist

### Skill Discovery
- [ ] Agent read SKILL.md
- [ ] Agent referenced verification.md

### Code Quality
- [ ] Correct verification method used
- [ ] Raw body handling implemented
- [ ] Proper error handling (status codes)
- [ ] Code is idiomatic to framework

### Functionality
- [ ] Code runs without errors
- [ ] Signature verification works
- [ ] Event handling works

## Scoring

| Criterion | Points | Score |
|-----------|--------|-------|
| Skill discovery | 1 | /1 |
| Correct verification method | 2 | /2 |
| Raw body handling | 2 | /2 |
| Error handling | 1 | /1 |
| Code runs | 2 | /2 |
| Tests pass | 2 | /2 |
| **Total** | **10** | **/10** |

## Notes

(Add observations here)

## Full Log

See: $(basename "$log_file")
EOF
    
    echo -e "\n${GREEN}Results saved to:${NC}"
    echo "  Summary: $result_file"
    echo "  Full log: $log_file"
}

# Main execution
init_project
install_skill
run_agent

echo ""
echo "========================================"
echo -e "  ${GREEN}Test Complete${NC}"
echo "========================================"
echo ""
echo -e "Test directory: ${BLUE}$SCENARIO_DIR${NC}"
echo ""
echo "Next steps:"
echo "  1. cd $SCENARIO_DIR"
echo "  2. Review the generated code"
echo "  3. Try running the application"
echo "  4. Fill in the evaluation in test-results/"

# Check if results were generated
if [ -f "$RESULTS_DIR/${SCENARIO}-${TIMESTAMP}.md" ]; then
    echo ""
    echo -e "Results: ${BLUE}$RESULTS_DIR/${SCENARIO}-${TIMESTAMP}.md${NC}"
fi
