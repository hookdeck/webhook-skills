/**
 * Configuration parsing for provider configs from CLI and YAML files
 */

import { readFileSync, existsSync } from 'fs';
import { join, isAbsolute } from 'path';
import { parse as parseYaml } from 'yaml';
import type { ProviderConfig } from './types';

// Root directory of the repository (two levels up from lib/)
const ROOT_DIR = join(__dirname, '..', '..', '..');

/**
 * Parse a provider argument that may include a docs URL and optional notes
 * Formats:
 *   - "provider" — name only
 *   - "provider=https://docs.example.com" — one URL (used as webhooks reference)
 *   - "provider=https://docs.example.com|Optional context for the LLM" — URL + notes
 *
 * Pipe (|) is safe as delimiter: it is not allowed unencoded in URLs (RFC 3986; use %7C if needed).
 *
 * Notes are passed to the prompt as "Important context:" so you can e.g. say
 * "Official SDK supports webhook verification; prefer documenting the SDK method."
 */
export function parseProviderArg(arg: string): ProviderConfig {
  const equalIndex = arg.indexOf('=');
  
  if (equalIndex === -1) {
    // Just a provider name
    return {
      name: normalizeProviderName(arg),
      displayName: toDisplayName(arg),
    };
  }
  
  // Provider with docs URL (and optional notes after |)
  const name = arg.slice(0, equalIndex);
  const value = arg.slice(equalIndex + 1);
  const pipeIndex = value.indexOf('|');
  const docsUrl = pipeIndex === -1 ? value : value.slice(0, pipeIndex);
  const notes = pipeIndex === -1 ? undefined : value.slice(pipeIndex + 1).trim() || undefined;
  
  return {
    name: normalizeProviderName(name),
    displayName: toDisplayName(name),
    docs: {
      webhooks: docsUrl,
    },
    ...(notes && { notes }),
  };
}

/**
 * Normalize provider name to kebab-case
 */
export function normalizeProviderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Convert provider name to display name (proper casing)
 */
export function toDisplayName(name: string): string {
  // Handle common cases
  const knownNames: Record<string, string> = {
    'elevenlabs': 'ElevenLabs',
    'openai': 'OpenAI',
    'deepgram': 'Deepgram',
    'chargebee': 'Chargebee',
    'github': 'GitHub',
    'stripe': 'Stripe',
    'shopify': 'Shopify',
    'resend': 'Resend',
    'twilio': 'Twilio',
    'sendgrid': 'SendGrid',
    'clerk': 'Clerk',
    'auth0': 'Auth0',
  };
  
  const normalized = normalizeProviderName(name);
  if (knownNames[normalized]) {
    return knownNames[normalized];
  }
  
  // Default: capitalize first letter of each word
  return name
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Load provider configs from a YAML file
 */
export function loadConfigFile(filePath: string): Map<string, ProviderConfig> {
  // Resolve relative paths from repo root
  const resolvedPath = isAbsolute(filePath) ? filePath : join(ROOT_DIR, filePath);
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${filePath} (resolved to: ${resolvedPath})`);
  }
  
  const content = readFileSync(resolvedPath, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  
  const configs = new Map<string, ProviderConfig>();
  
  // Handle both formats:
  // 1. providers: [array] - array under 'providers' key
  // 2. {name: config, ...} - object with provider names as keys
  
  const providersArray = parsed.providers;
  
  if (Array.isArray(providersArray)) {
    // Format: providers: [{ name: "chargebee", ... }, ...]
    for (const item of providersArray) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      
      const config = item as Record<string, unknown>;
      const name = config.name as string;
      
      if (!name) {
        console.warn('Skipping provider config without name:', config);
        continue;
      }
      
      const normalizedName = normalizeProviderName(name);
      
      configs.set(normalizedName, {
        name: normalizedName,
        displayName: (config.displayName as string) || toDisplayName(name),
        docs: config.docs as ProviderConfig['docs'],
        notes: config.notes as string | undefined,
      });
    }
  } else {
    // Format: { chargebee: { ... }, openai: { ... } }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }
      
      const config = value as Record<string, unknown>;
      const normalizedName = normalizeProviderName(key);
      
      configs.set(normalizedName, {
        name: normalizedName,
        displayName: (config.displayName as string) || toDisplayName(key),
        docs: config.docs as ProviderConfig['docs'],
        notes: config.notes as string | undefined,
      });
    }
  }
  
  return configs;
}

/**
 * Merge provider configs from CLI args and config file
 * CLI args take precedence over config file
 */
export function mergeProviderConfigs(
  cliProviders: string[],
  configFile?: string
): ProviderConfig[] {
  // Load config file if provided
  const fileConfigs = configFile ? loadConfigFile(configFile) : new Map<string, ProviderConfig>();
  
  // If no CLI providers specified, use all from config file
  if (cliProviders.length === 0) {
    return Array.from(fileConfigs.values());
  }
  
  // Parse CLI providers and merge with config file
  const result: ProviderConfig[] = [];
  
  for (const arg of cliProviders) {
    const cliConfig = parseProviderArg(arg);
    const fileConfig = fileConfigs.get(cliConfig.name);
    
    if (fileConfig) {
      // Merge: CLI overrides file config
      result.push({
        ...fileConfig,
        ...cliConfig,
        docs: {
          ...fileConfig.docs,
          ...cliConfig.docs,
        },
      });
    } else {
      result.push(cliConfig);
    }
  }
  
  return result;
}

/**
 * Get the skill directory path for a provider (relative path)
 */
export function getSkillPath(provider: ProviderConfig): string {
  return `skills/${provider.name}-webhooks`;
}

/**
 * Get the absolute skill directory path for a provider
 */
export function getAbsoluteSkillPath(provider: ProviderConfig): string {
  return join(ROOT_DIR, getSkillPath(provider));
}

/**
 * Check if a skill already exists for a provider
 */
export function skillExists(provider: ProviderConfig): boolean {
  const skillPath = getAbsoluteSkillPath(provider);
  return existsSync(skillPath);
}
