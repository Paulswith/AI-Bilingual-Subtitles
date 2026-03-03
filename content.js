/**
 * AI Bilingual Subtitles Extension
 * Content Script - 主逻辑
 * 功能：全量预翻译、缓存管理、字幕显示
 */

// ============== 配置 ==============
let CONFIG = {
  // 字幕显示样式
  subtitleStyle: {
    fontSize: '18px',
    lineHeight: '1.4',
    background: 'rgba(0, 0, 0, 0.7)',
    padding: '8px 16px',
    borderRadius: '4px',
  },
  // 自动翻译延迟 (页面加载后)
  autoTranslateDelay: 500,
  // 缓存有效期 (毫秒)
  cacheExpiry: 7 * 24 * 60 * 60 * 1000, // 7 天
  // 高级设置
  batchSize: 30,
  requestDelay: 200,
  maxRetries: 3,
  debugMode: false
};

// 加载扩展配置
async function loadExtensionConfig() {
  try {
    const result = await chrome.storage.sync.get(['advancedConfig']);
    if (result.advancedConfig) {
      CONFIG.batchSize = result.advancedConfig.batchSize || 30;
      CONFIG.requestDelay = result.advancedConfig.requestDelay || 200;
      CONFIG.maxRetries = result.advancedConfig.maxRetries || 3;
      CONFIG.debugMode = result.advancedConfig.debugMode || false;
      CONFIG.cacheExpiry = (result.advancedConfig.cacheExpiry || 7) * 24 * 60 * 60 * 1000;
    }
  } catch (error) {
    console.error('[BilingualSubs] Failed to load config:', error);
  }
}

// 调试日志
function debugLog(...args) {
  if (CONFIG.debugMode) {
    console.log('[BilingualSubs]', ...args);
  }
}

// ============== 语言检测工具 (T003) ==============

/**
 * 检测字幕语言
 * @param {Array} cues - 字幕片段数组
 * @returns {string} 语言代码 'zh' | 'en' | 'ja' | 'ko' | 'unknown'
 */
function detectSubtitleLanguage(cues) {
  // 采样前 10 条字幕内容进行检测
  const sampleText = cues.slice(0, 10).map(c => c.text || '').join(' ');

  // 中文字符检测
  if (/[\u4e00-\u9fa5]/.test(sampleText)) {
    return 'zh';
  }

  // 日文字符检测 (平假名 + 片假名)
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sampleText)) {
    return 'ja';
  }

  // 韩文字符检测
  if (/[\uac00-\ud7af]/.test(sampleText)) {
    return 'ko';
  }

  // 英文/拉丁字母检测
  if (/[a-zA-Z]/.test(sampleText)) {
    return 'en';
  }

  return 'unknown';
}

/**
 * 检测是否包含中文
 * @param {string} text - 文本内容
 * @returns {boolean}
 */
function containsChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

// ============== UI 提示组件 (T004) ==============

/**
 * 显示缓存加载提示
 * @param {string} message - 提示消息
 * @param {number} duration - 显示时长 (毫秒)
 */
function showCacheHint(message = '已从缓存加载', duration = 3000) {
  // 移除已存在的提示
  let hintEl = document.querySelector('.cache-hint');
  if (hintEl) {
    hintEl.remove();
  }

  // 创建提示元素
  hintEl = document.createElement('div');
  hintEl.className = 'cache-hint';
  hintEl.textContent = message;

  // 添加到字幕容器
  const container = document.getElementById('bilingual-subs-container');
  if (container) {
    container.appendChild(hintEl);

    // 显示动画
    requestAnimationFrame(() => {
      hintEl.classList.add('visible');
    });

    // 定时隐藏
    setTimeout(() => {
      hideCacheHint(hintEl);
    }, duration);
  }
}

/**
 * 隐藏缓存提示
 * @param {HTMLElement} hintEl - 提示元素
 */
function hideCacheHint(hintEl = null) {
  if (!hintEl) {
    hintEl = document.querySelector('.cache-hint');
  }
  if (hintEl) {
    hintEl.classList.add('hide');
    hintEl.classList.remove('visible');
    setTimeout(() => {
      hintEl.remove();
    }, 300);
  }
}

// ============== 字幕数据管理 ==============
class SubtitleManager {
  constructor() {
    this.originalSubtitles = [];  // 原始英文字幕
    this.translatedSubtitles = []; // 翻译后的中文字幕
    this.mergedSubtitles = [];     // 合并后的双语字幕
    this.currentVideoId = null;
    this.translationProgress = 0;
    this.isTranslating = false;
    this.hasCache = false;
  }

  /**
   * 解析 VTT 字幕文件
   */
  parseVTT(vttContent) {
    const lines = vttContent.split('\n');
    const subtitles = [];
    let currentSub = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过 WEBVTT 头部
      if (line === 'WEBVTT' || line === '' || line.startsWith('NOTE')) continue;

      // 解析时间轴
      if (line.includes('-->')) {
        const times = line.split('-->');
        if (currentSub) {
          subtitles.push(currentSub);
        }
        currentSub = {
          id: subtitles.length + 1,
          startTime: this.parseTime(times[0].trim()),
          endTime: this.parseTime(times[1].trim().split(' ')[0]), // 移除可能的额外参数
          text: '',
          translation: ''
        };
      } else if (currentSub && line !== '' && !line.match(/^\d+$/)) {
        // 字幕文本 (可能多行)，跳过纯数字行 (字幕序号)
        currentSub.text += (currentSub.text ? '\n' : '') + line;
      }
    }

    // 添加最后一个字幕
    if (currentSub) {
      subtitles.push(currentSub);
    }

    return subtitles;
  }

  /**
   * 解析时间字符串为秒数
   */
  parseTime(timeStr) {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split('.');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  /**
   * 从视频元素获取字幕 URL
   */
  async getSubtitleUrl() {
    const video = document.querySelector('video');
    if (!video) {
      throw new Error('未找到视频元素');
    }

    const track = video.querySelector('track');
    if (!track) {
      throw new Error('未找到字幕轨道');
    }

    let subtitleUrl = track.src;

    // 如果是 m3u8，需要获取实际的 VTT 文件
    if (subtitleUrl.endsWith('.m3u8')) {
      const response = await fetch(subtitleUrl);
      const content = await response.text();
      const lines = content.split('\n');
      const vttFile = lines.find(l => l.endsWith('.vtt'));
      if (vttFile) {
        subtitleUrl = subtitleUrl.replace(/[^/]+\.m3u8$/, vttFile);
      }
    }

    return subtitleUrl;
  }

  /**
   * 获取并解析字幕
   */
  async fetchSubtitles() {
    const url = await this.getSubtitleUrl();
    console.log('[BilingualSubs] Fetching subtitles from:', url);

    const response = await fetch(url);
    const content = await response.text();

    this.originalSubtitles = this.parseVTT(content);
    console.log('[BilingualSubs] Parsed subtitles:', this.originalSubtitles.length, 'segments');

    return this.originalSubtitles;
  }

  /**
   * 生成视频唯一 ID
   */
  generateVideoId() {
    const url = window.location.href;
    // 尝试从 URL 提取有意义的 ID
    const urlParts = url.split('/').filter(p => p);
    const videoId = urlParts.slice(-3).join('_').replace(/[^a-zA-Z0-9_]/g, '_');
    return `subtitle_${videoId}`;
  }

  /**
   * 获取带哈希的缓存键
   */
  async getCacheKey() {
    const baseKey = this.generateVideoId();
    const subtitleUrl = await this.getSubtitleUrl().catch(() => '');
    if (!subtitleUrl) return baseKey;

    // 获取字幕内容并计算哈希
    try {
      const response = await fetch(subtitleUrl);
      const content = await response.text();
      // 使用 background.js 中的 calculateHash
      const hashResult = await chrome.runtime.sendMessage({
        action: 'calculateHash',
        content: content
      });
      this.currentContentHash = hashResult.hash;
      return `${baseKey}_${hashResult.hash}`;
    } catch (error) {
      debugLog('Failed to compute content hash:', error);
      return baseKey;
    }
  }

  /**
   * 从缓存加载翻译 (US1 - T006)
   */
  async loadFromCache() {
    try {
      // 获取字幕 URL 用于计算哈希
      const subtitleUrl = await this.getSubtitleUrl().catch(() => null);
      if (!subtitleUrl) {
        return false;
      }

      // 获取字幕内容并计算哈希
      const response = await fetch(subtitleUrl);
      const content = await response.text();

      // 计算哈希
      const hashResult = await chrome.runtime.sendMessage({
        action: 'calculateHash',
        content: content
      });
      const subtitleHash = hashResult.hash;

      // 检查缓存
      const videoId = this.generateVideoId();
      const cacheResult = await chrome.runtime.sendMessage({
        action: 'checkCache',
        videoId: videoId,
        subtitleHash: subtitleHash
      });

      if (cacheResult.hit && cacheResult.data?.translatedSubs) {
        // 缓存命中，加载翻译
        const cacheData = cacheResult.data;

        // 重新获取原始字幕并填充翻译
        this.originalSubtitles = this.parseVTT(content);
        for (let i = 0; i < this.originalSubtitles.length && i < cacheData.translatedSubs.length; i++) {
          this.originalSubtitles[i].translation = cacheData.translatedSubs[i]?.translatedText || cacheData.translatedSubs[i]?.translation || '';
        }

        this.hasCache = true;
        console.log('[BilingualSubs] Loaded from cache:', this.originalSubtitles.length, 'items');

        // 显示缓存提示 (US1)
        showCacheHint('已从缓存加载', 3000);

        return true;
      }

      // 缓存未命中，保存当前字幕内容以便后续保存
      this.currentSubtitleHash = subtitleHash;
      console.log('[BilingualSubs] Cache miss, will translate');
    } catch (error) {
      console.error('[BilingualSubs] Cache load error:', error);
    }
    return false;
  }

  /**
   * 保存翻译到缓存 (US1 - T008)
   */
  async saveToCache() {
    try {
      const videoId = this.generateVideoId();
      const subtitleHash = this.currentSubtitleHash;

      // 准备翻译后的字幕数据
      const translatedSubs = this.originalSubtitles.map(sub => ({
        id: sub.id,
        startTime: sub.startTime,
        endTime: sub.endTime,
        text: sub.text,
        translation: sub.translation || sub.translatedText || ''
      }));

      // 保存到缓存
      await chrome.runtime.sendMessage({
        action: 'saveCache',
        videoId: videoId,
        subtitleHash: subtitleHash,
        translatedSubs: translatedSubs
      });

      console.log('[BilingualSubs] Saved to cache:', videoId);
    } catch (error) {
      console.error('[BilingualSubs] Cache save error:', error);
    }
  }

  /**
   * 获取当前翻译配置 (用于缓存校验)
   */
  async getCurrentTranslationConfig() {
    try {
      const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
      return {
        service: config?.translationService,
        model: config?.openai?.model
      };
    } catch {
      return { service: 'google' };
    }
  }

  /**
   * 保存翻译进度到存储
   */
  async saveProgress() {
    try {
      const cacheKey = this.generateVideoId();
      const progressData = {
        translationProgress: this.translationProgress,
        isTranslating: this.isTranslating,
        timestamp: Date.now(),
        translatedCount: this.originalSubtitles.filter(s => s.translation).length,
        totalCount: this.originalSubtitles.length
      };
      await chrome.storage.local.set({ [`${cacheKey}_progress`]: progressData });
    } catch (error) {
      debugLog('Failed to save progress:', error);
    }
  }

  /**
   * 从存储加载翻译进度
   */
  async loadProgress() {
    try {
      const cacheKey = this.generateVideoId();
      const result = await chrome.storage.local.get(`${cacheKey}_progress`);
      if (result[`${cacheKey}_progress`]) {
        const progress = result[`${cacheKey}_progress`];
        // 检查进度是否过期（超过1小时）
        if (Date.now() - progress.timestamp < 3600000) {
          this.translationProgress = progress.translationProgress;
          return progress;
        }
      }
    } catch (error) {
      debugLog('Failed to load progress:', error);
    }
    return null;
  }

  /**
   * 翻译字幕 (批量) 带重试机制
   * @param {Function} onProgress - 进度回调
   */
  async translateSubtitles(onProgress = null) {
    if (this.isTranslating) {
      debugLog('Translation already in progress');
      return;
    }

    this.isTranslating = true;
    this.translationProgress = 0;
    const total = this.originalSubtitles.length;

    // 分批翻译
    const batchSize = CONFIG.batchSize;
    const batches = [];

    for (let i = 0; i < total; i += batchSize) {
      batches.push(this.originalSubtitles.slice(i, i + batchSize));
    }

    debugLog('Starting translation, batches:', batches.length);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const texts = batch.map(sub => sub.text);

      let success = false;
      let retries = 0;
      const maxRetries = CONFIG.maxRetries;

      while (!success && retries <= maxRetries) {
        try {
          // 发送翻译请求到 background script
          const response = await chrome.runtime.sendMessage({
            action: 'translate',
            texts: texts
          });

          debugLog('Translate response:', response);

          if (response.success) {
            const translations = response.results;
            debugLog('Translations received:', translations.length);
            // 更新翻译结果
            batch.forEach((sub, idx) => {
              sub.translation = translations[idx] || '';
            });
            success = true;
          } else if (response.error) {
            throw new Error(response.error);
          }
        } catch (error) {
          retries++;
          debugLog(`Translation batch ${i + 1} failed (attempt ${retries}/${maxRetries + 1}):`, error.message);

          if (retries > maxRetries) {
            console.error(`[BilingualSubs] Batch ${i + 1} failed after ${maxRetries + 1} attempts`);
            // 继续使用原始文本
            batch.forEach((sub) => {
              if (!sub.translation) sub.translation = '';
            });
          } else {
            // 指数退避重试
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      this.translationProgress = Math.min(100, Math.round((i + 1) / batches.length * 100));

      // 保存进度
      await this.saveProgress();

      if (onProgress) {
        onProgress(this.translationProgress);
      }

      // 避免请求过快
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
      }
    }

    this.isTranslating = false;

    // 清除进度
    await this.clearProgress();

    debugLog('Translation completed');

    // 保存到缓存
    await this.saveToCache();

    return this.originalSubtitles;
  }

  /**
   * 清除进度
   */
  async clearProgress() {
    try {
      const cacheKey = this.generateVideoId();
      await chrome.storage.local.remove(`${cacheKey}_progress`);
    } catch (error) {
      debugLog('Failed to clear progress:', error);
    }
  }

  /**
   * 根据当前时间获取字幕
   */
  getCurrentSubtitle(currentTime) {
    for (const sub of this.originalSubtitles) {
      if (currentTime >= sub.startTime && currentTime <= sub.endTime) {
        return sub;
      }
    }
    return null;
  }

  /**
   * 导出字幕为 SRT 格式
   */
  exportSRT(bilingual = true) {
    let srt = '';
    this.originalSubtitles.forEach((sub, idx) => {
      srt += `${idx + 1}\n`;
      srt += `${this.formatTimeSRT(sub.startTime)} --> ${this.formatTimeSRT(sub.endTime)}\n`;
      srt += `${sub.text}\n`;
      if (bilingual && sub.translation) {
        srt += `${sub.translation}\n`;
      }
      srt += '\n';
    });
    return srt;
  }

  formatTimeSRT(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    const cacheKey = this.generateVideoId();
    await chrome.storage.local.remove([cacheKey, `${cacheKey}_config`]);
    this.hasCache = false;
    console.log('[BilingualSubs] Cache cleared');
  }
}

// ============== 字幕显示控制器 ==============
class SubtitleDisplay {
  constructor(manager) {
    this.manager = manager;
    this.container = null;
    this.subtitleElement = null;
    this.isEnabled = true;
    this.mode = 'bilingual'; // 'bilingual' | 'chinese' | 'english'
    this.video = null;
  }

  /**
   * 初始化字幕显示容器
   */
  init() {
    this.video = document.querySelector('video');
    if (!this.video) {
      console.error('[BilingualSubs] Video element not found');
      return false;
    }

    // 创建字幕容器
    this.createContainer();

    // 监听视频时间更新
    this.video.addEventListener('timeupdate', () => this.updateSubtitle());
    this.video.addEventListener('play', () => this.container.style.display = 'block');
    this.video.addEventListener('pause', () => {
      // 暂停时保持显示最后一帧字幕
    });

    console.log('[BilingualSubs] Display initialized');
    return true;
  }

  /**
   * 创建字幕显示容器
   */
  createContainer() {
    // 移除已存在的容器
    const existing = document.getElementById('bilingual-subs-container');
    if (existing) {
      existing.remove();
    }

    // 找到视频容器的父级
    const videoContainer = this.video.closest('.lesson-video-player') ||
                           this.video.parentElement?.parentElement ||
                           document.body;

    // 创建外层容器 (用于定位)
    this.container = document.createElement('div');
    this.container.id = 'bilingual-subs-container';

    // 创建字幕元素
    this.subtitleElement = document.createElement('div');
    this.subtitleElement.className = 'bilingual-subs-text';
    this.container.appendChild(this.subtitleElement);

    // 插入到视频容器中
    if (videoContainer && videoContainer !== document.body) {
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(this.container);
    } else {
      // 备用：绝对定位到视频上方
      const videoRect = this.video.getBoundingClientRect();
      this.container.style.position = 'fixed';
      this.container.style.bottom = '80px';
      this.container.style.left = '50%';
      this.container.style.transform = 'translateX(-50%)';
      document.body.appendChild(this.container);
    }

    console.log('[BilingualSubs] Container created');
  }

  /**
   * 更新字幕显示
   */
  updateSubtitle() {
    if (!this.isEnabled || !this.subtitleElement) return;

    const currentTime = this.video.currentTime;
    const subtitle = this.manager.getCurrentSubtitle(currentTime);

    if (subtitle) {
      let html = '';
      switch (this.mode) {
        case 'bilingual':
          html = subtitle.translation
            ? `<div class="sub-chinese">${subtitle.translation}</div><div class="sub-english">${subtitle.text}</div>`
            : `<div class="sub-english">${subtitle.text}</div>`;
          break;
        case 'chinese':
          html = subtitle.translation
            ? `<div class="sub-chinese">${subtitle.translation}</div>`
            : `<div class="sub-english">${subtitle.text}</div>`;
          break;
        case 'english':
          html = `<div class="sub-english">${subtitle.text}</div>`;
          break;
      }
      this.subtitleElement.innerHTML = html;
      this.container.style.display = 'block';
    } else {
      this.container.style.display = 'none';
    }
  }

  /**
   * 设置显示模式
   */
  setMode(mode) {
    this.mode = mode;
    this.updateSubtitle();
  }

  /**
   * 切换启用状态
   */
  toggle() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled) {
      this.container.style.display = 'none';
    } else {
      this.container.style.display = 'block';
      this.updateSubtitle();
    }
    return this.isEnabled;
  }

  /**
   * 显示翻译进度
   */
  showProgress(progress) {
    if (this.subtitleElement) {
      this.subtitleElement.innerHTML = `<div class="sub-progress">🔄 翻译进度：${progress}%</div>`;
      this.container.style.display = 'block';
    }
  }

  /**
   * 显示状态消息
   */
  showMessage(message, duration = 3000) {
    if (this.subtitleElement) {
      this.subtitleElement.innerHTML = `<div class="sub-message">${message}</div>`;
      this.container.style.display = 'block';
      setTimeout(() => {
        this.updateSubtitle();
      }, duration);
    }
  }
}

// ============== 控制面板 ==============
class ControlPanel {
  constructor(display, manager) {
    this.display = display;
    this.manager = manager;
    this.panel = null;
    this.isAttached = false;
  }

  /**
   * 创建控制面板
   */
  create() {
    const existing = document.getElementById('bilingual-subs-panel');
    if (existing) existing.remove();

    this.panel = document.createElement('div');
    this.panel.id = 'bilingual-subs-panel';
    this.panel.innerHTML = `
      <div class="panel-header">
        <span>📺 AI 双语字幕</span>
        <button id="bilingual-subs-close" class="panel-btn">×</button>
      </div>
      <div class="panel-content">
        <div class="panel-row">
          <label>显示模式:</label>
          <select id="bilingual-subs-mode">
            <option value="bilingual">中英双语</option>
            <option value="chinese">仅中文</option>
            <option value="english">仅英文</option>
          </select>
        </div>
        <div class="panel-row">
          <button id="bilingual-subs-toggle" class="panel-btn">隐藏字幕</button>
          <button id="bilingual-subs-translate" class="panel-btn primary">翻译字幕</button>
        </div>
        <div class="panel-row">
          <button id="bilingual-subs-clear-cache" class="panel-btn">清除缓存</button>
          <button id="bilingual-subs-export" class="panel-btn">导出字幕</button>
        </div>
        <div id="bilingual-subs-status" class="panel-status"></div>
        <div class="panel-info">
          <small>💡 页面加载时自动翻译，结果已缓存</small>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);
    this.bindEvents();
    this.isAttached = true;
    console.log('[BilingualSubs] Control panel created');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 关闭面板
    document.getElementById('bilingual-subs-close')?.addEventListener('click', () => {
      this.panel.style.display = 'none';
    });

    // 切换显示模式
    document.getElementById('bilingual-subs-mode')?.addEventListener('change', (e) => {
      this.display.setMode(e.target.value);
    });

    // 切换字幕显示
    document.getElementById('bilingual-subs-toggle')?.addEventListener('click', (e) => {
      const isEnabled = this.display.toggle();
      e.target.textContent = isEnabled ? '隐藏字幕' : '显示字幕';
    });

    // 翻译字幕
    document.getElementById('bilingual-subs-translate')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('bilingual-subs-status');
      statusEl.textContent = '正在翻译...';

      await this.manager.translateSubtitles((progress) => {
        statusEl.textContent = `翻译进度：${progress}%`;
        this.display.showProgress(progress);
      });

      statusEl.textContent = '翻译完成!';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
      this.display.updateSubtitle();
    });

    // 清除缓存
    document.getElementById('bilingual-subs-clear-cache')?.addEventListener('click', async () => {
      await this.manager.clearCache();
      const statusEl = document.getElementById('bilingual-subs-status');
      statusEl.textContent = '缓存已清除，刷新页面后重新翻译';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
    });

    // 导出字幕
    document.getElementById('bilingual-subs-export')?.addEventListener('click', () => {
      const srt = this.manager.exportSRT();
      const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subtitles_${Date.now()}.srt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /**
   * 显示/隐藏面板
   */
  toggle() {
    if (!this.panel) {
      this.create();
    }
    this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
  }

  /**
   * 更新状态
   */
  updateStatus(subtitleCount, translatedCount, hasCache) {
    const statusEl = document.getElementById('bilingual-subs-status');
    if (statusEl) {
      if (hasCache) {
        statusEl.textContent = `✅ 已加载缓存 (${translatedCount}/${subtitleCount})`;
      } else if (translatedCount > 0) {
        statusEl.textContent = `✅ 翻译完成 (${translatedCount}/${subtitleCount})`;
      } else {
        statusEl.textContent = `等待翻译 (${subtitleCount}条)`;
      }
    }
  }
}

// ============== 主程序 ==============
const subtitleManager = new SubtitleManager();
let subtitleDisplay = null;
let controlPanel = null;
let autoTranslateEnabled = true;

/**
 * 使用 MutationObserver 监听字幕轨道变化
 */
function observeSubtitleTrack() {
  const video = document.querySelector('video');
  if (!video) return null;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const track = video.querySelector('track');
        if (track && track.kind === 'subtitles') {
          debugLog('Subtitle track detected');
          return track;
        }
      }
    }
  });

  observer.observe(video, { childList: true });
  return observer;
}

/**
 * 初始化扩展
 */
async function init() {
  console.log('[BilingualSubs] Initializing...');

  // 加载扩展配置
  await loadExtensionConfig();

  // 加载显示配置
  try {
    const displayConfig = await chrome.storage.sync.get(['displayConfig']);
    if (displayConfig.displayConfig) {
      autoTranslateEnabled = displayConfig.displayConfig.autoTranslate ?? true;
    }
  } catch (error) {
    debugLog('Failed to load display config:', error);
  }

  // 等待视频和字幕轨道加载
  const maxAttempts = 50;
  let video = null;
  let track = null;

  for (let i = 0; i < maxAttempts; i++) {
    video = document.querySelector('video');
    if (video) {
      track = video.querySelector('track');
      if (track) break;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (!video) {
    console.error('[BilingualSubs] No video found, retrying...');
    setTimeout(init, 2000);
    return;
  }

  // 如果没有检测到 track，设置 MutationObserver 监听
  if (!track) {
    debugLog('No track found, setting up observer');
    const observer = observeSubtitleTrack();
    if (observer) {
      // 5 秒后如果没有检测到 track，继续初始化
      setTimeout(() => {
        observer.disconnect();
        if (!subtitleManager.originalSubtitles.length) {
          initializeAfterVideoReady(video);
        }
      }, 5000);
      return; // 等待 observer 检测
    }
  }

  initializeAfterVideoReady(video, track);
}

/**
 * 视频准备就绪后初始化
 */
async function initializeAfterVideoReady(video, track = null) {
  // 初始化显示
  subtitleDisplay = new SubtitleDisplay(subtitleManager);
  if (!subtitleDisplay.init()) {
    console.error('[BilingualSubs] Failed to initialize display');
    return;
  }

  // 初始化控制面板
  controlPanel = new ControlPanel(subtitleDisplay, subtitleManager);
  controlPanel.create();

  // 获取字幕
  try {
    // 先尝试加载缓存 (US1)
    const hasCache = await subtitleManager.loadFromCache();

    if (hasCache) {
      // 有缓存，直接加载
      const translatedCount = subtitleManager.originalSubtitles.filter(s => s.translation).length;

      const statusEl = document.getElementById('bilingual-subs-status');
      if (statusEl) {
        statusEl.textContent = `✅ 已加载缓存 (${translatedCount}/${subtitleManager.originalSubtitles.length})`;
        setTimeout(() => {
          statusEl.textContent = '';
        }, 5000);
      }

      // 更新面板状态
      controlPanel.updateStatus(
        subtitleManager.originalSubtitles.length,
        translatedCount,
        hasCache
      );
    } else {
      // 没有缓存，获取新字幕
      await subtitleManager.fetchSubtitles();

      // 语言检测 (US4 - T020, T021)
      // 注意：我们需要翻译的是英文字幕 → 中文
      // 所以应该检测是否为英文，非英文才不翻译
      const detectedLanguage = detectSubtitleLanguage(subtitleManager.originalSubtitles);
      console.log('[BilingualSubs] Detected language:', detectedLanguage);

      if (detectedLanguage !== 'en') {
        // 非英文字幕，不触发翻译（仅支持英文源字幕）
        const statusEl = document.getElementById('bilingual-subs-status');
        if (statusEl) {
          statusEl.textContent = '⚠️ 暂不支持此语言（仅支持英文源字幕翻译为中文）';
        }
        // 显示不支持的提示
        subtitleDisplay.showMessage('仅支持英文翻译为中文', 5000);
        return;
      }

      // 自动开始翻译（延迟执行，避免阻塞页面）
      if (autoTranslateEnabled) {
        setTimeout(async () => {
          const statusEl = document.getElementById('bilingual-subs-status');
          if (statusEl) {
            statusEl.textContent = '正在加载字幕...';
          }

          await subtitleManager.translateSubtitles((progress) => {
            subtitleDisplay.showProgress(progress);
            if (statusEl) {
              statusEl.textContent = `翻译进度：${progress}%`;
            }
          });

          if (statusEl) {
            statusEl.textContent = '✅ 翻译完成';
            setTimeout(() => {
              statusEl.textContent = '';
            }, 3000);
          }
        }, CONFIG.autoTranslateDelay);
      }
    }
  } catch (error) {
    console.error('[BilingualSubs] Error fetching subtitles:', error);
    const statusEl = document.getElementById('bilingual-subs-status');
    if (statusEl) {
      statusEl.textContent = '⚠️ 无法获取字幕';
    }
  }

  console.log('[BilingualSubs] Initialization complete');
}

// 监听来自 popup 或 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getStatus':
      const translatedCount = subtitleManager.originalSubtitles.filter(s => s.translation).length;
      sendResponse({
        subtitleCount: subtitleManager.originalSubtitles.length,
        translatedCount: translatedCount,
        isTranslating: subtitleManager.isTranslating,
        progress: subtitleManager.translationProgress,
        hasCache: subtitleManager.hasCache
      });
      break;

    case 'startTranslation':
      subtitleManager.translateSubtitles((progress) => {
        subtitleDisplay.showProgress(progress);
      }).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'setMode':
      subtitleDisplay.setMode(message.mode);
      sendResponse({ success: true });
      break;

    case 'toggle':
      const isEnabled = subtitleDisplay.toggle();
      sendResponse({ enabled: isEnabled });
      break;

    case 'togglePanel':
      controlPanel.toggle();
      sendResponse({ success: true });
      break;

    case 'export':
      const srt = subtitleManager.exportSRT();
      sendResponse({ srt });
      break;

    case 'clearCache':
      subtitleManager.clearCache().then(() => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// 页面加载后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 1000);
  });
} else {
  setTimeout(init, 1000);
}

// 监听 URL 变化 (SPA 路由)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[BilingualSubs] URL changed, reinitializing...');
    setTimeout(init, 1000);
  }
}).observe(document, { subtree: true, childList: true });
