# Bug 修复指南

## 修复的问题

### Bug 1: OpenAI 配置没有保存
**原因**: `options.js` 和 `background.js` 使用不同的配置键名

**修复**: 统一使用 `config` 作为配置键名

### Bug 2: 翻译结果没有显示
**原因**: 配置未正确加载，导致使用了错误的翻译服务

## 快速修复步骤

### 方法 1: 清除旧配置（推荐）

1. **打开 Chrome 开发者工具**
   - 在任何页面按 `F12` 或 `Cmd+Option+I` (Mac)

2. **打开 Console 控制台**

3. **运行以下命令清除旧配置**:
   ```javascript
   chrome.storage.sync.clear(() => {
     console.log('配置已清除');
     location.reload();
   });
   ```

4. **重新配置**:
   - 打开扩展的 `options.html` 页面
   - 配置 OpenAI API Key
   - 保存配置

### 方法 2: 手动删除扩展数据

1. 访问 `chrome://extensions/`
2. 找到 "AI Bilingual Subtitles"
3. 点击 "详细信息"
4. 点击 "清除数据"（如果有）
5. 或者卸载扩展后重新安装

### 方法 3: 在选项中重新保存

1. 打开 `options.html`
2. 进入"翻译服务"标签页
3. 重新输入 OpenAI 配置
4. 点击"保存配置"
5. 刷新页面检查是否保存成功

## 验证修复

### 检查配置是否保存

1. 打开 `options.html`
2. 配置 OpenAI 服务
3. 保存后刷新页面
4. 检查配置是否保持

### 检查翻译是否工作

1. 打开包含字幕的视频页面
2. 点击扩展图标
3. 查看状态中的翻译服务
4. 检查翻译进度

## 调试日志

在 `options.html` 或视频页面打开开发者工具 Console，查看日志：

```
[BilingualSubs] Config loaded: {...}  // 配置加载
[BilingualSubs BG] Translating X texts using openai  // 翻译请求
[BilingualSubs] Saved to cache: subtitle_xxx  // 缓存保存
```

## 如果问题仍然存在

1. 启用调试模式:
   - 打开 `options.html`
   - 进入"常规设置"
   - 开启"调试日志"
   - 保存

2. 查看 Console 日志，寻找错误信息

3. 报告问题时提供:
   - Console 截图
   - 配置（隐藏 API Key）
   - 视频 URL
