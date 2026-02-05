#!/bin/bash

# Test Agent Scenario
# Runs a specific agent test scenario using Claude Code CLI
# 
# Usage: ./test-agent-scenario.sh <provider> <framework> [options]
# Example: ./test-agent-scenario.sh stripe express --dry-run

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR="/tmp/webhook-skills-agent-test"
RESULTS_DIR="$ROOT_DIR/test-results"
CONFIG_FILE="$ROOT_DIR/providers.yaml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check for required tools
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed.${NC}"
        echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
}

# Pre-flight check for Claude CLI
# Verifies Claude is installed, can connect to API, and responds within timeout
preflight_claude_check() {
    local timeout_seconds=15
    
    echo -e "${BLUE}Pre-flight check: Claude CLI...${NC}"
    
    # Check if Claude CLI is installed
    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: Claude CLI is not installed.${NC}"
        echo "Install from: https://claude.ai/download"
        return 1
    fi
    
    local version
    version=$(claude --version 2>&1)
    echo -e "  Version: ${GREEN}$version${NC}"
    
    # Test network connectivity to Anthropic API
    echo -e "  Testing API connectivity..."
    if command -v curl &> /dev/null; then
        if ! curl -s --max-time 5 https://api.anthropic.com > /dev/null 2>&1; then
            echo -e "${YELLOW}  Warning: Cannot reach api.anthropic.com${NC}"
            echo -e "  This may indicate network issues or firewall restrictions."
            echo -e "  The test will continue but may fail if Claude cannot connect."
        fi
    fi
    
    # Quick test of Claude CLI with timeout
    echo -e "  Testing Claude CLI response (${timeout_seconds}s timeout)..."
    local test_output
    local test_exit_code
    
    # Use timeout command if available, otherwise use a background process approach
    if command -v timeout &> /dev/null; then
        test_output=$(timeout "$timeout_seconds" claude -p "Reply with only: OK" 2>&1)
        test_exit_code=$?
    elif command -v gtimeout &> /dev/null; then
        # macOS with coreutils installed
        test_output=$(gtimeout "$timeout_seconds" claude -p "Reply with only: OK" 2>&1)
        test_exit_code=$?
    else
        # Fallback for macOS without coreutils: use background process
        claude -p "Reply with only: OK" > /tmp/claude_preflight_test.$$ 2>&1 &
        local pid=$!
        local count=0
        while kill -0 $pid 2>/dev/null && [ $count -lt $timeout_seconds ]; do
            sleep 1
            ((count++))
        done
        if kill -0 $pid 2>/dev/null; then
            kill $pid 2>/dev/null
            wait $pid 2>/dev/null
            test_exit_code=124  # Simulate timeout exit code
            test_output="Command timed out"
        else
            wait $pid
            test_exit_code=$?
            test_output=$(cat /tmp/claude_preflight_test.$$ 2>/dev/null)
        fi
        rm -f /tmp/claude_preflight_test.$$
    fi
    
    if [ $test_exit_code -eq 124 ]; then
        echo -e "${RED}  Error: Claude CLI timed out after ${timeout_seconds}s${NC}"
        echo -e "  This may indicate:"
        echo -e "    - Network/firewall blocking Anthropic API"
        echo -e "    - API authentication issues (try: claude logout && claude login)"
        echo -e "    - Anthropic API service issues"
        echo -e "    - Running in a sandboxed environment without network access"
        return 1
    elif [ $test_exit_code -ne 0 ]; then
        echo -e "${RED}  Error: Claude CLI failed (exit code: $test_exit_code)${NC}"
        echo -e "  Output: $test_output"
        return 1
    fi
    
    echo -e "  ${GREEN}Claude CLI is working${NC}"
    return 0
}

usage() {
    echo "Usage: $0 <provider> <framework> [options]"
    echo ""
    echo "Example: $0 stripe express"
    echo ""
    echo "Frameworks: express, nextjs, fastapi"
    echo ""
    # List providers from YAML dynamically (list-providers already includes header)
    "$SCRIPT_DIR/generate-skills.sh" list-providers --config "$CONFIG_FILE" 2>/dev/null || {
        echo "Available providers:"
        echo -e "${YELLOW}  (Could not load providers from config)${NC}"
        echo "  Run from repository root or check that providers.yaml exists"
    }
    echo ""
    echo "Options:"
    echo "  --dry-run    Show what would be done without executing"
    echo "  --verbose    Show more detailed Claude output"
    echo "  -h, --help   Show this help message"
    exit 1
}

# Get scenario config from providers.yaml via generate-skills.sh
get_scenario_config() {
    local provider=$1
    local framework=$2
    
    # Call the scenario command to get JSON config
    # Capture stderr separately to avoid npm warnings polluting the JSON output
    local config_json
    local error_output
    error_output=$("$SCRIPT_DIR/generate-skills.sh" scenario "$provider" "$framework" --config "$CONFIG_FILE" 2>&1 1>/dev/null)
    config_json=$("$SCRIPT_DIR/generate-skills.sh" scenario "$provider" "$framework" --config "$CONFIG_FILE" 2>/dev/null)
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Error getting scenario config:${NC}"
        echo "$error_output"
        return 1
    fi
    
    # Validate JSON before parsing
    if ! echo "$config_json" | jq empty 2>/dev/null; then
        echo -e "${RED}Error: Invalid JSON response from scenario command${NC}"
        echo "$config_json"
        return 1
    fi
    
    # Parse JSON response
    PROVIDER=$(echo "$config_json" | jq -r '.provider')
    DISPLAY_NAME=$(echo "$config_json" | jq -r '.displayName')
    FRAMEWORK=$(echo "$config_json" | jq -r '.framework')
    SKILL_NAME=$(echo "$config_json" | jq -r '.skillName')
    PROMPT=$(echo "$config_json" | jq -r '.prompt')
    
    # Validate we got valid data
    if [ "$PROVIDER" = "null" ] || [ -z "$PROVIDER" ]; then
        echo -e "${RED}Error: Invalid config returned${NC}"
        echo "$config_json"
        return 1
    fi
    
    return 0
}

# Parse arguments
PROVIDER_ARG=""
FRAMEWORK_ARG=""
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
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
        *)
            if [ -z "$PROVIDER_ARG" ]; then
                PROVIDER_ARG="$1"
            elif [ -z "$FRAMEWORK_ARG" ]; then
                FRAMEWORK_ARG="$1"
            else
                echo -e "${RED}Too many arguments${NC}"
                usage
            fi
            shift
            ;;
    esac
done

# Check dependencies
check_dependencies

# Validate arguments
if [ -z "$PROVIDER_ARG" ] || [ -z "$FRAMEWORK_ARG" ]; then
    echo -e "${RED}Error: Both provider and framework are required${NC}"
    echo ""
    usage
fi

# Validate framework
case $FRAMEWORK_ARG in
    express|nextjs|fastapi)
        ;;
    *)
        echo -e "${RED}Error: Invalid framework '$FRAMEWORK_ARG'${NC}"
        echo "Supported frameworks: express, nextjs, fastapi"
        exit 1
        ;;
esac

# Get scenario configuration from providers.yaml
if ! get_scenario_config "$PROVIDER_ARG" "$FRAMEWORK_ARG"; then
    exit 1
fi

# Create scenario name for directory/logging
SCENARIO="${PROVIDER}-${FRAMEWORK}"

echo "========================================"
echo -e "  ${BLUE}Agent Test: $SCENARIO${NC}"
echo "========================================"
echo ""
echo -e "Provider:  ${GREEN}$DISPLAY_NAME${NC} ($PROVIDER)"
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

- **Provider:** $DISPLAY_NAME ($PROVIDER)
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

# Run pre-flight check for Claude CLI (skip for dry-run)
if [ "$DRY_RUN" != true ]; then
    if ! preflight_claude_check; then
        echo -e "\n${RED}Pre-flight check failed. Aborting test.${NC}"
        echo -e "Use --dry-run to skip this check and see what would be executed."
        exit 1
    fi
    echo ""
fi

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
