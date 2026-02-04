/**
 * Claude CLI adapter
 * 
 * Supports the Anthropic Claude CLI tool
 * https://github.com/anthropics/claude-cli
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

export const DEFAULT_MODEL = 'claude-opus-4-20250514';

export const claudeAdapter: CliAdapter = {
  name: 'claude',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    const model = options.model ?? DEFAULT_MODEL;
    
    return {
      command: 'claude',
      args: [
        '-p',
        '--model', model,
        '--dangerously-skip-permissions',
      ],
    };
  },
};
