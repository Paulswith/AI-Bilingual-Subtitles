/**
 * 修复脚本 - 清除旧的配置格式
 * 在控制台运行此脚本以清除旧配置
 */

// 在 browser console 中运行：
// chrome.storage.sync.clear()  // 清除所有配置（会重置为默认值）
// chrome.storage.local.clear() // 清除所有缓存（需要重新翻译）

console.log('=== 修复配置问题 ===');
console.log('1. 打开扩展的高级设置页面 (options.html)');
console.log('2. 在翻译服务标签页配置 OpenAI');
console.log('3. 点击保存配置');
console.log('');
console.log('如果需要清除旧配置：');
console.log('chrome.storage.sync.clear();');
console.log('chrome.storage.local.clear();');
console.log('然后刷新页面重新配置');
