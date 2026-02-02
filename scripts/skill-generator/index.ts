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
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
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
import { DEFAULT_MODEL, setCachedVersions } from './lib/claude';
import { getLatestVersions } from './lib/versions';
import {
  createWorktree,
  removeWorktree,
  addFiles,
  commit,
  push,
  getRepoInfo,
  cleanupAllWorktrees,
  hasUnpushedCommits,
  getWorktreePath,
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
  
  // Default parallel to number of providers (run all in parallel unless throttled)
  const parallelCount = options.parallel 
    ? parseInt(options.parallel, 10) 
    : providerConfigs.length;
  
  console.log(chalk.blue(`Providers (${providerConfigs.length}): ${providerConfigs.map(p => p.name).join(', ')}`));
  console.log(chalk.blue(`Model: ${options.model}`));
  if (providerConfigs.length > 1) {
    console.log(chalk.blue(`Parallel: ${parallelCount}`));
  }
  console.log(chalk.blue(`Dry run: ${options.dryRun}`));
  console.log(chalk.gray(`\nNote: Generation can take 5-15 minutes per provider depending on model.\n`));
  
  const generateOptions: GenerateOptions = {
    command: 'generate',
    parallel: parallelCount,
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
  
  // Query latest package versions and cache them for prompts
  console.log(chalk.blue('Querying package managers for latest stable versions...'));
  try {
    const versions = await getLatestVersions();
    setCachedVersions(versions);
    console.log(chalk.green(`  npm: ${Object.entries(versions.npm).map(([k, v]) => `${k}@${v}`).join(', ')}`));
    console.log(chalk.green(`  pip: ${Object.entries(versions.pip).map(([k, v]) => `${k}@${v}`).join(', ')}\n`));
  } catch (error) {
    console.log(chalk.yellow('  Warning: Could not query package versions, using defaults\n'));
  }
  
  // PHASE 1: Create all worktrees SEQUENTIALLY to avoid .git/config lock contention
  console.log(chalk.gray('Creating worktrees...\n'));
  const worktrees: Map<string, { path: string; branch: string; logger: Logger; logFile: string }> = new Map();
  
  for (const provider of providerConfigs) {
    const logFile = join(resultsDir, `${provider.name}.log`);
    const logger = createLogger(provider.name, logFile);
    const branchName = `feat/${provider.name}-webhooks`;
    
    logger.info(`Creating worktree for ${provider.name}...`);
    const worktreeResult = await createWorktree(ROOT_DIR, provider.name, branchName, {
      logger,
      baseBranch: generateOptions.baseBranch,
      dryRun: generateOptions.dryRun,
    });
    
    if (!worktreeResult.success) {
      logger.error(`Failed to create worktree: ${worktreeResult.error}`);
      continue;
    }
    
    worktrees.set(provider.name, {
      path: worktreeResult.path!,
      branch: branchName,
      logger,
      logFile,
    });
  }
  
  // PHASE 2: Run generation IN PARALLEL now that worktrees exist
  const limit = pLimit(generateOptions.parallel);
  
  const results = await Promise.all(
    providerConfigs.map(provider =>
      limit(async () => {
        const worktree = worktrees.get(provider.name);
        
        if (!worktree) {
          // Worktree creation failed earlier
          return {
            provider: provider.name,
            command: 'generate',
            success: false,
            error: 'Worktree creation failed',
            phases: {
              generation: { passed: false },
              testing: { passed: false },
              review: { passed: false },
              iterations: 0,
            },
            issuesFound: 0,
            issuesFixed: 0,
            duration: 0,
            logFile: join(resultsDir, `${provider.name}.log`),
          } as OperationResult;
        }
        
        const { logger, logFile, path: worktreePath, branch: branchName } = worktree;
        
        logger.info(`Starting generation for ${provider.displayName || provider.name}`);
        
        const result = await generateSkill(provider, generateOptions, {
          rootDir: ROOT_DIR,
          logger,
          logFile,
          worktreePath,
          branchName,
          isParallel: providerConfigs.length > 1,
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
    workingDir?: string;  // Review in this directory (any git checkout, worktree, or local path)
  }
): Promise<void> {
  console.log(chalk.bold('\n🔍 Skill Generator - Review Mode\n'));
  
  // When --working-dir is specified, review in that directory instead of creating a worktree
  const useProvidedDir = !!options.workingDir;
  
  const providerConfigs = mergeProviderConfigs(providers, options.config);
  
  if (providerConfigs.length === 0) {
    console.log(chalk.red('No providers specified. Use --config or provide provider names.'));
    process.exit(1);
  }
  
  // When using provided directory, skip the skill existence check in main repo
  let existingProviders: typeof providerConfigs;
  if (useProvidedDir) {
    // Trust that the skill exists in the provided directory
    existingProviders = providerConfigs;
    if (providerConfigs.length > 1) {
      console.log(chalk.yellow('Warning: --working-dir only supports single provider. Using first one.'));
      existingProviders = [providerConfigs[0]];
    }
    // Will resolve relative paths later when we have the path module
    console.log(chalk.blue(`Working directory: ${options.workingDir}${options.workingDir!.startsWith('/') ? '' : ' (relative to repo root)'}`));
  } else {
    // Filter to only existing skills (in main repo OR in a worktree)
    existingProviders = providerConfigs.filter(p => {
      // Check main repo first
      if (skillExists(p)) {
        return true;
      }
      
      // Check if there's an existing worktree with the skill
      const worktreePath = getWorktreePath(ROOT_DIR, p.name);
      const skillPathInWorktree = join(worktreePath, 'skills', `${p.name}-webhooks`, 'SKILL.md');
      if (existsSync(skillPathInWorktree)) {
        console.log(chalk.blue(`Found ${p.name} in existing worktree: ${worktreePath}`));
        return true;
      }
      
      console.log(chalk.yellow(`Skipping ${p.name}: skill does not exist (use 'generate' command first)`));
      return false;
    });
    
    if (existingProviders.length === 0) {
      console.log(chalk.red('No existing skills found to review.'));
      process.exit(1);
    }
  }
  
  // Default parallel to number of providers (run all in parallel unless throttled)
  const parallelCount = options.parallel 
    ? parseInt(options.parallel, 10) 
    : existingProviders.length;
  
  console.log(chalk.blue(`Providers: ${existingProviders.map(p => p.name).join(', ')}`));
  console.log(chalk.blue(`Model: ${options.model}`));
  if (!useProvidedDir && existingProviders.length > 1) {
    console.log(chalk.blue(`Parallel: ${parallelCount}`));
  }
  console.log(chalk.blue(`Dry run: ${options.dryRun}`));
  console.log('');
  
  const reviewOptions: ReviewOptions = {
    command: 'review',
    parallel: parallelCount,
    dryRun: options.dryRun,
    maxIterations: parseInt(options.maxIterations, 10),
    createPr: normalizeCreatePr(options.createPr),
    branchPrefix: options.branchPrefix,
    model: options.model,
  };
  
  const { dir: resultsDir } = createResultsDir();
  console.log(chalk.gray(`Results directory: ${resultsDir}\n`));
  
  // Query latest package versions and cache them for prompts
  console.log(chalk.blue('Querying package managers for latest stable versions...'));
  try {
    const versions = await getLatestVersions();
    setCachedVersions(versions);
    console.log(chalk.green(`  npm: ${Object.entries(versions.npm).map(([k, v]) => `${k}@${v}`).join(', ')}`));
    console.log(chalk.green(`  pip: ${Object.entries(versions.pip).map(([k, v]) => `${k}@${v}`).join(', ')}\n`));
  } catch (error) {
    console.log(chalk.yellow('  Warning: Could not query package versions, using defaults\n'));
  }
  
  // Get repo info for PR creation
  const repoInfo = await getRepoInfo(ROOT_DIR);
  if (!repoInfo && reviewOptions.createPr) {
    console.log(chalk.red('Could not determine repository owner/name from git remote'));
    process.exit(1);
  }
  
  const worktrees: Map<string, { path: string; branch: string; worktreeId: string; logger: Logger; logFile: string; isExternal: boolean }> = new Map();
  
  if (useProvidedDir) {
    // Use the provided working directory
    const provider = existingProviders[0];
    const logFile = join(resultsDir, `${provider.name}.log`);
    const logger = createLogger(provider.name, logFile);
    
    // Resolve working directory path (relative paths are relative to repo root)
    const { resolve, isAbsolute } = await import('path');
    const resolvedWorkingDir = isAbsolute(options.workingDir!)
      ? options.workingDir!
      : resolve(ROOT_DIR, options.workingDir!);
    
    // Get current branch name from the directory (if it's a git repo)
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(resolvedWorkingDir);
    let branchName: string;
    try {
      const branchResult = await git.branch();
      branchName = branchResult.current;
    } catch {
      branchName = `${reviewOptions.branchPrefix}/${provider.name}-webhooks`;
    }
    
    worktrees.set(provider.name, {
      path: resolvedWorkingDir,
      branch: branchName,
      worktreeId: 'external',
      logger,
      logFile,
      isExternal: true,  // Don't clean up user-provided directories
    });
    
    logger.info(`Using directory: ${options.workingDir}`);
    logger.info(`Current branch: ${branchName}`);
  } else {
    // PHASE 1: Create worktrees SEQUENTIALLY (or use existing ones from generate)
    console.log(chalk.gray('Setting up worktrees...\n'));
    
    for (const provider of existingProviders) {
      const logFile = join(resultsDir, `${provider.name}.log`);
      const logger = createLogger(provider.name, logFile);
      
      // Check if there's an existing worktree from a previous generate run
      const existingWorktreePath = getWorktreePath(ROOT_DIR, provider.name);
      const skillPathInWorktree = join(existingWorktreePath, 'skills', `${provider.name}-webhooks`, 'SKILL.md');
      
      if (existsSync(skillPathInWorktree)) {
        // Use existing worktree
        logger.info(`Using existing worktree at ${existingWorktreePath}`);
        
        // Get branch name from the existing worktree
        const { simpleGit } = await import('simple-git');
        const git = simpleGit(existingWorktreePath);
        let branchName: string;
        try {
          const branchResult = await git.branch();
          branchName = branchResult.current;
        } catch {
          branchName = `feat/${provider.name}-webhooks`;
        }
        
        worktrees.set(provider.name, {
          path: existingWorktreePath,
          branch: branchName,
          worktreeId: provider.name, // worktree ID from generate
          logger,
          logFile,
          isExternal: false, // Can be cleaned up after PR
        });
        
        logger.info(`Current branch: ${branchName}`);
        continue;
      }
      
      // No existing worktree - create a new one
      const branchName = `${reviewOptions.branchPrefix}/${provider.name}-webhooks`;
      const worktreeId = `review-${provider.name}`;
      
      logger.info(`Creating worktree for ${provider.name}...`);
      const worktreeResult = await createWorktree(ROOT_DIR, worktreeId, branchName, {
        logger,
        dryRun: reviewOptions.dryRun,
      });
      
      if (!worktreeResult.success) {
        logger.error(`Failed to create worktree: ${worktreeResult.error}`);
        continue;
      }
      
      worktrees.set(provider.name, {
        path: worktreeResult.path!,
        branch: branchName,
        worktreeId,
        logger,
        logFile,
        isExternal: false,
      });
    }
  }
  
  // PHASE 2: Run reviews IN PARALLEL now that worktrees exist
  const limit = pLimit(reviewOptions.parallel);
  
  const results = await Promise.all(
    existingProviders.map(provider =>
      limit(async () => {
        const worktree = worktrees.get(provider.name);
        
        if (!worktree) {
          // Worktree creation failed earlier
          return {
            provider: provider.name,
            command: 'review',
            success: false,
            error: 'Worktree creation failed',
            phases: {
              testing: { passed: false },
              review: { passed: false },
              iterations: 0,
            },
            issuesFound: 0,
            issuesFixed: 0,
            duration: 0,
            logFile: join(resultsDir, `${provider.name}.log`),
          } as OperationResult;
        }
        
        const { logger, logFile, path: workingDir, branch: branchName, worktreeId, isExternal } = worktree;
        const startTime = Date.now();
        
        logger.info(`Starting review for ${provider.displayName || provider.name}`);
        
        const reviewResult = await reviewExistingSkill(provider, {
          workingDir,
          logger,
          dryRun: reviewOptions.dryRun,
          maxIterations: reviewOptions.maxIterations,
          model: reviewOptions.model,
          parallel: existingProviders.length > 1,
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
          
          // Only push and create PR if review was fully successful
          if (reviewOptions.createPr && repoInfo && reviewResult.success) {
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
            
            // Cleanup worktree after PR created (but not external worktrees)
            if (!isExternal) {
              await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
            }
          } else {
            // No PR - either not requested, not successful, or missing repo info
            logger.info(`Changes committed locally (no PR created)`);
            if (!reviewResult.success) {
              logger.warn(`Review had unfixed issues - PR not created`);
            }
            logger.info(`  Branch: ${branchName}`);
            logger.info(`  Path: ${workingDir}`);
            logger.info(`To push and create PR manually:`);
            logger.info(`  cd ${workingDir} && git push -u origin HEAD`);
            logger.info(`  gh pr create`);
          }
        } else {
          // No new changes in this run
          // But check if there are unpushed commits from a previous run (e.g., failed generate that we're retrying)
          if (reviewOptions.createPr && repoInfo && reviewResult.success) {
            const hasUnpushed = await hasUnpushedCommits(workingDir, { logger, dryRun: reviewOptions.dryRun });
            
            if (hasUnpushed) {
              logger.info(`No new fixes needed, but found unpushed commits from previous run`);
              await push(workingDir, branchName, { logger, dryRun: reviewOptions.dryRun });
              
              const isDraft = reviewOptions.createPr === 'draft';
              const pr = await createPullRequest({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                title: `feat: add ${provider.name}-webhooks skill`,
                body: `## Summary\n\nAdd webhook skill for ${provider.displayName || provider.name}.\n\n- Review passed with no issues`,
                head: branchName,
                draft: isDraft,
                logger,
                dryRun: reviewOptions.dryRun,
              });
              
              result.prUrl = pr.prUrl;
              
              // Cleanup worktree after PR created (but not external worktrees)
              if (!isExternal) {
                await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
              }
            } else {
              logger.info(`No issues fixed and no unpushed commits`);
              // Cleanup worktree (but not external worktrees)
              if (!isExternal) {
                await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
              }
            }
          } else {
            // No PR requested or review failed - cleanup worktree (but not external worktrees)
            if (!isExternal) {
              logger.info(`No issues fixed - cleaning up worktree`);
              await removeWorktree(ROOT_DIR, worktreeId, { logger, dryRun: reviewOptions.dryRun });
            } else {
              logger.info(`No issues fixed`);
            }
          }
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
  .option('--parallel <n>', 'Max concurrent agents (default: all providers)')
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
  .option('--parallel <n>', 'Max concurrent agents (default: all providers)')
  .option('--dry-run', 'Show what would be done without executing', false)
  .option('--max-iterations <n>', 'Max review/fix cycles', '3')
  .option('--create-pr [type]', 'Push and create PR (true or "draft")', false)
  .option('--branch-prefix <prefix>', 'Prefix for improvement branches', 'improve')
  .option('--working-dir <path>', 'Review skill in specified directory (skips skill existence check and worktree creation)')
  .action(handleReview);

program.parse();
