/**
 * AI Bilingual Subtitles Extension
 * Background Script - 处理翻译 API 调用和配置管理
 * 功能：双翻译服务、重试机制、错误分类、请求限流
 */

// ============== 默认配置 ==============
const DEFAULT_CONFIG = {
  // 翻译服务：'google' | 'openai'
  translationService: 'google',

  // 目标语言
  targetLanguage: 'zh-CN',

  // OpenAI 兼容接口配置
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    // 自定义提示词
    prompt: '你是一个专业的字幕翻译助手。请将以下英文内容翻译成自然流畅的中文，保持专业术语准确，译文简洁易懂。'
  },

  // 翻译批处理大小
  batchSize: 100,

  // 请求间隔 (ms)
  requestDelay: 50,

  // 重试配置
  maxRetries: 3,
  retryBaseDelay: 1000, // 基础重试延迟 (ms)
  retryMaxDelay: 30000, // 最大重试延迟 (ms)

  // 超时配置 (ms) - 用户可配置，默认 30 秒
  timeout: 30000
};

// ============== 配置管理 ==============
let config = null;
// 翻译模式状态跟踪
let translationModeState = {
  service: 'google',
  displayName: 'Google 翻译',
  isActive: false
};
let lastEligibilitySnapshot = null;

// 从 storage 加载配置（统一使用 'config' 键）
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['config']);
    if (result.config) {
      config = {
        ...DEFAULT_CONFIG,
        ...result.config,
        openai: { ...DEFAULT_CONFIG.openai, ...(result.config.openai || {}) },
        display: { ...DEFAULT_CONFIG.display, ...(result.config.display || {}) },
        advanced: { ...DEFAULT_CONFIG.advanced, ...(result.config.advanced || {}) }
      };
    } else {
      config = { ...DEFAULT_CONFIG };
      // 初始化默认配置到 storage
      await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
    }
    // 同步翻译模式状态
    updateTranslationModeState(config.translationService);
    console.log('[BilingualSubs] Config loaded:', config);
  } catch (error) {
    console.error('[BilingualSubs] Failed to load config:', error);
    config = { ...DEFAULT_CONFIG };
  }
}

// 更新翻译模式状态
function updateTranslationModeState(service) {
  translationModeState.service = service;
  translationModeState.displayName = service === 'google' ? 'Google 翻译' : 'OpenAI 接口';
  translationModeState.isActive = true;
}

// 保存配置（统一保存到一个对象）
async function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  if (newConfig?.translationService) {
    updateTranslationModeState(newConfig.translationService);
  }
  await chrome.storage.sync.set({ config: config });
  console.log('[BilingualSubs] Config saved');
}

// 初始化加载配置
loadConfig();

// ============== 翻译服务实现 ==============

/**
 * 错误类型分类
 */
const ErrorType = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * 错误消息常量 (中文)
 * 注意：必须在 ErrorType 定义之后
 */
const ERROR_MESSAGES = {
  [ErrorType.NETWORK_ERROR]: {
    message: '网络连接失败',
    suggestedAction: '请检查网络连接或稍后重试'
  },
  [ErrorType.API_ERROR]: {
    message: '翻译 API 请求失败',
    suggestedAction: '请检查翻译服务配置或稍后重试'
  },
  [ErrorType.RATE_LIMIT_ERROR]: {
    message: '请求过于频繁',
    suggestedAction: '请稍后重试'
  },
  [ErrorType.AUTH_ERROR]: {
    message: 'API 认证失败',
    suggestedAction: '请检查 API Key 配置是否正确'
  },
  [ErrorType.TIMEOUT_ERROR]: {
    message: '翻译请求超时',
    suggestedAction: '请检查网络连接或在高级设置中增加超时时间'
  },
  [ErrorType.UNKNOWN_ERROR]: {
    message: '未知错误',
    suggestedAction: '请重试或查看控制台日志'
  }
};

function getUserErrorPayload(error) {
  const type = error?.type || classifyError(error, error?.statusCode);
  const detail = ERROR_MESSAGES[type] || ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR];
  return {
    errorType: type,
    errorMessage: detail.message,
    suggestedAction: detail.suggestedAction
  };
}

/**
 * 分类错误类型
 */
function classifyError(error, statusCode) {
  if (statusCode === 429) {
    return ErrorType.RATE_LIMIT_ERROR;
  }
  if (statusCode === 401 || statusCode === 403) {
    return ErrorType.AUTH_ERROR;
  }
  if (statusCode >= 500 || statusCode === undefined) {
    return ErrorType.NETWORK_ERROR;
  }
  if (statusCode >= 400) {
    return ErrorType.API_ERROR;
  }
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return ErrorType.NETWORK_ERROR;
  }
  if (error.name === 'AbortError') {
    return ErrorType.TIMEOUT_ERROR;
  }
  return ErrorType.UNKNOWN_ERROR;
}

/**
 * 带重试的 fetch 请求
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutMs = config?.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      // 检查是否是速率限制
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`[BilingualSubs] Rate limited, retrying after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`翻译请求超时（${timeoutMs}ms）`);
        timeoutError.type = ErrorType.TIMEOUT_ERROR;
        lastError = timeoutError;
      } else {
        lastError = error;
      }

      // 网络错误，使用指数退避
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`[BilingualSubs] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google 单条翻译（最多 2 次重试）
 */
async function googleTranslateOne(text) {
  const targetLang = config.targetLanguage || 'zh-CN';
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetchWithRetry(url, { method: 'GET' }, 0);

      if (!response.ok) {
        if (response.status === 429 && attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
          continue;
        }
        const httpError = new Error(`Google 翻译请求失败：HTTP ${response.status}`);
        httpError.type = classifyError(httpError, response.status);
        throw httpError;
      }

      const data = await response.json();
      const translated = Array.isArray(data?.[0]) ? data[0].map((item) => item?.[0] || '').join('') : '';
      if (!translated.trim()) {
        const emptyError = new Error('Google 翻译返回空结果');
        emptyError.type = ErrorType.API_ERROR;
        throw emptyError;
      }
      return translated;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      await sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
    }
  }

  throw new Error('Google 单条翻译失败');
}

/**
 * OpenAI 单条翻译（最多 2 次重试）
 */
async function openaiTranslateOne(text) {
  const { baseUrl, apiKey, model, prompt } = config.openai;
  const targetLang = config.targetLanguage || 'zh-CN';
  const maxRetries = 2;

  if (!apiKey) {
    const authError = new Error('OpenAI API Key 未配置');
    authError.type = ErrorType.AUTH_ERROR;
    throw authError;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `将以下英文翻译成${targetLang}，只返回译文，不要任何额外说明：${text}` }
          ],
          temperature: 0.3,
          max_tokens: 600
        })
      }, 0);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(errorData?.error?.message || `OpenAI 请求失败：HTTP ${response.status}`);
        err.type = classifyError(err, response.status);
        throw err;
      }

      const data = await response.json();
      const translated = data?.choices?.[0]?.message?.content?.trim() || '';
      if (!translated || translated === text) {
        const invalidError = new Error('OpenAI 翻译结果无效');
        invalidError.type = ErrorType.API_ERROR;
        throw invalidError;
      }
      return translated;
    } catch (error) {
      if (attempt >= maxRetries || error?.type === ErrorType.AUTH_ERROR) {
        throw error;
      }
      await sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
    }
  }

  throw new Error('OpenAI 单条翻译失败');
}

/**
 * 统一单条翻译入口
 */
async function translateOne(text, service = null) {
  const targetService = service || config.translationService;
  const normalizedText = typeof text === 'string' ? text.trim() : '';

  if (!normalizedText) {
    return '';
  }

  try {
    if (targetService === 'openai') {
      return {
        translation: await openaiTranslateOne(normalizedText),
        serviceUsed: 'openai',
        fallbackFrom: null
      };
    }
    return {
      translation: await googleTranslateOne(normalizedText),
      serviceUsed: 'google',
      fallbackFrom: null
    };
  } catch (error) {
    // OpenAI 失败时自动降级到 Google
    if (targetService === 'openai') {
      try {
        return {
          translation: await googleTranslateOne(normalizedText),
          serviceUsed: 'google',
          fallbackFrom: 'openai'
        };
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw error;
  }
}

/**
 * 测试翻译服务连接
 */
async function testTranslationService(service = null) {
  const targetService = service || config.translationService;
  try {
    const result = await translateOne('Hello, this is a test.', targetService);
    return { success: true, result: result.translation, serviceUsed: result.serviceUsed, fallbackFrom: result.fallbackFrom };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== 消息处理 ==============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'translateOne':
      translateOne(message.text, message.service)
        .then((result) => {
          sendResponse({
            success: true,
            translation: result.translation,
            serviceUsed: result.serviceUsed,
            fallbackFrom: result.fallbackFrom
          });
        })
        .catch((error) => {
          const userError = getUserErrorPayload(error);
          sendResponse({
            success: false,
            error: error.message,
            errorType: userError.errorType,
            errorMessage: userError.errorMessage,
            suggestedAction: userError.suggestedAction
          });
        });
      return true;

    case 'translate':
      // 兼容旧消息：内部逐条串行调用 translateOne
      (async () => {
        const texts = Array.isArray(message.texts) ? message.texts : [];
        const results = [];
        for (const text of texts) {
          try {
            const result = await translateOne(text, message.service);
            results.push(result.translation);
          } catch {
            results.push('');
          }
          if ((config?.requestDelay || 0) > 0) {
            await sleep(config.requestDelay);
          }
        }
        sendResponse({ success: true, results });
      })()
        .catch((error) => {
          const userError = getUserErrorPayload(error);
          sendResponse({
            success: false,
            error: error.message,
            errorType: userError.errorType,
            errorMessage: userError.errorMessage,
            suggestedAction: userError.suggestedAction
          });
        })
        .finally(() => {});
      return true;

    case 'getConfig':
      sendResponse({
        translationService: config.translationService,
        openai: {
          baseUrl: config.openai.baseUrl,
          model: config.openai.model,
          hasApiKey: !!config.openai.apiKey
        }
      });
      break;

    case 'setConfig':
      saveConfig(message.config)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'testTranslation':
      testTranslationService(message.service)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'loadConfig':
      loadConfig().then(() => sendResponse({ success: true, config }));
      return true;

    // 获取当前翻译模式
    case 'getTranslationMode':
      sendResponse({
        service: translationModeState.service,
        displayName: translationModeState.displayName,
        isConfigured: translationModeState.service !== 'openai' || !!config?.openai?.apiKey
      });
      break;

    // 新增缓存相关消息处理
    case 'checkCache':
      checkCache(message.videoId, message.subtitleHash)
        .then(result => sendResponse(result));
      return true;

    case 'saveCache':
      saveCache(message.videoId, message.subtitleHash, message.translatedSubs)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'clearCache':
      clearCache(message.videoId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'calculateHash':
      const hash = calculateHash(message.content);
      sendResponse({ hash });
      break;

    case 'subtitleEligibility':
      lastEligibilitySnapshot = message.payload || null;
      if (lastEligibilitySnapshot?.status === 'eligible') {
        console.log('[BilingualSubs BG] 已识别英文字幕:', lastEligibilitySnapshot);
      } else if (lastEligibilitySnapshot?.status?.startsWith('rejected')) {
        console.log('[BilingualSubs BG] 拒绝生成:', lastEligibilitySnapshot);
      } else {
        console.log('[BilingualSubs BG] 字幕资格状态:', lastEligibilitySnapshot);
      }
      sendResponse({ success: true });
      break;

    case 'retryEligibilityCheck':
      console.log('[BilingualSubs BG] 收到资格重试请求:', message.payload || {});
      sendResponse({ success: true });
      break;
  }
});

// ============== 安装/更新处理 ==============
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[BilingualSubs] Extension installed');
    // 初始化默认配置
    chrome.storage.sync.set({ config: DEFAULT_CONFIG });
  } else if (details.reason === 'update') {
    console.log('[BilingualSubs] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

console.log('[BilingualSubs] Background script loaded');

// ============== 工具函数 ==============

/**
 * 计算字幕内容哈希 (FNV-1a 算法)
 * @param {string} content - 字幕内容
 * @returns {string} 16 字符哈希值
 */
function calculateHash(content) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 检查缓存
 * @param {string} videoId - 视频 ID
 * @param {string} subtitleHash - 字幕内容哈希
 * @returns {Promise<{hit: boolean, data?: object}>}
 */
async function checkCache(videoId, subtitleHash) {
  try {
    // videoId 已经是完整的 cacheKey (如 sub_domain_abc123)
    const result = await chrome.storage.local.get([videoId, `${videoId}_hash`]);

    if (result[videoId] && result[`${videoId}_hash`] === subtitleHash) {
      const cacheData = result[videoId];
      // 检查缓存是否过期 (30 天)
      const now = Date.now();
      const expiresAt = cacheData.expiresAt || (cacheData.timestamp + 30 * 24 * 60 * 60 * 1000);

      if (now < expiresAt) {
        console.log('[BilingualSubs] Cache hit:', videoId);
        return { hit: true, data: cacheData };
      } else {
        console.log('[BilingualSubs] Cache expired:', videoId);
        await clearCache(videoId);
      }
    }
    return { hit: false };
  } catch (error) {
    console.error('[BilingualSubs] checkCache error:', error);
    return { hit: false };
  }
}

/**
 * 保存缓存
 * @param {string} videoId - 视频 ID
 * @param {string} subtitleHash - 字幕内容哈希
 * @param {Array} translatedSubs - 翻译后的字幕
 */
async function saveCache(videoId, subtitleHash, translatedSubs) {
  try {
    // videoId 已经是完整的 cacheKey (如 sub_domain_abc123)
    const cacheKey = videoId;
    const cacheData = {
      translatedSubs: translatedSubs,
      timestamp: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 天后过期
      accessCount: 1
    };

    await chrome.storage.local.set({
      [cacheKey]: cacheData,
      [`${cacheKey}_hash`]: subtitleHash
    });

    console.log('[BilingualSubs] Cache saved:', videoId);
  } catch (error) {
    console.error('[BilingualSubs] saveCache error:', error);
  }
}

/**
 * 清除指定视频的缓存
 * @param {string} videoId - 视频 ID
 */
async function clearCache(videoId) {
  try {
    // videoId 已经是完整的 cacheKey (如 sub_domain_abc123)
    await chrome.storage.local.remove([videoId, `${videoId}_hash`]);
    console.log('[BilingualSubs] Cache cleared:', videoId);
  } catch (error) {
    console.error('[BilingualSubs] clearCache error:', error);
  }
}
