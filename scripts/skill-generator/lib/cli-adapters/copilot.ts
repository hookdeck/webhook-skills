/**
 * Copilot CLI adapter
 * 
 * Supports the GitHub Copilot CLI tool
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

// Default model for the GitHub Copilot CLI; can be overridden via options.model
// Valid choices: claude-sonnet-4.5, claude-haiku-4.5, claude-opus-4.5, claude-sonnet-4,
// gemini-3-pro-preview, gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex,
// gpt-5.1, gpt-5, gpt-5.1-codex-mini, gpt-5-mini, gpt-4.1
// Note: gpt-5 has known issues with web fetching causing "invalid_request_body" errors
const DEFAULT_MODEL = 'claude-sonnet-4';

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    const model = options.model ?? DEFAULT_MODEL;
    
    return {
      command: 'copilot',
      args: [
        // Copilot CLI reads prompts from stdin (no -p flag needed like Claude)
        '--model', model,
        // Use --allow-all to enable tools, paths, AND URLs without interactive prompts
        // (--allow-all-tools alone still blocks URL fetches in non-interactive mode)
        '--allow-all',
      ],
    };
  },
};
