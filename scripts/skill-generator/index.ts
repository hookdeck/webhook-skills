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
import { setCachedVersions } from './lib/cli';
import { DEFAULT_CLI_TOOL, AVAILABLE_CLI_TOOLS } from './lib/cli-adapters';
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
  pathExistsInBranch,
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
    cli: string;
    workingDir?: string;  // Generate in this directory (skip worktree creation)
    worktree?: boolean;   // Set to false by --no-worktree flag
  }
): Promise<void> {
  console.log(chalk.bold('\n🚀 Skill Generator - Generate Mode\n'));
  
  // Validate mutually exclusive flags
  // Note: --no-worktree sets options.worktree = false (Commander.js negatable boolean pattern)
  if (options.workingDir && options.worktree === false) {
    console.log(chalk.red('Error: --working-dir and --no-worktree cannot be used together.'));
    console.log(chalk.gray('Use --working-dir <path> to specify a directory, or --no-worktree to use the current directory.'));
    process.exit(1);
  }
  
  // Handle --no-worktree as shorthand for --working-dir .
  if (options.worktree === false) {
    options.workingDir = '.';
  }
  
  // When using working directory mode, only single provider is supported
  const useProvidedDir = !!options.workingDir;
  
  const providerConfigs = mergeProviderConfigs(providers, options.config);
  
  if (providerConfigs.length === 0) {
    console.log(chalk.red('No providers specified. Use --config or provide provider names.'));
    process.exit(1);
  }
  
  // Validate single provider when using working directory mode
  if (useProvidedDir && providerConfigs.length > 1) {
    const flagUsed = options.worktree === false ? '--no-worktree' : '--working-dir';
    console.log(chalk.red(`Error: ${flagUsed} only supports a single provider.`));
    console.log(chalk.gray('For multiple providers, use the default worktree mode for parallel processing.'));
    process.exit(1);
  }
  
  // Default parallel to number of providers (run all in parallel unless throttled)
  const parallelCount = options.parallel 
    ? parseInt(options.parallel, 10) 
    : providerConfigs.length;
  
  console.log(chalk.blue(`Providers (${providerConfigs.length}): ${providerConfigs.map(p => p.name).join(', ')}`));
  console.log(chalk.blue(`CLI tool: ${options.cli}`));
  console.log(chalk.blue(`Model: ${options.model}`));
  if (!useProvidedDir && providerConfigs.length > 1) {
    console.log(chalk.blue(`Parallel: ${parallelCount}`));
  }
  if (useProvidedDir) {
    console.log(chalk.blue(`Working directory: ${options.workingDir}${options.workingDir!.startsWith('/') ? '' : ' (relative to repo root)'}`));
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
    cliTool: options.cli,
  };
  
  const { dir: resultsDir } = createResultsDir();
  console.log(chalk.gray(`Results directory: ${resultsDir}\n`));
  
  // Query latest package versions and cache them for prompts (skip in dry-run mode)
  if (!generateOptions.dryRun) {
    console.log(chalk.blue('Querying package managers for latest stable versions...'));
    const VERSIONS_TIMEOUT = 30000; // 30 seconds
    try {
      const versions = await Promise.race([
        getLatestVersions(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout after 30s')), VERSIONS_TIMEOUT)
        ),
      ]);
      setCachedVersions(versions);
      console.log(chalk.green(`  npm: ${Object.entries(versions.npm).map(([k, v]) => `${k}@${v}`).join(', ')}`));
      console.log(chalk.green(`  pip: ${Object.entries(versions.pip).map(([k, v]) => `${k}@${v}`).join(', ')}\n`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.yellow(`  Warning: Could not query package versions: ${errorMessage}`));
      console.log(chalk.yellow('  Using default versions. Ensure network access for accurate versions.\n'));
    }
  } else {
    console.log(chalk.gray('Skipping version lookup (dry-run mode)\n'));
  }
  
  // Get repo info for PR creation
  const repoInfo = await getRepoInfo(ROOT_DIR);
  if (!repoInfo && generateOptions.createPr) {
    console.log(chalk.red('Could not determine repository owner/name from git remote'));
    process.exit(1);
  }
  
  // Working directories map - may be user-provided directories or auto-created worktrees
  const workDirs: Map<string, { path: string; branch: string; logger: Logger; logFile: string; isExternal: boolean }> = new Map();
  
  if (useProvidedDir) {
    // Use the provided working directory (no worktree creation)
    const provider = providerConfigs[0];
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
      branchName = `feat/${provider.name}-webhooks`;
    }
    
    workDirs.set(provider.name, {
      path: resolvedWorkingDir,
      branch: branchName,
      logger,
      logFile,
      isExternal: true,  // Don't clean up user-provided directories
    });
    
    logger.info(`Using directory: ${options.workingDir}`);
    logger.info(`Current branch: ${branchName}`);
  } else {
    // Create worktrees for parallel execution (sequential creation to avoid .git/config lock contention)
    console.log(chalk.gray('Creating worktrees...\n'));
    
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
      
      workDirs.set(provider.name, {
        path: worktreeResult.path!,
        branch: branchName,
        logger,
        logFile,
        isExternal: false,
      });
    }
  }
  
  // Run generation for each provider
  const limit = pLimit(generateOptions.parallel);
  
  const results = await Promise.all(
    providerConfigs.map(provider =>
      limit(async () => {
        const workDir = workDirs.get(provider.name);
        
        if (!workDir) {
          // Working directory setup failed earlier
          return {
            provider: provider.name,
            command: 'generate',
            success: false,
            error: 'Working directory setup failed',
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
        
        const { logger, logFile, path: workDirPath, branch: branchName } = workDir;
        
        logger.info(`Starting generation for ${provider.displayName || provider.name}`);
        
        const result = await generateSkill(provider, generateOptions, {
          rootDir: ROOT_DIR,
          logger,
          logFile,
          worktreePath: workDirPath,
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
    cli: string;
    workingDir?: string;  // Review in this directory (any git checkout, worktree, or local path)
    worktree?: boolean;   // Set to false by --no-worktree flag
  }
): Promise<void> {
  console.log(chalk.bold('\n🔍 Skill Generator - Review Mode\n'));
  
  // Validate mutually exclusive flags
  // Note: --no-worktree sets options.worktree = false (Commander.js negatable boolean pattern)
  if (options.workingDir && options.worktree === false) {
    console.log(chalk.red('Error: --working-dir and --no-worktree cannot be used together.'));
    console.log(chalk.gray('Use --working-dir <path> to specify a directory, or --no-worktree to use the current directory.'));
    process.exit(1);
  }
  
  // Handle --no-worktree as shorthand for --working-dir .
  if (options.worktree === false) {
    options.workingDir = '.';
  }
  
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
    // Validate single provider when using working directory mode
    if (providerConfigs.length > 1) {
      const flagUsed = options.worktree === false ? '--no-worktree' : '--working-dir';
      console.log(chalk.red(`Error: ${flagUsed} only supports a single provider.`));
      console.log(chalk.gray('For multiple providers, use the default worktree mode for parallel processing.'));
      process.exit(1);
    }
    // Trust that the skill exists in the provided directory
    existingProviders = providerConfigs;
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
  console.log(chalk.blue(`CLI tool: ${options.cli}`));
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
    cliTool: options.cli,
  };
  
  const { dir: resultsDir } = createResultsDir();
  console.log(chalk.gray(`Results directory: ${resultsDir}\n`));
  
  // Query latest package versions and cache them for prompts (skip in dry-run mode)
  if (!reviewOptions.dryRun) {
    console.log(chalk.blue('Querying package managers for latest stable versions...'));
    const VERSIONS_TIMEOUT = 30000; // 30 seconds
    try {
      const versions = await Promise.race([
        getLatestVersions(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout after 30s')), VERSIONS_TIMEOUT)
        ),
      ]);
      setCachedVersions(versions);
      console.log(chalk.green(`  npm: ${Object.entries(versions.npm).map(([k, v]) => `${k}@${v}`).join(', ')}`));
      console.log(chalk.green(`  pip: ${Object.entries(versions.pip).map(([k, v]) => `${k}@${v}`).join(', ')}\n`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.yellow(`  Warning: Could not query package versions: ${errorMessage}`));
      console.log(chalk.yellow('  Using default versions. Ensure network access for accurate versions.\n'));
    }
  } else {
    console.log(chalk.gray('Skipping version lookup (dry-run mode)\n'));
  }
  
  // Get repo info for PR creation
  const repoInfo = await getRepoInfo(ROOT_DIR);
  if (!repoInfo && reviewOptions.createPr) {
    console.log(chalk.red('Could not determine repository owner/name from git remote'));
    process.exit(1);
  }
  
  // Working directories map - may be user-provided directories or auto-created worktrees
  const workDirs: Map<string, { path: string; branch: string; worktreeId: string; logger: Logger; logFile: string; isExternal: boolean }> = new Map();
  
  if (useProvidedDir) {
    // Use the provided working directory (no worktree creation)
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
    
    workDirs.set(provider.name, {
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
    // Create worktrees for parallel execution (or use existing ones from generate)
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
        
        workDirs.set(provider.name, {
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
      
      workDirs.set(provider.name, {
        path: worktreeResult.path!,
        branch: branchName,
        worktreeId,
        logger,
        logFile,
        isExternal: false,
      });
    }
  }
  
  // Run reviews for each provider
  const limit = pLimit(reviewOptions.parallel);
  
  const results = await Promise.all(
    existingProviders.map(provider =>
      limit(async () => {
        const workDir = workDirs.get(provider.name);
        
        if (!workDir) {
          // Working directory setup failed earlier
          return {
            provider: provider.name,
            command: 'review',
            success: false,
            error: 'Working directory setup failed',
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
        
        const { logger, logFile, path: workingDir, branch: branchName, worktreeId, isExternal } = workDir;
        const startTime = Date.now();
        
        logger.info(`Starting review for ${provider.displayName || provider.name}`);
        
        const reviewResult = await reviewExistingSkill(provider, {
          workingDir,
          logger,
          dryRun: reviewOptions.dryRun,
          maxIterations: reviewOptions.maxIterations,
          model: reviewOptions.model,
          cliTool: reviewOptions.cliTool,
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
          
          // Check if this is a new skill (feat) or existing skill (fix)
          // We check against 'main' branch to determine if this is a new addition
          const isNewSkill = !(await pathExistsInBranch(
            ROOT_DIR,
            `${skillPath}/SKILL.md`,
            'main',
            { logger, dryRun: reviewOptions.dryRun }
          ));
          
          const commitPrefix = isNewSkill ? 'feat' : 'fix';
          const commitVerb = isNewSkill ? 'add' : 'improve';
          const commitMessage = `${commitPrefix}: ${commitVerb} ${provider.name}-webhooks skill`;
          
          await addFiles(workingDir, [skillPath], { logger, dryRun: reviewOptions.dryRun });
          await commit(workingDir, commitMessage, {
            logger,
            dryRun: reviewOptions.dryRun,
          });
          
          // Only push and create PR if review was fully successful
          if (reviewOptions.createPr && repoInfo && reviewResult.success) {
            await push(workingDir, branchName, { logger, dryRun: reviewOptions.dryRun });
            
            const isDraft = reviewOptions.createPr === 'draft';
            const prBody = isNewSkill
              ? `## Summary\n\nAdd webhook skill for ${provider.displayName || provider.name}.\n\n- Issues found during review: ${reviewResult.issuesFound}\n- Issues fixed: ${reviewResult.issuesFixed}\n- Review iterations: ${reviewResult.iterations}`
              : `## Summary\n\nAutomated improvements to ${provider.name}-webhooks skill.\n\n- Issues found: ${reviewResult.issuesFound}\n- Issues fixed: ${reviewResult.issuesFixed}\n- Iterations: ${reviewResult.iterations}`;
            
            const pr = await createPullRequest({
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              title: commitMessage,
              body: prBody,
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
  .description('Generate and review webhook skills using AI CLI tools')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate new webhook skills')
  .argument('[providers...]', 'Provider names, or provider=url, or provider=url|notes (e.g. elevenlabs=https://github.com/elevenlabs/elevenlabs-js|Official SDK supports webhook verification)')
  .option('--config <file>', 'Load provider configs from YAML file')
  .option('--cli <tool>', `CLI tool to use (${AVAILABLE_CLI_TOOLS.join(', ')})`, DEFAULT_CLI_TOOL)
  .option('--model <model>', 'Model to use', undefined)
  .option('--parallel <n>', 'Max concurrent agents (default: all providers)')
  .option('--dry-run', 'Show what would be done without executing', false)
  .option('--base-branch <branch>', 'Branch to create from', 'main')
  .option('--skip-tests', 'Skip running tests after generation', false)
  .option('--skip-review', 'Skip the review/validation phase', false)
  .option('--max-iterations <n>', 'Max review/fix cycles', '3')
  .option('--create-pr [type]', 'Push and create PR (true or "draft")', false)
  .option('--working-dir <path>', 'Generate skill in specified directory (skips worktree creation)')
  .option('--no-worktree', 'Generate in current directory (shorthand for --working-dir .)')
  .action(handleGenerate);

program
  .command('review')
  .description('Review and improve existing webhook skills')
  .argument('[providers...]', 'Provider names, or provider=url, or provider=url|notes (e.g. elevenlabs=https://.../elevenlabs-js|Prefer SDK verification in skill)')
  .option('--config <file>', 'Load provider configs from YAML file')
  .option('--cli <tool>', `CLI tool to use (${AVAILABLE_CLI_TOOLS.join(', ')})`, DEFAULT_CLI_TOOL)
  .option('--model <model>', 'Model to use', undefined)
  .option('--parallel <n>', 'Max concurrent agents (default: all providers)')
  .option('--dry-run', 'Show what would be done without executing', false)
  .option('--max-iterations <n>', 'Max review/fix cycles', '3')
  .option('--create-pr [type]', 'Push and create PR (true or "draft")', false)
  .option('--branch-prefix <prefix>', 'Prefix for improvement branches', 'improve')
  .option('--working-dir <path>', 'Review skill in specified directory (skips skill existence check and worktree creation)')
  .option('--no-worktree', 'Review in current directory (shorthand for --working-dir .)')
  .action(handleReview);

program.parse();
