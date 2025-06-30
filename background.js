/**
 * 访问历史标记插件 - 后台脚本
 * 功能：处理历史记录、右键菜单和快捷键
 */

// 初始化配置
const DEFAULT_SETTINGS = {
  enabled: true,
  showCurrentPage: true,
  markStyle: 'border',
  colors: {
    recent: '#FF0000',  // 红色
    today: '#FFA500',   // 橙色
    earlier: '#90EE90'  // 浅绿色
  },
  historyMode: 'all',
  customRetentionTime: 7,
  autoClean: false,
  cleanPeriod: 7,
  excludeSites: [],
  autoEnable: true,
  showControlButton: true
};

// 初始化插件
function initializeExtension() {
  // 确保存储中有默认设置
  chrome.storage.sync.get(DEFAULT_SETTINGS, function(settings) {
    // 如果需要自动清理，设置定期清理任务
    setupAutoCleaning(settings);
    
    // 创建右键菜单
    createContextMenus();
    
    // 如果设置了自动启用，则在浏览器启动时启用插件
    if (settings.autoEnable && settings.enabled === false) {
      chrome.storage.sync.set({ enabled: true });
    }
  });
  
  // 监听历史记录变更
  chrome.history.onVisited.addListener(handleHistoryVisit);
  
  // 监听快捷键
  chrome.commands.onCommand.addListener(handleCommands);
  
  // 监听安装/更新事件
  chrome.runtime.onInstalled.addListener(handleInstalled);
}

// 设置自动清理任务
function setupAutoCleaning(settings) {
  // 如果已启用自动清理
  if (settings.autoClean) {
    // 清理过期的访问记录
    const now = Date.now();
    const cutoffTime = now - (settings.cleanPeriod * 24 * 60 * 60 * 1000);
    
    // 清理存储中的过期记录
    chrome.storage.local.get('visitedLinks', function(result) {
      const storedLinks = result.visitedLinks || {};
      let hasChanges = false;
      
      for (const url in storedLinks) {
        if (storedLinks[url] < cutoffTime) {
          delete storedLinks[url];
          hasChanges = true;
        }
      }
      
      // 如果有变更，保存更新后的记录
      if (hasChanges) {
        chrome.storage.local.set({ 'visitedLinks': storedLinks });
      }
    });
  }
  
  // 24小时后再次执行清理
  setTimeout(() => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, setupAutoCleaning);
  }, 24 * 60 * 60 * 1000); // 24小时
}

// 处理历史记录访问
function handleHistoryVisit(historyItem) {
  // 检查是否需要忽略无痕浏览模式
  chrome.windows.getCurrent({ populate: true }, function(window) {
    if (window && window.incognito) {
      return; // 忽略无痕模式下的访问
    }
    
    // 记录访问
    registerVisit(historyItem.url);
  });
}

// 注册链接访问
function registerVisit(url) {
  // 确保是HTTP链接
  if (!url.startsWith('http')) return;
  
  const now = Date.now();
  
  // 更新存储
  chrome.storage.local.get('visitedLinks', function(result) {
    const storedLinks = result.visitedLinks || {};
    storedLinks[url] = now;
    chrome.storage.local.set({ 'visitedLinks': storedLinks });
  });
}

// 创建右键菜单
function createContextMenus() {
  // 清除现有菜单
  chrome.contextMenus.removeAll(function() {
    // 创建菜单组
    chrome.contextMenus.create({
      id: 'visited-links-marker',
      title: '访问历史标记',
      contexts: ['link']
    });
    
    // 子菜单项
    chrome.contextMenus.create({
      id: 'force-mark',
      title: '强制标记此链接',
      parentId: 'visited-links-marker',
      contexts: ['link']
    });
    
    chrome.contextMenus.create({
      id: 'ignore-link',
      title: '忽略此链接',
      parentId: 'visited-links-marker',
      contexts: ['link']
    });
    
    chrome.contextMenus.create({
      id: 'ignore-site',
      title: '忽略此网站',
      parentId: 'visited-links-marker',
      contexts: ['link']
    });
    
    // 页面右键菜单
    chrome.contextMenus.create({
      id: 'toggle-page-marks',
      title: '显示/隐藏标记',
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'page-marking-separator',
      type: 'separator',
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'disable-page',
      title: '禁用此页面的新标记',
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'enable-page',
      title: '启用此页面的标记',
      contexts: ['page']
    });
  });
  
  // 菜单点击事件
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}

// 处理右键菜单点击
function handleContextMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'force-mark':
      // 强制标记链接
      if (info.linkUrl) {
        registerVisit(info.linkUrl);
        // 通知内容脚本立即应用标记
        chrome.tabs.sendMessage(tab.id, {
          type: 'forceMarkLink',
          url: info.linkUrl
        });
      }
      break;
      
    case 'ignore-link':
      // 忽略此链接
      chrome.tabs.sendMessage(tab.id, {
        type: 'ignoreLink',
        url: info.linkUrl
      });
      break;
      
    case 'ignore-site':
      // 忽略链接所在网站
      if (info.linkUrl) {
        const url = new URL(info.linkUrl);
        const domain = url.hostname;
        
        // 添加到排除列表
        chrome.storage.sync.get({ excludeSites: [] }, function(data) {
          if (!data.excludeSites.includes(domain)) {
            const updatedSites = [...data.excludeSites, domain];
            chrome.storage.sync.set({ excludeSites: updatedSites });
            
            // 通知用户
            chrome.tabs.sendMessage(tab.id, {
              type: 'siteMuted',
              domain: domain
            });
          }
        });
      }
      break;
      
    case 'toggle-page-marks':
      // 切换当前页面标记显示
      chrome.tabs.sendMessage(tab.id, {
        type: 'toggleVisibility'
      });
      break;
      
    case 'disable-page':
      // 禁用当前页面的新标记
      chrome.tabs.sendMessage(tab.id, {
        type: 'disablePage'
      });
      break;
      
    case 'enable-page':
      // 启用当前页面的标记
      chrome.tabs.sendMessage(tab.id, {
        type: 'enablePage'
      });
      break;
  }
}

// 处理命令快捷键
function handleCommands(command) {
  // 获取当前活动标签
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length === 0) return;
    
    const tab = tabs[0];
    
    switch (command) {
      case 'toggle-marks':
        // Alt+H: 显示/隐藏所有标记
        chrome.tabs.sendMessage(tab.id, {
          type: 'toggleVisibility'
        });
        break;
        
      case 'add-mark':
        // Alt+J: 手动添加标记
        chrome.tabs.sendMessage(tab.id, {
          type: 'addManualMark'
        });
        break;
    }
  });
}

// 处理安装或更新
function handleInstalled(details) {
  if (details.reason === 'install') {
    // 首次安装 - 可以打开欢迎页面
    chrome.tabs.create({
      url: 'welcome.html'
    });
  }
}

// 启动插件
initializeExtension(); 