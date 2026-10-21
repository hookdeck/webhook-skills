/**
 * Claude CLI adapter
 * 
 * Supports the Anthropic Claude CLI tool
 * https://github.com/anthropics/claude-cli
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

export const claudeAdapter: CliAdapter = {
  name: 'claude',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    // No pinned default: a hardcoded model ID goes stale. Without --model the
    // CLI uses its own current default; pass --model to choose explicitly.
    return {
      command: 'claude',
      args: [
        '-p',
        ...(options.model ? ['--model', options.model] : []),
        '--dangerously-skip-permissions',
      ],
    };
  },
};
