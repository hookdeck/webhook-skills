/**
 * CLI Adapter factory
 * 
 * Registry and factory for CLI adapters
 */

import type { CliAdapter } from './types';
import { claudeAdapter } from './claude';
import { copilotAdapter } from './copilot';

// Re-export types and default model
export type { CliAdapter, CliAdapterOptions, CliCommandConfig } from './types';

/**
 * Registry of available CLI adapters
 */
const adapters: Map<string, CliAdapter> = new Map([
  ['claude', claudeAdapter],
  ['copilot', copilotAdapter],
]);

/**
 * List of available CLI tool names (for help text and validation)
 */
export const AVAILABLE_CLI_TOOLS = Array.from(adapters.keys());

/**
 * Default CLI tool to use
 */
export const DEFAULT_CLI_TOOL = 'claude';

/**
 * Get a CLI adapter by name
 * 
 * @param name - The name of the CLI tool (e.g., 'claude', 'copilot')
 * @returns The CLI adapter
 * @throws Error if the adapter is not found
 */
export function getCliAdapter(name: string): CliAdapter {
  const adapter = adapters.get(name);
  
  if (!adapter) {
    const available = AVAILABLE_CLI_TOOLS.join(', ');
    throw new Error(`Unknown CLI tool: '${name}'. Available tools: ${available}`);
  }
  
  return adapter;
}
