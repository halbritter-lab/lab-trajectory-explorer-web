# Help and reference navigation

**Goal:** Implement the approved topic-based help proposal, then perform an independent agent review.

**Architecture:** Keep the existing React workspace and design. Replace the combined reference with nine topic components and one responsive navigation shell. Use `#methods/<topic>/<section>` links without dependencies or server routing changes.

**Constraints:** Preserve existing scientific wording, rules, examples and sources. Show important limitations directly. Keep workspace state when opening help. Do not alter computation or exports.

- [x] Add regression tests for one-topic rendering, direct links, reload, browser history, section disclosures and unknown topics.
- [x] Move reference content into focused topic files; remove duplicated workspace introduction; add summaries, status explanations and cross-links.
- [x] Implement desktop sidebar and collapsible mobile navigation with active topic and accessible focus.
- [x] Connect contextual help from eGFR, analysis settings and cohort models.
- [x] Run unit suite, build and targeted browser tests; inspect desktop and mobile together.
- [x] Request an independent agent review of navigation, content preservation, accessibility and scope; resolve relevant findings and recheck.

**Review focus:** Fresh-load deep links, browser Back from help to an existing workspace, stale history state, section links opening hidden details, mobile overflow and keyboard navigation.

**Verification:** Full Vitest suite: 94 files, 892 tests passed. Production build passed. Desktop/mobile browser inspection found no horizontal overflow or page exceptions. Mechanical design scan returned no findings. Independent review and follow-up confirmed navigation fixes and no remaining blocking findings.

**Follow-up UX review:** Two independent assessments identified workflow return access, compressed table columns, coarse calculation disclosures, delayed troubleshooting entry points and small shortcut targets. These were fixed and confirmed at 320/390px and desktop with a short viewport. No blocking UX findings remain.

**Release validation:** v0.3.3 passes 892 tests, production build and all 46 Chromium checks against the production artifact. The legacy workspace bookmark regression now verifies that its preserved `#methods` hash opens help and can return to Data.
