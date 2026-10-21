/**
 * Copilot CLI adapter
 * 
 * Supports the GitHub Copilot CLI tool
 */

import type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

// No pinned default model: without --model the Copilot CLI uses its own
// current default. Run `copilot --help` to list the models it accepts.
// Note: gpt-5 has known issues with web fetching causing "invalid_request_body" errors

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  
  buildCommand(options: CliAdapterOptions): CliCommandConfig {
    return {
      command: 'copilot',
      args: [
        // Copilot CLI reads prompts from stdin (no -p flag needed like Claude)
        ...(options.model ? ['--model', options.model] : []),
        // Use --allow-all to enable tools, paths, AND URLs without interactive prompts
        // (--allow-all-tools alone still blocks URL fetches in non-interactive mode)
        '--allow-all',
      ],
    };
  },
};
