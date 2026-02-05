#!/bin/bash

# Test All Webhook Skills Examples
# This script runs tests for all example applications across providers and frameworks.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$ROOT_DIR/skills"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
SKIPPED=0
FAILED_TESTS=()

# Providers to test
PROVIDERS=("stripe-webhooks" "shopify-webhooks" "github-webhooks" "hookdeck-event-gateway" "deepgram-webhooks")

# Frameworks to test
FRAMEWORKS=("express" "nextjs" "fastapi")

echo "========================================"
echo "  Webhook Skills Example Tests"
echo "========================================"
echo ""

# Function to run Node.js tests (Express/Next.js)
run_node_tests() {
    local dir=$1
    local name=$2
    
    echo -n "  Testing $name... "
    
    cd "$dir"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo -e "${YELLOW}SKIPPED${NC} (no package.json)"
        SKIPPED=$((SKIPPED + 1))
        return
    fi
    
    # Check if test script exists
    if ! grep -q '"test"' package.json; then
        echo -e "${YELLOW}SKIPPED${NC} (no test script)"
        SKIPPED=$((SKIPPED + 1))
        return
    fi
    
    # Install dependencies (capture output for errors)
    local install_output
    install_output=$(npm install --silent 2>&1) || {
        echo -e "${RED}FAILED${NC} (npm install failed)"
        echo "$install_output"
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$name: npm install failed")
        return
    }
    
    # Run tests (capture output, only show on failure)
    local test_output
    test_output=$(npm test 2>&1)
    local test_exit_code=$?
    
    if [ $test_exit_code -eq 0 ]; then
        # Extract just the summary line for passed tests
        local summary
        # Match Jest format "Tests: X passed" or Vitest format "Tests  X passed (X)"
        summary=$(echo "$test_output" | grep -E "(Tests:.*passed|Tests[[:space:]]+[0-9]+ passed)" | tail -1 | xargs)
        if [ -n "$summary" ]; then
            echo -e "${GREEN}PASSED${NC} ($summary)"
        else
            echo -e "${GREEN}PASSED${NC}"
        fi
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAILED${NC}"
        echo ""
        echo "$test_output"
        echo ""
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$name")
    fi
}

# Function to run Python tests (FastAPI)
run_python_tests() {
    local dir=$1
    local name=$2
    
    echo -n "  Testing $name... "
    
    cd "$dir"
    
    # Check if requirements.txt exists
    if [ ! -f "requirements.txt" ]; then
        echo -e "${YELLOW}SKIPPED${NC} (no requirements.txt)"
        SKIPPED=$((SKIPPED + 1))
        return
    fi
    
    # Check if test file exists
    if [ ! -f "test_webhook.py" ]; then
        echo -e "${YELLOW}SKIPPED${NC} (no test file)"
        SKIPPED=$((SKIPPED + 1))
        return
    fi
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        local venv_output
        venv_output=$(python3 -m venv venv 2>&1) || {
            echo -e "${RED}FAILED${NC} (venv creation failed)"
            echo "$venv_output"
            FAILED=$((FAILED + 1))
            FAILED_TESTS+=("$name: venv creation failed")
            return
        }
    fi
    
    # Activate venv and install dependencies
    source venv/bin/activate
    local pip_output
    pip_output=$(pip install -q -r requirements.txt 2>&1) || {
        echo -e "${RED}FAILED${NC} (pip install failed)"
        echo "$pip_output"
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$name: pip install failed")
        deactivate
        return
    }
    
    # Run tests (capture output, only show on failure)
    local test_output
    test_output=$(python -m pytest test_webhook.py -q 2>&1)
    local test_exit_code=$?
    
    if [ $test_exit_code -eq 0 ]; then
        # Extract just the summary line for passed tests
        local summary
        summary=$(echo "$test_output" | grep -E "passed" | tail -1)
        if [ -n "$summary" ]; then
            echo -e "${GREEN}PASSED${NC} ($summary)"
        else
            echo -e "${GREEN}PASSED${NC}"
        fi
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAILED${NC}"
        echo ""
        echo "$test_output"
        echo ""
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$name")
    fi
    
    deactivate
}

# Run tests for each provider
for provider in "${PROVIDERS[@]}"; do
    provider_dir="$SKILLS_DIR/$provider"
    
    if [ ! -d "$provider_dir" ]; then
        echo "Provider $provider not found, skipping..."
        continue
    fi
    
    echo ""
    echo "Testing $provider"
    echo "----------------------------------------"
    
    for framework in "${FRAMEWORKS[@]}"; do
        example_dir="$provider_dir/examples/$framework"
        test_name="$provider/$framework"
        
        if [ ! -d "$example_dir" ]; then
            echo -n "  Testing $test_name... "
            echo -e "${YELLOW}SKIPPED${NC} (directory not found)"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        if [ "$framework" = "fastapi" ]; then
            run_python_tests "$example_dir" "$test_name"
        else
            run_node_tests "$example_dir" "$test_name"
        fi
    done
done

# Print summary
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo -e "  ${GREEN}Passed:${NC}  $PASSED"
echo -e "  ${RED}Failed:${NC}  $FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
echo ""

# Print failed tests if any
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    echo ""
fi

# Exit with error if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

echo "All tests passed!"
exit 0
