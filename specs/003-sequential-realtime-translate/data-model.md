# Data Model: 翻译模块重构 — 逐条翻译与实时双语展示

## 1) SubtitleItem

表示单条字幕及其翻译状态。

### Fields
- `id` (number, required): 字幕序号（从 1 开始）
- `startTime` (number, required): 开始时间（秒）
- `endTime` (number, required): 结束时间（秒）
- `text` (string, required): 英文原文
- `translation` (string, optional): 中文译文（翻译完成后填入）
- `status` (enum, required): `pending | translating | done | failed`

### Validation Rules
- `text` 为空或仅包含符号/标点时，`status` 直接设为 `done`，`translation` 保持为空。
- `status=done` 时 `translation` 应存在（除空文本跳过场景）。
- `status=failed` 时 `translation` 为空。

### State Transitions
- `pending -> translating`：开始翻译该条。
- `translating -> done`：翻译成功，写入 `translation`。
- `translating -> failed`：翻译失败（重试耗尽）。
- `failed -> translating`：用户触发重试。

## 2) TranslationSession

表示一次完整的逐条翻译流程。

### Fields
- `totalCount` (number, required): 字幕总条数
- `doneCount` (number, required): 已完成条数（含跳过的空文本）
- `failedCount` (number, required): 失败条数
- `isRunning` (boolean, required): 翻译循环是否正在运行
- `isAborted` (boolean, required): 是否被中断
- `startedAt` (number, required): 翻译开始时间戳
- `completedAt` (number, optional): 翻译完成时间戳

### Validation Rules
- `doneCount + failedCount <= totalCount`。
- `isRunning=true` 时 `isAborted` 必须为 `false`。
- `isAborted=true` 时 `isRunning` 必须为 `false`。

### State Transitions
- `idle -> running`：用户触发翻译。
- `running -> completed`：所有字幕处理完毕（done + failed = total）。
- `running -> aborted`：用户切换页面/视频或手动中断。
- `completed -> running`：用户触发重试（仅处理 failed 条目）。

## 3) TranslationResult

表示缓存中的翻译结果。

### Fields
- `videoId` (string, required): 视频唯一标识
- `subtitleHash` (string, required): 字幕内容哈希
- `items` (SubtitleItem[], required): 所有字幕条目及其译文
- `timestamp` (number, required): 保存时间戳
- `expiresAt` (number, required): 过期时间戳

### Validation Rules
- 仅在所有条目 `status=done`（无 `failed`）时才保存到缓存。
- `subtitleHash` 在加载时校验，不匹配则清除并重新翻译。

## Relationships

- `TranslationSession` 操作 `SubtitleItem[]`：翻译循环遍历并更新每条状态。
- `TranslationResult.items` 是 `SubtitleItem[]` 的持久化快照。
- `TranslationSession` 完成且无失败时，生成 `TranslationResult` 并写入缓存。
