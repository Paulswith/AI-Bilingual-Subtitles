# Research: 翻译性能与 UI 增强

**Feature**: 翻译性能与 UI 增强
**Date**: 2026-03-03
**Branch**: 001-perf-cache-ui

---

## R1: 5 秒内首批翻译技术方案

**Decision**: 采用并行翻译 + 首批优先策略

**Rationale**:
- Google 翻译 API 单次请求约 200-500ms
- 并行发送 5 个请求 (Chrome 并发限制)
- 首批 20 条字幕分为 4 批，每批 5 条
- 预计时间：4 批 × 500ms = 2 秒 (含网络延迟)

**实施方案**:
```javascript
// 首批 20 条，分 4 批并行
const firstBatch = subtitles.slice(0, 20);
const promises = [];
for (let i = 0; i < firstBatch.length; i += 5) {
  promises.push(translateBatch(firstBatch.slice(i, i + 5)));
}
await Promise.all(promises); // 约 2-3 秒完成
```

**Alternatives Considered**:
- 流式翻译：实现复杂，不符合"全量预翻译"设计理念
- 单条串行：100 条 × 500ms = 50 秒，不可接受

---

## R2: 缓存检测与提示方案

**Decision**: 字幕加载后立即检测，提示显示 3 秒自动消失

**Rationale**:
- 缓存键基于字幕内容哈希，需在字幕内容获取后计算
- 提示显示在字幕区域顶部，不遮挡视频
- 3 秒足够用户注意到，又不会长期干扰

**实施方案**:
```javascript
// content.js
async function onSubtitlesLoaded(subtitles) {
  const hash = calculateHash(subtitles);
  const cached = await checkCache(videoId, hash);

  if (cached) {
    showCacheHint(); // 显示"已从缓存加载"
    setTimeout(hideCacheHint, 3000);
    renderSubtitles(cached.translatedsubs);
  } else {
    startTranslation(subtitles);
  }
}
```

**UI 样式**:
```css
.cache-hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #4ade80; /* 绿色成功提示 */
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  z-index: 10000;
}
```

**Alternatives Considered**:
- Toast 弹窗：可能被视频控件遮挡
- 永久提示：干扰观看体验

---

## R3: API Key 状态同步方案

**Decision**: Popup 打开时实时读取 + storage.onChanged 监听

**Rationale**:
- Popup 生命周期短，打开时读取保证最新
- storage.onChanged 监听配置页面变更
- 无需轮询，性能开销小

**实施方案**:
```javascript
// popup.js
async function updateApiKeyStatus() {
  const config = await chrome.storage.sync.get(['apiKey', 'service']);
  const configured = !!config.apiKey;
  renderApiKeyStatus(configured);
}

// 监听配置变更
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey || changes.service) {
    updateApiKeyStatus();
  }
});

popup 打开时调用 updateApiKeyStatus()
```

**UI 显示**:
```html
<div class="service-status">
  <span>翻译服务：</span>
  <select id="service">...</select>
  <span class="status-indicator configured">✓ 已配置</span>
  <span class="status-indicator unconfigured">未配置</span>
</div>
```

**Alternatives Considered**:
- 轮询：性能开销大，不必要
- 仅初始化读取：配置变更后 popup 不更新

---

## R4: 字幕语言检测方案

**Decision**: VTT 元数据解析 + 内容采样双重校验

**Rationale**:
- VTT 文件可能包含语言元数据 (`LANGUAGE:zh-CN`)
- 部分网站不提供元数据，需内容检测
- 前 10 条字幕采样足够判断语言

**实施方案**:
```javascript
// content.js
function detectSubtitleLanguage(cues) {
  // 1. 尝试解析 VTT 元数据
  const vttLanguage = parseVTTMetadata(cues.raw);
  if (vttLanguage && vttLanguage.startsWith('zh')) {
    return 'zh';
  }

  // 2. 内容采样检测
  const sampleText = cues.slice(0, 10).map(c => c.text).join(' ');
  if (containsChinese(sampleText)) {
    return 'zh';
  }

  return 'unknown'; // 非中文，不触发翻译
}

function containsChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}
```

**支持的语言代码**:
- `zh`, `zh-CN`, `zh-TW`, `zh-HK`, `Chinese`

**Alternatives Considered**:
- 使用第三方语言检测库：增加包体积，不必要
- 仅依赖元数据：部分网站不提供，可靠性低

---

## Performance Benchmarks

**Google 翻译 API 响应时间** (基于现有日志):
- 批处理大小 10: 平均 800ms
- 批处理大小 5: 平均 400ms
- 并发 4 批：首批 20 条约 1.6-2 秒

**缓存命中率** (预期):
- 重复观看场景：100%
- 同一视频不同用户：0% (本地缓存)

**Popup 打开时间**:
- 冷启动：<100ms
- 热启动：<50ms

---

## Security & Privacy Considerations

**API Key 存储**:
- 使用 chrome.storage.sync 加密存储
- 仅发送到用户配置的翻译服务
- 不在日志中输出完整 API Key

**字幕内容**:
- 仅发送到翻译 API，不经过第三方服务
- 缓存数据本地存储，不上传

---

## Next Steps

1. **Phase 1**: 基于本研究的方案创建 data-model.md 和 quickstart.md
2. **Phase 2**: `/speckit.tasks` 生成实现任务
