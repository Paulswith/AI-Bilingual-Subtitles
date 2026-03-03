/**
 * AI Bilingual Subtitles Extension
 * Options Page Script - 高级设置页面
 */

// ============== 默认配置 ==============
const DEFAULT_CONFIG = {
  // 翻译服务
  translationService: 'google',

  // OpenAI 配置
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    prompt: '你是一个专业的字幕翻译助手。请将以下英文内容翻译成自然流畅的中文，保持专业术语准确，译文简洁易懂。'
  },

  // 显示设置
  display: {
    defaultMode: 'bilingual',
    autoTranslate: true,
    showPanel: true
  },

  // 高级设置
  advanced: {
    batchSize: 30,
    requestDelay: 200,
    cacheExpiry: 7,
    maxRetries: 3,
    debugMode: false
  }
};

// ============== 状态管理 ==============
let currentConfig = null;

// ============== DOM 元素 ==============
const elements = {
  // 标签页
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // 常规设置
  defaultMode: document.getElementById('default-mode'),
  autoTranslate: document.getElementById('auto-translate'),
  showPanel: document.getElementById('show-panel'),
  batchSize: document.getElementById('batch-size'),
  requestDelay: document.getElementById('request-delay'),
  cacheExpiry: document.getElementById('cache-expiry'),
  maxRetries: document.getElementById('max-retries'),
  debugMode: document.getElementById('debug-mode'),
  saveGeneral: document.getElementById('save-general'),
  resetGeneral: document.getElementById('reset-general'),
  generalStatus: document.getElementById('general-status'),

  // 翻译服务
  translationService: document.getElementById('translation-service'),
  googleConfig: document.getElementById('google-config'),
  openaiConfig: document.getElementById('openai-config'),
  openaiBaseUrl: document.getElementById('openai-baseurl'),
  openaiApiKey: document.getElementById('openai-apikey'),
  openaiModel: document.getElementById('openai-model'),
  openaiPrompt: document.getElementById('openai-prompt'),
  saveTranslation: document.getElementById('save-translation'),
  testTranslation: document.getElementById('test-translation'),
  translationStatus: document.getElementById('translation-status'),
  testResult: document.getElementById('test-result'),
  testResultContent: document.getElementById('test-result-content'),

  // 缓存管理
  cachedVideos: document.getElementById('cached-videos'),
  cachedItems: document.getElementById('cached-items'),
  storageUsed: document.getElementById('storage-used'),
  clearAllCache: document.getElementById('clear-all-cache'),
  refreshStats: document.getElementById('refresh-stats'),
  cacheStatus: document.getElementById('cache-status'),
  exportConfig: document.getElementById('export-config'),
  importConfig: document.getElementById('import-config'),
  importFile: document.getElementById('import-file'),
  importStatus: document.getElementById('import-status')
};

// ============== 工具函数 ==============
function showStatus(element, message, type = 'info', duration = 0) {
  element.textContent = message;
  element.className = `status ${type}`;
  element.classList.remove('hidden');

  if (duration > 0) {
    setTimeout(() => {
      element.classList.add('hidden');
    }, duration);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============== 配置管理 ==============
async function loadConfig() {
  try {
    // 使用统一的配置键名
    const result = await chrome.storage.sync.get(['config']);

    if (result.config) {
      // 合并保存的配置
      currentConfig = {
        ...DEFAULT_CONFIG,
        ...result.config,
        openai: { ...DEFAULT_CONFIG.openai, ...(result.config.openai || {}) },
        display: { ...DEFAULT_CONFIG.display, ...(result.config.display || {}) },
        advanced: { ...DEFAULT_CONFIG.advanced, ...(result.config.advanced || {}) }
      };
    } else {
      currentConfig = { ...DEFAULT_CONFIG };
    }

    // 应用配置到 UI
    applyConfigToUI(currentConfig);

    console.log('[Options] Config loaded:', currentConfig);
    return currentConfig;
  } catch (error) {
    console.error('[Options] Failed to load config:', error);
    currentConfig = { ...DEFAULT_CONFIG };
    applyConfigToUI(currentConfig);
    return currentConfig;
  }
}

async function saveConfig(config) {
  try {
    // 统一保存到一个配置对象中
    await chrome.storage.sync.set({
      config: {
        translationService: config.translationService,
        openai: config.openai,
        display: config.display,
        advanced: config.advanced
      }
    });

    console.log('[Options] Config saved:', config);

    // 通知 background script 重新加载配置
    try {
      await chrome.runtime.sendMessage({ action: 'loadConfig' });
    } catch (e) {
      // background 可能未加载
    }

    return true;
  } catch (error) {
    console.error('[Options] Failed to save config:', error);
    return false;
  }
}

function applyConfigToUI(config) {
  // 常规设置
  elements.defaultMode.value = config.display.defaultMode;
  elements.autoTranslate.checked = config.display.autoTranslate;
  elements.showPanel.checked = config.display.showPanel;
  elements.batchSize.value = config.advanced.batchSize;
  elements.requestDelay.value = config.advanced.requestDelay;
  elements.cacheExpiry.value = config.advanced.cacheExpiry;
  elements.maxRetries.value = config.advanced.maxRetries;
  elements.debugMode.checked = config.advanced.debugMode;

  // 翻译服务
  elements.translationService.value = config.translationService;
  updateServiceUI(config.translationService);

  elements.openaiBaseUrl.value = config.openai.baseUrl;
  elements.openaiApiKey.value = config.openai.apiKey;
  elements.openaiModel.value = config.openai.model;
  elements.openaiPrompt.value = config.openai.prompt;
}

function updateServiceUI(service) {
  if (service === 'openai') {
    elements.googleConfig.classList.remove('active');
    elements.openaiConfig.classList.add('active');
  } else {
    elements.googleConfig.classList.add('active');
    elements.openaiConfig.classList.remove('active');
  }
}

// ============== 标签页切换 ==============
function initTabs() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      // 更新标签页状态
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 更新内容显示
      elements.tabContents.forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${targetId}`).classList.add('active');

      // 切换到缓存标签页时刷新统计
      if (targetId === 'cache') {
        refreshCacheStats();
      }
    });
  });
}

// ============== 常规设置 ==============
function initGeneralSettings() {
  // 保存设置
  elements.saveGeneral.addEventListener('click', async () => {
    const config = {
      ...currentConfig,
      display: {
        defaultMode: elements.defaultMode.value,
        autoTranslate: elements.autoTranslate.checked,
        showPanel: elements.showPanel.checked
      },
      advanced: {
        batchSize: parseInt(elements.batchSize.value) || 30,
        requestDelay: parseInt(elements.requestDelay.value) || 200,
        cacheExpiry: parseInt(elements.cacheExpiry.value) || 7,
        maxRetries: parseInt(elements.maxRetries.value) || 3,
        debugMode: elements.debugMode.checked
      }
    };

    const success = await saveConfig(config);

    if (success) {
      currentConfig = config;
      showStatus(elements.generalStatus, '✅ 设置已保存', 'success', 3000);
    } else {
      showStatus(elements.generalStatus, '❌ 保存失败', 'error', 3000);
    }
  });

  // 恢复默认
  elements.resetGeneral.addEventListener('click', async () => {
    if (confirm('确定要恢复默认设置吗？这将覆盖您当前的配置。')) {
      applyConfigToUI(DEFAULT_CONFIG);
      const success = await saveConfig(DEFAULT_CONFIG);

      if (success) {
        currentConfig = DEFAULT_CONFIG;
        showStatus(elements.generalStatus, '✅ 已恢复默认设置', 'success', 3000);
      }
    }
  });
}

// ============== 翻译服务设置 ==============
function initTranslationSettings() {
  // 服务切换
  elements.translationService.addEventListener('change', (e) => {
    updateServiceUI(e.target.value);
  });

  // 保存配置
  elements.saveTranslation.addEventListener('click', async () => {
    const config = {
      ...currentConfig,
      translationService: elements.translationService.value,
      openai: {
        baseUrl: elements.openaiBaseUrl.value.trim() || DEFAULT_CONFIG.openai.baseUrl,
        apiKey: elements.openaiApiKey.value.trim(),
        model: elements.openaiModel.value.trim() || DEFAULT_CONFIG.openai.model,
        prompt: elements.openaiPrompt.value.trim() || DEFAULT_CONFIG.openai.prompt
      }
    };

    const success = await saveConfig(config);

    if (success) {
      currentConfig = config;
      showStatus(elements.translationStatus, '✅ 配置已保存', 'success', 3000);
    } else {
      showStatus(elements.translationStatus, '❌ 保存失败', 'error', 3000);
    }
  });

  // 测试翻译服务
  elements.testTranslation.addEventListener('click', async () => {
    const service = elements.translationService.value;

    elements.testTranslation.disabled = true;
    elements.testTranslation.textContent = '测试中...';
    elements.testResult.classList.remove('visible', 'success', 'error');

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'testTranslation',
        service: service
      });

      elements.testResult.classList.add('visible');

      if (result.success) {
        elements.testResult.classList.add('success');
        elements.testResultContent.textContent = `翻译成功: "${result.result}"`;
        showStatus(elements.translationStatus, '✅ 测试成功', 'success', 3000);
      } else {
        elements.testResult.classList.add('error');
        elements.testResultContent.textContent = `错误: ${result.error}`;
        showStatus(elements.translationStatus, `❌ 测试失败: ${result.error}`, 'error', 5000);
      }
    } catch (error) {
      elements.testResult.classList.add('visible', 'error');
      elements.testResultContent.textContent = `错误: ${error.message}`;
      showStatus(elements.translationStatus, `❌ 测试失败: ${error.message}`, 'error', 5000);
    }

    elements.testTranslation.disabled = false;
    elements.testTranslation.textContent = '测试连接';
  });
}

// ============== 缓存管理 ==============
async function refreshCacheStats() {
  try {
    // 获取所有存储数据
    const data = await chrome.storage.local.get(null);

    let videoCount = 0;
    let subtitleCount = 0;
    let totalBytes = 0;

    for (const [key, value] of Object.entries(data)) {
      const bytes = JSON.stringify(value).length;
      totalBytes += bytes;

      if (key.startsWith('subtitle_') && !key.endsWith('_config') && !key.endsWith('_progress') && !key.endsWith('_hash')) {
        videoCount++;
        if (value.subtitles) {
          subtitleCount += value.subtitles.length;
        }
      }
    }

    elements.cachedVideos.textContent = videoCount;
    elements.cachedItems.textContent = subtitleCount.toLocaleString();
    elements.storageUsed.textContent = formatBytes(totalBytes);
  } catch (error) {
    console.error('[Options] Failed to refresh cache stats:', error);
    elements.cachedVideos.textContent = '?';
    elements.cachedItems.textContent = '?';
    elements.storageUsed.textContent = '?';
  }
}

function initCacheManagement() {
  // 清除所有缓存
  elements.clearAllCache.addEventListener('click', async () => {
    if (confirm('确定要清除所有缓存吗？这将删除所有已翻译的字幕数据。')) {
      try {
        await chrome.storage.local.clear();
        await refreshCacheStats();
        showStatus(elements.cacheStatus, '✅ 所有缓存已清除', 'success', 3000);
      } catch (error) {
        showStatus(elements.cacheStatus, '❌ 清除失败', 'error', 3000);
      }
    }
  });

  // 刷新统计
  elements.refreshStats.addEventListener('click', async () => {
    elements.refreshStats.disabled = true;
    await refreshCacheStats();
    elements.refreshStats.disabled = false;
    showStatus(elements.cacheStatus, '✅ 统计已更新', 'success', 2000);
  });

  // 导出配置
  elements.exportConfig.addEventListener('click', async () => {
    try {
      const syncData = await chrome.storage.sync.get(null);
      const localData = await chrome.storage.local.get(null);

      const exportData = {
        version: chrome.runtime.getManifest().version,
        exportDate: new Date().toISOString(),
        sync: syncData,
        local: localData
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilingual-subtitles-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showStatus(elements.importStatus, '✅ 配置已导出', 'success', 3000);
    } catch (error) {
      showStatus(elements.importStatus, `❌ 导出失败: ${error.message}`, 'error', 3000);
    }
  });

  // 导入配置
  elements.importConfig.addEventListener('click', () => {
    elements.importFile.click();
  });

  elements.importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!confirm('确定要导入此配置吗？这将覆盖您当前的设置和缓存。')) {
        return;
      }

      // 导入同步存储（配置）
      if (data.sync) {
        await chrome.storage.sync.set(data.sync);
      }

      // 导入本地存储（缓存）
      if (data.local) {
        await chrome.storage.local.set(data.local);
      }

      // 重新加载配置
      await loadConfig();
      await refreshCacheStats();

      showStatus(elements.importStatus, '✅ 配置已导入', 'success', 3000);
    } catch (error) {
      showStatus(elements.importStatus, `❌ 导入失败: ${error.message}`, 'error', 3000);
    }

    // 清空文件输入
    elements.importFile.value = '';
  });
}

// ============== 初始化 ==============
async function init() {
  // 加载配置
  await loadConfig();

  // 初始化各个模块
  initTabs();
  initGeneralSettings();
  initTranslationSettings();
  initCacheManagement();

  // 初始刷新缓存统计
  await refreshCacheStats();

  console.log('[Options] Page initialized');
}

// 启动
init();
