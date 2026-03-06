# Implementation Plan: Translation Mode Display and Real-time Translation Fix

**Branch**: `002-translation-fix-realtime` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-translation-fix-realtime/spec.md`

## Summary

修复翻译功能无响应问题，实现翻译模式指示器（实时字幕翻译）和实时翻译进度展示。基于现有 Chrome Extension 架构，在 popup.js 和 content.js 中添加翻译状态实时反馈机制，确保用户始终知晓翻译模式、进度和结果。

## Technical Context

**Language/Version**: JavaScript (ES6+), Chrome Extension Manifest V3
**Primary Dependencies**: Chrome Storage API (storage.sync, storage.local), Fetch API
**Storage**: Chrome storage.sync (配置), storage.local (缓存)
**Testing**: Manual testing via Chrome Extension UI
**Target Platform**: Chrome Browser Extension
**Project Type**: Browser Extension (Chrome Extension Manifest V3)
**Performance Goals**: Translation mode display <100ms, first segment <2s, feedback within 30s
**Constraints**: Service worker background script, non-blocking UI, incremental rendering

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. 配置简约 (Minimal Configuration) | PASS | 翻译模式显示为 UI 状态，非配置项；超时阈值默认 30 秒可配置 |
| II. 自动保存 (Auto-Persist Everything) | PASS | 翻译进度已支持实时保存，本功能增强实时反馈 |
| III. 一键操作 (One-Click Actions) | PASS | 翻译模式显示为自动状态，不增加用户操作 |
| IV. 零学习成本 (Zero Learning Curve) | PASS | 使用中文文字标签，状态反馈清晰（"翻译中 X%"、"实时字幕翻译"） |
| V. 隐私优先 (Privacy First) | PASS | 无新增数据收集，仅展示本地状态 |
| VI. 渐进增强 (Progressive Enhancement) | PASS | 基础功能不受影响，实时展示为增强体验 |
| VII. 版本管理 (Version Management) | PASS | 需在 manifest.json 和 popup.html 更新版本号 |

**Gate Result**: PASS - 所有原则符合

## Project Structure

### Documentation (this feature)

```text
specs/002-translation-fix-realtime/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (interface contracts)
```

### Source Code (repository root)

```text
Root files modified:
├── popup.js             # Add translation mode indicator UI logic
├── popup.html           # Add translation mode display element
├── content.js           # Add real-time translation progress callback
├── background.js        # Add translation mode tracking, streaming response support
└── manifest.json        # Version update (2.2.0 → 2.3.0)
```

**Structure Decision**: Single-file modification approach - no new files needed. Changes are localized to existing popup UI and translation flow.

## Complexity Tracking

No violations justified. All changes align with constitution principles.

## Phase 0: Research & Unknowns

### Research Tasks

1. **Research current translation flow**: Understand how translation is triggered and how status is communicated between content.js, background.js, and popup.js
2. **Research existing state management**: How translation mode/state is tracked across extension components
3. **Research streaming/chunked response patterns**: How to support incremental translation display
4. **Research timeout handling patterns**: Existing timeout mechanisms in background.js

### Findings

See [research.md](./research.md) for detailed analysis.

## Phase 1: Design & Contracts - COMPLETE

**Status**: All Phase 1 artifacts generated

### Data Model

See [data-model.md](./data-model.md) for state entities and transitions.

**Key Entities**:
- TranslationMode: Service type with user-visible display name
- TranslationState: State machine (idle → translating → completed/error/timeout)
- TranslationProgress: Incremental batch progress for real-time updates
- TranslationError: Structured error with Chinese user messages

### Interface Contracts

See [contracts/message-protocol.md](./contracts/message-protocol.md) for message protocol.

**New Messages**:
- `translationProgress`: background.js → content.js streaming
- `translationModeChanged`: popup.js → content.js notification
- `getTranslationMode`: popup.js → background.js query
- Enhanced error response contract with Chinese messages

### Quick Start

See [quickstart.md](./quickstart.md) for developer onboarding.

### Constitution Check (Post-Design)

**Result**: PASS - All principles still satisfied after detailed design

| Principle | Status | Notes |
|-----------|--------|-------|
| I. 配置简约 | PASS | 超时配置置于高级设置（默认折叠） |
| II. 自动保存 | PASS | 翻译进度实时持久化已存在 |
| III. 一键操作 | PASS | 无新增用户操作步骤 |
| IV. 零学习成本 | PASS | 中文标签，直观状态反馈 |
| V. 隐私优先 | PASS | 无新增数据收集 |
| VI. 渐进增强 | PASS | 实时展示为可选增强体验 |
| VII. 版本管理 | TODO | 需在实现时更新 manifest.json 版本 |

## Phase 2: Implementation Tasks - COMPLETE

See [tasks.md](./tasks.md) for detailed implementation tasks.

**Task Summary**:
- Total: 32 tasks
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 3 tasks
- Phase 3 (US1 - P1): 6 tasks (MVP scope)
- Phase 4 (US2 - P2): 6 tasks
- Phase 5 (US3 - P3): 7 tasks
- Phase 6 (Polish): 6 tasks
- Parallel opportunities: 12 tasks marked [P]

---

*Template Note*: This plan was generated via `/speckit.plan` command. Phases 0-1 artifacts are created before this file. Phase 2 tasks are generated via `/speckit.tasks` command.
