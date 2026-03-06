# Contract: Subtitle Eligibility and Rejection Feedback

本契约定义“字幕可翻译判定”在扩展内部的消息语义，用于对齐内容脚本、后台脚本与弹窗反馈。

## 1) Eligibility Snapshot

### Message Name
`subtitleEligibility`

### Payload
- `status`: `eligible | rejected_no_english | rejected_no_track | pending`
- `reason`: string (optional)
- `detectedLanguage`: string (optional)
- `sourceTrackId`: string (optional)
- `evaluatedAt`: number (required, timestamp)

### Rules
- 当 `status=eligible`，必须带 `sourceTrackId`。
- 当 `status` 为拒绝态，必须带用户可读 `reason`。

## 2) Rejection Feedback

### Message Name
`translationRejected`

### Payload
- `code`: `NO_ENGLISH_SUBTITLE | NO_SUBTITLE_TRACK`
- `message`: string (required, Chinese)
- `actionHint`: string (required, Chinese)
- `retryAllowed`: boolean (required, always `true`)

### Rules
- `message` 必须解释“拒绝生成”原因。
- `actionHint` 必须提供可执行下一步动作。

## 3) Retry Request

### Message Name
`retryEligibilityCheck`

### Payload
- `trigger`: `user_retry | track_changed | page_updated`
- `requestedAt`: number (timestamp)

### Rules
- 每次重试都必须刷新 `evaluatedAt`。
- 若重试后转为 `eligible`，必须清除拒绝提示。

## 4) Compatibility

- 本契约为内部契约，不影响外部 API。
- 字段命名允许在实现中映射，但语义必须保持一致。
