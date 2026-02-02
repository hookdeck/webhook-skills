/**
 * Claude CLI wrapper for running prompts
 */

import { execa, type ExecaError } from 'execa';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ProviderConfig, Logger, ReviewResult } from './types';

const PROMPTS_DIR = join(__dirname, '..', 'prompts');

/**
 * Load a prompt template and replace placeholders
 */
export function loadPrompt(
  templateName: string,
  replacements: Record<string, string>
): string {
  const templatePath = join(PROMPTS_DIR, templateName);
  let content = readFileSync(templatePath, 'utf-8');
  
  // Simple {{KEY}} replacements
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  
  return content;
}

/**
 * Build prompt replacements from provider config
 */
export function buildPromptReplacements(provider: ProviderConfig): Record<string, string> {
  // Build the docs section based on what's provided
  let docsSection = '';
  if (provider.docs?.webhooks) {
    docsSection = `Use the following official documentation as your primary reference:\n`;
    docsSection += `- Webhooks: ${provider.docs.webhooks}\n`;
    if (provider.docs.verification) {
      docsSection += `- Verification: ${provider.docs.verification}\n`;
    }
    if (provider.docs.events) {
      docsSection += `- Events: ${provider.docs.events}\n`;
    }
    if (provider.notes) {
      docsSection += `\n**Note:** ${provider.notes}\n`;
    }
    docsSection += `\nRead these URLs and extract the information below.`;
  } else {
    docsSection = `Search for ${provider.displayName || provider.name}'s official webhook documentation.`;
  }
  
  // Build docs reference for review prompt (includes all available references)
  let docsReference = '';
  if (provider.docs) {
    const docsList: string[] = [];
    if (provider.docs.webhooks) {
      docsList.push(`- Webhooks: ${provider.docs.webhooks}`);
    }
    if (provider.docs.verification) {
      docsList.push(`- Verification: ${provider.docs.verification}`);
    }
    if (provider.docs.events) {
      docsList.push(`- Events: ${provider.docs.events}`);
    }
    if (provider.docs.api) {
      docsList.push(`- API Reference: ${provider.docs.api}`);
    }
    // Include any additional doc URLs (like reference_impl)
    for (const [key, url] of Object.entries(provider.docs)) {
      if (!['webhooks', 'verification', 'events', 'api'].includes(key) && url) {
        docsList.push(`- ${key.replace(/_/g, ' ')}: ${url}`);
      }
    }
    
    if (docsList.length > 0) {
      docsReference = `## Reference Documentation\n\nUse these official sources to verify accuracy:\n\n${docsList.join('\n')}`;
      
      if (provider.notes) {
        docsReference += `\n\n**Important context:** ${provider.notes}`;
      }
    }
  }
  
  const replacements: Record<string, string> = {
    PROVIDER: provider.displayName || provider.name,
    PROVIDER_KEBAB: provider.name,
    DOCS_SECTION: docsSection,
    DOCS_REFERENCE: docsReference,
  };
  
  return replacements;
}

// Default model - Claude Opus 4
export const DEFAULT_MODEL = 'claude-opus-4-20250514';

/**
 * Run Claude CLI with a prompt
 */
export async function runClaude(
  prompt: string,
  options: {
    workingDir: string;
    logger: Logger;
    dryRun?: boolean;
    model?: string;
    parallel?: boolean;  // If true, use log messages instead of in-place spinner
  }
): Promise<{ output: string; success: boolean }> {
  const { workingDir, logger, dryRun, model = DEFAULT_MODEL, parallel = false } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would run Claude (model: ${model}) with prompt:`);
    logger.debug(prompt.slice(0, 500) + '...');
    return { output: '[DRY RUN] Skipped', success: true };
  }
  
  try {
    logger.info(`Running Claude CLI (model: ${model})...`);
    logger.info(`Working directory: ${workingDir}`);
    
    const startTime = Date.now();
    
    // Format elapsed time as "Xm Ys"
    const formatElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };
    
    let progressInterval: ReturnType<typeof setInterval>;
    
    if (parallel) {
      // In parallel mode, use periodic log messages (no in-place updates)
      let lastLogTime = Date.now();
      progressInterval = setInterval(() => {
        const now = Date.now();
        // Log every 30 seconds
        if (now - lastLogTime >= 30000) {
          logger.info(`Still working... (${formatElapsed()} elapsed)`);
          lastLogTime = now;
        }
      }, 5000);
    } else {
      // Single mode: use in-place spinner
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIndex = 0;
      progressInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        process.stdout.write(`\r${spinnerFrames[spinnerIndex]} Working... (${formatElapsed()} elapsed)   `);
      }, 100);
    }
    
    // Use stdin to pass the prompt - more reliable for long prompts
    // Capture output while also streaming it to console
    const subprocess = execa('claude', [
      '-p',
      '--model', model,
      '--dangerously-skip-permissions',
    ], {
      cwd: workingDir,
      input: prompt,  // Pass prompt via stdin
      timeout: 20 * 60 * 1000, // 20 minute timeout for Opus
      reject: false,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // Collect stdout and stderr
    let stdout = '';
    let stderr = '';
    
    if (subprocess.stdout) {
      subprocess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }
    
    if (subprocess.stderr) {
      subprocess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }
    
    const result = await subprocess;
    
    // Stop progress indicator
    clearInterval(progressInterval);
    
    if (parallel) {
      logger.success(`Claude completed in ${formatElapsed()}`);
    } else {
      process.stdout.write(`\r✓ Completed in ${formatElapsed()}                    \n`);
    }
    
    // Show Claude's output (only in non-parallel mode to avoid interleaved output)
    if (stdout && !parallel) {
      console.log('\n--- Claude Output ---');
      console.log(stdout);
      console.log('--- End Output ---\n');
    }
    
    if (result.exitCode !== 0) {
      logger.error(`Claude CLI failed with exit code ${result.exitCode}`);
      if (stderr) logger.error(stderr);
      return { output: stderr || stdout, success: false };
    }
    
    logger.info(`Claude CLI completed successfully`);
    return { output: stdout, success: true };
  } catch (error) {
    const execaError = error as ExecaError;
    logger.error(`Claude CLI error: ${execaError.message}`);
    return { output: execaError.message, success: false };
  }
}

/**
 * Common options for Claude operations
 */
interface ClaudeOperationOptions {
  workingDir: string;
  logger: Logger;
  dryRun?: boolean;
  model?: string;
  parallel?: boolean;
}

/**
 * Run Claude to generate a skill
 */
export async function runGenerateSkill(
  provider: ProviderConfig,
  options: ClaudeOperationOptions
): Promise<{ output: string; success: boolean }> {
  const replacements = buildPromptReplacements(provider);
  const prompt = loadPrompt('generate-skill.md', replacements);
  
  return runClaude(prompt, options);
}

/**
 * Run Claude to review a skill
 */
export async function runReviewSkill(
  provider: ProviderConfig,
  options: ClaudeOperationOptions
): Promise<{ output: string; success: boolean; reviewResult?: ReviewResult }> {
  const replacements = buildPromptReplacements(provider);
  const prompt = loadPrompt('review-skill.md', replacements);
  
  const result = await runClaude(prompt, options);
  
  if (!result.success) {
    return result;
  }
  
  // Try to parse the review result from Claude's output
  const reviewResult = parseReviewResult(result.output);
  
  return { ...result, reviewResult };
}

/**
 * Run Claude to fix issues
 */
export async function runFixIssues(
  provider: ProviderConfig,
  issuesJson: string,
  options: ClaudeOperationOptions
): Promise<{ output: string; success: boolean }> {
  const replacements = {
    ...buildPromptReplacements(provider),
    ISSUES_JSON: issuesJson,
  };
  const prompt = loadPrompt('fix-issues.md', replacements);
  
  return runClaude(prompt, options);
}

/**
 * Parse review result from Claude's output
 * Looks for JSON in the output that matches the ReviewResult structure
 */
function parseReviewResult(output: string): ReviewResult | undefined {
  // Try to find JSON in the output
  const jsonMatch = output.match(/\{[\s\S]*"approved"[\s\S]*"issues"[\s\S]*\}/);
  
  if (!jsonMatch) {
    return undefined;
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ReviewResult;
    
    // Validate structure
    if (typeof parsed.approved !== 'boolean' || !Array.isArray(parsed.issues)) {
      return undefined;
    }
    
    return parsed;
  } catch {
    return undefined;
  }
}
