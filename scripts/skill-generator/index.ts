#!/usr/bin/env node

/**
 * Skill Generator CLI
 * 
 * Generate and review webhook skills using Claude CLI
 */

import { config } from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import pLimit from 'p-limit';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

// Load .env from skill-generator directory
config({ path: join(__dirname, '.env') });
import type {
  ProviderConfig,
  GenerateOptions,
  ReviewOptions,
  OperationResult,
  Logger,
} from './lib/types';
import { mergeProviderConfigs, skillExists } from './lib/config';
import { generateSkill } from './lib/generator';
import { reviewExistingSkill } from './lib/reviewer';
import { DEFAULT_MODEL } from './lib/claude';
import {
  createWorktree,
  removeWorktree,
  addFiles,
  commit,
  push,
  getRepoInfo,
  cleanupAllWorktrees,
} from './lib/git';
import { createPullRequest, verifyToken } from './lib/github';

const ROOT_DIR = join(__dirname, '..', '..');

/**
 * Create a logger for a provider
 */
function createLogger(provider: string, logFile: string): Logger {
  const timestamp = () => new Date().toISOString();
  
  const log = (level: string, message: string, color: (s: string) => string) => {
    const line = `[${timestamp()}] [${level}] [${provider}] ${message}`;
    console.log(color(line));
    appendFileSync(logFile, line + '\n');
  };
  
  return {
    info: (msg) => log('INFO', msg, chalk.blue),
    success: (msg) => log('SUCCESS', msg, chalk.green),
    warn: (msg) => log('WARN', msg, chalk.yellow),
    error: (msg) => log('ERROR', msg, chalk.red),
    debug: (msg) => log('DEBUG', msg, chalk.gray),
  };
}

/**
 * Create results directory and return paths
 */
function createResultsDir(): { dir: string; timestamp: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ROOT_DIR, 'results', timestamp);
  mkdirSync(dir, { recursive: true });
  return { dir, timestamp };
}

/**
 * Write summary files
 */
function writeSummary(results: OperationResult[], resultsDir: string): void {
  // JSON summary
  writeFileSync(
    join(resultsDir, 'summary.json'),
    JSON.stringify(results, null, 2)
  );
  
  // Markdown summary
  const lines = [
    '# Skill Generation Summary',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Total providers:** ${results.length}`,
    `**Successful:** ${results.filter(r => r.success).length}`,
    `**Failed:** ${results.filter(r => !r.success).length}`,
    '',
    '## Results',
    '',
    '| Provider | Status | Branch | PR | Duration | Issues |',
    '|----------|--------|--------|----|---------:|--------|',
  ];
  
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const pr = r.prUrl ? `[PR](${r.prUrl})` : '-';
    const duration = `${(r.duration / 1000).toFixed(1)}s`;
    const issues = `${r.issuesFound} found, ${r.issuesFixed} fixed`;
    lines.push(`| ${r.provider} | ${status} | ${r.branch || '-'} | ${pr} | ${duration} | ${issues} |`);
  }
  
  if (results.some(r => !r.success)) {
    lines.push('', '## Errors', '');
    for (const r of results.filter(r => !r.success)) {
      lines.push(`### ${r.provider}`, '', `\`\`\``, r.error || 'Unknown error', `\`\`\``, '');
    }
  }
  
  writeFileSync(join(resultsDir, 'summary.md'), lines.join('\n'));
}

/**
 * Normalize createPr option value
 * Commander passes: true (flag without value), 'draft', 'true', or false (no flag)
 */
function normalizeCreatePr(value: boolean | string): boolean | 'draft' {
  if (value === false) return false;
  if (value === true || value === 'true' || value === '') return true;
  if (value === 'draft') return 'draft';
  return false;
}

/**
 * Generate command handler
 */
async function handleGenerate(
  providers: string[],
  options: {
    config?: string;
    parallel: string;
    dryRun: boolean;
    baseBranch: string;
    skipTests: boolean;
    skipReview: boolean;
    maxIterations: string;
    createPr: boolean | string;
    model: string;
  }
): Promise<void> {
  console.log(chalk.bold('\n🚀 Skill Generator - Generate Mode\n'));
  
  const providerConfigs = mergeProviderConfigs(providers, options.config);
  
  if (providerConfigs.length === 0) {
    console.log(chalk.red('No providers specified. Use --config or provide provider names.'));
    process.exit(1);
  }
  
  console.log(chalk.blue(`Providers (${providerConfigs.length}): ${providerConfigs.map(p => p.name).join(', ')}`));
  console.log(chalk.blue(`Model: ${options.model}`));
  if (providerConfigs.length > 1) {
    console.log(chalk.blue(`Max parallel: ${options.parallel}`));
  }
  console.log(chalk.blue(`Dry run: ${options.dryRun}`));
  console.log(chalk.gray(`\nNote: Generation can take 5-15 minutes per provider depending on model.\n`));
  
  const generateOptions: GenerateOptions = {
    command: 'generate',
    parallel: parseInt(options.parallel, 10),
    dryRun: options.dryRun,
    baseBranch: options.baseBranch,
    skipTests: options.skipTests,
    skipReview: options.skipReview,
    maxIterations: parseInt(options.maxIterations, 10),
    createPr: normalizeCreatePr(options.createPr),
    model: options.model,
  };
  
  const { dir: resultsDir } = createResultsDir();
  console.log(chalk.gray(`Results directory: ${resultsDir}\n`));
  
  const limit = pLimit(generateOptions.parallel);
  
  const results = await Promise.all(
    providerConfigs.map(provider =>
      limit(async () => {
        const logFile = join(resultsDir, `${provider.name}.log`);
        const logger = createLogger(provider.name, logFile);
        
        logger.info(`Starting generation for ${provider.displayName || provider.name}`);
        
        const result = await generateSkill(provider, generateOptions, {
          rootDir: ROOT_DIR,
          logger,
          logFile,
        });
        
        if (result.success) {
          logger.success(`Completed successfully!`);
        } else {
          logger.error(`Failed: ${result.error}`);
        }
        
        return result;
      })
    )
  );
  
  writeSummary(results, resultsDir);
  
  // Print final summary
  console.log(chalk.bold('\n📊 Summary\n'));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(chalk.green(`✅ Successful: ${successful.length}`));
  for (const r of successful) {
    console.log(chalk.green(`   - ${r.provider}${r.prUrl ? ` (${r.prUrl})` : ''}`));
  }
  
  if (failed.length > 0) {
    console.log(chalk.red(`\n❌ Failed: ${failed.length}`));
    for (const r of failed) {
      console.log(chalk.red(`   - ${r.provider}: ${r.error}`));
    }
  }
  
  console.log(chalk.gray(`\nFull results: ${resultsDir}`));
  
  process.exit(failed.length > 0 ? 1 : 0);
}

/**
 * Review command handler
 */
async function handleReview(
  providers: string[],
  options: {
    config?: string;
    parallel: string;
    dryRun: boolean;
    maxIterations: string;
    createPr: boolean | string;
    branchPrefix: string;
    model: string;
  }
): Promise<void> {
  console.log(chalk.bold('\n🔍 Skill Generator - Review Mode\n'));
  
  const providerConfigs = mergeProviderConfigs(providers, options.config);
  
  if (providerConfigs.length === 0) {
    console.log(chalk.red('No providers specified. Use --config or provide provider names.'));
    process.exit(1);
  }
  
  // Filter to only existing skills
  const existingProviders = providerConfigs.filter(p => {
    const exists = skillExists(p);
    if (!exists) {
      console.log(chalk.yellow(`Skipping ${p.name}: skill does not exist (use 'generate' command first)`));
    }
    return exists;
  });
  
  if (existingProviders.length === 0) {
    console.log(chalk.red('No existing skills found to review.'));
    process.exit(1);
  }
  
  console.log(chalk.blue(`Providers: ${existingProviders.map(p => p.name).join(', ')}`));
  console.log(chalk.blue(`Model: ${options.model}`));
  console.log(chalk.blue(`Parallel: ${options.parallel}`));
  console.log(chalk.blue(`Dry run: ${options.dryRun}`));
  console.log('');
  
  const reviewOptions: ReviewOptions = {
    command: 'review',
    parallel: parseInt(options.parallel, 10),
    dryRun: options.dryRun,
    maxIterations: parseInt(options.maxIterations, 10),
    createPr: normalizeCreatePr(options.createPr),
    branchPrefix: options.branchPrefix,
    model: options.model,
  };
  
  const { dir: resultsDir } = createResultsDir();
  console.log(chalk.gray(`Results directory: ${resultsDir}\n`));
  
  const limit = pLimit(reviewOptions.parallel);
  
  // Get repo info for PR creation
  const repoInfo = await getRepoInfo(ROOT_DIR);
  if (!repoInfo && reviewOptions.createPr) {
    console.log(chalk.red('Could not determine repository owner/name from git remote'));
    process.exit(1);
  }
  
  const results = await Promise.all(
    existingProviders.map(provider =>
      limit(async () => {
        const logFile = join(resultsDir, `${provider.name}.log`);
        const logger = createLogger(provider.name, logFile);
        const startTime = Date.now();
        
        logger.info(`Starting review for ${provider.displayName || provider.name}`);
        
        // Always use worktrees for parallel safety
        const branchName = `${reviewOptions.branchPrefix}/${provider.name}-webhooks`;
        const worktreeId = `review-${provider.name}`;
        
        const worktreeResult = await createWorktree(ROOT_DIR, worktreeId, branchName, {
          logger,
          dryRun: reviewOptions.dryRun,
        });
        
        if (!worktreeResult.success) {
          throw new Error(`Failed to create worktree: ${worktreeResult.error}`);
        }
        
        const workingDir = worktreeResult.path;
        
        const reviewResult = await reviewExistingSkill(provider, {
          workingDir,
          logger,
          dryRun: reviewOptions.dryRun,
          maxIterations: reviewOptions.maxIterations,
          model: reviewOptions.model,
        });
        
        const result: OperationResult = {
          provider: provider.name,
          command: 'review',
          success: reviewResult.success,
          branch: branchName,
          phases: {
            testing: reviewResult.testing,
            review: reviewResult.review,
            iterations: reviewResult.iterations,
          },
          issuesFound: reviewResult.issuesFound,
          issuesFixed: reviewResult.issuesFixed,
          duration: Date.now() - startTime,
          logFile,
        };
        
        // Commit changes if any fixes were made
        if (reviewResult.issuesFixed > 0) {
          const skillPath = `skills/${provider.name}-webhooks`;
          await addFiles(workingDir, [skillPath], { logger, dryRun: reviewOptions.dryRun });
          await commit(workingDir, `fix: improve ${provider.name}-webhooks skill`, {
            logger,
            dryRun: reviewOptions.dryRun,
          });
          
          // Push and create PR if requested
          if (reviewOptions.createPr && repoInfo) {
            await push(workingDir, branchName, { logger, dryRun: reviewOptions.dryRun });
            
            const isDraft = reviewOptions.createPr === 'draft';
            const pr = await createPullRequest({
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              title: `fix: improve ${provider.name}-webhooks skill`,
              body: `## Summary\n\nAutomated improvements to ${provider.name}-webhooks skill.\n\n- Issues found: ${reviewResult.issuesFound}\n- Issues fixed: ${reviewResult.issuesFixed}\n- Iterations: ${reviewResult.iterations}`,
              head: branchName,
              draft: isDraft,
              logger,
              dryRun: reviewOptions.dryRun,
            });
            
            result.prUrl = pr.prUrl;
            
            // Cleanup worktree after PR created
            await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
          } else {
            // No PR - inform user about worktree location
            logger.info(`Changes committed locally (no PR created)`);
            logger.info(`  Branch: ${branchName}`);
            logger.info(`  Path: ${workingDir}`);
            logger.info(`To push and create PR manually:`);
            logger.info(`  cd ${workingDir} && git push -u origin HEAD`);
            logger.info(`  gh pr create`);
          }
        } else {
          // No changes made - cleanup worktree
          logger.info(`No issues fixed - cleaning up worktree`);
          await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
        }
        
        if (result.success) {
          logger.success(`Review completed!`);
        } else {
          logger.error(`Review found unfixed issues`);
        }
        
        return result;
      })
    )
  );
  
  writeSummary(results, resultsDir);
  
  // Print final summary
  console.log(chalk.bold('\n📊 Summary\n'));
  
  for (const r of results) {
    const status = r.success ? chalk.green('✅') : chalk.yellow('⚠️');
    console.log(`${status} ${r.provider}: ${r.issuesFound} issues found, ${r.issuesFixed} fixed`);
    if (r.prUrl) {
      console.log(chalk.gray(`   PR: ${r.prUrl}`));
    }
  }
  
  console.log(chalk.gray(`\nFull results: ${resultsDir}`));
  
  const hasUnfixedIssues = results.some(r => !r.success);
  process.exit(hasUnfixedIssues ? 1 : 0);
}

// CLI setup
const program = new Command();

program
  .name('skill-generator')
  .description('Generate and review webhook skills using Claude CLI')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate new webhook skills')
  .argument('[providers...]', 'Provider names (e.g., elevenlabs, "openai=https://docs...")')
  .option('--config <file>', 'Load provider configs from YAML file')
  .option('--model <model>', 'Claude model to use', DEFAULT_MODEL)
  .option('--parallel <n>', 'Max concurrent agents', '2')
  .option('--dry-run', 'Show what would be done without executing', false)
  .option('--base-branch <branch>', 'Branch to create from', 'main')
  .option('--skip-tests', 'Skip running tests after generation', false)
  .option('--skip-review', 'Skip the review/validation phase', false)
  .option('--max-iterations <n>', 'Max review/fix cycles', '3')
  .option('--create-pr [type]', 'Push and create PR (true or "draft")', false)
  .action(handleGenerate);

program
  .command('review')
  .description('Review and improve existing webhook skills')
  .argument('[providers...]', 'Provider names to review')
  .option('--config <file>', 'Load provider configs from YAML file')
  .option('--model <model>', 'Claude model to use', DEFAULT_MODEL)
  .option('--parallel <n>', 'Max concurrent agents', '2')
  .option('--dry-run', 'Show what would be done without executing', false)
  .option('--max-iterations <n>', 'Max review/fix cycles', '3')
  .option('--create-pr [type]', 'Push and create PR (true or "draft")', false)
  .option('--branch-prefix <prefix>', 'Prefix for improvement branches', 'improve')
  .action(handleReview);

program.parse();
