# Interface Contracts: Extension Message Protocol

**Purpose**: Define message contracts between extension components for translation features

## Component Overview

```
┌─────────────┐     chrome.runtime     ┌─────────────┐
│  popup.js   │ ◄────────────────────► │ background.js│
│   (UI)      │                        │  (Service)  │
└─────────────┘                        └──────▲──────┘
       │                                      │
       │         chrome.tabs.sendMessage      │
       └────────────────────────────────────► │
                                              │
                                        ┌─────▼────────┐
                                        │  content.js  │
                                        │   (Content)  │
                                        └──────────────┘
```

## Message Protocol Extensions

### New Message Type: `translationProgress`

**Direction**: background.js → content.js (broadcast)

**Purpose**: Stream incremental translation results for real-time display

**Payload**:
```typescript
{
  action: 'translationProgress',
  results: Array<{
    index: number,      // Index in original batch
    text: string,       // Original text
    translation: string // Translated text
  }>,
  progress: number,     // 0-100 percentage
  batchIndex: number,   // Current batch number (0-based)
  totalBatches: number  // Total batches to process
}
```

**Handler** (content.js):
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translationProgress') {
    // Update subtitles with partial results
    subtitleManager.applyPartialResults(message.results);
    // Notify display for real-time update
    subtitleDisplay.showRealtimeProgress(message.progress);
  }
});
```

### New Message Type: `translationModeChanged`

**Direction**: popup.js → content.js (notification)

**Purpose**: Notify content script when user changes translation mode

**Payload**:
```typescript
{
  action: 'translationModeChanged',
  mode: {
    service: 'google' | 'openai',
    displayName: string
  }
}
```

**Handler** (content.js):
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translationModeChanged') {
    // Store current mode for display
    currentTranslationMode = message.mode;
    // Optionally show confirmation
    subtitleDisplay.showModeIndicator(message.mode.displayName);
  }
});
```

### Modified Message Type: `startTranslation`

**Direction**: popup.js → content.js

**Current Response**: `{ success: true }` or `{ success: false, error: string }`

**Enhanced Response**:
```typescript
{
  success: boolean,
  mode: {
    service: string,
    displayName: string
  },
  estimatedTime?: number  // Estimated seconds (based on batch size)
}
```

### New Message Type: `getTranslationMode`

**Direction**: popup.js → background.js

**Purpose**: Query current translation mode for display

**Payload**:
```typescript
{
  action: 'getTranslationMode'
}
```

**Response**:
```typescript
{
  service: 'google' | 'openai',
  displayName: string,
  isConfigured: boolean  // false if API key missing for openai
}
```

## Existing Message Protocol (Reference)

| Action | Direction | Purpose | Modified? |
|--------|-----------|---------|-----------|
| `translate` | content→background | Translate texts | Yes: add progress callback |
| `startTranslation` | popup→content | Start translation | Yes: enhance response |
| `getStatus` | popup→content | Get translation status | No |
| `setMode` | popup→content | Set display mode | No |
| `toggle` | popup→content | Toggle subtitles | No |
| `togglePanel` | popup→content | Toggle control panel | No |
| `export` | popup→content | Export subtitles | No |
| `clearCache` | popup→content | Clear cache | No |
| `getConfig` | popup→background | Get config | No |
| `setConfig` | popup→background | Set config | No |
| `testTranslation` | popup→background | Test service | No |
| `loadConfig` | popup→background | Load config | No |

## Error Response Contract

All error responses must follow this structure:

```typescript
{
  success: false,
  error: {
    type: 'NETWORK_ERROR' | 'API_ERROR' | 'RATE_LIMIT_ERROR' | 'AUTH_ERROR' | 'TIMEOUT_ERROR',
    message: string,      // Chinese, user-visible
    recoverable: boolean,
    suggestedAction: string
  }
}
```

**Examples**:

```javascript
// API Key not configured
{
  success: false,
  error: {
    type: 'AUTH_ERROR',
    message: 'API Key 未配置',
    recoverable: true,
    suggestedAction: '请在设置中配置 OpenAI API Key'
  }
}

// Network timeout
{
  success: false,
  error: {
    type: 'TIMEOUT_ERROR',
    message: '翻译请求超时',
    recoverable: true,
    suggestedAction: '请检查网络连接或稍后重试'
  }
}
```

## Contract Versioning

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial contracts (existing protocol) |
| 2.0.0 | Add translationProgress, translationModeChanged messages |
| 2.1.0 | Add error response contract structure |
