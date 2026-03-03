# Tasks: 翻译性能与 UI 增强

**Input**: Design documents from `/specs/001-perf-cache-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal-api.md

**Tests**: Not requested - implementation tasks only

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Existing Project)

**Purpose**: No setup needed - project already exists with manifest.json and basic structure

**Note**: This is an existing Chrome extension project (v2.1.1). No project initialization required.

---

## Phase 2: Foundational (Shared Infrastructure)

**Purpose**: Core utilities needed by all user stories

**⚠️ CRITICAL**: Complete these tasks before user story implementation

- [x] T001 [P] Add hash utility function in background.js (calculateHash for subtitle content)
- [x] T002 [P] Add cache storage helpers in background.js (checkCache, saveCache functions)
- [x] T003 Add language detection utility in content.js (detectSubtitleLanguage function)
- [x] T004 [P] Add UI hint component in content.js (showCacheHint, hideCacheHint functions)
- [x] T005 Add cache hint styles in subtitle.css (.cache-hint class with green success style)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 缓存加载提示 (Priority: P1) 🎯 MVP

**Goal**: 字幕加载时检测缓存，命中时显示"已从缓存加载"提示并直接渲染缓存内容

**Independent Test**: 打开之前访问过的视频页面，检查是否显示缓存提示且不触发新翻译

### Implementation for User Story 1

- [x] T006 [P] [US1] Implement cache check logic in content.js (onSubtitlesLoaded: calculateHash → checkCache)
- [x] T007 [US1] Add cache hit handling in content.js (render cached subtitles, show hint, hide after 3s)
- [x] T008 [US1] Add cache miss handling in content.js (trigger translation flow)
- [x] T009 [US1] Add logging for cache operations in content.js ([BilingualSubs] 缓存命中/未命中)

**Checkpoint**: At this point, User Story 1 should be fully functional - refresh a previously visited video page and verify cache hint appears

---

## Phase 4: User Story 2 - 翻译性能优化 (Priority: P1) 🎯 MVP

**Goal**: 首批 20 条字幕分 4 批并行翻译，5 秒内显示

**Independent Test**: 首次访问视频，从开始翻译到首批字幕显示时间 <5 秒

### Implementation for User Story 2

- [ ] T010 [P] [US2] Add parallel translation function in background.js (translateFirstBatch: 4 concurrent requests of 5 subs each)
- [ ] T011 [P] [US2] Add performance timing logging in content.js (log T1 start, T2 first batch complete)
- [ ] T012 [US2] Update translation flow in content.js (use parallel translation for first 20 subs, then continue remaining)
- [ ] T013 [US2] Add progress persistence in background.js (save translation progress to storage.local for recovery)
- [ ] T014 [US2] Add progress recovery on page refresh in content.js (resume from last completed batch)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - cache hits show hint, first batch completes in <5s

---

## Phase 5: User Story 3 - API Key 配置状态提示 (Priority: P2)

**Goal**: Popup UI 显示 API Key 配置状态，配置后显示"✓ 已配置"

**Independent Test**: 配置 API Key 后打开 popup 显示"已配置"，清除后消失

### Implementation for User Story 3

- [x] T015 [P] [US3] Add status indicator HTML in popup.html (.status-indicator elements for configured/unconfigured)
- [x] T016 [P] [US3] Add status indicator styles in popup.css (green for configured, gray for unconfigured)
- [x] T017 [US3] Implement getApiKeyStatus in popup.js (read from chrome.storage.sync)
- [x] T018 [US3] Add storage.onChanged listener in popup.js (update status when apiKey or service changes)
- [x] T019 [US3] Call updateApiKeyStatus on popup open in popup.js

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work - popup shows API Key status

---

## Phase 6: User Story 4 - 源语言限制 (Priority: P3)

**Goal**: 检测字幕语言，仅英文源字幕触发翻译（翻译为中文），其他语言不启动翻译

**Independent Test**: 英文字幕正常翻译，非英文字幕不触发翻译

### Implementation for User Story 4

- [x] T020 [P] [US4] Implement detectSubtitleLanguage in content.js (VTT metadata + Chinese character detection)
- [x] T021 [US4] Add language check before translation in content.js (skip if language !== 'en')
- [x] T022 [US4] Add unsupported language hint in content.js (optional: show "暂不支持此语言" for non-English)
- [x] T023 [US4] Add language detection logging in content.js ([BilingualSubs] 语言检测：en)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T024 [P] Update quickstart.md with validation steps for all 4 user stories
- [ ] T025 Add error handling for edge cases (cache corruption, network timeout, invalid API Key)
- [x] T026 [P] Update PRIVACY.md if any new data collection (none expected)
- [ ] T027 Run quickstart.md validation (verify all 4 user stories pass)
- [ ] T028 Code cleanup and remove debug logging
- [x] T029 Update version in manifest.json to 2.2.0

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - project exists
- **Foundational (Phase 2)**: No dependencies - can start immediately
- **User Story 1 (Phase 3)**: Depends on Foundational (T001-T005)
- **User Story 2 (Phase 4)**: Depends on Foundational (T001-T005)
- **User Story 3 (Phase 5)**: Depends on Foundational (T001-T002 only for cache helpers)
- **User Story 4 (Phase 6)**: Depends on Foundational (T003 language detection utility)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after T001-T005 - independently testable
- **User Story 2 (P1)**: Can start after T001-T005 - independently testable
- **User Story 3 (P2)**: Can start anytime - only needs popup.js access
- **User Story 4 (P3)**: Can start after T003 - independently testable

### Parallel Opportunities

- **Foundational phase**: T001, T002, T003, T004, T005 can all run in parallel (different files)
- **User Story 1 & 2**: Can run in parallel after foundation (both need T001-T002)
- **User Story 3**: Independent - can run anytime
- **User Story 4**: Can start after T003 (language detection utility)

---

## Parallel Example: Foundational Phase

```bash
# Launch all foundational tasks in parallel:
# Developer A: T001 - hash utility in background.js
# Developer B: T002 - cache helpers in background.js
# Developer C: T003 - language detection in content.js
# Developer D: T004 - UI hint component in content.js
# Developer E: T005 - cache hint styles in subtitle.css
```

---

## Parallel Example: User Stories

```bash
# After foundation complete:
# Developer A: US1 - Cache hint (Phase 3)
# Developer B: US2 - Performance optimization (Phase 4)
# Developer C: US3 - API Key status (Phase 5)
# All can complete independently and be tested separately
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T005)
2. Complete Phase 3: User Story 1 (T006-T009)
3. **STOP and VALIDATE**: Refresh a cached video page, verify hint appears
4. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational → Foundation ready
2. Add User Story 1 → Cache hint works → Deploy/Demo (MVP!)
3. Add User Story 2 → Performance improves → Deploy/Demo
4. Add User Story 3 → API status visible → Deploy/Demo
5. Add User Story 4 → Language filtering → Deploy/Demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational together (T001-T005)
2. Split by user story:
   - Developer A: User Story 1 (cache hint)
   - Developer B: User Story 2 (performance)
   - Developer C: User Story 3 (API status)
   - Developer D: User Story 4 (language filter)
3. All stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at checkpoints to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies

---

## Task Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 2 | 5 tasks | Foundational utilities (hash, cache, language detection, UI hint, styles) - ✅ Complete |
| Phase 3 | 4 tasks | User Story 1: 缓存加载提示 - ✅ Complete |
| Phase 4 | 5 tasks | User Story 2: 翻译性能优化 - Pending |
| Phase 5 | 5 tasks | User Story 3: API Key 配置状态提示 - ✅ Complete |
| Phase 6 | 4 tasks | User Story 4: 源语言限制 - ✅ Complete |
| Phase 7 | 6 tasks | Polish & validation - Pending |
| **Total** | **29 tasks** | **18 completed, 11 pending** |

**MVP Scope**: Phase 2 + Phase 3 (9 tasks) → Cache hint working - ✅ Complete
**Full Feature**: All phases (29 tasks) - In Progress
