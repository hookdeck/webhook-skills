/**
 * Scenario configuration for agent testing
 * Used by test-agent-scenario.sh to get dynamic provider/framework config
 */

import { loadConfigFile, normalizeProviderName, toDisplayName } from './config';
import type { ProviderConfig, ScenarioConfig, TestScenario } from './types';

// Supported frameworks
export const SUPPORTED_FRAMEWORKS = ['express', 'nextjs', 'fastapi'] as const;
export type Framework = typeof SUPPORTED_FRAMEWORKS[number];

/**
 * Default prompt template used when provider doesn't specify a custom prompt
 * Placeholders: {Provider}, {framework}, {events}
 */
const DEFAULT_PROMPT_TEMPLATE = `Add {Provider} webhook handling to my {framework} app. I want to handle {events} events. If you use any skills to help with this, add a comment in the code noting which skill(s) you referenced.`;

/**
 * Get the skill name for a provider
 * Uses testScenario.skillName if specified, otherwise defaults to {name}-webhooks
 */
export function getSkillName(provider: ProviderConfig): string {
  if (provider.testScenario?.skillName) {
    return provider.testScenario.skillName;
  }
  return `${provider.name}-webhooks`;
}

/**
 * Build the prompt for a provider and framework
 */
export function buildPrompt(
  provider: ProviderConfig,
  framework: Framework
): string {
  const testScenario = provider.testScenario;
  
  // Use custom prompt if specified
  const template = testScenario?.prompt || DEFAULT_PROMPT_TEMPLATE;
  
  // Format events list
  const events = testScenario?.events?.join(' and ') || 'webhook';
  
  // Get display name
  const displayName = provider.displayName || toDisplayName(provider.name);
  
  // Replace placeholders and trim whitespace (YAML > blocks add trailing newlines)
  return template
    .trim()
    .replace(/\{Provider\}/g, displayName)
    .replace(/\{provider\}/g, provider.name)
    .replace(/\{framework\}/g, framework)
    .replace(/\{events\}/g, events);
}

/**
 * Get scenario configuration for a provider and framework
 * Returns null if provider not found or framework invalid
 */
export function getScenarioConfig(
  providerName: string,
  framework: string,
  configFile: string
): ScenarioConfig | null {
  // Validate framework
  if (!SUPPORTED_FRAMEWORKS.includes(framework as Framework)) {
    console.error(`Invalid framework: ${framework}`);
    console.error(`Supported frameworks: ${SUPPORTED_FRAMEWORKS.join(', ')}`);
    return null;
  }
  
  // Load providers from config
  const providers = loadConfigFile(configFile);
  const normalizedName = normalizeProviderName(providerName);
  const provider = providers.get(normalizedName);
  
  if (!provider) {
    console.error(`Provider not found: ${providerName}`);
    console.error(`Available providers: ${Array.from(providers.keys()).join(', ')}`);
    return null;
  }
  
  // Check if provider has testScenario configured
  if (!provider.testScenario) {
    console.error(`Provider '${providerName}' does not have testScenario configured in providers.yaml`);
    return null;
  }
  
  return {
    provider: provider.name,
    displayName: provider.displayName || toDisplayName(provider.name),
    framework: framework,
    skillName: getSkillName(provider),
    prompt: buildPrompt(provider, framework as Framework),
  };
}

/**
 * List all providers from config file
 * Returns array of provider names with display names
 */
export function listProviders(configFile: string): Array<{ name: string; displayName: string; hasTestScenario: boolean }> {
  const providers = loadConfigFile(configFile);
  
  return Array.from(providers.values())
    .map(p => ({
      name: p.name,
      displayName: p.displayName || toDisplayName(p.name),
      hasTestScenario: !!p.testScenario,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List providers formatted for CLI output
 */
export function listProvidersFormatted(configFile: string): string {
  const providers = listProviders(configFile);
  
  return providers
    .map(p => {
      const status = p.hasTestScenario ? '' : ' (no testScenario)';
      return `  ${p.name.padEnd(25)} ${p.displayName}${status}`;
    })
    .join('\n');
}
