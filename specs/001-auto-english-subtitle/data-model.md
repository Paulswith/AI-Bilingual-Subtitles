# Data Model: 英文字幕自动识别与拒绝提示

## 1) SubtitleTrack

表示页面中可用的单条字幕轨道。

### Fields
- `trackId` (string, required): 轨道唯一标识
- `label` (string, optional): 轨道显示名称
- `languageCode` (string, optional): 语言代码（如 `en`, `zh`, `ja`）
- `isActive` (boolean, required): 当前是否为激活轨道
- `isReadable` (boolean, required): 内容是否可读取
- `sampleText` (string, optional): 用于回退判定的字幕样本

### Validation Rules
- `trackId` 必须非空。
- `languageCode` 若存在，必须可归一化为标准短码（例如 `en-US` -> `en`）。
- `sampleText` 可为空，但为空时不得作为唯一英文判定依据。

## 2) TranslationEligibility

表示当前页面是否允许生成翻译及其原因。

### Fields
- `status` (enum, required): `eligible | rejected_no_english | rejected_no_track | pending`
- `reason` (string, optional): 拒绝或等待原因
- `detectedLanguage` (string, optional): 当前判定语言（如 `en`, `zh`, `unknown`）
- `evaluatedAt` (datetime-like number, required): 最近一次判定时间戳
- `sourceTrackId` (string, optional): 被选作翻译源的轨道 ID

### Validation Rules
- `status=eligible` 时，`sourceTrackId` 必须存在。
- `status` 为拒绝态时，`reason` 必须存在且面向用户可理解。
- `evaluatedAt` 必须为单调递增更新。

### State Transitions
- `pending -> eligible`：检测到可用英文轨道。
- `pending -> rejected_no_track`：未检测到任何可用轨道。
- `pending -> rejected_no_english`：检测到轨道但无英文可用。
- `rejected_* -> eligible`：用户切换/页面更新后检测到英文轨道。
- `eligible -> rejected_*`：翻译中轨道切换导致英文不可用。

## 3) RejectionNotice

表示“拒绝生成”对用户的可见提示。

### Fields
- `noticeId` (string, required): 提示唯一标识
- `message` (string, required): 提示主文本
- `actionHint` (string, required): 建议动作（如“切换到英文字幕后重试”）
- `visible` (boolean, required): 当前是否展示
- `updatedAt` (datetime-like number, required): 最近更新时间

### Validation Rules
- `message` 与 `actionHint` 必须为中文，且长度可读（建议 8-80 字）。
- `visible=true` 时必须存在最新 `updatedAt`。
- 同一时刻仅允许一个活跃拒绝提示。

## Relationships

- `TranslationEligibility.sourceTrackId` -> `SubtitleTrack.trackId`（多对一）
- `RejectionNotice` 与 `TranslationEligibility` 一一对应于当前页面会话状态：
  - `eligible` 时 `RejectionNotice.visible=false`
  - `rejected_*` 时 `RejectionNotice.visible=true`
