# Demo Events Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load synthetic dialysis/transplant events with the bundled demo data and show loaded events in a compact table.

**Architecture:** Keep lab rows and annotations as separate existing concepts. Add a small bundled `test_events.csv`, load it only for the synthetic dataset, validate it through the existing annotation parser, then render the store's `annotations` as a table in the sidebar.

**Tech Stack:** React, Zustand store, Vitest, SheetJS-backed CSV/XLSX parser.

---

### Task 1: Bundled Event Loading

**Files:**
- Modify: `src/ui/data/loadDataset.ts`
- Modify: `src/ui/state/store.ts`
- Add: `public/test_events.csv`
- Test: `tests/ui/data/loadDataset.test.ts`
- Test: `tests/ui/state/store.test.ts`

- [ ] Write tests that bundled synthetic loading returns validated dialysis/transplant annotations and stores them.
- [ ] Add `loadBundledFixtureData(baseUrl)` returning `{ rows, annotations }`.
- [ ] Keep `loadBundledFixture(baseUrl)` returning only rows for compatibility.
- [ ] Update `loadSynthetic()` to set rows and annotations together.
- [ ] Commit with message `feat: load synthetic demo events`.

### Task 2: Event Table UI

**Files:**
- Modify: `src/ui/shell/Sidebar.tsx`
- Test: `tests/ui/Sidebar.test.tsx`

- [ ] Write a test that seeded annotations render a table with Patient, Date, Type, and Label.
- [ ] Render the table under the existing Annotations sidebar section.
- [ ] Infer display type from labels containing dialysis, transplant, or neither.
- [ ] Commit with message `feat: show loaded events table`.
