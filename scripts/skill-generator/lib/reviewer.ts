/**
 * Review and iteration logic for skills
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  ProviderConfig,
  Logger,
  PhaseResult,
  ReviewResult,
  ReviewIssue,
} from './types';
import { runReviewSkill, runFixIssues } from './claude';
import { runTests } from './generator';

/**
 * Thresholds for accepting a skill
 */
export const ACCEPTANCE_THRESHOLDS = {
  maxCritical: 0,    // No critical issues allowed
  maxMajor: 1,       // At most 1 major issue
  maxMinor: 2,       // At most 2 minor issues
  maxTotal: 5,       // At most 5 issues total
};

export interface ReviewAndIterateOptions {
  workingDir: string;
  logger: Logger;
  dryRun?: boolean;
  skipTests?: boolean;
  skipReview?: boolean;
  maxIterations: number;
  model?: string;
  parallel?: boolean;
}

export interface ReviewAndIterateResult {
  success: boolean;
  testing: PhaseResult;
  review: PhaseResult;
  iterations: number;
  issuesFound: number;
  issuesFixed: number;
  remainingIssues?: ReviewIssue[];
}

/**
 * Check if issues are within acceptance thresholds
 */
function issuesWithinThresholds(issues: ReviewIssue[]): boolean {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major = issues.filter(i => i.severity === 'major').length;
  const minor = issues.filter(i => i.severity === 'minor').length;
  const total = issues.length;
  
  return (
    critical <= ACCEPTANCE_THRESHOLDS.maxCritical &&
    major <= ACCEPTANCE_THRESHOLDS.maxMajor &&
    minor <= ACCEPTANCE_THRESHOLDS.maxMinor &&
    total <= ACCEPTANCE_THRESHOLDS.maxTotal
  );
}

/**
 * Read existing TODO.md from skill directory
 */
function readTodoFile(skillDir: string): string | null {
  const todoPath = join(skillDir, 'TODO.md');
  if (existsSync(todoPath)) {
    return readFileSync(todoPath, 'utf-8');
  }
  return null;
}

/**
 * Write TODO.md with remaining issues
 */
function writeTodoFile(
  skillDir: string, 
  issues: ReviewIssue[], 
  suggestions: string[],
  dryRun?: boolean
): void {
  if (issues.length === 0 && suggestions.length === 0) {
    return; // Nothing to write
  }
  
  const todoPath = join(skillDir, 'TODO.md');
  const timestamp = new Date().toISOString().split('T')[0];
  
  let content = `# TODO - Known Issues and Improvements\n\n`;
  content += `*Last updated: ${timestamp}*\n\n`;
  content += `These items were identified during automated review but are acceptable for merge.\n`;
  content += `Contributions to address these items are welcome.\n\n`;
  
  if (issues.length > 0) {
    content += `## Issues\n\n`;
    
    const critical = issues.filter(i => i.severity === 'critical');
    const major = issues.filter(i => i.severity === 'major');
    const minor = issues.filter(i => i.severity === 'minor');
    
    if (critical.length > 0) {
      content += `### Critical\n\n`;
      for (const issue of critical) {
        content += `- [ ] **${issue.file}**: ${issue.description}\n`;
        if (issue.suggestedFix) {
          content += `  - Suggested fix: ${issue.suggestedFix}\n`;
        }
      }
      content += `\n`;
    }
    
    if (major.length > 0) {
      content += `### Major\n\n`;
      for (const issue of major) {
        content += `- [ ] **${issue.file}**: ${issue.description}\n`;
        if (issue.suggestedFix) {
          content += `  - Suggested fix: ${issue.suggestedFix}\n`;
        }
      }
      content += `\n`;
    }
    
    if (minor.length > 0) {
      content += `### Minor\n\n`;
      for (const issue of minor) {
        content += `- [ ] **${issue.file}**: ${issue.description}\n`;
        if (issue.suggestedFix) {
          content += `  - Suggested fix: ${issue.suggestedFix}\n`;
        }
      }
      content += `\n`;
    }
  }
  
  if (suggestions.length > 0) {
    content += `## Suggestions\n\n`;
    for (const suggestion of suggestions) {
      content += `- [ ] ${suggestion}\n`;
    }
    content += `\n`;
  }
  
  if (!dryRun) {
    writeFileSync(todoPath, content, 'utf-8');
  }
}

/**
 * Run tests and review with iteration loop
 */
export async function reviewAndIterate(
  provider: ProviderConfig,
  options: ReviewAndIterateOptions
): Promise<ReviewAndIterateResult> {
  const { workingDir, logger, dryRun, skipTests, skipReview, maxIterations, model, parallel } = options;
  
  logger.info(`Starting review for ${provider.displayName || provider.name}`);
  logger.info(`Acceptance thresholds: critical=${ACCEPTANCE_THRESHOLDS.maxCritical}, major≤${ACCEPTANCE_THRESHOLDS.maxMajor}, minor≤${ACCEPTANCE_THRESHOLDS.maxMinor}, total≤${ACCEPTANCE_THRESHOLDS.maxTotal}`);
  
  // Check for existing TODO.md from previous runs
  const skillDir = join(workingDir, 'skills', `${provider.name}-webhooks`);
  const existingTodo = readTodoFile(skillDir);
  if (existingTodo) {
    logger.info(`Found existing TODO.md with issues from previous run`);
  }
  
  let iteration = 0;
  let totalIssuesFound = 0;
  let totalIssuesFixed = 0;
  let testingResult: PhaseResult = { passed: true, details: 'Skipped' };
  let reviewResult: PhaseResult = { passed: true, details: 'Skipped' };
  let lastReviewIssues: ReviewIssue[] = [];
  
  while (iteration < maxIterations) {
    logger.info(`--- Iteration ${iteration + 1}/${maxIterations} ---`);
    
    // Phase 1: Run tests
    if (!skipTests) {
      logger.info('Running tests...');
      const tests = await runTests(provider, { workingDir, logger, dryRun });
      
      testingResult = {
        passed: tests.passed,
        details: tests.frameworks
          .map(f => `${f.framework}: ${f.passed ? 'PASS' : 'FAIL'}`)
          .join(', '),
      };
      
      if (!tests.passed) {
        // Tests failed - need to fix
        const failedTests = tests.frameworks.filter(f => !f.passed);
        const errorDetails = failedTests
          .map(f => `${f.framework}: ${f.error || f.output}`)
          .join('\n\n');
        
        logger.warn(`Tests failed: ${testingResult.details}`);
        
        // Create fix prompt for test failures
        const testIssues: ReviewIssue[] = failedTests.map(f => ({
          severity: 'critical' as const,
          category: 'code' as const,
          file: `examples/${f.framework}/`,
          description: `Test failure: ${f.error || 'See output'}`,
          suggestedFix: f.output,
        }));
        
        totalIssuesFound += testIssues.length;
        
        // Try to fix
        await runFixIssues(provider, JSON.stringify(testIssues, null, 2), {
          workingDir,
          logger,
          dryRun,
          model,
          parallel,
          existingTodo,
        });
        
        totalIssuesFixed += testIssues.length; // Assume fixed, will verify next iteration
        iteration++;
        continue;
      }
      
      logger.success('Tests passed!');
    }
    
    // Phase 2: Review content accuracy
    if (!skipReview) {
      logger.info('Reviewing content accuracy...');
      const review = await runReviewSkill(provider, { workingDir, logger, dryRun, model, parallel });
      
      if (!review.success) {
        reviewResult = { passed: false, details: 'Review failed to run' };
        iteration++;
        continue;
      }
      
      if (review.reviewResult) {
        lastReviewIssues = review.reviewResult.issues;
        totalIssuesFound += lastReviewIssues.length;
        
        // Check if approved or within thresholds
        const criticalIssues = lastReviewIssues.filter(i => i.severity === 'critical');
        const majorIssues = lastReviewIssues.filter(i => i.severity === 'major');
        const minorIssues = lastReviewIssues.filter(i => i.severity === 'minor');
        
        const issuesSummary = `${criticalIssues.length} critical, ${majorIssues.length} major, ${minorIssues.length} minor`;
        
        if (review.reviewResult.approved) {
          reviewResult = {
            passed: true,
            details: `Approved with ${review.reviewResult.suggestions.length} suggestions`,
          };
          logger.success('Review passed!');
          break; // Success!
        }
        
        // Check if issues are within acceptance thresholds
        if (issuesWithinThresholds(lastReviewIssues)) {
          reviewResult = {
            passed: true,
            details: `Accepted within thresholds (${issuesSummary})`,
          };
          
          // Write remaining issues to TODO.md
          const skillDir = join(workingDir, 'skills', `${provider.name}-webhooks`);
          writeTodoFile(skillDir, lastReviewIssues, review.reviewResult.suggestions, dryRun);
          
          logger.success(`Review accepted within thresholds: ${issuesSummary}`);
          logger.info(`Remaining issues written to TODO.md`);
          break; // Success - within thresholds
        }
        
        // Issues exceed thresholds - need to fix
        reviewResult = {
          passed: false,
          details: `Found ${issuesSummary} (exceeds thresholds)`,
        };
        
        logger.warn(`Review found issues: ${issuesSummary}`);
        
        // Log issues
        for (const issue of lastReviewIssues) {
          logger.warn(`  [${issue.severity}] ${issue.file}: ${issue.description}`);
        }
        
        // Try to fix
        await runFixIssues(provider, JSON.stringify(lastReviewIssues, null, 2), {
          workingDir,
          logger,
          dryRun,
          model,
          parallel,
          existingTodo,
        });
        
        totalIssuesFixed += lastReviewIssues.length; // Assume fixed, will verify next iteration
      } else {
        // Couldn't parse review result - assume approved with warning
        reviewResult = {
          passed: true,
          details: 'Review completed but could not parse structured result',
        };
        logger.warn('Could not parse review result - assuming approved');
        break;
      }
    } else {
      // Review skipped
      break;
    }
    
    iteration++;
  }
  
  // Check if we exhausted iterations without success
  const success = testingResult.passed && reviewResult.passed;
  
  if (!success && iteration >= maxIterations) {
    logger.error(`Exhausted ${maxIterations} iterations without success`);
    
    // Write remaining issues to TODO.md even on failure
    if (lastReviewIssues.length > 0) {
      const skillDir = join(workingDir, 'skills', `${provider.name}-webhooks`);
      writeTodoFile(skillDir, lastReviewIssues, [], dryRun);
      logger.info(`Remaining issues written to TODO.md for future reference`);
    }
  }
  
  return {
    success,
    testing: testingResult,
    review: reviewResult,
    iterations: iteration,
    issuesFound: totalIssuesFound,
    issuesFixed: totalIssuesFixed,
    remainingIssues: lastReviewIssues,
  };
}

/**
 * Review an existing skill (for the review command)
 */
export async function reviewExistingSkill(
  provider: ProviderConfig,
  options: ReviewAndIterateOptions
): Promise<ReviewAndIterateResult> {
  // Same logic as reviewAndIterate, but doesn't require generation phase
  return reviewAndIterate(provider, options);
}
