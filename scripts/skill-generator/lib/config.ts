/**
 * Configuration parsing for provider configs from CLI and YAML files
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { ProviderConfig } from './types';

// Root directory of the repository (two levels up from lib/)
const ROOT_DIR = join(__dirname, '..', '..', '..');

/**
 * Parse a provider argument that may include a docs URL
 * Format: "provider" or "provider=https://docs.example.com"
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
  
  // Provider with docs URL
  const name = arg.slice(0, equalIndex);
  const docsUrl = arg.slice(equalIndex + 1);
  
  return {
    name: normalizeProviderName(name),
    displayName: toDisplayName(name),
    docs: {
      webhooks: docsUrl,
    },
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
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  
  const configs = new Map<string, ProviderConfig>();
  
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
