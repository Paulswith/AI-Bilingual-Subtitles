# Chrome 扩展打包发布指南

## 方法 1：通过 Chrome 浏览器打包（最简单）

### 步骤：

1. **打开扩展管理页面**
   - 在 Chrome 浏览器地址栏输入：`chrome://extensions/`
   - 或：菜单 → 更多工具 → 扩展程序

2. **开启开发者模式**
   - 点击右上角的 "开发者模式" 开关

3. **打包扩展程序**
   - 点击 "打包扩展程序" 按钮
   - 在弹出的对话框中：
     - **扩展程序根目录**：选择本项目文件夹
       ```
       /Users/akarizo/Develop/owns/deeplearning-trans
       ```
     - **私钥文件路径**：留空（首次打包会自动生成）

4. **点击 "打包扩展程序"**
   - 成功后会生成两个文件：
     - `deeplearning-trans.crx` - 扩展安装包
     - `deeplearning-trans.pem` - 私钥文件（重要！请妥善保存）

5. **本地测试**
   - 将 `.crx` 文件拖拽到 `chrome://extensions/` 页面
   - 或直接在开发者模式下加载未打包的扩展

---

## 方法 2：命令行打包（需要 Chrome 安装）

### macOS / Linux
```bash
# 使用 Chrome 命令行参数打包
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --pack-extension=/Users/akarizo/Develop/owns/deeplearning-trans \
  --pack-extension-key=/path/to/private-key.pem

# 输出文件在当前目录
# deeplearning-trans.crx
# deeplearning-trans.pem（如果密钥不存在会创建）
```

### Windows
```cmd
"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" ^
  --pack-extension=C:\path\to\deeplearning-trans ^
  --pack-extension-key=C:\path\to\private-key.pem
```

---

## 方法 3：使用构建工具

### 使用 web-ext（推荐用于 CI/CD）

```bash
# 安装 web-ext
npm install -g web-ext

# 构建扩展
web-ext build --source-dir . --artifacts-dir ./dist

# 输出：./dist/bilingual_subtitles-2.1.0.zip
```

---

## 发布到 Chrome Web Store

### 准备工作

1. **创建开发者账号**
   - 访问：https://chrome.google.com/webstore/devconsole
   - 支付一次性注册费：$5 USD
   - 等待账号审核（通常 1-2 个工作日）

2. **准备商店素材**

   | 素材 | 规格 | 用途 |
   |------|------|------|
   | 小图标 | 128x128 | 商店列表显示 |
   | 大图标 | 440x280 | 扩展详情页 |
   | 截图 1 | 1280x800 或 640x400 | 至少 1 张 |
   | 截图 2 | 1280x800 或 640x400 | 推荐 2-5 张 |
   | 宣传视频 | YouTube 链接 | 可选 |

3. **准备文案**
   - 已准备好 `STORE_LISTING.md`

### 发布步骤

1. **登录开发者控制台**
   - https://chrome.google.com/webstore/devconsole

2. **创建新项目**
   - 点击 "新增项目" / "New Item"
   - 上传 `.crx` 文件或 `.zip` 包

3. **填写商店信息**

   **主商店 listing**：
   ```
   语言：简体中文
   标题：AI Bilingual Subtitles - 双语字幕翻译
   简短描述：为在线视频添加 AI 驱动的中英双语字幕...
   详细描述：参考 STORE_LISTING.md
   分类：生产力 / 教育
   ```

   **隐私政策**：
   - 上传 `PRIVACY.md` 内容到 GitHub Pages 或其他可公开访问的 URL
   - 在隐私政策字段填入 URL

4. **上传素材**
   - 图标、截图按提示上传

5. **设置权限**
   - 勾选声明的权限和用途说明

6. **提交审核**
   - 点击 "提交审核"
   - 审核时间：通常 1-3 个工作日
   - 状态变更：草稿 → 审核中 → 已发布

---

## 本地测试清单

发布前请在本地测试以下功能：

- [ ] 在 deeplearning.ai 测试字幕加载
- [ ] 切换翻译服务（Google / OpenAI）
- [ ] 验证缓存功能（刷新页面后不重复翻译）
- [ ] 测试高级设置页面
- [ ] 导出字幕功能
- [ ] 清除缓存功能
- [ ] 在不同网站测试兼容性

---

## 常见问题

### Q: 打包时提示"无法找到清单文件"？
A: 确保选择的目录包含 `manifest.json` 文件。

### Q: 私钥文件丢了怎么办？
A: 需要重新打包并更新扩展程序 ID，已安装用户无法自动更新。

### Q: 审核被拒绝怎么办？
A: 查看拒绝原因，通常是：
- 权限说明不清晰
- 隐私政策缺失
- 功能与描述不符
修改后重新提交即可。

### Q: 如何更新已发布的扩展？
A:
1. 修改 `manifest.json` 中的 `version` 号
2. 重新打包
3. 在开发者控制台上传新版本
4. 用户会自动收到更新

### Q: 如何分发测试版？
A: 使用 Chrome 的 "信任此开发者" 渠道：
1. 打包时指定 `--pack-without-prompt`
2. 通过其他渠道分发 `.crx` 文件
3. 用户手动安装

---

## 快速命令参考

```bash
# 运行验证脚本
./validate.sh

# 查看当前版本
grep '"version"' manifest.json

# 更新版本号（手动编辑 manifest.json）

# 使用 web-ext 打包
web-ext build
```

---

## 发布后检查清单

- [ ] 在 Chrome Web Store 查看扩展页面
- [ ] 测试从商店安装
- [ ] 验证自动更新功能
- [ ] 监控用户反馈和评价
- [ ] 回复用户问题
