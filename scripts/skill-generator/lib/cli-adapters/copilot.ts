/**
 * Copilot CLI adapter
 * 
 * Supports the GitHub Copilot CLI tool
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

// Default model for the GitHub Copilot CLI; can be overridden via options.model
const DEFAULT_MODEL = 'gpt-4o';

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    const model = options.model ?? DEFAULT_MODEL;
    
    return {
      command: 'copilot',
      args: [
        // Note: copilot does not use -p flag
        '--model', model,
        '--allow-all-tools',
      ],
    };
  },
};
