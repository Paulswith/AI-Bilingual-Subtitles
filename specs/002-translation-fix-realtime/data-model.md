# Data Model: Translation State Management

**Purpose**: Define state entities and transitions for translation mode display and real-time feedback

## State Entities

### TranslationMode

Represents the current translation service/mode visible to users.

| Field | Type | Description |
|-------|------|-------------|
| `service` | `'google' \| 'openai'` | Internal service identifier |
| `displayName` | `string` | User-visible name ("Google 翻译", "OpenAI 接口", "实时字幕翻译") |
| `isActive` | `boolean` | Whether this mode is currently active |

**State Transitions**:
```
Initial: google (default)
google ←→ openai (user switches in popup)
```

### TranslationState

Tracks the real-time translation process state.

| Field | Type | Description |
|-------|------|-------------|
| `status` | `'idle' \| 'translating' \| 'completed' \| 'error' \| 'timeout'` | Current translation status |
| `progress` | `number (0-100)` | Percentage complete |
| `translatedCount` | `number` | Number of segments translated |
| `totalCount` | `number` | Total segments to translate |
| `startTime` | `number` | Timestamp when translation started |
| `error` | `string \| null` | Error message if failed |

**State Transitions**:
```
idle → translating (user initiates)
translating → completed (success)
translating → error (API error)
translating → timeout (timeout exceeded)
completed → idle (new translation)
error → idle (retry)
timeout → idle (retry)
```

### TranslationProgress

Incremental progress update for real-time display.

| Field | Type | Description |
|-------|------|-------------|
| `batchIndex` | `number` | Current batch being processed |
| `totalBatches` | `number` | Total batches |
| `results` | `Array<string>` | Translated texts for this batch |
| `percent` | `number` | Overall percentage (0-100) |

### TranslationError

Structured error information for user feedback.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'NETWORK_ERROR' \| 'API_ERROR' \| 'RATE_LIMIT_ERROR' \| 'AUTH_ERROR' \| 'TIMEOUT_ERROR' \| 'UNKNOWN_ERROR'` | Error category |
| `message` | `string` | User-visible error message (Chinese) |
| `recoverable` | `boolean` | Whether retry is possible |
| `suggestedAction` | `string` | User guidance ("请检查网络", "API Key 无效", "稍后重试") |

## Validation Rules

### TranslationMode
- `displayName` must be Chinese for non-technical users
- Mode indicator must update within 100ms of service change

### TranslationState
- `progress` must be monotonic (only increase, never decrease)
- `translatedCount` must not exceed `totalCount`
- Timeout must trigger within configured threshold (default 30s)

### TranslationProgress
- Progress updates must be sent after each batch completes
- Each update must include cumulative results (not just delta)

## Entity Relationships

```
┌─────────────────┐
│ TranslationMode │
│  - service      │
│  - displayName  │
│  - isActive     │
└────────┬────────┘
         │ 1:1
         │
┌────────▼──────────┐
│ TranslationState  │
│  - status         │
│  - progress       │
│  - translatedCount│
│  - totalCount     │
└────────┬──────────┘
         │ 1:N
         │
┌────────▼──────────┐
│TranslationProgress│
│  - batchIndex     │
│  - results        │
│  - percent        │
└───────────────────┘
```

## Storage Locations

| Entity | Storage | Key | Expiry |
|--------|---------|-----|--------|
| TranslationMode | chrome.storage.sync | `config.translationService` | Persistent |
| TranslationState | Memory (runtime only) | N/A | Session only |
| TranslationProgress | Memory (runtime only) | N/A | Session only |
| TranslationError | Memory (runtime only) | N/A | Session only |

## State Machine Diagram

```
                    ┌─────────┐
                    │  idle   │
                    └────┬────┘
                         │ startTranslation
                         ▼
                    ┌─────────────┐
              ┌─────│translating  │─────┐
              │     │ (progress%) │     │
         retry│     └─────┬───────┘     │ error/timeout
              │           │ complete    │
              │           ▼             │
              │     ┌───────────┐       │
              │     │ completed │       │
              │     └───────────┘       │
              │                         │
              └─────────────────────────┘
```
