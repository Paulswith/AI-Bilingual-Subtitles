# Implementation Plan: 英文字幕自动识别与拒绝提示

**Branch**: `001-auto-english-subtitle` | **Date**: 2026-03-03 | **Spec**: `/Users/akarizo/Develop/owns/deeplearning-trans/specs/001-auto-english-subtitle/spec.md`
**Input**: Feature specification from `/specs/001-auto-english-subtitle/spec.md`

## Summary

新增“英文字幕自动识别”能力：系统优先检测并使用英文字幕作为翻译源；若未找到英文字幕，则拒绝生成翻译并提供可操作提示。  
设计重点是“判定状态机 + 用户反馈一致性 + 字幕轨道变化后的重判定”，确保用户不会得到错误翻译或无反馈结果。

## Technical Context

**Language/Version**: JavaScript (ES6+), Chrome Extension Manifest V3  
**Primary Dependencies**: Chrome Runtime Messaging, Chrome Storage API, DOM/Video Track API  
**Storage**: `chrome.storage.sync`（配置），`chrome.storage.local`（缓存与进度）  
**Testing**: 手工 E2E（扩展弹窗 + 内容脚本 + 字幕轨道切换场景）  
**Target Platform**: Chrome 浏览器扩展运行环境（MV3 Service Worker + Content Script）  
**Project Type**: 单仓库浏览器扩展  
**Performance Goals**: 英文字幕识别在触发后 2 秒内完成；拒绝提示在 1 秒内可见  
**Constraints**: 不得对非英文字幕发起翻译输出；错误与拒绝提示必须是中文且可操作  
**Scale/Scope**: 面向单页面视频播放场景，覆盖“有英文/无英文/字幕延迟加载/字幕切换”四类主流程

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I. 配置简约**: PASS  
  本特性不新增复杂配置，仅在现有流程内增强自动识别与拒绝提示。
- **II. 自动保存**: PASS  
  复用现有配置/缓存/进度存储，不引入手动保存。
- **III. 一键操作**: PASS  
  用户仍可一键触发翻译；拒绝逻辑不增加额外操作路径。
- **IV. 零学习成本**: PASS  
  通过中文状态提示解释“为何拒绝生成”，减少用户困惑。
- **V. 隐私优先**: PASS  
  仅处理字幕轨道信息，不新增个人数据收集与外发。
- **VI. 渐进增强**: PASS  
  不影响 Google 默认可用路径，增强判定健壮性。
- **VIII. 文档中文**: PASS  
  计划与交付文档均为中文。

**Gate Result**: PASS（无阻塞项）

### Post-Design Gate (Phase 1 后复核)

- 设计文档已明确“拒绝生成”状态机、数据模型、消息契约、验证步骤。
- 无新增违反宪法原则的设计决策。

**Post-Design Result**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-auto-english-subtitle/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── subtitle-eligibility-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
/Users/akarizo/Develop/owns/deeplearning-trans/
├── content.js
├── background.js
├── popup.js
├── popup.html
├── options.js
└── options.html
```

**Structure Decision**: 采用现有“单仓库扩展脚本”结构，不引入新子工程；实现聚焦 `content.js`（字幕判定与拒绝状态）、`background.js`（消息与日志）、`popup.js/html`（状态反馈）。

## Phase 0: Research Output

- 产出文件：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/001-auto-english-subtitle/research.md`
- 结论：选择“轨道判定优先 + 拒绝生成状态机 + 轨道变化触发重判定”的方案。
- 所有 Technical Context 的不确定项已收敛，无 `NEEDS CLARIFICATION`。

## Phase 1: Design Output

- 数据模型：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/001-auto-english-subtitle/data-model.md`
- 契约文档：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/001-auto-english-subtitle/contracts/subtitle-eligibility-contract.md`
- 快速验证：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/001-auto-english-subtitle/quickstart.md`

## Complexity Tracking

无宪法违规项，无需豁免说明。
