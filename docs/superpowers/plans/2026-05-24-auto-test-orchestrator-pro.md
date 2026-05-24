# 自动化测试编排器 Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable automated test orchestrator that replaces fixed test items with editable flows covering device/simulator execution, assertions, fault/scenario controls, frame checks, screenshots, and report export.

**Architecture:** Add a pure TypeScript orchestration core with explicit TestCase/TestStep models and runner interfaces, backed by the existing Device Profile + Simulator Engine for in-memory simulator execution and an adapter-friendly device target. Add templates that migrate existing fixed test items into configurable cases, then render a dedicated AutoTestWorkbench UI in the autotest module with tree, step orchestrator, property panel, logs, run controls, and report export.

**Tech Stack:** React 19, TypeScript, Node test runner via esbuild, existing simulator engine, CSS glass panels.

---

### Task 0: Restore current test baseline dependency

**Files:**
- Create: `src/protocol/pointModel.ts`
- Test: `tests/protocol-wizard-pro.test.ts`

- [ ] Use the existing failing test `tests/protocol-wizard-pro.test.ts` as RED evidence: `npm run test:core` fails because `../src/protocol/pointModel` cannot resolve.
- [ ] Implement `createPointFieldMapping`, `generateProtocolImportArtifacts`, and related export types used by the test.
- [ ] Run `npm run test:core` and expect the protocol wizard test to pass.

### Task 1: Define orchestrator models and step taxonomy

**Files:**
- Create: `src/autotest/testOrchestrator.ts`
- Test: `tests/auto-test-orchestrator-pro.test.ts`

- [ ] Write failing tests asserting `createBlankTestCase()` exposes `case_id`, `case_name`, `device_type`, `tags`, `steps`, `timeout`, `retry`, `expected`, `result`, `logs`.
- [ ] Write failing tests asserting every required step type is accepted: connect device, read point, write point, wait time, wait condition, assert value, assert enum, assert bit, inject/clear fault, start/stop scenario, check frame, capture screenshot, export report.
- [ ] Implement TypeScript types and helpers for `TestCase`, `TestStep`, `TestStepType`, `TestRunResult`, logs, step results, and report model.
- [ ] Run `npm run test:core` and expect pass.

### Task 2: Implement runner over real-device and simulator targets

**Files:**
- Modify: `src/autotest/testOrchestrator.ts`
- Test: `tests/auto-test-orchestrator-pro.test.ts`

- [ ] Add failing tests with a fake real-device target proving read/write/assert/check-frame/report execution works without simulator-only APIs.
- [ ] Add failing tests with `createSimulatorTestTarget()` proving simulator register reads, writes, scenario start/stop, fault injection/clear, wait condition, and frame checks work.
- [ ] Implement `runTestCase`, retry/timeout/on_fail handling, target adapter interface, simulator target adapter, deterministic timestamp hooks, step log capture, and pass/fail aggregation.
- [ ] Run `npm run test:core` and expect pass.

### Task 3: Add built-in configurable templates

**Files:**
- Create: `src/autotest/templates.ts`
- Test: `tests/auto-test-orchestrator-pro.test.ts`

- [ ] Add failing tests proving the template list contains: PMU 通信测试, PCS 在线测试, PCS 启动测试, PCS 停止测试, PCS 功率给定测试, BMS 数据范围测试, 液冷通信测试, 动环急停测试, 故障恢复测试, 首页自测模拟闭环测试.
- [ ] Implement templates as editable `TestCase[]`, each using orchestration steps rather than fixed bespoke code.
- [ ] Run `npm run test:core` and expect pass.

### Task 4: Add report generation and export formats

**Files:**
- Modify: `src/autotest/testOrchestrator.ts`
- Test: `tests/auto-test-orchestrator-pro.test.ts`

- [ ] Add failing tests proving reports include test time, project name, protocol version, device info, case results, step logs, failure reason, communication frames, screenshots, and CSV/HTML/PDF export payloads.
- [ ] Implement `generateTestReport()`, `exportReportCsv()`, `exportReportHtml()`, and `exportReportPdf()` lightweight deterministic payloads.
- [ ] Run `npm run test:core` and expect pass.

### Task 5: Render AutoTestWorkbench UI

**Files:**
- Create: `src/components/AutoTestWorkbench.tsx`
- Modify: `src/components/ModulePanel.tsx`
- Modify: `src/styles/modules.css`
- Test: `tests/auto-test-workbench-contract.test.mjs`

- [ ] Add a contract test asserting the UI contains left case tree, middle step orchestrator, right step properties, bottom logs, top Run All / Run Selected / Stop / Export Report controls, and new-case/read-write/assert controls.
- [ ] Implement the React workbench using templates and orchestrator core, with state for selected case/step, new case creation, step editing affordances, run logs, and report export buttons.
- [ ] Route the `autotest` module to `AutoTestWorkbench`.
- [ ] Add CSS classes for the four-pane Pro layout.
- [ ] Run `npm run test:contract` and expect pass.

### Task 6: Final verification

**Files:**
- All above

- [ ] Run `npm test` and expect pass.
- [ ] Run `npm run build` and expect pass.
- [ ] Audit `docs/goals/auto-test-orchestrator-pro.md` requirement by requirement against files and test evidence.
