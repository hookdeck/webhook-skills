#!/bin/bash

# Test Webhook Skills Examples
# Runs tests for example applications across skills and frameworks.
#
# Usage:
#   ./scripts/test-examples.sh                  # Test all skills that have examples
#   ./scripts/test-examples.sh stripe-webhooks   # Test one specific skill
#   ./scripts/test-examples.sh stripe-webhooks github-webhooks  # Test multiple skills
#
# Discovery: Finds skills by looking for skills/*/examples/ directories.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$ROOT_DIR/skills"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
SKIPPED=0
FAILED_TESTS=()

# Frameworks to test
FRAMEWORKS=("express" "nextjs" "fastapi")

usage() {
    echo "Usage: $0 [skill-name ...]"
    echo ""
    echo "Test webhook skill example applications."
    echo ""
    echo "  No arguments    Discover and test all skills that have examples/"
    echo "  skill-name ...  Test only the specified skill(s)"
    echo ""
    echo "Examples:"
    echo "  $0                                          # Test all"
    echo "  $0 stripe-webhooks                          # Test one"
    echo "  $0 stripe-webhooks github-webhooks           # Test multiple"
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo ""

    # Show available skills with examples
    echo "Skills with examples:"
    for dir in "$SKILLS_DIR"/*/examples; do
        if [ -d "$dir" ]; then
            local skill_name
            skill_name=$(basename "$(dirname "$dir")")
            # List which frameworks are available
            local frameworks=()
            for fw in "${FRAMEWORKS[@]}"; do
                if [ -d "$dir/$fw" ]; then
                    frameworks+=("$fw")
                fi
            done
            echo "  $skill_name (${frameworks[*]})"
        fi
    done
    exit 0
}

# Parse arguments
REQUESTED_SKILLS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            echo ""
            usage
            ;;
        *)
            REQUESTED_SKILLS+=("$1")
            shift
            ;;
    esac
done

# Discover skills with examples
discover_skills() {
    local skills=()
    for dir in "$SKILLS_DIR"/*/examples; do
        if [ -d "$dir" ]; then
            skills+=("$(basename "$(dirname "$dir")")")
        fi
    done
    # Sort alphabetically
    IFS=$'\n' skills=($(sort <<<"${skills[*]}")); unset IFS
    echo "${skills[@]}"
}

# Determine which skills to test
if [ ${#REQUESTED_SKILLS[@]} -gt 0 ]; then
    # Validate requested skills exist and have examples
    SKILLS=()
    for skill in "${REQUESTED_SKILLS[@]}"; do
        if [ ! -d "$SKILLS_DIR/$skill" ]; then
            echo -e "${RED}Error: Skill '$skill' not found in $SKILLS_DIR/${NC}"
            exit 1
        fi
        if [ ! -d "$SKILLS_DIR/$skill/examples" ]; then
            echo -e "${RED}Error: Skill '$skill' has no examples/ directory${NC}"
            exit 1
        fi
        SKILLS+=("$skill")
    done
else
    # Discover all skills with examples
    read -ra SKILLS <<< "$(discover_skills)"
fi

if [ ${#SKILLS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No skills with examples found.${NC}"
    exit 0
fi

echo "========================================"
echo "  Webhook Skills Example Tests"
echo "========================================"
echo ""
echo -e "Skills to test: ${BLUE}${#SKILLS[@]}${NC} (${SKILLS[*]})"

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

# Run tests for each skill
for skill in "${SKILLS[@]}"; do
    skill_dir="$SKILLS_DIR/$skill"
    
    echo ""
    echo "Testing $skill"
    echo "----------------------------------------"
    
    for framework in "${FRAMEWORKS[@]}"; do
        example_dir="$skill_dir/examples/$framework"
        test_name="$skill/$framework"
        
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
