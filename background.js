/**
 * AI Bilingual Subtitles Extension
 * Background Script - 处理翻译 API 调用和配置管理
 * 功能：双翻译服务、重试机制、错误分类、请求限流
 */

// ============== 默认配置 ==============
const DEFAULT_CONFIG = {
  // 翻译服务：'google' | 'openai'
  translationService: 'google',

  // OpenAI 兼容接口配置
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    // 自定义提示词
    prompt: '你是一个专业的字幕翻译助手。请将以下英文内容翻译成自然流畅的中文，保持专业术语准确，译文简洁易懂。'
  },

  // 翻译批处理大小
  batchSize: 30,

  // 请求间隔 (ms)
  requestDelay: 100,

  // 重试配置
  maxRetries: 3,
  retryBaseDelay: 1000, // 基础重试延迟 (ms)
  retryMaxDelay: 30000, // 最大重试延迟 (ms)
};

// ============== 配置管理 ==============
let config = null;

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
    console.log('[BilingualSubs] Config loaded:', config);
  } catch (error) {
    console.error('[BilingualSubs] Failed to load config:', error);
    config = { ...DEFAULT_CONFIG };
  }
}

// 保存配置（统一保存到一个对象）
async function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  await chrome.storage.sync.set({ config: config });
  console.log('[BilingualSubs] Config saved');
}

// 初始化时加载配置
loadConfig();

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
    try {
      const response = await fetch(url, options);

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
      lastError = error;

      // 网络错误，使用指数退避
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`[BilingualSubs] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Google Translate API (免费方案)
 * 带重试机制和错误处理
 */
async function googleTranslate(texts, targetLang = 'zh-CN') {
  const results = [];
  const maxRetries = 3;

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    let success = false;

    for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 429) {
            // 速率限制，等待更长时间
            const delay = Math.min(5000 * Math.pow(2, attempt), 60000);
            console.log(`[BilingualSubs] Google rate limited, waiting ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        let translated = '';
        if (data && data[0]) {
          translated = data[0].map(item => item[0]).join('');
        }

        results.push(translated || text);
        success = true;

      } catch (error) {
        console.error(`[BilingualSubs] Google Translate attempt ${attempt + 1} failed:`, error.message);

        if (attempt === maxRetries) {
          // 所有重试失败，使用原文
          console.warn(`[BilingualSubs] Google Translate failed after ${maxRetries + 1} attempts, using original text`);
          results.push(text);
        } else if (attempt < maxRetries) {
          // 指数退避
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 请求间隔，避免触发限流
    if (i < texts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, config.requestDelay));
    }
  }

  return results;
}

/**
 * OpenAI 兼容接口翻译
 * 支持任何 OpenAI API 兼容的服务 (如 Azure OpenAI, DeepSeek, 月之暗面等)
 * 带重试机制和错误分类
 */
async function openaiTranslate(texts, targetLang = '中文') {
  const { baseUrl, apiKey, model, prompt } = config.openai;

  if (!apiKey) {
    const error = new Error('OpenAI API Key 未配置');
    error.type = ErrorType.AUTH_ERROR;
    throw error;
  }

  // 批量翻译，将所有字幕合并成一个请求
  const promptText = `请将以下英文视频字幕翻译成${targetLang}，保持专业术语的准确性。
每行一条字幕，只返回翻译结果，不要添加任何额外说明：

${texts.join('\n')}`;

  const url = `${baseUrl}/chat/completions`;
  const maxRetries = config.maxRetries || 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: prompt
            },
            {
              role: 'user',
              content: promptText
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        })
      }, maxRetries - attempt);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorType = classifyError(new Error(errorData.error?.message || 'API error'), response.status);

        // 认证错误不重试
        if (errorType === ErrorType.AUTH_ERROR) {
          const error = new Error(`API 认证失败：${response.status} - ${errorData.error?.message || 'Invalid API key'}`);
          error.type = errorType;
          throw error;
        }

        // 速率限制
        if (errorType === ErrorType.RATE_LIMIT_ERROR) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(5000 * Math.pow(2, attempt), 30000);
          console.log(`[BilingualSubs] OpenAI rate limited, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`API 请求失败：${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const translated = data.choices[0].message.content;

      // 分割翻译结果，处理可能的各种换行符
      const lines = translated.split(/\r?\n/).filter(line => line.trim());

      // 如果返回的行数与输入不匹配，尝试降级处理
      if (lines.length !== texts.length) {
        console.warn(`[BilingualSubs] 翻译结果行数 (${lines.length}) 与输入 (${texts.length}) 不匹配，尝试逐条翻译`);
        return await openaiTranslateBatch(texts, targetLang);
      }

      return lines;

    } catch (error) {
      // 认证错误直接抛出
      if (error.type === ErrorType.AUTH_ERROR) {
        throw error;
      }

      if (attempt === maxRetries) {
        console.error(`[BilingualSubs] OpenAI Translate failed after ${maxRetries + 1} attempts:`, error.message);
        // 降级到逐条翻译
        return await openaiTranslateBatch(texts, targetLang);
      }

      console.log(`[BilingualSubs] OpenAI attempt ${attempt + 1} failed:`, error.message);

      // 指数退避
      const delay = Math.min(config.retryBaseDelay * Math.pow(2, attempt), config.retryMaxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 不应到达这里，但为了安全
  throw new Error('OpenAI translation failed');
}

/**
 * OpenAI 逐条翻译（降级方案）
 * 带重试机制
 */
async function openaiTranslateBatch(texts, targetLang = '中文') {
  const { baseUrl, apiKey, model, prompt } = config.openai;
  const results = [];
  const maxRetriesPerItem = 2;

  for (const text of texts) {
    let translated = text; // 默认使用原文

    for (let attempt = 0; attempt <= maxRetriesPerItem; attempt++) {
      try {
        const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: `将以下英文翻译成${targetLang}，只返回译文：${text}` }
            ],
            temperature: 0.3,
            max_tokens: 500
          })
        }, 1);

        if (response.ok) {
          const data = await response.json();
          translated = data.choices[0].message.content || text;
          break;
        }
      } catch (error) {
        if (attempt === maxRetriesPerItem) {
          console.error('[BilingualSubs] OpenAI batch translate failed for item:', error.message);
        } else {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    results.push(translated);

    // 请求间隔
    await new Promise(resolve => setTimeout(resolve, config.requestDelay));
  }

  return results;
}

/**
 * 统一翻译入口
 * 带错误分类和降级处理
 */
async function translate(texts, service = null) {
  const targetService = service || config.translationService;

  console.log('[BilingualSubs BG] Translating', texts.length, 'texts using', targetService);

  try {
    switch (targetService) {
      case 'google':
        return await googleTranslate(texts);
      case 'openai':
        return await openaiTranslate(texts);
      default:
        return await googleTranslate(texts);
    }
  } catch (error) {
    console.error('[BilingualSubs BG] Translation error:', error.message);

    // 错误分类日志
    if (error.type) {
      console.log(`[BilingualSubs BG] Error type: ${error.type}`);
    }

    // 非 Google 翻译时尝试降级
    if (targetService !== 'google') {
      console.log('[BilingualSubs BG] Falling back to Google Translate');
      try {
        return await googleTranslate(texts);
      } catch (googleError) {
        console.error('[BilingualSubs BG] Google Translate also failed:', googleError.message);
      }
    }

    // 完全失败时返回原文
    throw error;
  }
}

/**
 * 测试翻译服务连接
 */
async function testTranslationService(service = null) {
  const targetService = service || config.translationService;
  const testText = ['Hello, this is a test.'];

  try {
    const result = await translate(testText, targetService);
    return { success: true, result: result[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== 消息处理 ==============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'translate':
      translate(message.texts, message.service)
        .then(results => sendResponse({ success: true, results }))
        .catch(error => {
          console.error('[BilingualSubs BG] Error:', error);
          sendResponse({ success: false, error: error.message, results: message.texts });
        });
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
  }
});

// ============== 安装/更新处理 ==============
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[BilingualSubs] Extension installed');
    // 初始化默认配置
    chrome.storage.sync.set({ translationConfig: DEFAULT_CONFIG });
  } else if (details.reason === 'update') {
    console.log('[BilingualSubs] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

console.log('[BilingualSubs] Background script loaded');
