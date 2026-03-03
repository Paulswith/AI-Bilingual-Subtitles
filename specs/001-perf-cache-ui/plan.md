# Implementation Plan: 翻译性能与 UI 增强

**Branch**: `001-perf-cache-ui` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-perf-cache-ui/spec.md`

## Summary

本功能为 AI 双语字幕扩展添加性能优化与 UI 增强：
1. **缓存加载提示** - 命中缓存时显示"已从缓存加载"，3 秒自动消失
2. **翻译性能优化** - 并行翻译策略，首批 20 条分 4 批并发，5 秒内显示
3. **API Key 配置状态** - Popup 实时读取 + storage.onChanged 监听同步
4. **源语言限制** - VTT 元数据 + 内容采样双重检测，仅中文触发翻译

技术策略：并行翻译首批字幕、内容哈希缓存校验、popup 状态实时同步。

## Technical Context

**Language/Version**: JavaScript (ES6+), Chrome Extension Manifest V3
**Primary Dependencies**: Chrome Storage API, Fetch API
**Storage**: Chrome storage.local (缓存), storage.sync (配置)
**Testing**: 手动测试 + 控制台日志验证
**Target Platform**: Chrome 浏览器 (Chromium 88+)
**Project Type**: 浏览器扩展 (Browser Extension)
**Performance Goals**: 首批字幕 <5 秒显示，弹窗加载 <200ms
**Constraints**: 内存 <50MB (1000 条字幕缓存), 不阻塞视频播放
**Scale/Scope**: 单视频最多 1000 条字幕，批处理大小可配置

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 检查结果 | 说明 |
|------|----------|------|
| **I. 配置简约** | ✅ 通过 | 新增功能无需用户配置，自动运行 |
| **II. 自动保存** | ✅ 通过 | 缓存状态、配置状态自动持久化 |
| **III. 一键操作** | ✅ 通过 | 无新增操作，自动触发 |
| **IV. 零学习成本** | ✅ 通过 | 提示语使用通俗中文："已从缓存加载"、"API Key 已配置" |
| **V. 隐私优先** | ✅ 通过 | 所有数据本地存储，仅翻译时发送字幕内容 |
| **VI. 渐进增强** | ✅ 通过 | 缓存提示为增强体验，不影响基础翻译功能 |

**Gate 结果**: ✅ 所有原则通过，可继续 Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-perf-cache-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (if needed)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
├── manifest.json          # 扩展配置
├── background.js          # 后台服务 (翻译服务、缓存管理)
├── content.js             # 内容脚本 (字幕检测、显示、语言检测)
├── popup.html             # 弹窗界面
├── popup.js               # 弹窗逻辑 (API Key 状态显示)
├── options.html           # 高级设置页面
├── options.js             # 选项页面逻辑
└── subtitle.css           # 字幕样式 (缓存提示样式)
```

**Structure Decision**: 保持现有单项目结构，在现有文件中添加功能模块

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无违宪项，无需复杂度说明。

---

## Phase 0: Research

**Purpose**: Resolve technical unknowns and define implementation approach

### Research Tasks

1. **5 秒内首批翻译技术方案**
   - 并行翻译 vs 流式翻译
   - 首批字幕数量优化 (20 条 vs 50 条)
   - Google 翻译 API 响应时间基准

2. **缓存检测与提示方案**
   - 缓存键生成时机 (字幕加载后 vs 解析后)
   - 提示 UI 显示位置 (字幕区域顶部 vs 独立 Toast)
   - 缓存提示消失时机 (3 秒自动消失 vs 手动关闭)

3. **API Key 状态同步方案**
   - storage.sync 监听机制 (chrome.storage.onChanged)
   - Popup 打开时实时读取状态
   - 配置页面保存后立即通知 popup 更新

4. **字幕语言检测方案**
   - VTT 文件语言元数据解析
   - 字幕内容采样检测 (前 10 条)
   - 语言代码映射 (zh, zh-CN, zh-TW → 中文)

---

## Phase 1: Design & Contracts

**Prerequisites**: Phase 0 research.md complete

### Data Model Design

**翻译缓存实体**:
- subtitleHash: 字幕内容哈希 (SHA-256 截取)
- translatedsubs: 翻译结果数组
- timestamp: 缓存创建时间
- expiresAt: 缓存过期时间 (30 天)

**配置状态实体**:
- apiKeyConfigured: boolean
- translationService: 'google' | 'openai'
- batchSize: number
- requestInterval: number

**字幕轨道实体**:
- language: 语言代码
- contentHash: 内容哈希
- cues: 字幕片段数组

### Interface Contracts

本项目为浏览器扩展，无外部 API 契约。内部接口：

**background.js → content.js**:
- `translateBatch(subtitles, service)` → translated subs
- `checkCache(videoId, subtitleHash)` → cache status

**popup.js ↔ background.js**:
- `getApiKeyStatus()` → { configured: boolean }

### Quickstart Guide

**开发者快速验证**:
1. 打开视频页面，观察控制台日志
2. 首次访问：查看"开始翻译"→"首批完成"时间 <5 秒
3. 刷新页面：查看"已从缓存加载"提示
4. 打开 popup：查看 API Key 状态显示

**用户快速上手**:
1. 打开视频自动播放
2. 点击扩展图标查看状态
3. 如显示"已从缓存加载"，无需等待

---

## Phase 1 Complete Artifacts

- [x] research.md - 技术方案文档
- [x] data-model.md - 数据模型详细设计
- [x] quickstart.md - 快速上手指南
- [x] contracts/internal-api.md - 内部接口契约

**Constitution Re-Check** (post-design):

| 原则 | 检查结果 | 说明 |
|------|----------|------|
| **I. 配置简约** | ✅ 通过 | 设计方案无需新增配置项 |
| **II. 自动保存** | ✅ 通过 | 缓存、进度、配置全部自动持久化 |
| **III. 一键操作** | ✅ 通过 | 缓存提示自动显示，无额外操作 |
| **IV. 零学习成本** | ✅ 通过 | 提示语"已从缓存加载"直观易懂 |
| **V. 隐私优先** | ✅ 通过 | 所有数据本地存储，无第三方追踪 |
| **VI. 渐进增强** | ✅ 通过 | 缓存提示为增强体验，基础功能不受影响 |

**Next Command**: `/speckit.tasks` to generate implementation tasks
