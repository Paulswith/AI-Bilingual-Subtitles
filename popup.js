/**
 * AI Bilingual Subtitles Extension
 * Popup Script - 弹窗控制逻辑
 */

// ============== DOM 元素 ==============
const elements = {
  subtitleCount: document.getElementById('subtitle-count'),
  translatedCount: document.getElementById('translated-count'),
  cacheStatus: document.getElementById('cache-status'),
  progressContainer: document.getElementById('progress-container'),
  progressFill: document.getElementById('progress-fill'),
  displayMode: document.getElementById('display-mode'),
  toggleSubs: document.getElementById('toggle-subs'),
  togglePanel: document.getElementById('toggle-panel'),
  translationService: document.getElementById('translation-service'),
  serviceDesc: document.getElementById('service-desc'),
  openaiConfig: document.getElementById('openai-config'),
  openaiBaseUrl: document.getElementById('openai-baseurl'),
  openaiApiKey: document.getElementById('openai-apikey'),
  openaiModel: document.getElementById('openai-model'),
  saveOpenaiConfig: document.getElementById('save-openai-config'),
  testTranslation: document.getElementById('test-translation'),
  translateBtn: document.getElementById('translate-btn'),
  clearCacheBtn: document.getElementById('clear-cache-btn'),
  exportBtn: document.getElementById('export-btn'),
  status: document.getElementById('status')
};

// ============== 工具函数 ==============
function showStatus(message, type = 'loading', duration = 0) {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');

  if (duration > 0) {
    setTimeout(hideStatus, duration);
  }
}

function hideStatus() {
  elements.status.classList.add('hidden');
}

function showProgress(show = true) {
  elements.progressContainer.classList.toggle('hidden', !show);
}

function updateProgress(percent) {
  elements.progressFill.style.width = `${percent}%`;
}

// ============== 初始化 ==============
async function init() {
  // 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    showStatus('无法访问当前页面', 'error');
    return;
  }

  // 直接从 storage 加载配置
  await loadConfig();

  // 获取字幕状态
  await updateStatus();

  // 绑定事件
  bindEvents();
}

/**
 * 加载配置（统一使用 'config' 键）
 */
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['config']);
    if (result.config) {
      elements.translationService.value = result.config.translationService || 'google';
      elements.openaiBaseUrl.value = result.config.openai?.baseUrl || '';
      elements.openaiModel.value = result.config.openai?.model || '';

      // 根据服务显示/隐藏配置项
      updateServiceUI(result.config.translationService || 'google');
    } else {
      elements.translationService.value = 'google';
      updateServiceUI('google');
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

/**
 * 更新服务 UI
 */
function updateServiceUI(service) {
  if (service === 'openai') {
    elements.openaiConfig.classList.remove('hidden');
    elements.serviceDesc.textContent = '使用 AI 大模型翻译，质量更高但需要 API Key';
  } else {
    elements.openaiConfig.classList.add('hidden');
    elements.serviceDesc.textContent = '使用 Google 免费翻译接口，无需配置';
  }
}

/**
 * 更新字幕状态
 */
async function updateStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 检查是否是支持的页面
    if (!tab.url?.includes('learn.deeplearning.ai')) {
      // 仍然允许使用，但显示提示
      showStatus('⚠️ 请在支持的视频网站使用此扩展', 'loading', 5000);
    }

    const status = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }).catch(() => null);

    if (status) {
      elements.subtitleCount.textContent = status.subtitleCount || 0;
      elements.translatedCount.textContent = status.translatedCount || 0;
      elements.cacheStatus.textContent = status.hasCache ? '✅ 已缓存' : '❌ 无缓存';

      if (status.isTranslating) {
        elements.currentStatus.textContent = `翻译中... ${status.progress}%`;
        showProgress(true);
        updateProgress(status.progress);
      } else if (status.translatedCount > 0) {
        elements.cacheStatus.textContent = '✅ 已就绪';
      } else {
        elements.cacheStatus.textContent = '等待翻译';
      }
    } else {
      elements.subtitleCount.textContent = '-';
      elements.translatedCount.textContent = '-';
      elements.cacheStatus.textContent = '未加载';
    }
  } catch (error) {
    console.error('Failed to get status:', error);
    elements.cacheStatus.textContent = '未加载';
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 显示模式切换
  elements.displayMode.addEventListener('change', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, {
      action: 'setMode',
      mode: e.target.value
    });
  });

  // 切换字幕显示
  elements.toggleSubs.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    elements.toggleSubs.textContent = result.enabled ? '隐藏字幕' : '显示字幕';
  });

  // 打开控制面板
  elements.togglePanel.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
    window.close();
  });

  // 翻译服务切换
  elements.translationService.addEventListener('change', async (e) => {
    const service = e.target.value;
    updateServiceUI(service);

    // 直接保存到 storage
    await chrome.storage.sync.set({
      config: {
        translationService: service
      }
    });

    // 通知 background
    try {
      await chrome.runtime.sendMessage({ action: 'loadConfig' });
    } catch (e) {}
  });

  // 保存 OpenAI 配置
  elements.saveOpenaiConfig.addEventListener('click', async () => {
    const baseUrl = elements.openaiBaseUrl.value.trim() || 'https://api.openai.com/v1';
    const apiKey = elements.openaiApiKey.value.trim();
    const model = elements.openaiModel.value.trim() || 'gpt-3.5-turbo';

    if (!apiKey) {
      showStatus('请输入 API Key', 'error', 3000);
      return;
    }

    // 移除末尾的斜杠
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

    // 直接保存到 storage
    await chrome.storage.sync.set({
      config: {
        translationService: 'openai',
        openai: {
          baseUrl: normalizedBaseUrl,
          apiKey: apiKey,
          model: model,
          prompt: '你是一个专业的字幕翻译助手。请将以下英文内容翻译成自然流畅的中文，保持专业术语准确，译文简洁易懂。'
        }
      }
    });

    // 通知 background
    try {
      await chrome.runtime.sendMessage({ action: 'loadConfig' });
    } catch (e) {}

    showStatus('✅ 配置已保存', 'success', 3000);
  });

  // 测试翻译服务
  elements.testTranslation.addEventListener('click', async () => {
    const service = elements.translationService.value;
    elements.testTranslation.disabled = true;
    elements.testTranslation.textContent = '测试中...';

    const result = await chrome.runtime.sendMessage({
      action: 'testTranslation',
      service: service
    });

    elements.testTranslation.disabled = false;
    elements.testTranslation.textContent = '测试翻译服务';

    if (result.success) {
      showStatus(`✅ 测试成功：${result.result}`, 'success', 5000);
    } else {
      showStatus(`❌ 测试失败：${result.error}`, 'error', 5000);
    }
  });

  // 开始翻译
  elements.translateBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    showStatus('正在翻译...', 'loading');
    showProgress(true);
    elements.translateBtn.disabled = true;

    chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' }, (response) => {
      if (response?.success) {
        showStatus('✅ 翻译完成!', 'success', 3000);
        updateStatus();
      } else {
        showStatus('❌ 翻译失败', 'error', 3000);
      }
      elements.translateBtn.disabled = false;
    });

    // 定期更新进度
    const progressInterval = setInterval(async () => {
      await updateStatus();
    }, 1000);

    // 30 秒后停止更新
    setTimeout(() => {
      clearInterval(progressInterval);
      elements.translateBtn.disabled = false;
    }, 30000);
  });

  // 清除缓存
  elements.clearCacheBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.tabs.sendMessage(tab.id, { action: 'clearCache' });
    showStatus('✅ 缓存已清除，刷新页面重新翻译', 'success', 3000);
    updateStatus();
  });

  // 导出字幕
  elements.exportBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'export' });

    if (response?.srt) {
      const blob = new Blob([response.srt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bilingual_subtitles.srt';
      a.click();
      URL.revokeObjectURL(url);
      showStatus('✅ 字幕已导出', 'success', 3000);
    } else {
      showStatus('❌ 导出失败', 'error', 3000);
    }
  });
}

// 启动
init();
