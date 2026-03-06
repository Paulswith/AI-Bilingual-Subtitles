# Tasks: 英文字幕自动识别与拒绝提示

**Input**: Design documents from `/specs/001-auto-english-subtitle/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: 仓库根目录下 `content.js`, `background.js`, `popup.js`, `popup.html`

---

## Phase 1: Setup

**Purpose**: 确认现有代码结构与本特性无冲突，准备工作分支

- [X] T001 确认当前 content.js 中 detectSubtitleLanguage() 与 initializeAfterVideoReady() 的字幕检测入口，记录行号与调用链（content.js）
- [X] T002 [P] 确认 background.js 中现有消息处理 switch/case 结构，确定新消息插入位置（background.js）
- [X] T003 [P] 确认 popup.js/popup.html 中字幕状态展示区域（#cache-status、#current-status），确定拒绝反馈插入位置（popup.js, popup.html）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 实现跨用户故事共享的核心判定逻辑与数据结构

**⚠️ CRITICAL**: US1/US2/US3 均依赖本阶段完成

- [X] T004 在 content.js 中新增 evaluateSubtitleEligibility() 函数，实现字幕轨道扫描并返回 TranslationEligibility 对象（status/reason/detectedLanguage/sourceTrackId/evaluatedAt）（content.js）
- [X] T005 [P] 在 content.js 中新增 scanAvailableTracks() 辅助函数，枚举页面 video 元素的所有 track 子元素，提取 srclang/label/kind/readyState 并归一化语言代码（content.js）
- [X] T006 [P] 在 content.js 中增强现有 detectSubtitleLanguage() 函数，新增"显式语言标识优先 + 文本特征回退"双层判定逻辑（content.js）
- [X] T007 在 content.js 中新增 eligibilityState 模块级变量，保存当前 TranslationEligibility 快照，供后续读取与更新（content.js）
- [X] T008 [P] 在 background.js 消息处理中新增 subtitleEligibility case，接收并记录资格判定日志（background.js）
- [X] T009 [P] 在 content.js 中定义拒绝提示常量对象 REJECTION_MESSAGES，包含 NO_ENGLISH_SUBTITLE 和 NO_SUBTITLE_TRACK 两类的 message/actionHint 中文文案（content.js）

**Checkpoint**: evaluateSubtitleEligibility() 可在控制台调用并返回正确的 status

---

## Phase 3: User Story 1 - 自动识别英文字幕并翻译 (Priority: P1) 🎯 MVP

**Goal**: 系统自动识别英文字幕并进入翻译流程

**Independent Test**: 在含英文字幕页面，系统自动选中英文字幕并开始翻译，无需手动切换

### Implementation for User Story 1

- [X] T010 [US1] 修改 content.js 中 initializeAfterVideoReady() 函数，在 fetchSubtitles() 之前调用 evaluateSubtitleEligibility()，根据返回 status 决定是否进入翻译流程（content.js）
- [X] T011 [US1] 当 status=eligible 时，使用 sourceTrackId 对应的字幕轨道作为翻译输入，替换现有的"取第一个 track"逻辑（content.js）
- [X] T012 [US1] 当 status=eligible 时，在控制面板状态区显示"正在基于英文字幕翻译"提示文案（content.js）
- [X] T013 [P] [US1] 当 status=eligible 时，通过 chrome.runtime.sendMessage 向 background 发送 subtitleEligibility 消息，记录"已识别英文字幕"日志（content.js）
- [X] T014 [US1] 在 popup.js 中修改 updateStatus() 函数，当 eligibility.status=eligible 时在 #current-status 显示"英文字幕已识别"（popup.js）
- [X] T015 [P] [US1] 在 popup.html 中为 #current-status 新增 eligible 样式类（绿色文字提示）（popup.html）

**Checkpoint**: 在含英文字幕页面，系统自动识别英文字幕并进入翻译；控制面板与弹窗均显示识别状态

---

## Phase 4: User Story 2 - 找不到英文字幕时拒绝生成并提示 (Priority: P1)

**Goal**: 无英文字幕时拒绝翻译生成并展示中文可操作提示

**Independent Test**: 在仅有非英文字幕或无字幕页面触发翻译，系统停止翻译并显示拒绝提示

### Implementation for User Story 2

- [X] T016 [US2] 在 content.js 中 initializeAfterVideoReady() 函数内，当 evaluateSubtitleEligibility() 返回 rejected_no_english 或 rejected_no_track 时，阻止进入翻译流程（content.js）
- [X] T017 [US2] 在 content.js 中新增 showRejectionNotice(eligibility) 函数，在字幕显示区域或控制面板展示拒绝原因 + 建议动作（使用 REJECTION_MESSAGES 常量）（content.js）
- [X] T018 [US2] 在 content.js 中新增 hideRejectionNotice() 函数，清除当前拒绝提示（供后续恢复使用）（content.js）
- [X] T019 [P] [US2] 在 content.js 的控制面板"翻译字幕"按钮点击事件中，增加 eligibility 前置判定，若为拒绝态则显示拒绝提示而非调用 translateSubtitles()（content.js）
- [X] T020 [US2] 在 content.js 消息监听 startTranslation case 中增加 eligibility 前置判定，拒绝态返回 { success: false, error: rejectionMessage }（content.js）
- [X] T021 [P] [US2] 在 popup.js 中修改 updateStatus() 函数，当 eligibility.status 为拒绝态时在 #current-status 显示拒绝原因 + 建议动作（popup.js）
- [X] T022 [P] [US2] 在 popup.html 中为 #current-status 新增 rejected 样式类（橙色/红色警告提示）（popup.html）
- [X] T023 [US2] 在 content.js getStatus 消息响应中新增 eligibility 字段，将当前判定状态返回给 popup（content.js）

**Checkpoint**: 在无英文字幕页面触发翻译时被拒绝，显示中文原因与建议；弹窗同步显示拒绝状态

---

## Phase 5: User Story 3 - 拒绝状态可恢复 (Priority: P2)

**Goal**: 用户切换到英文字幕后系统可恢复翻译能力

**Independent Test**: 先在无英文字幕页面触发拒绝，再切换到英文字幕，系统可成功翻译

### Implementation for User Story 3

- [X] T024 [US3] 在 content.js 中新增 observeTrackChanges() 函数，使用 MutationObserver 监听 video 元素子节点（track）变化，变化时重新调用 evaluateSubtitleEligibility()（content.js）
- [X] T025 [US3] 在 observeTrackChanges() 回调中，若判定从 rejected 转为 eligible，调用 hideRejectionNotice() 清除拒绝提示，并更新控制面板状态（content.js）
- [X] T026 [US3] 在 initializeAfterVideoReady() 中启动 observeTrackChanges()（仅在首次初始化后调用一次）（content.js）
- [X] T027 [US3] 在控制面板"翻译字幕"按钮点击事件中，若当前为拒绝态，先重新调用 evaluateSubtitleEligibility() 做即时重判定，再决定是否进入翻译（content.js）
- [X] T028 [P] [US3] 在 background.js 消息处理中新增 retryEligibilityCheck case，记录重试触发日志（trigger/requestedAt）（background.js）
- [X] T029 [US3] 增加防抖逻辑：在 observeTrackChanges() 中对轨道频繁变化做 500ms 防抖，避免"拒绝/翻译"状态抖动（content.js）

**Checkpoint**: 从拒绝状态切换英文字幕后可恢复翻译，手动/自动重试均可工作

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 边界场景处理、日志完善、版本同步

- [X] T030 [P] 处理字幕轨道延迟加载场景：initializeAfterVideoReady() 中首次评估为 pending 时启动定时重试（最多 3 次，间隔 2 秒），直到明确 eligible 或 rejected（content.js）
- [X] T031 [P] 处理英文字幕标签存在但内容为空的场景：scanAvailableTracks() 中增加 readyState/内容可读检查，不可读时标记 isReadable=false 排除该轨道（content.js）
- [X] T032 处理翻译中途切到非英文字幕场景：在 observeTrackChanges() 中若 eligible->rejected，停止后续翻译批次并显示说明（content.js）
- [X] T033 [P] 在 manifest.json 与 popup.html 中同步更新版本号（MINOR 升级）（manifest.json, popup.html）
- [X] T034 [P] 在 content.js 各关键路径添加 console.log 日志（中文），标明"已识别英文字幕"/"拒绝生成"/"恢复翻译资格"等状态变化（content.js）
- [ ] T035 运行 quickstart.md 中四个场景（A/B/C/D）进行手工 E2E 验证（quickstart.md）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (independent files/functions)
  - US3 depends on US2 completion (requires showRejectionNotice/hideRejectionNotice)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on US1
- **User Story 3 (P2)**: Can start after US2 completion (depends on T017/T018 hideRejectionNotice)

### Within Each User Story

- 状态模型与逻辑 → 显示反馈 → 消息通知
- content.js 改动优先于 popup.js/popup.html 改动
- Core implementation before integration

### Parallel Opportunities

- Phase 2: T005, T006, T008, T009 can all run in parallel
- Phase 3 (US1) and Phase 4 (US2) can start in parallel once Phase 2 completes
- Within US1: T013, T015 can run in parallel
- Within US2: T019, T021, T022 can run in parallel
- Within US3: T028 can run in parallel with other US3 tasks

---

## Parallel Example: Foundational Phase

```bash
# Launch in parallel (different functions/files):
Task: "T005 scanAvailableTracks() in content.js"
Task: "T006 detectSubtitleLanguage() enhancement in content.js"
Task: "T008 subtitleEligibility message handler in background.js"
Task: "T009 REJECTION_MESSAGES constants in content.js"
```

## Parallel Example: US1 + US2 simultaneously

```bash
# Developer A: User Story 1 (content.js eligibility->translate flow)
Task: "T010 initializeAfterVideoReady() eligible path"
Task: "T011 sourceTrackId track selection"

# Developer B: User Story 2 (content.js rejection display)
Task: "T016 initializeAfterVideoReady() rejected path"
Task: "T017 showRejectionNotice()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: 在含英文字幕页面自动识别并翻译
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → 判定引擎就绪
2. Add User Story 1 → 英文字幕自动翻译 → Deploy (MVP!)
3. Add User Story 2 → 拒绝生成 + 中文提示 → Deploy
4. Add User Story 3 → 拒绝恢复 → Deploy
5. Polish → 边界场景 + 版本同步 → Deploy (完整版)

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
