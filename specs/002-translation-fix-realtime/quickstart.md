# Quick Start: Translation Mode Display Feature

**Purpose**: Developer onboarding for understanding and implementing the translation mode display feature

## Feature Overview

This feature adds:
1. **Translation Mode Indicator**: Shows which translation service is active ("Google 翻译" or "OpenAI 接口")
2. **Real-time Translation Display**: Shows translation progress incrementally as batches complete
3. **Timeout Handling**: User-configurable timeout with clear error messages

## Prerequisites

- Chrome browser (latest)
- Node.js (for package management)
- Basic understanding of Chrome Extensions (Manifest V3)

## Project Structure

```
deeplearning-trans/
├── popup.js              # UI logic - ADD mode indicator here
├── popup.html            # UI markup - ADD mode display element
├── content.js            # Content script - ADD real-time progress handler
├── background.js         # Service worker - ADD progress messaging
└── manifest.json         # Extension config
```

## Key Files to Modify

### 1. popup.html - Add Mode Indicator

Add after translation service selector:

```html
<div id="translation-mode-display" class="translation-mode">
  当前模式：<span id="current-mode">实时字幕翻译</span>
</div>
```

### 2. popup.js - Mode Display Logic

Add function to update mode indicator:

```javascript
function updateModeIndicator(service) {
  const modeDisplay = document.getElementById('current-mode');
  if (modeDisplay) {
    modeDisplay.textContent = service === 'google' ? 'Google 翻译' : 'OpenAI 接口';
  }
}

// Call in translationService change handler (line 275-297)
elements.translationService.addEventListener('change', async (e) => {
  const service = e.target.value;
  updateModeIndicator(service);
  // ... existing code
});
```

### 3. background.js - Progress Messages

Add after each batch translation completes (inside `googleTranslate` and `openaiTranslate`):

```javascript
// After processing each batch
chrome.runtime.sendMessage({
  action: 'translationProgress',
  results: partialResults,
  progress: Math.round((i + 1) / texts.length * 100)
});
```

### 4. content.js - Real-time Display

Add handler for progress messages:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translationProgress') {
    // Apply partial results
    message.results.forEach(result => {
      if (subtitleManager.originalSubtitles[result.index]) {
        subtitleManager.originalSubtitles[result.index].translation = result.translation;
      }
    });
    // Update display
    subtitleDisplay.updateSubtitle();
    // Update progress
    if (controlPanel) {
      controlPanel.updateStatus(
        subtitleManager.originalSubtitles.length,
        subtitleManager.originalSubtitles.filter(s => s.translation).length,
        subtitleManager.hasCache
      );
    }
  }
  // ... existing switch cases
});
```

## Testing

### Manual Test Flow

1. **Mode Indicator Test**:
   - Open popup
   - Switch translation service
   - Verify mode indicator updates immediately

2. **Real-time Translation Test**:
   - Open a video page
   - Click "翻译" button
   - Verify progress percentage updates incrementally
   - Verify translated subtitles appear as they complete

3. **Timeout Test**:
   - Set timeout to 5s in advanced settings
   - Trigger translation with slow network
   - Verify timeout message appears after 5s

### Debug Commands

Open Chrome DevTools Console in extension context:

```javascript
// Check current mode
chrome.storage.sync.get(['config'], r => console.log(r.config.translationService));

// Simulate progress message
chrome.runtime.sendMessage({
  action: 'translationProgress',
  results: [{ index: 0, text: 'Test', translation: '测试' }],
  progress: 10
});
```

## Common Issues

### Issue: Mode indicator doesn't update

**Cause**: Event listener not attached

**Fix**: Check popup.js line numbers match after modifications

### Issue: Progress messages not received

**Cause**: background.js not broadcasting

**Fix**: Verify `chrome.runtime.sendMessage` is called after each batch

### Issue: Real-time display not updating

**Cause**: content.js handler missing

**Fix**: Add `translationProgress` case to message listener

## Next Steps

1. Read [data-model.md](./data-model.md) for state management details
2. Read [message-protocol.md](./contracts/message-protocol.md) for contract specifications
3. See [tasks.md](./tasks.md) for implementation task breakdown

## Related Documentation

- [spec.md](./spec.md) - Feature specification
- [plan.md](./plan.md) - Implementation plan
- [research.md](./research.md) - Technical research findings
