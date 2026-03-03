<!--
## Sync Impact Report

- **Version change**: N/A → 1.0.0 (Initial ratification)
- **Modified principles**: N/A (new document)
- **Added sections**:
  - Core Principles (6 principles)
  - User Experience Standards
  - Data & Privacy
  - Governance
- **Removed sections**: N/A
- **Templates requiring updates**:
  - `.specify/templates/plan-template.md`: ✅ No changes needed (Constitution Check section compatible)
  - `.specify/templates/spec-template.md`: ✅ No changes needed (user scenarios align with UX principles)
  - `.specify/templates/tasks-template.md`: ✅ No changes needed (phase structure compatible)
  - `.specify/templates/commands/*.md`: ✅ No changes needed
- **Follow-up TODOs**: None
-->

# AI 双语字幕扩展 Constitution

## Core Principles

### I. 配置简约 (Minimal Configuration)

所有配置项必须有合理的默认值，用户仅在需要时才进行调整。配置界面必须简洁，避免技术术语，使用通俗易懂的中文描述。

**非协商规则**：
- 默认使用 Google 翻译（免费、无需配置）
- 高级配置（如 OpenAI API）必须折叠/隐藏，用户主动展开
- 配置项数量必须控制在 10 项以内
- 所有配置项必须有"恢复默认"按钮

**Rationale**: 小型浏览器插件的目标用户是非技术人员，配置复杂度会直接阻碍使用。

### II. 自动保存 (Auto-Persist Everything)

所有用户操作、配置、进度必须自动保存到本地存储，无需用户手动保存。

**非协商规则**：
- 配置变更立即保存（使用 Chrome storage.sync 或 storage.local）
- 翻译进度实时持久化，页面刷新后可恢复
- 字幕缓存基于内容哈希，自动校验更新
- 用户无需看到"保存"按钮

**Rationale**: 减少用户反复输入操作，提升使用体验。

### III. 一键操作 (One-Click Actions)

核心功能必须在一次点击内完成，避免多层级菜单和复杂流程。

**非协商规则**：
- 开启/关闭双语字幕：1 次点击
- 切换显示模式（中英/仅中/仅英）：1 次点击循环切换
- 清除缓存：1 次点击（可加确认对话框）
- 导出字幕：1 次点击

**Rationale**: 浏览器扩展是轻量级工具，操作路径越长用户流失率越高。

### IV. 零学习成本 (Zero Learning Curve)

界面和交互必须直观，用户无需阅读文档即可使用。

**非协商规则**：
- 使用图标 + 中文文字标签（避免纯图标导致的歧义）
- 状态反馈必须清晰（如"翻译中 50%"、"缓存已清除"）
- 错误信息必须可操作（如"API Key 无效，请检查配置"而非"请求失败"）
- 不引入新概念（如"批处理大小"改为"每次翻译数量"）

### V. 隐私优先 (Privacy First)

所有用户数据必须本地存储，仅在必要时发送翻译服务。

**非协商规则**：
- API Key 使用 Chrome storage 加密存储
- 不收集浏览历史、个人信息
- 字幕内容仅发送至用户配置的翻译服务
- 不集成任何分析/追踪代码

**Rationale**: 浏览器扩展权限敏感，隐私保护是用户信任的基础。

### VI. 渐进增强 (Progressive Enhancement)

基础功能免费可用，高级功能可选配置，不强制用户升级。

**非协商规则**：
- Google 翻译默认可用（免费）
- OpenAI 兼容接口为可选项（非必须）
- 所有功能不设付费墙
- 高级设置不影响基础体验

## User Experience Standards

**界面一致性**：
- 所有文本使用简体中文
- 按钮样式统一（圆角、悬停效果）
- 错误提示使用红色，成功提示使用绿色
- 加载状态必须显示进度条或 Spinner

**性能标准**：
- 扩展弹窗加载时间 < 200ms
- 字幕渲染不阻塞视频播放
- 内存占用 < 50MB（1000 条字幕缓存）

## Data & Privacy

**存储策略**：
- 配置数据：storage.sync（跨设备同步）
- 翻译缓存：storage.local（容量优先）
- 临时状态：内存（页面关闭后清除）

**数据保留**：
- 翻译缓存默认保留 30 天
- 用户可随时清除缓存
- 卸载扩展时所有数据自动清除

## Governance

**修订流程**：
1. 提出修订建议（GitHub Issue 或 PR）
2. 说明修订原因和影响范围
3. 更新 constitution.md 并递增版本号
4. 更新相关模板（如受影响）

**版本策略**：
- MAJOR：原则删除或重大重新定义
- MINOR：新增原则或实质性扩展
- PATCH：措辞优化、非语义调整

**合规审查**：
- 每个 PR 必须通过原则符合性检查
- 新功能必须说明符合哪些原则
- 违反原则的功能需要明确标注并说明理由

---

**Version**: 1.0.0 | **Ratified**: 2026-03-03 | **Last Amended**: 2026-03-03
