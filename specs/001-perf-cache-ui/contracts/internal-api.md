# Internal Contracts: 翻译性能与 UI 增强

**Feature**: 翻译性能与 UI 增强
**Date**: 2026-03-03
**Branch**: 001-perf-cache-ui

**Note**: 本项目为浏览器扩展，无对外暴露的 API 接口。本文档记录内部模块间的调用契约。

---

## Contract 1: Cache Service (background.js)

**Purpose**: 缓存管理接口

### checkCache(videoId, subtitleHash)

**调用方**: content.js
**返回**: `Promise<{hit: boolean, data?: TranslationCache}>`

```typescript
async function checkCache(videoId: string, subtitleHash: string): Promise<{
  hit: boolean;
  data?: {
    translatedSubs: SubtitleCue[];
    createdAt: number;
  };
}>
```

**示例**:
```javascript
const result = await checkCache('video123', 'a1b2c3d4');
if (result.hit) {
  renderSubtitles(result.data.translatedSubs);
  showCacheHint();
}
```

---

### saveCache(videoId, subtitleHash, translatedSubs)

**调用方**: content.js
**返回**: `Promise<void>`

```typescript
async function saveCache(
  videoId: string,
  subtitleHash: string,
  translatedSubs: SubtitleCue[]
): Promise<void>
```

---

## Contract 2: Translation Service (background.js)

**Purpose**: 翻译服务接口

### translateBatch(subtitles, options)

**调用方**: content.js
**返回**: `Promise<TranslatedSubtitle[]>`

```typescript
async function translateBatch(
  subtitles: string[],
  options: {
    service: 'google' | 'openai';
    apiKey?: string;
    apiBaseUrl?: string;
    model?: string;
    targetLanguage: 'zh' | 'en';
  }
): Promise<{
  original: string;
  translated: string;
}[]>
```

**错误处理**:
```typescript
type TranslationError = {
  code: 'NETWORK_ERROR' | 'API_ERROR' | 'AUTH_ERROR' | 'RATE_LIMIT';
  message: string;
  retryable: boolean;
  retryAfter?: number; // 毫秒
};
```

---

## Contract 3: Language Detection (content.js)

**Purpose**: 字幕语言检测

### detectSubtitleLanguage(cues)

**调用方**: content.js (内部)
**返回**: `'zh' | 'en' | 'ja' | 'ko' | 'unknown'`

```typescript
function detectSubtitleLanguage(cues: SubtitleCue[]): 'zh' | 'en' | 'ja' | 'ko' | 'unknown'
```

**检测逻辑**:
1. 解析 VTT 元数据 (如果有)
2. 采样前 10 条字幕内容
3. 基于 Unicode 范围判断语言

---

## Contract 4: Config Service (options.js → background.js)

**Purpose**: 配置管理接口

### getConfig()

**调用方**: popup.js, options.js
**返回**: `Promise<ConfigState>`

```typescript
async function getConfig(): Promise<{
  service: 'google' | 'openai';
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  batchSize: number;
  requestInterval: number;
  debugMode: boolean;
}>
```

---

### saveConfig(config)

**调用方**: options.js
**返回**: `Promise<void>`

```typescript
async function saveConfig(config: {
  service: 'google' | 'openai';
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  batchSize: number;
  requestInterval: number;
  debugMode: boolean;
}): Promise<void>
```

**副作用**: 触发 `chrome.storage.onChanged` 事件

---

## Contract 5: API Key Status (popup.js)

**Purpose**: API Key 状态查询

### getApiKeyStatus()

**调用方**: popup.js
**返回**: `Promise<{configured: boolean}>`

```typescript
async function getApiKeyStatus(): Promise<{
  configured: boolean;
  service: 'google' | 'openai';
}>
```

**UI 更新时机**:
1. Popup 打开时立即调用
2. 收到 `storage.onChanged` 事件时调用

---

## Event Contracts

### chrome.storage.onChanged

**触发条件**: 配置变更
**监听方**: popup.js

```javascript
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey || changes.service) {
    updateApiKeyStatus(); // Popup 更新状态显示
  }
});
```

### TranslationProgressUpdate

**触发条件**: 翻译进度更新
**监听方**: content.js (UI 更新)

```javascript
// Custom event dispatched from background.js
window.addEventListener('translation-progress', (e) => {
  const { completed, total } = e.detail;
  updateProgressUI(completed, total);
});
```

---

## Error Handling Contract

**所有异步方法遵循统一错误处理**:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: TranslationError };
```

**示例**:
```javascript
try {
  const result = await translateBatch(subs, options);
  return { success: true, data: result };
} catch (err) {
  return {
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: err.message,
      retryable: true,
      retryAfter: 1000
    }
  };
}
```
