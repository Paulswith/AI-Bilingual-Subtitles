# Tasks: Translation Mode Display and Real-time Translation Fix

**Input**: Design documents from `/specs/002-translation-fix-realtime/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL for this feature - manual testing via Chrome Extension UI is the primary validation approach

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Files are at repository root - no `src/` subdirectory:
- `popup.js`, `popup.html` - Extension popup UI
- `content.js` - Content script injected into web pages
- `background.js` - Service worker background script
- `manifest.json` - Extension configuration

---

## Phase 1: Setup (Extension Context)

**Purpose**: No project setup needed - extension already exists. Tasks focus on understanding current state.

- [x] T001 Read research.md to understand current translation flow architecture
- [x] T002 Review existing popup.js translation service change handler (lines 275-297)
- [x] T003 Review existing background.js translate() function (lines 404-448)
- [x] T004 Review existing content.js translateSubtitles() method (lines 444-537)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Add translation mode state tracking variable to background.js (alongside config object)
- [x] T006 [P] Create shared error message constants object in background.js with Chinese messages
- [x] T007 [P] Add timeout configuration to DEFAULT_CONFIG in background.js (default 30000ms)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Translation Mode Indicator (Priority: P1) 🎯 MVP

**Goal**: Display current translation mode ("Google 翻译" or "OpenAI 接口") persistently in popup UI

**Independent Test**: Open popup, switch translation service, verify mode indicator updates immediately and shows correct mode name

### Implementation for User Story 1

- [x] T010 [P] [US1] Add translation mode display element to popup.html (add `<div id="translation-mode-display">` after service selector)
- [x] T011 [P] [US1] Add CSS styling for mode display in popup.html or subtitle.css
- [x] T012 [US1] Add updateModeIndicator() function to popup.js to update mode display text
- [x] T013 [US1] Call updateModeIndicator() in translationService change handler (popup.js line ~275-297)
- [x] T014 [US1] Initialize mode indicator on popup load (call in init() function)
- [x] T015 [US1] Add getTranslationMode message handler to background.js for querying current mode

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Real-time Translation with Live Display (Priority: P2)

**Goal**: Show translated content incrementally as each batch completes, not waiting for full translation

**Independent Test**: Start translation, observe translated subtitles appear progressively (e.g., "5/100 translated...") rather than all at once

### Implementation for User Story 2

- [x] T020 [P] [US2] Add translationProgress message handler to content.js (listen for progress broadcasts)
- [x] T021 [P] [US2] Modify googleTranslate() in background.js to send progress message after each batch
- [x] T022 [P] [US2] Modify openaiTranslate() in background.js to send progress message after each batch
- [x] T023 [US2] Add applyPartialResults() method to SubtitleManager in content.js to update translations incrementally
- [x] T024 [US2] Update ControlPanel.updateStatus() to show real-time count ("已翻译 X/Y 条")
- [x] T025 [US2] Modify translateSubtitles() callback to trigger display update after each batch

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Translation Response Handling (Priority: P3)

**Goal**: Always provide visible feedback for translation requests (success, error, or timeout)

**Independent Test**: Trigger translation with various failure scenarios, verify clear Chinese error messages appear with suggested actions

### Implementation for User Story 3

- [ ] T030 [P] [US3] Implement AbortController-based timeout in background.js fetch requests
- [ ] T031 [P] [US3] Add timeout error detection and Chinese error message in translate() function
- [ ] T032 [US3] Enhance error response format to include type, message (Chinese), and suggestedAction
- [ ] T033 [US3] Update popup.js translateBtn handler to display structured error messages
- [ ] T034 [US3] Add retry option UI for timeout/recoverable errors in popup.html
- [ ] T035 [US3] Add timeout configuration UI to popup.html advanced settings (collapsed by default)
- [ ] T036 [US3] Persist timeout setting to chrome.storage.sync.config.timeout

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T040 [P] Update manifest.json version from 2.2.0 to 2.3.0 (per Constitution Principle VII)
- [x] T041 [P] Update popup.html displayed version string to match manifest.json
- [ ] T042 [P] Test all three user stories end-to-end with both Google and OpenAI services
- [ ] T043 [P] Verify error messages display correctly in Chinese for all error types
- [ ] T044 Update quickstart.md with actual implementation details if changed
- [ ] T045 [P] Run constitution compliance check (verify all 7 principles still satisfied)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but independently testable

### Within Each User Story

- Models before services
- Services before endpoints/UI
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks can run in parallel (reading different docs)
- All Foundational tasks marked [P] can run in parallel (different sections of background.js)
- Once Foundational is done, all user stories can start in parallel (different files)
- Within User Story 1: T010, T011, T012 can run in parallel (different files)
- Within User Story 2: T020, T021, T022 can run in parallel (different files)
- Within User Story 3: T030, T031 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all UI tasks for User Story 1 together:
# Developer A: popup.html changes
# Developer B: CSS styling
# Developer C: popup.js logic

# Tasks T010, T011, T012 can all run in parallel
# - T010 modifies popup.html only
# - T011 modifies CSS only
# - T012 modifies popup.js only
```

---

## Parallel Example: User Story 2

```bash
# Launch all progress streaming tasks together:
# Developer A: background.js googleTranslate modification
# Developer B: background.js openaiTranslate modification
# Developer C: content.js message handler

# Tasks T020, T021, T022 can all run in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (read existing code)
2. Complete Phase 2: Foundational (error messages, timeout config)
3. Complete Phase 3: User Story 1 (mode indicator)
4. **STOP and VALIDATE**: Test mode indicator shows correct service name
5. Deploy as v2.3.0 if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Mode indicator works → Deploy v2.3.0
3. Add User Story 2 → Real-time progress works → Deploy v2.4.0
4. Add User Story 3 → Error handling works → Deploy v2.5.0
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (popup.html, popup.js changes)
   - Developer B: User Story 2 (background.js, content.js changes)
   - Developer C: User Story 3 (timeout, error handling)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- **File paths are at repository root** - no src/ subdirectory

---

## Task Summary

| Phase | Task Count | Description |
|-------|------------|-------------|
| Phase 1: Setup | 4 | Understanding existing codebase |
| Phase 2: Foundational | 3 | Error messages, timeout config |
| Phase 3: US1 (P1) | 6 | Translation mode indicator |
| Phase 4: US2 (P2) | 6 | Real-time progress display |
| Phase 5: US3 (P3) | 7 | Timeout and error handling |
| Phase 6: Polish | 6 | Version bump, testing, validation |
| **Total** | **32** | |

**Parallel Opportunities**: 12 tasks marked [P] can run in parallel

**Suggested MVP**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only) = 13 tasks
