# Phase 0 Research: 翻译模块重构 — 逐条翻译与实时双语展示

## Decision 1: 翻译循环采用"严格逐条串行 + async/await"

**Decision**: 使用单个 `for` 循环遍历字幕数组，每次循环内 `await` 一条翻译请求完成后再进入下一条。不使用 `Promise.all`、不使用批量拼接。

**Rationale**:
- 满足 FR-001/FR-008 的"同一时间只翻译一条"约束。
- `await` 天然保证顺序性，代码简单可读。
- 避免批量请求在 background 中索引错位（之前的已知问题）。

**Alternatives considered**:
- 批量请求 + 拆分结果：实现复杂且索引对齐易出错（已在之前版本验证）。
- Worker 线程逐条：Chrome Content Script 无法直接使用 Worker，增加复杂度无收益。

## Decision 2: 翻译完成后立即触发实时渲染

**Decision**: 每条字幕翻译完成后，直接写入 `subtitle.translation` 字段。`SubtitleDisplay.updateSubtitle()` 在 `video.timeupdate` 事件中自动读取最新 translation 值，无需额外通知。

**Rationale**:
- `timeupdate` 每秒触发多次，保证已翻译字幕会被及时渲染。
- 无需引入事件总线或观察者模式，降低复杂度。

**Alternatives considered**:
- 翻译完成后主动调用 `updateSubtitle()`：会导致非当前时间的字幕被渲染，产生闪烁。
- 使用 `MutationObserver` 监听字幕对象变化：过度设计，`timeupdate` 已足够。

## Decision 3: 失败条目使用状态标记 + 仅失败重试

**Decision**: 为每条字幕增加 `status` 字段（`pending | translating | done | failed`）。翻译循环跳过 `done` 和空文本条目，重试时仅处理 `failed` 和 `pending` 条目。

**Rationale**:
- 状态字段使得"仅重试失败"逻辑简单明确。
- 无需维护额外的"失败列表"数据结构。

**Alternatives considered**:
- 维护独立的 `failedIndexes` 数组：需要额外同步，字幕对象和失败列表可能不一致。
- 每次重试都重新翻译全部：浪费 API 配额，违反 FR-006。

## Decision 4: background.js 提供单条翻译接口

**Decision**: `background.js` 新增 `translateOne` 消息类型，接收单条文本返回单条译文。Content Script 的翻译循环每次发送一条。

**Rationale**:
- 消除 content 与 background 之间的批量索引对齐问题。
- 简化 background 的翻译函数签名和错误处理。
- 进度广播由 content 侧控制，background 无需计算进度。

**Alternatives considered**:
- 复用现有 `translate` 批量接口（batchSize=1）：语义不清晰，参数冗余。
- Content Script 直接调用翻译 API：违反 MV3 CSP 限制，Content Script 不能直接 fetch 外部 API。

## Decision 5: 缓存策略沿用现有方案

**Decision**: 翻译全部完成后统一保存到 `chrome.storage.local`，使用现有的 videoId + subtitleHash 作为缓存键。中断时不保存。

**Rationale**:
- 复用已验证的缓存机制，降低重构范围。
- "全部完成后保存"避免中断时写入不完整数据。

**Alternatives considered**:
- 每条翻译完后增量保存：频繁写 storage 可能有性能问题，且中断保护复杂。
- 使用 IndexedDB：引入新依赖，对本项目规模来说过度。
