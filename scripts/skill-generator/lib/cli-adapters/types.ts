/**
 * CLI Adapter types for supporting multiple AI CLI tools
 */

/**
 * Options passed to the adapter when building the command
 */
export interface CliAdapterOptions {
  model?: string;
}

/**
 * The command configuration returned by an adapter
 */
export interface CliCommandConfig {
  command: string;
  args: string[];
}

/**
 * Interface that all CLI adapters must implement
 */
export interface CliAdapter {
  /** Unique identifier for this CLI tool */
  name: string;
  
  /** Build the command and arguments for executing the CLI */
  buildCommand(options: CliAdapterOptions): CliCommandConfig;
}
