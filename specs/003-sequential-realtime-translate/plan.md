# Implementation Plan: 翻译模块重构 — 逐条翻译与实时双语展示

**Branch**: `003-sequential-realtime-translate` | **Date**: 2026-03-03 | **Spec**: `/Users/akarizo/Develop/owns/deeplearning-trans/specs/003-sequential-realtime-translate/spec.md`
**Input**: Feature specification from `/specs/003-sequential-realtime-translate/spec.md`

## Summary

重构翻译模块：取消批量/并发翻译，改为严格逐条翻译；每翻译完一条字幕立即写入并触发实时双语渲染；失败条目可跳过并支持后续单独重试。
核心设计是"单条翻译循环 + 逐条实时渲染 + 失败条目记录"，确保用户在翻译进行中即可看到已完成的双语字幕。

## Technical Context

**Language/Version**: JavaScript (ES6+), Chrome Extension Manifest V3  
**Primary Dependencies**: Chrome Runtime Messaging, Chrome Storage API, DOM/Video Track API, Fetch API  
**Storage**: `chrome.storage.sync`（配置），`chrome.storage.local`（缓存与进度）  
**Testing**: 手工 E2E（扩展弹窗 + 内容脚本 + 逐条翻译场景）  
**Target Platform**: Chrome 浏览器扩展运行环境（MV3 Service Worker + Content Script）  
**Project Type**: 单仓库浏览器扩展  
**Performance Goals**: 首条字幕翻译 3 秒内可见；每条译文完成后 200ms 内渲染  
**Constraints**: 同一时间只有一条字幕在翻译（无并发）；不得对非英文字幕发起翻译  
**Scale/Scope**: 面向单页面视频播放场景，单次会话字幕量级 50-500 条

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I. 配置简约**: PASS  
  本特性不新增配置项，复用现有翻译服务选择。
- **II. 自动保存**: PASS  
  翻译结果自动缓存，进度无需手动保存。
- **III. 一键操作**: PASS  
  翻译仍为一键触发，无额外操作步骤。
- **IV. 零学习成本**: PASS  
  逐条翻译对用户透明，进度反馈使用中文"已翻译 N/M 条"。
- **V. 隐私优先**: PASS  
  仅向用户配置的翻译服务发送字幕文本，不新增数据收集。
- **VI. 渐进增强**: PASS  
  Google 翻译默认可用，OpenAI 为可选增强。
- **VII. 版本管理**: PASS  
  重构为 MAJOR 变更，需更新 manifest.json 和 popup.html 版本号。
- **VIII. 文档中文**: PASS  
  所有提示、日志、文档使用中文。

**Gate Result**: PASS（无阻塞项）

### Post-Design Gate (Phase 1 后复核)

- 设计文档已明确逐条翻译循环、失败跳过机制、实时渲染触发点。
- 无新增违反宪法原则的设计决策。

**Post-Design Result**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/003-sequential-realtime-translate/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
/Users/akarizo/Develop/owns/deeplearning-trans/
├── content.js          # 字幕管理、翻译循环、实时渲染、控制面板
├── background.js       # 翻译 API 调用（Google/OpenAI）、缓存管理
├── popup.js            # 弹窗交互、状态展示
├── popup.html          # 弹窗 UI
├── options.js          # 高级设置
├── options.html        # 设置页面
├── subtitle.css        # 字幕样式
└── manifest.json       # 扩展清单
```

**Structure Decision**: 采用现有"单仓库扩展脚本"结构；重构聚焦 `content.js`（翻译循环重写）和 `background.js`（单条翻译接口简化），`popup.js/html` 仅做进度展示适配。

## Phase 0: Research Output

- 产出文件：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/003-sequential-realtime-translate/research.md`
- 结论：选择"单条翻译循环 + 逐条渲染刷新 + 失败条目记录 + 仅失败重试"方案。
- 所有 Technical Context 无 `NEEDS CLARIFICATION`。

## Phase 1: Design Output

- 数据模型：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/003-sequential-realtime-translate/data-model.md`
- 快速验证：`/Users/akarizo/Develop/owns/deeplearning-trans/specs/003-sequential-realtime-translate/quickstart.md`

## Complexity Tracking

无宪法违规项，无需豁免说明。
