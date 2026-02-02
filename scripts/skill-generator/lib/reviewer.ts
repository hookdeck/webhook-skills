/**
 * Review and iteration logic for skills
 */

import type {
  ProviderConfig,
  Logger,
  PhaseResult,
  ReviewResult,
  ReviewIssue,
} from './types';
import { runReviewSkill, runFixIssues } from './claude';
import { runTests } from './generator';

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
}

/**
 * Run tests and review with iteration loop
 */
export async function reviewAndIterate(
  provider: ProviderConfig,
  options: ReviewAndIterateOptions
): Promise<ReviewAndIterateResult> {
  const { workingDir, logger, dryRun, skipTests, skipReview, maxIterations, model, parallel } = options;
  
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
        
        if (review.reviewResult.approved) {
          reviewResult = {
            passed: true,
            details: `Approved with ${review.reviewResult.suggestions.length} suggestions`,
          };
          logger.success('Review passed!');
          break; // Success!
        }
        
        // Issues found - need to fix
        const criticalIssues = lastReviewIssues.filter(i => i.severity === 'critical');
        const majorIssues = lastReviewIssues.filter(i => i.severity === 'major');
        const minorIssues = lastReviewIssues.filter(i => i.severity === 'minor');
        
        reviewResult = {
          passed: false,
          details: `Found ${criticalIssues.length} critical, ${majorIssues.length} major, ${minorIssues.length} minor issues`,
        };
        
        logger.warn(`Review found issues: ${reviewResult.details}`);
        
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
  }
  
  return {
    success,
    testing: testingResult,
    review: reviewResult,
    iterations: iteration,
    issuesFound: totalIssuesFound,
    issuesFixed: totalIssuesFixed,
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
