# Quickstart: 翻译性能与 UI 增强

**Feature**: 翻译性能与 UI 增强
**Date**: 2026-03-03
**Branch**: 001-perf-cache-ui

---

## 开发者快速验证

### 1. 缓存加载提示验证

```bash
# 1. 打开视频页面 (如 deeplearning.ai)
# 2. 等待翻译完成
# 3. 刷新页面
# 4. 观察字幕区域顶部是否显示"已从缓存加载"提示 (绿色，3 秒消失)
# 5. 打开控制台查看日志：应包含"[BilingualSubs] 已从缓存加载"
```

**预期结果**:
- 首次访问：无缓存提示，显示翻译进度
- 刷新后：显示"已从缓存加载"提示，字幕立即显示

---

### 2. 翻译性能验证

```bash
# 1. 清除缓存 (popup 中点击"清除缓存")
# 2. 打开视频页面
# 3. 打开控制台，记录时间戳
# 4. 观察日志：
#    - "开始翻译" 时间戳 T1
#    - "首批完成 (20 条)" 时间戳 T2
#    - 验证 T2 - T1 < 5000ms
```

**预期结果**:
- 首批 20 条字幕在 5 秒内显示
- 控制台日志显示具体时间

---

### 3. API Key 配置状态验证

```bash
# 1. 打开扩展 popup
# 2. 观察服务选择区域：应显示"未配置"或无提示
# 3. 点击"高级设置"，配置 OpenAI API Key
# 4. 返回 popup，应显示"✓ API Key 已配置" (绿色)
# 5. 清除 API Key，返回 popup，"已配置"提示消失
```

**预期结果**:
- 配置后立即显示"已配置"
- 清除后立即消失

---

### 4. 源语言限制验证

```bash
# 1. 打开中文字幕视频
# 2. 观察翻译正常触发
# 3. 打开英文字幕视频 (如 YouTube 英文视频)
# 4. 观察不触发翻译，可选显示"暂不支持此语言"
```

**预期结果**:
- 中文字幕：正常翻译
- 非中文字幕：不触发翻译

---

## 用户快速上手

### 首次使用

1. 打开支持的视频网站 (如 deeplearning.ai)
2. 播放视频，扩展自动检测字幕
3. 点击扩展图标查看翻译状态
4. 等待翻译完成 (首批约 3-5 秒)
5. 观看双语字幕

### 重复观看

1. 打开之前观看过的视频
2. 字幕区域显示"已从缓存加载" (3 秒)
3. 字幕立即显示，无需等待翻译

### 配置 OpenAI 服务 (可选)

1. 点击扩展图标
2. 点击"高级设置"
3. 选择"OpenAI 兼容接口"
4. 填写 API Base URL、API Key、模型名称
5. 点击"保存配置"
6. Popup 显示"✓ API Key 已配置"

---

## 调试指南

### 查看翻译日志

```javascript
// 1. 视频页面按 F12 打开开发者工具
// 2. 打开控制台
// 3. 查看 [BilingualSubs] 前缀的日志

// 关键日志示例:
[BilingualSubs] 检测到字幕：100 条
[BilingualSubs] 语言检测：zh-CN (中文)
[BilingualSubs] 缓存未命中，开始翻译
[BilingualSubs] 首批完成：20 条，耗时 1823ms
[BilingualSubs] 翻译完成：100 条
```

### 查看缓存状态

```javascript
// 控制台执行:
const cache = await chrome.storage.local.get(['translationCaches']);
console.log('缓存数量:', Object.keys(cache.translationCaches || {}).length);

// 查看特定视频缓存
const videoCache = cache.translationCaches?.[videoId];
console.log('缓存时间:', new Date(videoCache?.createdAt));
console.log('过期时间:', new Date(videoCache?.expiresAt));
```

### 查看配置状态

```javascript
// 控制台执行:
const config = await chrome.storage.sync.get(['apiKey', 'service']);
console.log('API Key 已配置:', !!config.apiKey);
console.log('翻译服务:', config.service);
```

---

## 常见问题

### Q: 缓存提示不显示？
A: 检查以下几点：
1. 确认之前观看过此视频且翻译完成
2. 清除缓存后重新观看
3. 查看控制台是否有"缓存命中"日志

### Q: 翻译超过 5 秒？
A: 检查以下几点：
1. 网络连接是否正常
2. Google 翻译是否可访问
3. 批处理大小是否过大 (建议 10)
4. 查看控制台错误日志

### Q: API Key 状态不更新？
A: 检查以下几点：
1. 刷新 popup 页面
2. 确认配置已保存 (查看 storage.sync)
3. 重启浏览器

### Q: 英文字幕也触发翻译？
A: 语言检测可能误判，建议：
1. 查看控制台"语言检测"日志
2. 提交 Issue 附上视频 URL

---

## 性能基准

| 场景 | 目标 | 实际 |
|------|------|------|
| 首批翻译时间 | <5 秒 | ~2-3 秒 (Google) |
| 缓存命中率 (重复观看) | 100% | 100% |
| Popup 打开时间 | <200ms | ~50ms |
| 内存占用 (1000 条) | <50MB | ~30MB |

---

## 下一步

- 功能验证完成后，运行 `/speckit.tasks` 生成实现任务
- 任务执行完成后，运行 `/speckit.implement` 执行实现
