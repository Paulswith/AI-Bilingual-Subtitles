# Phase 0 Research: Translation Mode Display and Real-time Translation Fix

**Purpose**: Resolve all NEEDS CLARIFICATION from Technical Context and understand current architecture

## Research Task 1: Current Translation Flow

**Question**: How is translation triggered and how does status flow between components?

**Findings**:

### Translation Trigger Flow

```
User clicks "翻译" in popup.html
    ↓
popup.js: translateBtn click handler (line 376-408)
    ↓
Sends message to content.js: { action: 'startTranslation' }
    ↓
content.js: SubtitleManager.translateSubtitles()
    ↓
Sends message to background.js: { action: 'translate', texts: [...] }
    ↓
background.js: translate() → googleTranslate() or openaiTranslate()
    ↓
Results flow back through response chain
```

### Current Status Communication

| Component | Status Tracking |
|-----------|-----------------|
| popup.js | `showTranslationStatus()` displays state; `updateStatus()` polls content.js every 1s |
| content.js | `SubtitleManager.isTranslating`, `translationProgress`, callbacks via `onProgress` |
| background.js | No state tracking; pure request/response |

**Issues Identified**:

1. **No translation mode indicator**: popup.js shows "Google 翻译" or "OpenAI 接口" temporarily (2s) but no persistent indicator
2. **No real-time streaming**: Translation waits for entire batch to complete before showing results (line 483-489 in content.js)
3. **No timeout handling**: No explicit timeout in background.js translation; relies on fetch defaults
4. **Progress polling**: popup.js polls every 1s for 30s max (line 399-407 in popup.js) - not truly real-time

**Key Code References**:

- popup.js:376-408 - Translation button handler
- popup.js:61-73 - `showTranslationStatus()` function
- content.js:444-537 - `translateSubtitles()` method
- background.js:404-448 - `translate()` entry point
- background.js:151-208 - `googleTranslate()` implementation
- background.js:215-327 - `openaiTranslate()` implementation

---

## Research Task 2: Existing State Management

**Question**: How is translation mode/state tracked?

**Findings**:

### Current State Storage

| State | Location | Persistence |
|-------|----------|-------------|
| Translation service (google/openai) | `chrome.storage.sync.config.translationService` | Cross-device sync |
| OpenAI config (baseUrl, model, apiKey) | `chrome.storage.sync.config.openai` | Cross-device sync |
| Translation progress | `chrome.storage.local.${videoId}_progress` | Local only, 1hr expiry |
| Subtitle cache | `chrome.storage.local.subtitle_${videoId}` | Local only, 30 days |

### Translation Mode Concept

The codebase currently uses **"translation service"** (google vs openai) rather than "translation mode". The user requirement mentions "翻译模式" which maps to:

- Current implementation: Service type (Google 翻译 / OpenAI 接口)
- User expectation: Mode type (实时字幕翻译)

**Gap**: The spec mentions "实时字幕翻译" as a mode, but current architecture only has service selection. The feature is about making the service selection VISIBLE as a "mode" indicator.

---

## Research Task 3: Streaming/Chunked Response Patterns

**Question**: Can the current architecture support incremental translation display?

**Findings**:

### Current Batch Processing

```javascript
// content.js:474-489
const response = await chrome.runtime.sendMessage({
  action: 'translate',
  texts: texts  // Batch of 30 items
});

if (response.success) {
  const translations = response.results;  // All at once
  batch.forEach((sub, idx) => {
    sub.translation = translations[idx] || '';
  });
}
```

### Streaming Feasibility

**Option A: Per-item callback** (Recommended)
- Modify `translate` action to send individual results as they complete
- Use `sendResponse()` multiple times via `chrome.runtime.sendResponse()` (not supported)
- Better: Use custom event pattern or port-based messaging

**Option B: Progress message** (Simpler, recommended)
- Send `{ action: 'translationProgress', results: [...] }` message after each batch
- content.js updates display immediately on progress message
- No architectural change needed

**Recommended Approach**: Option B

```javascript
// background.js: Inside translate() after each batch
chrome.runtime.sendMessage({
  action: 'translationProgress',
  results: partialResults,
  progress: percent
});

// content.js: Listen for progress messages
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'translationProgress') {
    // Update display with partial results
  }
});
```

---

## Research Task 4: Timeout Handling Patterns

**Question**: How are timeouts currently handled?

**Findings**:

### Current Timeout Mechanisms

| Location | Timeout | Behavior |
|----------|---------|----------|
| popup.js | 30s hard timeout | Stops polling, shows timeout implicitly |
| background.js googleTranslate() | None explicit | Fetch timeout defaults (~30s) |
| background.js openaiTranslate() | None explicit | Uses `fetchWithRetry()` with exponential backoff |
| background.js fetchWithRetry() | Exponential backoff up to 30s | Max delay capped at 30s |

### Gap: No User-Configurable Timeout

The spec requires:
- FR-009: Translation timeout threshold is user-configurable, default 30 seconds

**Implementation Needed**:

1. Add `timeout` field to `DEFAULT_CONFIG` in background.js
2. Add timeout UI option to popup.html (advanced settings)
3. Pass timeout to translation functions
4. Implement AbortController-based fetch timeout

```javascript
// background.js: Add to DEFAULT_CONFIG
timeout: 30000,  // 30 seconds default

// Implement timeout with AbortController
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), config.timeout);

const response = await fetch(url, {
  ...options,
  signal: controller.signal
});
clearTimeout(timeoutId);
```

---

## Architecture Decision Record

### Decision 1: Translation Mode Display

**Chosen**: Display current translation service as "翻译模式" indicator in popup.html

**Rationale**:
- Minimal code change (reuse existing `translationService` state)
- Aligns with user mental model ("I'm using Google translation mode")
- No new state management required

**Implementation**:
- Add `<div id="translation-mode-display">` to popup.html
- Update text on service change (already done in popup.js:291-296)
- Make indicator persistent (not temporary toast message)

### Decision 2: Real-time Translation Display

**Chosen**: Progress message pattern (Option B from Research Task 3)

**Rationale**:
- No breaking changes to message protocol
- Incremental implementation possible
- Compatible with existing batch processing

**Implementation**:
- background.js sends `translationProgress` message after each batch
- content.js listens and updates display immediately
- popup.js reflects progress in UI

### Decision 3: Timeout Configuration

**Chosen**: Add to advanced settings (collapsed by default per Constitution Principle I)

**Rationale**:
- Respects "配置简约" principle
- Power users can customize
- Default 30s works for most cases

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Port-based streaming | Over-engineering for simple progress updates |
| Server-Sent Events | Not supported in Chrome extension messaging |
| Polling from background.js | Inefficient, adds latency |
| WebSocket for real-time | Overkill, adds dependency on server support |

---

**Status**: All NEEDS CLARIFICATION resolved. Ready for Phase 1 design.
