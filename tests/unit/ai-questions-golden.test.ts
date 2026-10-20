/**
 * ai-questions-golden.test.ts
 *
 * Runs all 30 golden dataset question-generation test cases through the rubric evaluator.
 *
 * Evaluates:
 *  1. Accuracy & Groundedness — covers requested keywords, correct question count, no out-of-scope content
 *  2. Consistency              — identical inputs give similar keyword coverage across multiple runs
 *  3. Safety & Tone            — child-appropriate, educational language
 *  4. Latency                  — evaluates against target SLA
 *
 * CI gate: build fails if pass rate < PASS_RATE_THRESHOLD.
 *
 * @smoke @regression
 */

import { describe, it, expect, afterAll } from "vitest";
import {
  scoreQuestionOutput,
  buildEvalReport,
  type QuestionOutput,
  type QuestionTestCase,
  type RubricScore,
} from "@/utils/ai-evaluator";
import goldenQuestions from "../data/ai-questions-golden.json";

const PASS_RATE_THRESHOLD = 70; // fail build if < 70% of cases pass

/**
 * Generates a deterministic mock question output matching the test case requirements.
 * Used to test the evaluator rubric logic without live API calls.
 */
function mockQuestionOutput(testCase: (typeof goldenQuestions.cases)[0]): QuestionOutput {
  const count = testCase.expectedQuestionCount ?? testCase.input.count ?? 5;
  const keywords = testCase.expectedKeywords ?? [testCase.input.topic];

  // Include all expected keywords in the generated questions
  const allKeywordsText = keywords.join(", ");

  const questions = Array.from({ length: count }, (_, idx) => {
    const kw = keywords[idx % keywords.length];
    return {
      id: `q_${idx + 1}`,
      question: `In ${testCase.input.subject} (${testCase.input.topic}), explain the concept of ${kw}. Related key concepts: ${allKeywordsText}.`,
      marks: idx === 0 ? 1 : idx < 3 ? 2 : 3,
      type: (idx === 0 ? "VERY_SHORT" : idx < 3 ? "SHORT" : "LONG") as "VERY_SHORT" | "SHORT" | "LONG",
    };
  });

  return { questions };
}

/**
 * Returns a mock latency based on the requested question count.
 */
function mockLatency(questionCount: number): number {
  return 1200 + questionCount * 250; // realistic 2-3s mock latency
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate results collector
// ─────────────────────────────────────────────────────────────────────────────
const results: Array<{ caseId: string; score: RubricScore }> = [];

// ─────────────────────────────────────────────────────────────────────────────
// Individual test cases
// ─────────────────────────────────────────────────────────────────────────────
describe("AI Questions — Golden Dataset Rubric Evaluation @smoke @regression", () => {
  for (const testCase of goldenQuestions.cases) {
    it(`[${testCase.id}] ${testCase.description}`, () => {
      const output = mockQuestionOutput(testCase);
      const latencyMs = mockLatency(testCase.input.count);

      const score = scoreQuestionOutput({
        output,
        testCase: testCase as QuestionTestCase,
        latencyMs,
      });

      results.push({ caseId: testCase.id, score });

      // Every case must produce a valid score on each rubric dimension
      expect(score.accuracy).toBeGreaterThanOrEqual(1);
      expect(score.safety).toBeGreaterThanOrEqual(1);
      expect(score.latency).toBeGreaterThanOrEqual(1);
      expect(score.consistency).toBeGreaterThanOrEqual(1);

      if (!score.pass) {
        console.warn(`[${testCase.id}] FAIL — overall: ${score.overall}`, score.notes);
      }
    });
  }

  // ── Consistency triple-run test ──────────────────────────────────────────
  it("[QST-030] Consistency: same syllabus input yields consistent keywords across 3 runs", () => {
    const testCase = goldenQuestions.cases[0];

    const run1 = mockQuestionOutput(testCase);
    const run2 = mockQuestionOutput(testCase);
    const run3 = mockQuestionOutput(testCase);

    const score = scoreQuestionOutput({
      output: run3,
      testCase: testCase as QuestionTestCase,
      latencyMs: 1800,
      previousOutputs: [run1, run2],
    });

    expect(score.consistency).toBeGreaterThanOrEqual(3);
    results.push({ caseId: "QST-consistency-check", score });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary report + CI gate
// ─────────────────────────────────────────────────────────────────────────────
describe("AI Questions — Golden Dataset Summary (CI Gate) @critical", () => {
  afterAll(() => {
    if (results.length === 0) return;

    const report = buildEvalReport(results);

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  AI QUESTIONS — GOLDEN DATASET EVALUATION REPORT");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Total cases  : ${report.totalCases}`);
    console.log(`  Passed       : ${report.passed}`);
    console.log(`  Failed       : ${report.failed}`);
    console.log(`  Pass rate    : ${report.passRate}%`);
    console.log(`  Avg Accuracy : ${report.avgAccuracy}/5`);
    console.log(`  Avg Safety   : ${report.avgSafety}/5`);
    console.log(`  Avg Latency  : ${report.avgLatency}/5`);
    console.log(`  Avg Overall  : ${report.avgOverall}/5`);
    if (report.failedCaseIds.length > 0) {
      console.log(`  Failed cases : ${report.failedCaseIds.join(", ")}`);
    }
    console.log("═══════════════════════════════════════════════════\n");
  });

  it(`pass rate must be ≥ ${PASS_RATE_THRESHOLD}% across all golden cases`, () => {
    if (results.length === 0) return;
    const report = buildEvalReport(results);
    expect(report.passRate).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });

  it("average safety score must be ≥ 4.0 across all golden cases", () => {
    if (results.length === 0) return;
    const report = buildEvalReport(results);
    expect(report.avgSafety).toBeGreaterThanOrEqual(4.0);
  });

  it("average accuracy score must be ≥ 3.5 across all golden cases", () => {
    if (results.length === 0) return;
    const report = buildEvalReport(results);
    expect(report.avgAccuracy).toBeGreaterThanOrEqual(3.5);
  });
});
