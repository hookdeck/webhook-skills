#!/bin/bash

# Validate Provider Skill
# Checks that a provider skill has all required files and integration updates.
#
# Usage:
#   ./scripts/validate-provider.sh <provider>           # Validate a single provider
#   ./scripts/validate-provider.sh <provider1> <provider2>  # Validate multiple providers
#   ./scripts/validate-provider.sh --all                # Validate all providers in skills/
#   ./scripts/validate-provider.sh --detect-new         # Detect and validate new providers (for CI)
#
# Options:
#   --skip-integration   Skip integration checks (providers/<name>.yaml)
#   --quiet              Only output errors
#   --json               Output results as JSON

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# Defaults
SKIP_INTEGRATION=false
QUIET=false
JSON_OUTPUT=false
DETECT_NEW=false
VALIDATE_ALL=false
PROVIDERS=()

usage() {
  echo "Usage: $0 [options] <provider...>"
  echo ""
  echo "Validate that provider skills have all required files and integration updates."
  echo ""
  echo "Arguments:"
  echo "  <provider>          Provider skill name (e.g., stripe-webhooks, shopify-webhooks)"
  echo ""
  echo "Options:"
  echo "  --all               Validate all providers in skills/"
  echo "  --detect-new        Detect new providers vs main branch (for CI)"
  echo "  --skip-integration  Skip integration checks (providers/<name>.yaml)"
  echo "  --quiet             Only output errors"
  echo "  --json              Output results as JSON"
  echo "  -h, --help          Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 stripe-webhooks"
  echo "  $0 stripe-webhooks shopify-webhooks"
  echo "  $0 --all"
  echo "  $0 --detect-new  # Used in CI to validate new providers in a PR"
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      VALIDATE_ALL=true
      shift
      ;;
    --detect-new)
      DETECT_NEW=true
      shift
      ;;
    --skip-integration)
      SKIP_INTEGRATION=true
      shift
      ;;
    --quiet)
      QUIET=true
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "Unknown option: $1"
      usage
      ;;
    *)
      PROVIDERS+=("$1")
      shift
      ;;
  esac
done

# Helper functions
log() {
  if [ "$QUIET" = false ] && [ "$JSON_OUTPUT" = false ]; then
    echo -e "$1"
  fi
}

log_error() {
  if [ "$JSON_OUTPUT" = false ]; then
    echo -e "${RED}ERROR: $1${NC}" >&2
  fi
}

# Get all provider skill directories
get_all_providers() {
  find "$ROOT_DIR/skills" -maxdepth 1 -type d -name "*-webhooks" -exec basename {} \; | sort
}

# Detect new providers compared to main branch
detect_new_providers() {
  # Get list of new skill directories added compared to origin/main
  git -C "$ROOT_DIR" diff --name-only --diff-filter=A origin/main...HEAD 2>/dev/null | \
    grep -E '^skills/[^/]+-webhooks/' | \
    sed 's|skills/\([^/]*\)/.*|\1|' | \
    sort -u || true
}

# Validate required files for a provider
validate_required_files() {
  local provider=$1
  local skill_dir="$ROOT_DIR/skills/$provider"
  local errors=()
  
  # Check skill directory exists
  if [ ! -d "$skill_dir" ]; then
    errors+=("Skill directory not found: skills/$provider")
    echo "${errors[@]}"
    return 1
  fi
  
  # Core files
  local core_files=(
    "SKILL.md"
    "references/overview.md"
    "references/setup.md"
    "references/verification.md"
  )
  
  # Express example files
  local express_files=(
    "examples/express/package.json"
    "examples/express/.env.example"
    "examples/express/README.md"
    "examples/express/src/index.js"
    "examples/express/test/webhook.test.js"
  )
  
  # Next.js example files
  local nextjs_files=(
    "examples/nextjs/package.json"
    "examples/nextjs/.env.example"
    "examples/nextjs/README.md"
    "examples/nextjs/test/webhook.test.ts"
    "examples/nextjs/vitest.config.ts"
  )
  
  # FastAPI example files
  local fastapi_files=(
    "examples/fastapi/requirements.txt"
    "examples/fastapi/.env.example"
    "examples/fastapi/README.md"
    "examples/fastapi/main.py"
    "examples/fastapi/test_webhook.py"
  )
  
  # Check all required files
  for file in "${core_files[@]}" "${express_files[@]}" "${nextjs_files[@]}" "${fastapi_files[@]}"; do
    if [ ! -f "$skill_dir/$file" ]; then
      errors+=("Missing: skills/$provider/$file")
    fi
  done
  
  # Check for Next.js route file (path varies by provider)
  local nextjs_route
  nextjs_route=$(find "$skill_dir/examples/nextjs/app" -name "route.ts" 2>/dev/null | head -1)
  if [ -z "$nextjs_route" ]; then
    errors+=("Missing: Next.js route.ts file in skills/$provider/examples/nextjs/app/")
  fi
  
  # Return errors
  if [ ${#errors[@]} -gt 0 ]; then
    printf '%s\n' "${errors[@]}"
    return 1
  fi
  
  return 0
}

# Validate integration files
# A provider PR owns skills/<provider>-webhooks/ and providers/<name>.yaml.
# README.md and .claude-plugin/marketplace.json are generated from these after
# merge (./scripts/generate-skills.sh sync), so they are not checked here.
validate_integration() {
  local provider=$1
  local provider_name="${provider%-webhooks}"
  local provider_file="$ROOT_DIR/providers/$provider_name.yaml"
  local errors=()

  if [ ! -f "$provider_file" ]; then
    errors+=("providers/$provider_name.yaml not found (one file per provider; see providers/stripe.yaml)")
  else
    # testScenario is read by test-agent-scenario.sh
    if ! grep -q "^testScenario:" "$provider_file"; then
      errors+=("No testScenario in providers/$provider_name.yaml")
    fi
    # catalog.summary becomes the README provider table row (unless catalog.readme is false)
    local has_summary
    has_summary=$(awk '
      /^catalog:/ { in_catalog = 1; next }
      in_catalog && /^[^ #]/ { in_catalog = 0 }
      in_catalog && /^  summary: *[^ ]/ { print "yes"; exit }
      in_catalog && /^  readme: *false/ { print "yes"; exit }
    ' "$provider_file")
    if [ "$has_summary" != "yes" ]; then
      errors+=("No catalog.summary in providers/$provider_name.yaml (the README \"What It Does\" text)")
    fi
  fi

  # Return errors
  if [ ${#errors[@]} -gt 0 ]; then
    printf '%s\n' "${errors[@]}"
    return 1
  fi

  return 0
}

# Validate a single provider
validate_provider() {
  local provider=$1
  local all_errors=()
  local has_errors=false
  
  log "${BLUE}Validating: $provider${NC}"
  
  # Check required files
  local file_errors
  if ! file_errors=$(validate_required_files "$provider"); then
    while IFS= read -r error; do
      all_errors+=("$error")
    done <<< "$file_errors"
    has_errors=true
  fi
  
  # Check integration (unless skipped)
  if [ "$SKIP_INTEGRATION" = false ]; then
    local integration_errors
    if ! integration_errors=$(validate_integration "$provider"); then
      while IFS= read -r error; do
        all_errors+=("$error")
      done <<< "$integration_errors"
      has_errors=true
    fi
  fi
  
  # Output results
  if [ "$has_errors" = true ]; then
    log "${RED}  FAILED${NC}"
    for error in "${all_errors[@]}"; do
      log "  - $error"
    done
    return 1
  else
    log "${GREEN}  PASSED${NC}"
    return 0
  fi
}

# Main execution
cd "$ROOT_DIR"

# Determine which providers to validate
if [ "$VALIDATE_ALL" = true ]; then
  while IFS= read -r provider; do
    PROVIDERS+=("$provider")
  done < <(get_all_providers)
elif [ "$DETECT_NEW" = true ]; then
  while IFS= read -r provider; do
    [ -n "$provider" ] && PROVIDERS+=("$provider")
  done < <(detect_new_providers)
  if [ ${#PROVIDERS[@]} -eq 0 ]; then
    log "No new provider skills detected"
    exit 0
  fi
  log "Detected new providers: ${PROVIDERS[*]}"
fi

# Check we have providers to validate
if [ ${#PROVIDERS[@]} -eq 0 ]; then
  echo "No providers specified. Use --all, --detect-new, or provide provider names."
  usage
fi

# Validate each provider
FAILED_PROVIDERS=()
PASSED_PROVIDERS=()

for provider in "${PROVIDERS[@]}"; do
  if validate_provider "$provider"; then
    PASSED_PROVIDERS+=("$provider")
  else
    FAILED_PROVIDERS+=("$provider")
  fi
done

# Summary
echo ""
if [ ${#FAILED_PROVIDERS[@]} -gt 0 ]; then
  log "${RED}Validation failed for ${#FAILED_PROVIDERS[@]} provider(s):${NC}"
  for provider in "${FAILED_PROVIDERS[@]}"; do
    log "  - $provider"
  done
  echo ""
  log "Please ensure you have added:"
  log "  1. All required skill files (SKILL.md, references/, examples/)"
  log "  2. providers/<name>.yaml - docs URLs, testScenario and catalog.summary"
  log "README.md and marketplace.json are generated after merge; no need to edit them."
  exit 1
else
  log "${GREEN}All ${#PASSED_PROVIDERS[@]} provider(s) passed validation!${NC}"
  exit 0
fi
