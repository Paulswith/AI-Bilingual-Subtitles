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
  requestDelay: 200,
  maxRetries: 3,
  debugMode: false
};

const REJECTION_MESSAGES = {
  NO_ENGLISH_SUBTITLE: {
    code: 'NO_ENGLISH_SUBTITLE',
    message: '拒绝生成：未检测到可用英文字幕',
    actionHint: '请切换到英文字幕后重试'
  },
  NO_SUBTITLE_TRACK: {
    code: 'NO_SUBTITLE_TRACK',
    message: '拒绝生成：当前页面没有可用字幕轨道',
    actionHint: '请开启字幕后重试'
  }
};

let eligibilityState = {
  status: 'pending',
  reason: '等待检测字幕轨道',
  detectedLanguage: 'unknown',
  sourceTrackId: null,
  evaluatedAt: Date.now()
};

const translationSession = {
  totalCount: 0,
  doneCount: 0,
  translatedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  fallbackService: null,
  isRunning: false,
  isAborted: false,
  startedAt: 0,
  completedAt: 0
};

function isSkippableSubtitleText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return true;
  return !/[a-zA-Z0-9\u4e00-\u9fa5]/.test(normalized);
}

function getSessionSnapshot() {
  return {
    totalCount: translationSession.totalCount,
    doneCount: translationSession.doneCount,
    translatedCount: translationSession.translatedCount,
    skippedCount: translationSession.skippedCount,
    failedCount: translationSession.failedCount,
    fallbackService: translationSession.fallbackService,
    isRunning: translationSession.isRunning,
    isAborted: translationSession.isAborted,
    startedAt: translationSession.startedAt,
    completedAt: translationSession.completedAt
  };
}

// 加载扩展配置
async function loadExtensionConfig() {
  try {
    const result = await chrome.storage.sync.get(['advancedConfig']);
    if (result.advancedConfig) {
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
function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== 'string') return '';
  return lang.trim().toLowerCase().split('-')[0];
}

function detectSubtitleLanguage(cues, explicitLanguage = '') {
  const normalizedExplicit = normalizeLanguageCode(explicitLanguage);
  if (normalizedExplicit) {
    if (normalizedExplicit === 'en') return 'en';
    if (normalizedExplicit === 'zh') return 'zh';
    if (normalizedExplicit === 'ja') return 'ja';
    if (normalizedExplicit === 'ko') return 'ko';
  }

  const cueList = Array.isArray(cues) ? cues : [];
  // 采样前 10 条字幕内容进行检测
  const sampleText = cueList.slice(0, 10).map(c => c.text || '').join(' ');

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

function scanAvailableTracks(video = null) {
  const targetVideo = video || document.querySelector('video');
  if (!targetVideo) return [];

  const tracks = Array.from(targetVideo.querySelectorAll('track'));
  return tracks.map((trackEl, index) => {
    const trackObj = trackEl.track;
    const trackId = trackEl.dataset.bilingualTrackId || `${Date.now()}_${index}`;
    trackEl.dataset.bilingualTrackId = trackId;
    const languageCode = normalizeLanguageCode(trackEl.srclang || trackEl.getAttribute('srclang') || '');
    const label = trackEl.label || trackEl.getAttribute('label') || '';
    const readyState = trackObj?.readyState ?? 0;
    const isReadable = Boolean(trackEl.src) && readyState !== 3;

    return {
      trackId,
      label,
      languageCode,
      kind: trackEl.kind || trackEl.getAttribute('kind') || '',
      isActive: trackObj?.mode === 'showing',
      isReadable,
      readyState,
      sampleText: '',
      src: trackEl.src || '',
      trackEl
    };
  });
}

function rankTrackPriority(track) {
  let score = 0;
  if (track.languageCode === 'en') score += 100;
  if (/english|英文|en/i.test(track.label || '')) score += 80;
  if (track.isActive) score += 40;
  if (track.kind === 'subtitles') score += 20;
  if (track.isReadable) score += 10;
  return score;
}

async function resolveSubtitleUrlFromTrack(track) {
  if (!track?.src) {
    throw new Error('字幕轨道缺少 src');
  }

  let subtitleUrl = track.src;
  if (subtitleUrl.endsWith('.m3u8')) {
    const response = await fetch(subtitleUrl);
    const content = await response.text();
    const lines = content.split('\n');
    const vttFile = lines.find((line) => line.endsWith('.vtt'));
    if (vttFile) {
      subtitleUrl = subtitleUrl.replace(/[^/]+\.m3u8$/, vttFile);
    }
  }

  return subtitleUrl;
}

async function calculateSubtitleHash(content) {
  const hashResult = await chrome.runtime.sendMessage({
    action: 'calculateHash',
    content
  });
  return hashResult?.hash || '';
}

function buildEligibility(status, reason, detectedLanguage = 'unknown', sourceTrackId = null) {
  return {
    status,
    reason,
    detectedLanguage,
    sourceTrackId,
    evaluatedAt: Date.now()
  };
}

function getRejectionNoticeByStatus(status) {
  if (status === 'rejected_no_track') return REJECTION_MESSAGES.NO_SUBTITLE_TRACK;
  return REJECTION_MESSAGES.NO_ENGLISH_SUBTITLE;
}

async function syncEligibilityState(nextState, trigger = 'page_updated') {
  const previous = eligibilityState;
  const { subtitleSource, ...state } = nextState || {};
  eligibilityState = { ...state, evaluatedAt: Date.now() };

  try {
    await chrome.runtime.sendMessage({
      action: 'subtitleEligibility',
      payload: eligibilityState
    });

    if (trigger === 'user_retry' || trigger === 'track_changed' || trigger === 'page_updated') {
      await chrome.runtime.sendMessage({
        action: 'retryEligibilityCheck',
        payload: {
          trigger,
          requestedAt: Date.now()
        }
      });
    }
  } catch {
    // 忽略消息发送失败，避免打断主流程
  }

  if (previous.status !== eligibilityState.status) {
    console.log(`[BilingualSubs] 翻译资格状态变化: ${previous.status} -> ${eligibilityState.status}`);
  }

  return subtitleSource
    ? { ...eligibilityState, subtitleSource }
    : eligibilityState;
}

async function evaluateSubtitleEligibility(video = null, subtitles = [], trigger = 'page_updated') {
  const tracks = scanAvailableTracks(video);
  if (!tracks.length) {
    return syncEligibilityState(
      buildEligibility('rejected_no_track', REJECTION_MESSAGES.NO_SUBTITLE_TRACK.message, 'unknown', null),
      trigger
    );
  }

  const readableTracks = tracks.filter((t) => t.isReadable);
  if (!readableTracks.length) {
    return syncEligibilityState(
      buildEligibility('pending', '字幕轨道存在但暂不可读，等待加载', 'unknown', null),
      trigger
    );
  }

  const sortedTracks = [...readableTracks].sort((a, b) => rankTrackPriority(b) - rankTrackPriority(a));
  let lastDetectedLanguage = detectSubtitleLanguage(subtitles || []);
  let hadReadableButUnavailableContent = false;

  for (const track of sortedTracks) {
    try {
      const subtitleUrl = await resolveSubtitleUrlFromTrack(track);
      const response = await fetch(subtitleUrl);
      const content = await response.text();
      const parsedSubtitles = subtitleManager.parseVTT(content);

      if (!parsedSubtitles.length) {
        hadReadableButUnavailableContent = true;
        continue;
      }

      const detectedLanguage = detectSubtitleLanguage(parsedSubtitles, track.languageCode || '');
      lastDetectedLanguage = detectedLanguage || lastDetectedLanguage;
      if (detectedLanguage !== 'en') {
        continue;
      }

      const subtitleHash = await calculateSubtitleHash(content);
      return syncEligibilityState(
        {
          ...buildEligibility('eligible', '已识别英文字幕', 'en', track.trackId),
          subtitleSource: {
            trackId: track.trackId,
            url: subtitleUrl,
            content,
            subtitles: parsedSubtitles,
            hash: subtitleHash,
            detectedLanguage
          }
        },
        trigger
      );
    } catch (error) {
      hadReadableButUnavailableContent = true;
      debugLog('读取字幕轨道失败:', track.trackId, error);
    }
  }

  if (hadReadableButUnavailableContent && lastDetectedLanguage === 'unknown') {
    return syncEligibilityState(
      buildEligibility('pending', '字幕轨道存在但暂不可读，等待加载', 'unknown', null),
      trigger
    );
  }

  return syncEligibilityState(
    buildEligibility('rejected_no_english', REJECTION_MESSAGES.NO_ENGLISH_SUBTITLE.message, lastDetectedLanguage, null),
    trigger
  );
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
    this.currentCacheKey = null;
    this.currentSubtitleHash = null;
    this.selectedTrackId = null;
    this.shouldStopTranslation = false;
  }

  setSourceTrack(trackId) {
    this.selectedTrackId = trackId || null;
  }

  abortTranslation(reason = '页面切换或用户中断') {
    this.shouldStopTranslation = true;
    this.isTranslating = false;
    translationSession.isAborted = true;
    translationSession.isRunning = false;
    console.log(`[BilingualSubs] 翻译已中断：${reason}`);
  }

  resetForNewSource() {
    this.originalSubtitles = [];
    this.hasCache = false;
    this.currentCacheKey = null;
    this.currentSubtitleHash = null;
    this.translationProgress = 0;
    translationSession.totalCount = 0;
    translationSession.doneCount = 0;
    translationSession.translatedCount = 0;
    translationSession.skippedCount = 0;
    translationSession.failedCount = 0;
    translationSession.fallbackService = null;
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
          translation: '',
          status: 'pending'
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

  applySubtitleSource(source, force = false) {
    if (!source?.hash || !Array.isArray(source.subtitles)) {
      return false;
    }

    const isSameSource = !force
      && this.currentSubtitleHash === source.hash
      && this.selectedTrackId === source.trackId
      && this.originalSubtitles.length > 0;

    if (isSameSource) {
      return false;
    }

    this.setSourceTrack(source.trackId);
    this.originalSubtitles = source.subtitles.map((subtitle) => ({
      ...subtitle,
      translation: subtitle.translation || '',
      status: subtitle.status || 'pending'
    }));
    this.currentSubtitleHash = source.hash;
    this.currentCacheKey = `${this.generateVideoId()}_${source.hash}`;
    this.hasCache = false;
    this.refreshSessionCounts();
    return true;
  }

  /**
   * 生成视频唯一 ID（严格区分不同视频）
   */
  generateVideoId() {
    const url = window.location.href;
    const hostname = window.location.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    const pathname = window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
    
    // 使用 URL 哈希 + 域名 + 路径确保唯一性
    const urlHash = btoa(url).substring(0, 16).replace(/[^a-zA-Z0-9]/g, '');
    
    return `sub_${hostname}_${urlHash}`;
  }

  /**
   * 从缓存加载翻译 (US1 - T006)
   */
  async loadFromCache(source = null) {
    try {
      const subtitleSource = source || null;
      const subtitleHash = subtitleSource?.hash || this.currentSubtitleHash;
      const cacheKey = subtitleSource?.hash
        ? `${this.generateVideoId()}_${subtitleHash}`
        : this.currentCacheKey;

      if (!subtitleHash || !cacheKey) {
        return false;
      }

      this.currentCacheKey = cacheKey;
      const cacheResult = await chrome.runtime.sendMessage({
        action: 'checkCache',
        videoId: cacheKey,
        subtitleHash
      });

      if (cacheResult.hit && cacheResult.data?.translatedSubs) {
        const cacheData = cacheResult.data;
        for (let i = 0; i < this.originalSubtitles.length && i < cacheData.translatedSubs.length; i++) {
          const translatedText = cacheData.translatedSubs[i]?.translatedText || cacheData.translatedSubs[i]?.translation || '';
          this.originalSubtitles[i].translation = translatedText;
          this.originalSubtitles[i].status = translatedText ? 'done' : (isSkippableSubtitleText(this.originalSubtitles[i].text) ? 'done' : 'pending');
        }

        this.hasCache = true;
        this.refreshSessionCounts();
        console.log('[BilingualSubs] Loaded from cache:', this.originalSubtitles.length, 'items');
        showCacheHint('已从缓存加载', 3000);
        return true;
      }

      this.currentSubtitleHash = subtitleHash;
      this.currentCacheKey = cacheKey;
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
      const videoId = this.currentCacheKey || this.generateVideoId();
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

  refreshSessionCounts() {
    const totalCount = this.originalSubtitles.length;
    const doneCount = this.originalSubtitles.filter((item) => item.status === 'done').length;
    const translatedCount = this.originalSubtitles.filter((item) => item.status === 'done' && item.translation && item.translation.trim()).length;
    const skippedCount = this.originalSubtitles.filter((item) => item.status === 'done' && !(item.translation && item.translation.trim())).length;
    const failedCount = this.originalSubtitles.filter((item) => item.status === 'failed').length;
    translationSession.totalCount = totalCount;
    translationSession.doneCount = doneCount;
    translationSession.translatedCount = translatedCount;
    translationSession.skippedCount = skippedCount;
    translationSession.failedCount = failedCount;
    const processedCount = doneCount + failedCount;
    this.translationProgress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  }

  /**
   * 翻译字幕（严格逐条串行）
   * @param {Function|Object|null} optionsOrProgress - 回调或配置 { retryOnly, onProgress }
   */
  async translateSubtitles(optionsOrProgress = null) {
    if (this.isTranslating) {
      debugLog('Translation already in progress');
      return this.originalSubtitles;
    }

    let onProgress = null;
    let retryOnly = false;
    if (typeof optionsOrProgress === 'function') {
      onProgress = optionsOrProgress;
    } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
      onProgress = optionsOrProgress.onProgress || null;
      retryOnly = Boolean(optionsOrProgress.retryOnly);
    }

    this.isTranslating = true;
    this.shouldStopTranslation = false;
    translationSession.isRunning = true;
    translationSession.isAborted = false;
    translationSession.fallbackService = null;
    translationSession.startedAt = Date.now();
    translationSession.completedAt = 0;

    this.refreshSessionCounts();
    updateSessionUI(this);
    console.log('[BilingualSubs] 开始逐条翻译');

    for (let index = 0; index < this.originalSubtitles.length; index++) {
      if (this.shouldStopTranslation || translationSession.isAborted) {
        break;
      }

      const subtitle = this.originalSubtitles[index];
      const text = subtitle?.text || '';

      if (retryOnly && subtitle.status !== 'failed' && subtitle.status !== 'pending') {
        continue;
      }
      if (!retryOnly && subtitle.status === 'done') {
        continue;
      }

      if (isSkippableSubtitleText(text)) {
        subtitle.translation = '';
        subtitle.status = 'done';
        this.refreshSessionCounts();
        updateSessionUI(this);
        if (typeof onProgress === 'function') {
          onProgress(getSessionSnapshot());
        }
        continue;
      }

      subtitle.status = 'translating';
      this.refreshSessionCounts();
      updateSessionUI(this);

      let translated = '';
      let lastError = null;
      const maxRetriesPerItem = 2;

      for (let attempt = 0; attempt <= maxRetriesPerItem; attempt++) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'translateOne',
            text: text
          });

          if (!response?.success) {
            const detailedError = response?.suggestedAction
              ? `${response.errorMessage || response.error || '翻译失败'}：${response.suggestedAction}`
              : (response?.error || '翻译失败');
            throw new Error(detailedError);
          }

          const currentTranslation = String(response.translation || '').trim();
          if (!currentTranslation || currentTranslation === text.trim()) {
            throw new Error('翻译结果无效，请稍后重试');
          }

          if (response.fallbackFrom === 'openai' && !translationSession.fallbackService) {
            translationSession.fallbackService = 'google';
            console.log('[BilingualSubs] OpenAI 不可用，已自动降级到 Google 翻译');
          }

          translated = currentTranslation;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetriesPerItem) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (translated) {
        subtitle.translation = translated;
        subtitle.status = 'done';
        console.log(`[BilingualSubs] 第 ${subtitle.id} 条翻译完成`);
      } else {
        subtitle.translation = '';
        subtitle.status = 'failed';
        console.log(`[BilingualSubs] 第 ${subtitle.id} 条翻译失败：${lastError?.message || '未知错误'}`);
      }

      this.refreshSessionCounts();
      updateSessionUI(this);
      if (subtitleDisplay) {
        subtitleDisplay.updateSubtitle();
      }
      if (typeof onProgress === 'function') {
        onProgress(getSessionSnapshot());
      }

      if (CONFIG.requestDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, CONFIG.requestDelay));
      }
    }

    this.isTranslating = false;
    translationSession.isRunning = false;
    translationSession.completedAt = Date.now();
    this.refreshSessionCounts();

    if (this.shouldStopTranslation || translationSession.isAborted) {
      console.log('[BilingualSubs] 翻译已中断');
      updateSessionUI(this);
      return this.originalSubtitles;
    }

    const hasFailed = this.originalSubtitles.some((item) => item.status === 'failed');
    if (!hasFailed) {
      await this.saveToCache();
      console.log('[BilingualSubs] 翻译全部完成');
    } else {
      console.log('[BilingualSubs] 翻译结束，存在失败条目，未写入缓存');
    }

    updateSessionUI(this);
    return this.originalSubtitles;
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
    const baseKey = this.generateVideoId();
    const localData = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(localData).filter((key) => key.startsWith(baseKey));
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    this.hasCache = false;
    translationSession.completedAt = 0;
    translationSession.doneCount = 0;
    translationSession.failedCount = 0;
    this.originalSubtitles.forEach((item) => {
      item.translation = '';
      item.status = isSkippableSubtitleText(item.text) ? 'done' : 'pending';
    });
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
    this.progressElement = null;
    this.lastSubtitleId = null;
    this.lastRenderedHtml = '';
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

    this.progressElement = document.createElement('div');
    this.progressElement.className = 'bilingual-subs-progress';
    this.progressElement.style.display = 'none';
    this.container.appendChild(this.progressElement);

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
      const hasValidTranslation = subtitle.translation && subtitle.translation.trim() !== subtitle.text.trim();
      const isFailed = subtitle.status === 'failed';
      switch (this.mode) {
        case 'bilingual':
          html = hasValidTranslation
            ? `<div class="sub-chinese">${subtitle.translation}</div><div class="sub-english">${subtitle.text}</div>`
            : isFailed
              ? `<div class="sub-failed">翻译失败</div><div class="sub-english">${subtitle.text}</div>`
            : `<div class="sub-english">${subtitle.text}</div>`;
          break;
        case 'chinese':
          html = hasValidTranslation
            ? `<div class="sub-chinese">${subtitle.translation}</div>`
            : isFailed
              ? `<div class="sub-failed">翻译失败</div>`
            : `<div class="sub-english">${subtitle.text}</div>`;
          break;
        case 'english':
          html = `<div class="sub-english">${subtitle.text}</div>`;
          break;
      }
      if (this.lastSubtitleId !== subtitle.id || this.lastRenderedHtml !== html) {
        this.subtitleElement.innerHTML = html;
        this.lastSubtitleId = subtitle.id;
        this.lastRenderedHtml = html;
      }
      this.subtitleElement.style.display = 'inline-block';
      this.container.style.display = 'block';
    } else {
      this.lastSubtitleId = null;
      this.lastRenderedHtml = '';
      this.subtitleElement.style.display = 'none';
      if (this.progressElement?.style.display === 'none') {
        this.container.style.display = 'none';
      }
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
    if (this.progressElement) {
      this.progressElement.innerHTML = `<div class="sub-progress">🔄 翻译进度：${progress}%</div>`;
      this.progressElement.style.display = 'block';
      this.container.style.display = 'block';
    }
  }

  hideProgress() {
    if (this.progressElement) {
      this.progressElement.style.display = 'none';
      this.progressElement.innerHTML = '';
    }
    if (this.subtitleElement?.style.display === 'none') {
      this.container.style.display = 'none';
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
          <small id="bilingual-subs-service-indicator">当前翻译模式：加载中...</small>
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
    this.updateTranslationModeIndicator();
    updateTranslateButtonLabel(this.manager);
    this.isAttached = true;
    console.log('[BilingualSubs] Control panel created');
  }

  async updateTranslationModeIndicator() {
    const indicator = document.getElementById('bilingual-subs-service-indicator');
    if (!indicator) return;

    try {
      const cfg = await this.manager.getCurrentTranslationConfig();
      const modeName = cfg?.service === 'openai' ? 'OpenAI 接口' : 'Google 翻译';
      indicator.textContent = `当前翻译模式：${modeName}`;
    } catch {
      indicator.textContent = '当前翻译模式：Google 翻译';
    }
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
      await this.updateTranslationModeIndicator();
      const cfg = await this.manager.getCurrentTranslationConfig();
      const modeName = cfg?.service === 'openai' ? 'OpenAI 接口' : 'Google 翻译';

      const refreshedEligibility = await evaluateSubtitleEligibility(document.querySelector('video'), this.manager.originalSubtitles, 'user_retry');
      if (refreshedEligibility.status !== 'eligible') {
        showRejectionNotice(refreshedEligibility);
        statusEl.textContent = `${getRejectionNoticeByStatus(refreshedEligibility.status).message}。${getRejectionNoticeByStatus(refreshedEligibility.status).actionHint}`;
        return;
      }

      hideRejectionNotice();
      this.manager.setSourceTrack(refreshedEligibility.sourceTrackId);
      statusEl.textContent = `正在使用 ${modeName} 翻译...`;

      try {
        const hasFailed = this.manager.originalSubtitles.some((item) => item.status === 'failed');
        await this.manager.translateSubtitles({
          retryOnly: hasFailed,
          onProgress: (session) => {
            const processedCount = (session.doneCount || 0) + (session.failedCount || 0);
            const percent = session.totalCount > 0
              ? Math.round((processedCount / session.totalCount) * 100)
              : 0;
            statusEl.textContent = session.failedCount > 0
              ? `已翻译 ${session.doneCount}/${session.totalCount} 条，失败 ${session.failedCount} 条`
              : `已翻译 ${session.doneCount}/${session.totalCount} 条`;
            this.display.showProgress(percent);
          }
        });
        updateSessionUI(this.manager);
        this.display.updateSubtitle();
      } catch (error) {
        statusEl.textContent = `❌ 翻译失败：${error.message || '请稍后重试'}`;
      }
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
      const failedCount = this.manager.originalSubtitles.filter((item) => item.status === 'failed').length;
      if (hasCache) {
        statusEl.textContent = `✅ 已加载缓存 (${translatedCount}/${subtitleCount})`;
      } else if (translationSession.isRunning) {
        statusEl.textContent = failedCount > 0
          ? `已翻译 ${translatedCount}/${subtitleCount} 条，失败 ${failedCount} 条`
          : `已翻译 ${translatedCount}/${subtitleCount} 条`;
      } else if (translatedCount > 0 || failedCount > 0) {
        statusEl.textContent = failedCount > 0
          ? `翻译完成（失败 ${failedCount} 条，可点击重试）`
          : `✅ 翻译完成 (${translatedCount}/${subtitleCount})`;
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
let trackChangeObserver = null;
let trackChangeDebounceTimer = null;

function updateTranslateButtonLabel(manager) {
  const button = document.getElementById('bilingual-subs-translate');
  if (!button) return;
  const hasFailed = manager.originalSubtitles.some((item) => item.status === 'failed');
  button.textContent = hasFailed ? '重试失败项' : '翻译字幕';
}

function updateSessionUI(manager) {
  const snapshot = getSessionSnapshot();
  const statusEl = document.getElementById('bilingual-subs-status');
  const processedCount = snapshot.doneCount + snapshot.failedCount;
  const total = snapshot.totalCount || manager.originalSubtitles.length;

  if (statusEl && total > 0) {
    const fallbackText = snapshot.fallbackService === 'google' ? '（已自动降级到 Google）' : '';
    if (snapshot.isRunning) {
      statusEl.textContent = snapshot.failedCount > 0
        ? `已翻译 ${snapshot.translatedCount}/${total} 条，失败 ${snapshot.failedCount} 条${fallbackText}`
        : `已翻译 ${snapshot.translatedCount}/${total} 条${fallbackText}`;
    } else if (processedCount >= total) {
      statusEl.textContent = snapshot.failedCount > 0
        ? `翻译完成（失败 ${snapshot.failedCount} 条，可点击重试）${fallbackText}`
        : `翻译完成（已生成 ${snapshot.translatedCount} 条）${fallbackText}`;
    } else {
      statusEl.textContent = `等待翻译 (${total} 条)`;
    }
  }

  if (subtitleDisplay) {
    if (snapshot.isRunning) {
      const percent = total > 0 ? Math.round((processedCount / total) * 100) : 0;
      subtitleDisplay.showProgress(percent);
    } else {
      subtitleDisplay.hideProgress();
    }
  }

  if (controlPanel) {
    controlPanel.updateStatus(
      manager.originalSubtitles.length,
      snapshot.translatedCount,
      manager.hasCache
    );
  }

  updateTranslateButtonLabel(manager);
}

function showRejectionNotice(eligibility) {
  const notice = getRejectionNoticeByStatus(eligibility?.status);
  const statusEl = document.getElementById('bilingual-subs-status');
  if (statusEl) {
    statusEl.textContent = `${notice.message}。${notice.actionHint}`;
  }
  if (subtitleDisplay) {
    subtitleDisplay.showMessage(`${notice.message}，${notice.actionHint}`, 8000);
  }
  console.log(`[BilingualSubs] 拒绝生成：${notice.message}`);
}

function hideRejectionNotice() {
  const statusEl = document.getElementById('bilingual-subs-status');
  if (statusEl && /拒绝生成/.test(statusEl.textContent || '')) {
    statusEl.textContent = '';
  }
}

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

function getTrackSnapshot(video) {
  if (!video) return '';
  const tracks = scanAvailableTracks(video);
  const textTrackModes = Array.from(video.textTracks || []).map((track) => track.mode).join('|');
  return JSON.stringify(tracks.map((track) => ({
    id: track.trackId,
    src: track.src,
    lang: track.languageCode,
    label: track.label,
    active: track.isActive
  }))) + `::${textTrackModes}`;
}

function observeTrackChanges(video) {
  if (!video) return null;
  if (trackChangeObserver) {
    clearInterval(trackChangeObserver);
  }
  let previousSnapshot = getTrackSnapshot(video);
  trackChangeObserver = setInterval(async () => {
    const currentSnapshot = getTrackSnapshot(video);
    if (currentSnapshot === previousSnapshot) {
      return;
    }

    previousSnapshot = currentSnapshot;
    if (trackChangeDebounceTimer) {
      clearTimeout(trackChangeDebounceTimer);
    }

    trackChangeDebounceTimer = setTimeout(async () => {
      const previous = eligibilityState;
      const next = await evaluateSubtitleEligibility(video, subtitleManager.originalSubtitles, 'track_changed');
      if (next.status === 'eligible') {
        const sourceChanged = subtitleManager.applySubtitleSource(next.subtitleSource || null);
        subtitleManager.setSourceTrack(next.sourceTrackId);
        hideRejectionNotice();
        if (sourceChanged) {
          await subtitleManager.loadFromCache(next.subtitleSource || null);
          updateSessionUI(subtitleManager);
          subtitleDisplay?.updateSubtitle();
        }
        if (previous.status !== 'eligible') {
          console.log('[BilingualSubs] 已恢复翻译资格');
        }
        return;
      }

      if (previous.status === 'eligible' && next.status.startsWith('rejected')) {
        subtitleManager.abortTranslation('英文字幕轨道失效');
        showRejectionNotice(next);
      }
    }, 500);
  }, 1000);
  return trackChangeObserver;
}

async function loadEligibleSource(video, trigger = 'page_updated') {
  let eligibility = await evaluateSubtitleEligibility(video, subtitleManager.originalSubtitles, trigger);
  if (eligibility.status === 'pending') {
    for (let retry = 0; retry < 3 && eligibility.status === 'pending'; retry++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      eligibility = await evaluateSubtitleEligibility(video, subtitleManager.originalSubtitles, trigger);
    }
  }
  return eligibility;
}

function teardownRuntime() {
  if (trackChangeObserver) {
    clearInterval(trackChangeObserver);
    trackChangeObserver = null;
  }
  if (trackChangeDebounceTimer) {
    clearTimeout(trackChangeDebounceTimer);
    trackChangeDebounceTimer = null;
  }
  subtitleDisplay?.container?.remove();
  controlPanel?.panel?.remove();
  subtitleDisplay = null;
  controlPanel = null;
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
  teardownRuntime();

  // 初始化显示
  subtitleDisplay = new SubtitleDisplay(subtitleManager);
  if (!subtitleDisplay.init()) {
    console.error('[BilingualSubs] Failed to initialize display');
    return;
  }

  // 初始化控制面板
  controlPanel = new ControlPanel(subtitleDisplay, subtitleManager);
  controlPanel.create();

  observeTrackChanges(video);

  // 获取字幕
  try {
    const eligibility = await loadEligibleSource(video, 'page_updated');

    if (eligibility.status !== 'eligible') {
      showRejectionNotice(eligibility);
      return;
    }

    subtitleManager.applySubtitleSource(eligibility.subtitleSource || null, true);
    subtitleManager.setSourceTrack(eligibility.sourceTrackId);
    hideRejectionNotice();
    subtitleDisplay.updateSubtitle();

    const hasCache = await subtitleManager.loadFromCache(eligibility.subtitleSource || null);

    if (hasCache) {
      subtitleManager.refreshSessionCounts();
      translationSession.completedAt = Date.now();
      subtitleDisplay.updateSubtitle();

      const statusEl = document.getElementById('bilingual-subs-status');
      if (statusEl) {
        statusEl.textContent = `✅ 已加载缓存 (${translationSession.translatedCount}/${subtitleManager.originalSubtitles.length})`;
        setTimeout(() => {
          statusEl.textContent = '';
        }, 5000);
      }

      controlPanel.updateStatus(
        subtitleManager.originalSubtitles.length,
        translationSession.translatedCount,
        hasCache
      );
      updateSessionUI(subtitleManager);
    } else {
      console.log('[BilingualSubs] 已识别英文字幕，准备翻译');

      if (autoTranslateEnabled) {
        setTimeout(async () => {
          const statusEl = document.getElementById('bilingual-subs-status');
          const cfg = await subtitleManager.getCurrentTranslationConfig();
          const modeName = cfg?.service === 'openai' ? 'OpenAI 接口' : 'Google 翻译';
          if (statusEl) {
            statusEl.textContent = `正在基于英文字幕翻译（${modeName}）...`;
          }

          try {
            await subtitleManager.translateSubtitles({
              onProgress: (session) => {
                const processedCount = (session.doneCount || 0) + (session.failedCount || 0);
                const percent = session.totalCount > 0
                  ? Math.round((processedCount / session.totalCount) * 100)
                  : 0;
                if (statusEl) {
                  statusEl.textContent = session.failedCount > 0
                    ? `已翻译 ${session.translatedCount}/${session.totalCount} 条，失败 ${session.failedCount} 条`
                    : `已翻译 ${session.translatedCount}/${session.totalCount} 条`;
                }
                subtitleDisplay.showProgress(percent);
              }
            });
            updateSessionUI(subtitleManager);
          } catch (error) {
            if (statusEl) {
              statusEl.textContent = `❌ 翻译失败：${error.message || '请稍后重试'}`;
            }
            subtitleDisplay.showMessage(`翻译失败：${error.message || '请稍后重试'}`, 6000);
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
      subtitleManager.refreshSessionCounts();
      sendResponse({
        subtitleCount: subtitleManager.originalSubtitles.length,
        translatedCount: translationSession.translatedCount,
        isTranslating: subtitleManager.isTranslating,
        progress: subtitleManager.translationProgress,
        hasCache: subtitleManager.hasCache,
        eligibility: eligibilityState,
        session: getSessionSnapshot()
      });
      break;

    case 'startTranslation':
      evaluateSubtitleEligibility(document.querySelector('video'), subtitleManager.originalSubtitles, 'user_retry')
        .then((eligibility) => {
          if (eligibility.status !== 'eligible') {
            showRejectionNotice(eligibility);
            const notice = getRejectionNoticeByStatus(eligibility.status);
            sendResponse({
              success: false,
              error: `${notice.message}。${notice.actionHint}`,
              code: notice.code,
              eligibility
            });
            return;
          }

          if (eligibility.subtitleSource) {
            subtitleManager.applySubtitleSource(eligibility.subtitleSource);
          }
          subtitleManager.setSourceTrack(eligibility.sourceTrackId);
          hideRejectionNotice();
          const hasFailed = subtitleManager.originalSubtitles.some((item) => item.status === 'failed');
          subtitleManager.translateSubtitles({
            retryOnly: hasFailed,
            onProgress: (session) => {
              const processedCount = (session.doneCount || 0) + (session.failedCount || 0);
              const percent = session.totalCount > 0
                ? Math.round((processedCount / session.totalCount) * 100)
                : 0;
              subtitleDisplay.showProgress(percent);
            }
          }).then(() => {
            updateSessionUI(subtitleManager);
            sendResponse({ success: true, eligibility });
          }).catch((error) => {
            sendResponse({ success: false, error: error.message || '翻译失败，请稍后重试', eligibility });
          });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message || '翻译资格检测失败' });
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
    subtitleManager.abortTranslation('页面 URL 已变化');
    teardownRuntime();
    subtitleManager.resetForNewSource();
    console.log('[BilingualSubs] URL changed, reinitializing...');
    setTimeout(init, 1000);
  }
}).observe(document, { subtree: true, childList: true });

window.addEventListener('beforeunload', () => {
  subtitleManager.abortTranslation('页面即将卸载');
});
