document.addEventListener('DOMContentLoaded', function() {
  // DOM 元素
  const autoEnableCheckbox = document.getElementById('autoEnable');
  const showControlButtonCheckbox = document.getElementById('showControlButton');
  const historyModeRadios = document.getElementsByName('historyMode');
  const customRetentionTimeSelect = document.getElementById('customRetentionTime');
  const autoCleanCheckbox = document.getElementById('autoClean');
  const cleanPeriodSelect = document.getElementById('cleanPeriod');
  const cleanPeriodContainer = document.getElementById('cleanPeriodContainer');
  const excludeListContainer = document.getElementById('excludeList');
  const newExcludeSiteInput = document.getElementById('newExcludeSite');
  const addExcludeSiteButton = document.getElementById('addExcludeSite');
  const customShortcutButton = document.getElementById('customShortcutBtn');
  const resetAllButton = document.getElementById('resetAllBtn');
  const saveSettingsButton = document.getElementById('saveSettingsBtn');
  const messageElement = document.getElementById('message');
  
  // 默认设置
  const defaultSettings = {
    autoEnable: true,
    showControlButton: true,
    historyMode: 'all',
    customRetentionTime: 7, // 默认1周
    autoClean: false,
    cleanPeriod: 7, // 默认1周
    excludeSites: ['example.com', 'mail.google.com'],
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
  autoCleanCheckbox.addEventListener('change', toggleAutoClean);
  addExcludeSiteButton.addEventListener('click', addExcludeSite);
  customShortcutButton.addEventListener('click', openShortcutPage);
  resetAllButton.addEventListener('click', confirmResetAllSettings);
  saveSettingsButton.addEventListener('click', saveSettings);
  
  // 功能实现
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(settings) {
      // 基本设置
      autoEnableCheckbox.checked = settings.autoEnable;
      showControlButtonCheckbox.checked = settings.showControlButton;
      
      // 隐私保护设置
      for (let radio of historyModeRadios) {
        radio.checked = (radio.value === settings.historyMode);
      }
      customRetentionTimeSelect.value = settings.customRetentionTime;
      customRetentionTimeSelect.disabled = settings.historyMode !== 'custom';
      
      // 自动清理设置
      autoCleanCheckbox.checked = settings.autoClean;
      cleanPeriodSelect.value = settings.cleanPeriod;
      toggleAutoClean();
      
      // 排除列表
      renderExcludeList(settings.excludeSites);
    });
  }
  
  // 切换自动清理显示
  function toggleAutoClean() {
    cleanPeriodContainer.style.display = autoCleanCheckbox.checked ? 'flex' : 'none';
  }
  
  // 渲染排除列表
  function renderExcludeList(sites) {
    excludeListContainer.innerHTML = '';
    
    if (sites.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-list';
      emptyMessage.textContent = '暂无排除网站';
      excludeListContainer.appendChild(emptyMessage);
      return;
    }
    
    sites.forEach(site => {
      const siteElement = document.createElement('div');
      siteElement.className = 'exclude-site';
      
      const siteText = document.createElement('span');
      siteText.textContent = site;
      
      const removeButton = document.createElement('span');
      removeButton.className = 'remove-site';
      removeButton.textContent = '✕';
      removeButton.addEventListener('click', () => removeExcludeSite(site));
      
      siteElement.appendChild(siteText);
      siteElement.appendChild(removeButton);
      excludeListContainer.appendChild(siteElement);
    });
  }
  
  // 添加排除站点
  function addExcludeSite() {
    const newSite = newExcludeSiteInput.value.trim().toLowerCase();
    
    if (!newSite) {
      showMessage('请输入有效的网站域名', true);
      return;
    }
    
    // 简单验证域名格式
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (!domainRegex.test(newSite)) {
      showMessage('请输入有效的网站域名格式', true);
      return;
    }
    
    chrome.storage.sync.get({excludeSites: []}, function(data) {
      if (data.excludeSites.includes(newSite)) {
        showMessage('此网站已在排除列表中', true);
        return;
      }
      
      const updatedSites = [...data.excludeSites, newSite];
      chrome.storage.sync.set({excludeSites: updatedSites}, function() {
        renderExcludeList(updatedSites);
        newExcludeSiteInput.value = '';
        showMessage('网站已添加到排除列表');
      });
    });
  }
  
  // 删除排除站点
  function removeExcludeSite(site) {
    chrome.storage.sync.get({excludeSites: []}, function(data) {
      const updatedSites = data.excludeSites.filter(s => s !== site);
      chrome.storage.sync.set({excludeSites: updatedSites}, function() {
        renderExcludeList(updatedSites);
        showMessage('网站已从排除列表中移除');
      });
    });
  }
  
  // 打开快捷键设置页面
  function openShortcutPage() {
    chrome.tabs.create({url: 'chrome://extensions/shortcuts'});
  }
  
  // 确认重置所有设置
  function confirmResetAllSettings() {
    if (confirm('确定要重置所有设置吗？这将恢复所有默认设置并清除您的自定义配置。')) {
      resetAllSettings();
    }
  }
  
  // 重置所有设置
  function resetAllSettings() {
    chrome.storage.sync.set(defaultSettings, function() {
      loadSettings();
      showMessage('所有设置已重置为默认值');
    });
  }
  
  // 保存设置
  function saveSettings() {
    // 收集当前设置
    const settings = {
      autoEnable: autoEnableCheckbox.checked,
      showControlButton: showControlButtonCheckbox.checked,
      historyMode: document.querySelector('input[name="historyMode"]:checked').value,
      customRetentionTime: parseInt(customRetentionTimeSelect.value),
      autoClean: autoCleanCheckbox.checked,
      cleanPeriod: parseInt(cleanPeriodSelect.value)
    };
    
    // 获取排除站点列表（这部分是实时更新的）
    chrome.storage.sync.get({
      excludeSites: defaultSettings.excludeSites,
      colors: defaultSettings.colors,
      markStyle: defaultSettings.markStyle
    }, function(data) {
      // 合并设置
      const mergedSettings = {
        ...settings,
        excludeSites: data.excludeSites,
        colors: data.colors,
        markStyle: data.markStyle
      };
      
      // 保存设置
      chrome.storage.sync.set(mergedSettings, function() {
        showMessage('设置已保存');
      });
    });
  }
  
  // 显示消息
  function showMessage(text, isError = false) {
    messageElement.textContent = text;
    messageElement.classList.remove('hidden');
    
    if (isError) {
      messageElement.classList.add('error');
    } else {
      messageElement.classList.remove('error');
    }
    
    setTimeout(() => {
      messageElement.classList.add('hidden');
    }, 3000);
  }
  
  // 历史模式单选按钮事件处理
  for (let radio of historyModeRadios) {
    radio.addEventListener('change', function(event) {
      customRetentionTimeSelect.disabled = event.target.value !== 'custom';
    });
  }
}); 