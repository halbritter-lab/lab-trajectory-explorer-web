# Cohort Mixed Model Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the eGFR cohort mixed model from an inline cohort-table panel into a sidebar-opened dialog with clearer model data and parameter output.

**Architecture:** Keep `src/core/mixedModel` generic. Add UI state for opening the nephro-specific eGFR cohort model dialog, trigger it from `Sidebar`, and render `CohortMixedModelPanel` inside a dialog from `CohortView`. Split user-facing model parameters from technical fit details inside the existing panel.

**Tech Stack:** React, Zustand store, Vitest, Testing Library, existing CSS dialog patterns.

---

### Task 1: Add Dialog Open State

**Files:**
- Modify: `src/ui/state/store.ts`
- Test: `tests/ui/state/store.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions that `mixedModelDialogOpen` defaults to `false` and changes with `setMixedModelDialogOpen(true/false)`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/state/store.test.ts`
Expected: FAIL because the store state/actions do not exist.

- [x] **Step 3: Implement state and setter**

Add `mixedModelDialogOpen: boolean` and `setMixedModelDialogOpen(value: boolean)`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/state/store.test.ts`
Expected: PASS.

### Task 2: Open Model Dialog From Sidebar

**Files:**
- Modify: `src/ui/shell/Sidebar.tsx`
- Test: `tests/ui/Sidebar.test.tsx`

- [x] **Step 1: Write the failing test**

Assert that clicking `Open eGFR cohort model` calls store state so `mixedModelDialogOpen` becomes `true`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/Sidebar.test.tsx`
Expected: FAIL because the button does not exist.

- [x] **Step 3: Implement Sidebar trigger**

Add a button under `Nephro / CKD progression` > `Fit model` named `Open eGFR cohort model`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/Sidebar.test.tsx`
Expected: PASS.

### Task 3: Render Mixed Model As Dialog

**Files:**
- Modify: `src/ui/cohort/CohortView.tsx`
- Modify: `src/ui/cohort/CohortMixedModelPanel.tsx`
- Modify: `src/ui/app.css`
- Test: `tests/ui/CohortView.test.tsx`
- Test: `tests/ui/CohortMixedModelPanel.test.tsx`

- [x] **Step 1: Write failing tests**

Assert the panel is no longer rendered inline in the cohort table view, appears in a dialog when `mixedModelDialogOpen` is true, and can be closed.

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/ui/CohortView.test.tsx tests/ui/CohortMixedModelPanel.test.tsx`
Expected: FAIL because the panel is still inline.

- [x] **Step 3: Implement dialog rendering**

Move `CohortMixedModelPanel` into a modal container in `CohortView`; render it only when `mixedModelDialogOpen` is true. Add a close button and accessible dialog labels.

- [x] **Step 4: Improve result wording**

Change `Patients / measurements` to `Model data` with `N patients, M measurements`. Present estimated parameters in a table and keep technical details in a collapsed `<details>`.

- [x] **Step 5: Run focused tests**

Run: `pnpm vitest run tests/ui/CohortView.test.tsx tests/ui/CohortMixedModelPanel.test.tsx`
Expected: PASS.

### Task 4: Verify

**Files:**
- No new files.

- [x] **Step 1: Run full tests**

Run: `pnpm test`
Expected: PASS.

- [x] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS.
