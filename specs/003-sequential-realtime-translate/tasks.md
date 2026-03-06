# Tasks: 翻译模块重构 — 逐条翻译与实时双语展示

**Input**: Design documents from `/specs/003-sequential-realtime-translate/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: 仓库根目录下 `content.js`, `background.js`, `popup.js`, `popup.html`, `manifest.json`

---

## Phase 1: Setup

**Purpose**: 确认现有代码结构，定位重构切入点

- [X] T001 确认 content.js 中 SubtitleManager.translateSubtitles() 的现有批量翻译逻辑位置和调用链（content.js）
- [X] T002 [P] 确认 background.js 中 translate/googleTranslate/openaiTranslate 的现有批量接口签名（background.js）
- [X] T003 [P] 确认 popup.js 中 updateStatus() 和 content.js 中 getStatus 消息响应的进度数据格式（popup.js, content.js）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 新增单条翻译接口、为字幕对象增加 status 字段、定义翻译会话状态

**⚠️ CRITICAL**: US1/US2/US3/US4 均依赖本阶段完成

- [X] T004 在 background.js 中新增 translateOne 消息处理分支，接收 { action: 'translateOne', text: string, service?: string }，返回 { success: boolean, translation?: string, error?: string }；内部根据 config.translationService 调用 googleTranslateOne() 或 openaiTranslateOne()（background.js）
- [X] T005 在 background.js 中新增 googleTranslateOne(text) 函数，发送单条文本到 Google Translate API 并返回译文字符串；包含超时 + 重试（最多 2 次）逻辑（background.js）
- [X] T006 [P] 在 background.js 中新增 openaiTranslateOne(text) 函数，发送单条文本到 OpenAI 兼容接口并返回译文字符串；包含超时 + 重试（最多 2 次）逻辑（background.js）
- [X] T007 在 content.js 的 SubtitleManager 中，修改 parseVTT() 方法使其返回的每条字幕对象包含 status 字段（初始值 'pending'），即 { id, startTime, endTime, text, translation: '', status: 'pending' }（content.js）
- [X] T008 [P] 在 content.js 中新增模块级 translationSession 对象，字段包含 { totalCount, doneCount, failedCount, isRunning, isAborted, startedAt, completedAt }，初始化为 idle 状态（content.js）

**Checkpoint**: translateOne 消息可通过控制台手动调用并返回单条译文；字幕对象带 status 字段

---

## Phase 3: User Story 1 - 逐条翻译并实时展示双语字幕 (Priority: P1) 🎯 MVP

**Goal**: 翻译一条即显示一条双语字幕，用户无需等全部翻译完

**Independent Test**: 触发翻译后，视频播放到第一条字幕时间点时该条已以"中文+英文"双行显示

### Implementation for User Story 1

- [X] T009 [US1] 在 content.js 中重写 SubtitleManager.translateSubtitles() 方法：使用 for 循环逐条遍历 originalSubtitles，每次 await chrome.runtime.sendMessage({ action: 'translateOne', text: sub.text })，成功后将 sub.translation 写入并设 sub.status='done'（content.js）
- [X] T010 [US1] 在 T009 的翻译循环中，跳过 status='done' 的字幕（支持后续重试场景）和空文本/纯符号字幕（直接标记 status='done'）（content.js）
- [X] T011 [US1] 在 content.js 的 SubtitleDisplay.updateSubtitle() 中修改渲染逻辑：当 subtitle.translation 存在且非空且与原文不同时显示双语（中文+英文），否则仅显示英文原文（content.js）
- [X] T012 [US1] 修改 content.js 中 initializeAfterVideoReady() 的自动翻译触发路径，使其调用重写后的 translateSubtitles()（content.js）
- [X] T013 [US1] 修改 content.js 中 ControlPanel 的"翻译字幕"按钮点击事件，使其调用重写后的 translateSubtitles()（content.js）
- [X] T014 [US1] 删除或注释 content.js 中旧的批量翻译相关代码（旧的 batchSize 分批、批量 sendMessage({ action: 'translate' }) 调用、批量结果索引对齐逻辑）（content.js）

**Checkpoint**: 在英文字幕视频页面触发翻译，第一条字幕翻译完成后即以双语显示，后续逐条补上

---

## Phase 4: User Story 2 - 翻译进度可视化与状态反馈 (Priority: P1)

**Goal**: 控制面板和弹窗实时展示"已翻译 N/M 条"

**Independent Test**: 翻译进行中控制面板数字逐条递增，完成后显示"翻译完成"

### Implementation for User Story 2

- [X] T015 [US2] 在 content.js 的 translateSubtitles() 翻译循环中，每完成一条后更新 translationSession.doneCount 并调用 updateSessionUI()（content.js）
- [X] T016 [US2] 在 content.js 中新增 updateSessionUI() 函数：读取 translationSession 更新控制面板状态文本为"已翻译 N/M 条"，翻译完成后显示"翻译完成"（content.js）
- [X] T017 [US2] 修改 content.js 中 getStatus 消息响应，增加 session 字段返回 translationSession 当前快照（content.js）
- [X] T018 [US2] 修改 popup.js 中 updateStatus() 函数，当 status.session 存在时在 #current-status 显示"已翻译 N/M 条"或"翻译完成"（popup.js）

**Checkpoint**: 翻译进行中，控制面板和弹窗均显示实时进度数字

---

## Phase 5: User Story 3 - 翻译失败时逐条降级与错误提示 (Priority: P2)

**Goal**: 单条失败跳过并记录，重试时仅处理失败条目

**Independent Test**: 模拟单条翻译失败，系统跳过该条继续后续，再次触发仅重试失败条目

### Implementation for User Story 3

- [X] T019 [US3] 在 content.js 的 translateSubtitles() 翻译循环中增加 try/catch：捕获单条翻译失败后，重试最多 2 次；仍失败则设 sub.status='failed' 并递增 translationSession.failedCount，继续下一条（content.js）
- [X] T020 [US3] 在 content.js 的 updateSessionUI() 中，当 failedCount > 0 时在控制面板显示"N 条翻译失败，可点击重试"（content.js）
- [X] T021 [US3] 修改 content.js 的 translateSubtitles() 方法使其支持"仅重试模式"：当 retryOnly=true 时，循环中跳过 status!='failed' && status!='pending' 的条目（content.js）
- [X] T022 [US3] 修改 content.js 中 ControlPanel 的"翻译字幕"按钮逻辑：当存在 failed 条目时，按钮文案变为"重试失败项"，点击后调用 translateSubtitles({ retryOnly: true })（content.js）

**Checkpoint**: 某条翻译失败后，该条被跳过且后续继续翻译；再次点击仅重试失败条目

---

## Phase 6: User Story 4 - 缓存与翻译结果持久化 (Priority: P2)

**Goal**: 翻译全部完成后自动缓存，下次打开直接加载

**Independent Test**: 翻译完成后关闭页面再打开，字幕立即双语展示

### Implementation for User Story 4

- [X] T023 [US4] 在 content.js 的 translateSubtitles() 循环结束后，检查所有字幕 status：若全部为 done（无 failed），调用 saveToCache()；若有 failed 则不保存（content.js）
- [X] T024 [US4] 修改 content.js 中 initializeAfterVideoReady() 的缓存加载路径：缓存命中时直接加载字幕并设所有条目 status='done'，无需启动翻译循环（content.js）
- [X] T025 [US4] 在 content.js 中处理翻译中断场景：当页面卸载（beforeunload）或 URL 变化时，设 translationSession.isAborted=true 终止翻译循环，不保存不完整结果（content.js）

**Checkpoint**: 翻译完成后缓存生效，再次打开同一视频无需重新翻译

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 版本号同步、边界场景处理、旧代码清理

- [X] T026 [P] 在 manifest.json 和 popup.html 中同步更新版本号（MAJOR 升级至 3.0.0）（manifest.json, popup.html）
- [X] T027 [P] 清理 background.js 中旧的批量翻译专用函数（googleTranslate 批量版、openaiTranslate 批量版、openaiTranslateBatch），仅保留 translateOne 相关函数和 testTranslationService（background.js）
- [X] T028 [P] 清理 content.js 中旧的批量翻译相关变量和函数（batchSize 配置引用、resumeBatchIndex、translationProgress 百分比计算、旧的 translationProgress 消息处理）（content.js）
- [X] T029 在 content.js 各关键路径添加中文 console.log 日志："开始逐条翻译"/"第 N 条翻译完成"/"第 N 条翻译失败"/"翻译全部完成"/"翻译已中断"（content.js）
- [ ] T030 运行 quickstart.md 中五个场景（A/B/C/D/E）进行手工 E2E 验证（quickstart.md）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 must complete before US2（US2 的进度展示依赖翻译循环）
  - US3 depends on US1（失败处理在翻译循环中）
  - US4 depends on US1（缓存保存在翻译完成后）
  - US2、US3、US4 之间无互相依赖
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - 核心翻译循环
- **User Story 2 (P1)**: Depends on US1 completion（进度展示依赖翻译循环中的回调点）
- **User Story 3 (P2)**: Depends on US1 completion（失败处理扩展翻译循环逻辑）
- **User Story 4 (P2)**: Depends on US1 completion（缓存保存在翻译循环结束后触发）

### Within Each User Story

- content.js 改动优先于 popup.js/popup.html 改动
- 翻译循环逻辑优先于 UI 展示逻辑
- 核心路径优先于边界场景

### Parallel Opportunities

- Phase 2: T005 和 T006 可并行（Google/OpenAI 独立）；T007 和 T008 可并行（不同函数）
- Phase 7: T026、T027、T028 均可并行（不同文件或独立函数）

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: 在英文字幕视频中验证逐条翻译 + 实时双语展示
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → 单条翻译接口就绪
2. Add User Story 1 → 逐条翻译 + 实时双语展示 → Deploy (MVP!)
3. Add User Story 2 → 进度可视化 → Deploy
4. Add User Story 3 → 失败降级 + 重试 → Deploy
5. Add User Story 4 → 缓存持久化 → Deploy
6. Polish → 版本号 + 清理 + E2E → Deploy (完整版)

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
