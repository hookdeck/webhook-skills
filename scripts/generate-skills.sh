#!/bin/bash

# Skill Generator - Bash Wrapper
# Runs the TypeScript skill generator using ts-node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR_DIR="$SCRIPT_DIR/skill-generator"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    echo "Install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if claude CLI is installed (for non-dry-run)
if ! command -v claude &> /dev/null; then
    echo "Warning: Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-cli"
    echo "Dry run mode will still work."
fi

# Install dependencies if needed
if [ ! -d "$GENERATOR_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$GENERATOR_DIR"
    npm install
    cd - > /dev/null
fi

# Run the generator
cd "$GENERATOR_DIR"
exec npx ts-node index.ts "$@"
