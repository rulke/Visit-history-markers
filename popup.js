document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const enableExtensionToggle = document.getElementById('enableExtension');
  const showCurrentPageToggle = document.getElementById('showCurrentPage');
  const markStyleRadios = document.getElementsByName('markStyle');
  const recentColorPicker = document.getElementById('recentColor');
  const todayColorPicker = document.getElementById('todayColor');
  const earlierColorPicker = document.getElementById('earlierColor');
  const resetBtn = document.getElementById('resetBtn');
  const applyBtn = document.getElementById('applyBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // 默认设置
  const defaultSettings = {
    enabled: true,
    showCurrentPage: true,
    markStyle: 'border',
    colors: {
      recent: '#FF0000',  // 红色
      today: '#FFA500',   // 橙色
      earlier: '#90EE90'  // 浅绿色
    }
  };
  
  // 加载保存的设置
  loadSettings();
  
  // 绑定事件处理程序
  enableExtensionToggle.addEventListener('change', toggleExtension);
  showCurrentPageToggle.addEventListener('change', toggleCurrentPage);
  
  for (let radio of markStyleRadios) {
    radio.addEventListener('change', changeMarkStyle);
  }
  
  recentColorPicker.addEventListener('change', updateColors);
  todayColorPicker.addEventListener('change', updateColors);
  earlierColorPicker.addEventListener('change', updateColors);
  
  resetBtn.addEventListener('click', resetSettings);
  applyBtn.addEventListener('click', applySettings);
  settingsBtn.addEventListener('click', openOptionsPage);
  
  // 加载设置并更新UI
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(settings) {
      // 更新UI元素状态
      enableExtensionToggle.checked = settings.enabled;
      showCurrentPageToggle.checked = settings.showCurrentPage;
      
      // 设置单选按钮
      for (let radio of markStyleRadios) {
        radio.checked = (radio.value === settings.markStyle);
      }
      
      // 设置颜色选择器
      recentColorPicker.value = settings.colors.recent;
      todayColorPicker.value = settings.colors.today;
      earlierColorPicker.value = settings.colors.earlier;
    });
  }
  
  // 启用/禁用插件
  function toggleExtension() {
    const enabled = enableExtensionToggle.checked;
    chrome.storage.sync.set({ enabled: enabled }, function() {
      // 通知内容脚本更新状态
      sendMessageToContentScript({ type: 'toggleExtension', enabled: enabled });
    });
  }
  
  // 显示/隐藏当前页面标记
  function toggleCurrentPage() {
    const showCurrentPage = showCurrentPageToggle.checked;
    chrome.storage.sync.set({ showCurrentPage: showCurrentPage }, function() {
      // 通知内容脚本更新当前页面
      sendMessageToContentScript({ type: 'toggleCurrentPage', showCurrentPage: showCurrentPage });
    });
  }
  
  // 更改标记样式
  function changeMarkStyle(event) {
    const markStyle = event.target.value;
    chrome.storage.sync.set({ markStyle: markStyle }, function() {
      // 通知内容脚本更新样式
      sendMessageToContentScript({ type: 'updateMarkStyle', markStyle: markStyle });
    });
  }
  
  // 更新颜色设置
  function updateColors() {
    const colors = {
      recent: recentColorPicker.value,
      today: todayColorPicker.value,
      earlier: earlierColorPicker.value
    };
    
    chrome.storage.sync.set({ colors: colors }, function() {
      // 通知内容脚本更新颜色
      sendMessageToContentScript({ type: 'updateColors', colors: colors });
    });
  }
  
  // 重置为默认设置
  function resetSettings() {
    chrome.storage.sync.set(defaultSettings, function() {
      // 更新UI
      loadSettings();
      
      // 通知内容脚本应用默认设置
      sendMessageToContentScript({ type: 'applySettings', settings: defaultSettings });
    });
  }
  
  // 应用当前设置
  function applySettings() {
    // 收集当前设置
    const settings = {
      enabled: enableExtensionToggle.checked,
      showCurrentPage: showCurrentPageToggle.checked,
      markStyle: document.querySelector('input[name="markStyle"]:checked').value,
      colors: {
        recent: recentColorPicker.value,
        today: todayColorPicker.value,
        earlier: earlierColorPicker.value
      }
    };
    
    // 保存设置并应用
    chrome.storage.sync.set(settings, function() {
      // 通知内容脚本应用新设置
      sendMessageToContentScript({ type: 'applySettings', settings: settings });
      
      // 显示保存成功提示（可选）
      showMessage('设置已应用');
    });
  }
  
  // 打开选项页
  function openOptionsPage() {
    chrome.runtime.openOptionsPage();
  }
  
  // 向当前标签页内容脚本发送消息
  function sendMessageToContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }
  
  // 显示消息提示（可选）
  function showMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    // 3秒后自动消失
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }
}); 