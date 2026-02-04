/**
 * Copilot CLI adapter
 * 
 * Supports the GitHub Copilot CLI tool
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

const DEFAULT_MODEL = 'claude-opus-4.5';

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
