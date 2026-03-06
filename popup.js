/**
 * AI Bilingual Subtitles Extension
 * Popup Script - 弹窗控制逻辑
 */

// ============== DOM 元素 ==============
const elements = {
  subtitleCount: document.getElementById('subtitle-count'),
  translatedCount: document.getElementById('translated-count'),
  cacheStatus: document.getElementById('cache-status'),
  currentStatus: document.getElementById('current-status'),
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
  status: document.getElementById('status'),
  // API Key 状态指示器 (US3 - T015)
  apiKeyStatus: document.getElementById('api-key-status'),
  // 翻译状态指示器
  translationStatus: document.getElementById('translation-status'),
  translationStatusText: document.getElementById('translation-status-text'),
  // 翻译模式指示器 (US1 - T010)
  translationModeDisplay: document.getElementById('translation-mode-display'),
  currentMode: document.getElementById('current-mode')
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

function setCurrentStatusClass(className = '') {
  if (!elements.currentStatus) return;
  elements.currentStatus.classList.remove('eligible', 'rejected');
  if (className) {
    elements.currentStatus.classList.add(className);
  }
}

/**
 * 显示翻译状态 (支持方法、错误等)
 */
function showTranslationStatus(message, type = 'info', duration = 0) {
  if (!elements.translationStatus) return;

  elements.translationStatus.style.display = 'flex';
  elements.translationStatus.className = `translation-status ${type}`;
  elements.translationStatusText.textContent = message;

  if (duration > 0) {
    setTimeout(() => {
      elements.translationStatus.style.display = 'none';
    }, duration);
  }
}

/**
 * 隐藏翻译状态
 */
function hideTranslationStatus() {
  if (elements.translationStatus) {
    elements.translationStatus.style.display = 'none';
  }
}

/**
 * 更新翻译模式指示器 (US1 - T012)
 */
function updateModeIndicator(service) {
  if (!elements.translationModeDisplay || !elements.currentMode) return;

  const modeName = service === 'google' ? 'Google 翻译' : 'OpenAI 接口';
  elements.currentMode.textContent = modeName;
  elements.translationModeDisplay.style.display = 'inline-block';
}

async function readStoredConfig() {
  const result = await chrome.storage.sync.get(['config']);
  return result.config || {};
}

async function saveMergedConfig(partialConfig) {
  const currentConfig = await readStoredConfig();
  const nextConfig = {
    ...currentConfig,
    ...partialConfig,
    openai: {
      ...(currentConfig.openai || {}),
      ...(partialConfig.openai || {})
    }
  };

  await chrome.storage.sync.set({ config: nextConfig });
  try {
    await chrome.runtime.sendMessage({ action: 'loadConfig' });
  } catch {
    // background 可能尚未激活
  }
  return nextConfig;
}

/**
 * 加载并显示当前翻译模式 (US1 - T014)
 */
async function loadTranslationMode() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getTranslationMode' });
    if (result) {
      updateModeIndicator(result.service);
    }
  } catch (error) {
    console.error('[BilingualSubs] Failed to load translation mode:', error);
  }
}

/**
 * 保存 OpenAI 配置（输入即保存，API Key 除外）
 */
async function saveOpenAIConfigToStorage() {
  try {
    const baseUrl = elements.openaiBaseUrl.value.trim();
    const model = elements.openaiModel.value.trim();

    if (baseUrl || model) {
      await saveMergedConfig({
        openai: {
          baseUrl,
          model
        }
      });

      console.log('[BilingualSubs] OpenAI config auto-saved');
    }
  } catch (error) {
    console.error('[BilingualSubs] Failed to auto-save config:', error);
  }
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

  // 更新 API Key 状态 (US3 - T019)
  await updateApiKeyStatus();

  // 加载翻译模式指示器 (US1 - T014)
  await loadTranslationMode();

  // 监听配置变更 (US3 - T018)
  setupApiKeyStatusListener();

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
 * 更新 API Key 状态显示 (US3 - T017)
 */
async function updateApiKeyStatus() {
  try {
    const result = await chrome.storage.sync.get(['config']);
    const hasApiKey = !!result?.config?.openai?.apiKey;

    if (elements.apiKeyStatus) {
      if (hasApiKey) {
        elements.apiKeyStatus.style.display = 'inline-block';
        elements.apiKeyStatus.innerHTML = '<span class="status-indicator configured">✓ API Key 已配置</span>';
      } else {
        elements.apiKeyStatus.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Failed to get API key status:', error);
  }
}

/**
 * 监听配置变更 (US3 - T018)
 */
function setupApiKeyStatusListener() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      updateApiKeyStatus();
    }
  });
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

      const session = status.session || null;
      if (session?.totalCount > 0) {
        const processedCount = (session.doneCount || 0) + (session.failedCount || 0);
        const percent = Math.round((processedCount / session.totalCount) * 100);
        const fallbackText = session.fallbackService === 'google' ? '（已自动降级到 Google）' : '';
        showProgress(true);
        updateProgress(percent);

        if (session.isRunning) {
          elements.currentStatus.textContent = session.failedCount > 0
            ? `已翻译 ${session.translatedCount || 0}/${session.totalCount} 条，失败 ${session.failedCount} 条${fallbackText}`
            : `已翻译 ${session.translatedCount || 0}/${session.totalCount} 条${fallbackText}`;
          setCurrentStatusClass('');
        } else if (processedCount >= session.totalCount) {
          elements.currentStatus.textContent = session.failedCount > 0
            ? `翻译完成（失败 ${session.failedCount} 条）${fallbackText}`
            : `翻译完成（已生成 ${session.translatedCount || 0} 条）${fallbackText}`;
          setCurrentStatusClass('');
          elements.cacheStatus.textContent = status.hasCache ? '✅ 已缓存' : '✅ 已就绪';
        } else {
          elements.currentStatus.textContent = session.failedCount > 0
            ? `已翻译 ${session.translatedCount || 0}/${session.totalCount} 条，失败 ${session.failedCount} 条${fallbackText}`
            : `已翻译 ${session.translatedCount || 0}/${session.totalCount} 条${fallbackText}`;
          setCurrentStatusClass('');
        }
      } else if (status.eligibility?.status === 'eligible') {
        elements.currentStatus.textContent = '英文字幕已识别';
        setCurrentStatusClass('eligible');
        showProgress(false);
      } else if (status.eligibility?.status?.startsWith('rejected')) {
        const reason = status.eligibility.reason || '拒绝生成';
        elements.currentStatus.textContent = `${reason}，请切换到英文字幕后重试`;
        setCurrentStatusClass('rejected');
        showProgress(false);
      } else {
        setCurrentStatusClass('');
        showProgress(false);
        if (!status.isTranslating && !(status.translatedCount > 0)) {
          elements.cacheStatus.textContent = '等待翻译';
        }
      }
    } else {
      elements.subtitleCount.textContent = '-';
      elements.translatedCount.textContent = '-';
      elements.cacheStatus.textContent = '未加载';
      setCurrentStatusClass('');
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

    await saveMergedConfig({
      translationService: service
    });

    // 更新翻译模式指示器 (US1 - T013)
    updateModeIndicator(service);

    // 显示当前使用的翻译方法
    if (service === 'google') {
      showTranslationStatus('正在使用 Google 翻译', 'info', 2000);
    } else {
      showTranslationStatus('正在使用 OpenAI 兼容接口', 'info', 2000);
    }
  });

  // OpenAI 配置输入框 - 输入即保存 (Base URL 和 Model)
  elements.openaiBaseUrl.addEventListener('input', () => {
    saveOpenAIConfigToStorage();
  });

  elements.openaiModel.addEventListener('input', () => {
    saveOpenAIConfigToStorage();
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

    await saveMergedConfig({
      translationService: 'openai',
      openai: {
        baseUrl: normalizedBaseUrl,
        apiKey,
        model,
        prompt: '你是一个专业的字幕翻译助手。请将以下英文内容翻译成自然流畅的中文，保持专业术语准确，译文简洁易懂。'
      }
    });

    // 更新 API Key 状态显示
    updateApiKeyStatus();

    showStatus('✅ 配置已保存', 'success', 3000);
    showTranslationStatus('配置已保存，使用 OpenAI 翻译', 'success', 3000);
  });

  // 测试翻译服务
  elements.testTranslation.addEventListener('click', async () => {
    const service = elements.translationService.value;
    elements.testTranslation.disabled = true;
    elements.testTranslation.textContent = '测试中...';

    // 显示测试状态
    if (service === 'google') {
      showTranslationStatus('正在测试 Google 翻译...', 'info');
    } else {
      showTranslationStatus('正在测试 OpenAI 接口...', 'info');
    }

    const result = await chrome.runtime.sendMessage({
      action: 'testTranslation',
      service: service
    });

    elements.testTranslation.disabled = false;
    elements.testTranslation.textContent = '测试翻译服务';

    if (result.success) {
      showTranslationStatus(`✅ 测试成功：${result.result}`, 'success', 5000);
    } else {
      showTranslationStatus(`❌ 测试失败：${result.error}`, 'error', 5000);
    }
  });

  // 开始翻译
  elements.translateBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 获取当前翻译服务
    const service = elements.translationService.value;
    const serviceName = service === 'google' ? 'Google 翻译' : 'OpenAI 接口';

    // 显示翻译状态
    showTranslationStatus(`正在使用 ${serviceName} 翻译...`, 'info');
    showProgress(true);
    elements.translateBtn.disabled = true;

    const progressInterval = setInterval(async () => {
      await updateStatus();
    }, 1000);

    chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' }, (response) => {
      clearInterval(progressInterval);
      if (chrome.runtime.lastError) {
        showTranslationStatus(`❌ 翻译失败：${chrome.runtime.lastError.message}`, 'error', 5000);
        elements.translateBtn.disabled = false;
        return;
      }

      if (response?.success) {
        showTranslationStatus(`✅ 翻译完成 (${serviceName})`, 'success', 3000);
        updateStatus();
      } else {
        const errorText = response?.suggestedAction
          ? `${response?.errorMessage || response?.error || '未知错误'}：${response.suggestedAction}`
          : (response?.error || '未知错误');
        showTranslationStatus(`❌ 翻译失败：${errorText}`, 'error', 5000);
      }
      elements.translateBtn.disabled = false;
    });
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
