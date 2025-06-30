/**
 * 访问历史标记插件 - 欢迎页面脚本
 */

document.addEventListener('DOMContentLoaded', function() {
  // 绑定按钮点击事件
  document.getElementById('startBtn').addEventListener('click', function() {
    window.close();
  });
  
  document.getElementById('settingsBtn').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
}); 