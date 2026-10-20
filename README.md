# 🤖 Agentic AI & MCP Automation Testing Framework

[![CI Pipeline](https://github.com/kazimdfarhan007/agentic-ai-qa-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/kazimdfarhan007/agentic-ai-qa-framework/actions)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)
![Playwright](https://img.shields.io/badge/Playwright-E2E-green?logo=playwright)
![Vitest](https://img.shields.io/badge/Vitest-Fast_Unit_Tests-yellow?logo=vitest)
![Langfuse](https://img.shields.io/badge/Observability-Langfuse-orange)
![License](https://img.shields.io/badge/License-MIT-purple)

A production-grade QA automation framework designed to validate **Agentic AI lifecycles**, **Model Context Protocol (MCP)** tool execution, **Langfuse LLM observability**, and **Golden Dataset quality evaluations**.

---

## 🌟 Key Features & Architecture

```
                         AI Request Flow
                                │
                                ▼
                       ai-tracer.ts (Langfuse SDK)
                                │
                                ├─► Prompts, Completions, Latencies
                                ├─► Input/Output Token Breakdown
                                ├─► Per-call Cost Estimation ($/1K tokens)
                                └─► Latency SLA Score Compliance
                                │
                                ▼
                    LLM Execution (Google Gemini)
                                │
                                ▼
                ai-evaluator.ts (1–5 Rubric Scoring)
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  Accuracy & Grounding      Consistency           Safety & Tone
 (factual marks validation) (3-run variance check) (child-safe guardrails)
         │                      │                      │
         └──────────────────────┴──────────────────────┘
                                │
                                ▼
                 Automated Test Suites & CI Gates
         ├─► tests/unit/mcp-server.test.ts          (40 tests)
         ├─► tests/unit/ai-remarks-golden.test.ts   (34 tests)
         ├─► tests/unit/ai-questions-golden.test.ts (34 tests)
         ├─► tests/unit/ai-remarks-adversarial.test.ts (31 tests)
         └─► tests/e2e/ai/remarks-mcp.spec.ts       (Playwright)
```

### 1. Model Context Protocol (MCP) Server Validation
- Exposes tools (`generate_remarks`, `get_student_fees`, `get_attendance`) with strict Zod schema validation.
- Unit tests verify schema rejections on malformed arguments, wrong-tool selection, and fault tolerance (zero process crashes on API 401/404/500 or timeout).

### 2. AI Observability & Tracing (Langfuse)
- Full lifecycle monitoring of generative AI calls logging prompt, completion, latency, token usage, and dollar cost ($0.0001/call).
- Immediate flush architecture optimized for serverless runtimes.

### 3. Golden Datasets & 1–5 Rubric Scoring
- 60 benchmark golden test cases (30 for report card remarks, 30 for academic syllabus question generation).
- 1–5 rubric scoring engine measuring Groundedness, 3-iteration Consistency, Safety & Tone (zero toxic words), and Latency SLA targets.
- Enforces CI gate: build fails if overall pass rate < 70% or average safety score < 4.0.

### 4. Adversarial & Prompt Injection Testing
- 31 test scenarios covering indirect prompt injections embedded in data fields, JSON delimiter breaking, malformed payloads, and safe degradation.

---

## 🚀 Quickstart & Running Tests

### 1. Install Dependencies
```bash
npm install
```

### 2. Run MCP Server Tests (40 Tests)
```bash
npm run test:mcp
```

### 3. Run Golden Dataset Rubric Evaluations (68 Tests)
```bash
npm run test:ai-eval
```

### 4. Run Adversarial Prompt Injection Suite (31 Tests)
```bash
npm run test:adversarial
```

### 5. Run All Tests
```bash
npm test
```

---

## 📊 Summary of Test Suites

| Suite | Focus Area | Test Count | Status |
|---|---|:---:|:---:|
| `mcp-server.test.ts` | MCP Schemas, Wrong Tool, Error Recovery | 40 | **PASSED** ✅ |
| `ai-remarks-golden.test.ts` | Remarks 1–5 Rubric Evaluation | 34 | **PASSED** ✅ |
| `ai-questions-golden.test.ts` | Question Gen 1–5 Rubric Evaluation | 34 | **PASSED** ✅ |
| `ai-remarks-adversarial.test.ts` | Prompt Injections & Safe Degradation | 31 | **PASSED** ✅ |
| **TOTAL** | **Comprehensive Agentic AI Testing** | **139** | **100% PASS** ✅ |

---

## 👨‍💻 Author
**Kazi Md Farhan** — Automation & AI Quality Engineer
