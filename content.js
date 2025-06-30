/**
 * 访问历史标记插件 - 内容脚本
 * 功能：自动为网页中已访问的链接添加可视化标记
 */

(function() {
  // 全局变量
  let settings = {
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
    excludeSites: []
  };
  
  let visitedLinks = new Map(); // 存储访问过的链接及其访问时间
  let markApplied = new Set(); // 已标记的链接，避免重复处理
  let isCurrentlyVisible = true; // 当前标记是否可见
  let floatButton = null; // 悬浮控制按钮
  let isPageMarkingEnabled = true; // 当前页面是否允许新标记
  
  // 自定义样式ID
  const STYLE_ID = 'visited-links-marker-style';
  
  // 获取当前页面的存储键
  function getCurrentPageKey() {
    return `page_marking:${window.location.href}`;
  }
  
  // 检查当前页面标记状态
  function checkPageMarkingState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(getCurrentPageKey(), function(result) {
        // 默认启用标记
        resolve(result[getCurrentPageKey()] !== false);
      });
    });
  }
  
  // 设置页面标记状态
  function setPageMarkingState(enabled) {
    const data = {};
    data[getCurrentPageKey()] = enabled;
    chrome.storage.local.set(data);
    isPageMarkingEnabled = enabled;
  }
  
  // 初始化
  async function init() {
    // 加载设置
    chrome.storage.sync.get(settings, function(result) {
      settings = result;
      
      // 检查当前网站是否在排除列表中
      if (isCurrentSiteExcluded()) {
        return;
      }
      
      // 检查页面标记状态
      checkPageMarkingState().then(enabled => {
        isPageMarkingEnabled = enabled;
        
        // 加载访问历史
        loadVisitedLinks().then(() => {
          // 标记当前页面上的链接
          markVisitedLinksOnPage();
          
          // 添加自定义样式
          addCustomStyles();
          
          // 监听DOM变化
          setupMutationObserver();
          
          // 添加悬浮控制按钮
          if (settings.showControlButton) {
            addFloatingControlButton();
          }
        });
      });
    });
    
    // 监听消息
    chrome.runtime.onMessage.addListener(handleMessages);
  }
  
  // 检查当前站点是否在排除列表
  function isCurrentSiteExcluded() {
    const currentHost = window.location.hostname;
    return settings.excludeSites.some(site => currentHost === site || currentHost.endsWith('.' + site));
  }
  
  // 加载访问过的链接
  function loadVisitedLinks() {
    return new Promise((resolve) => {
      // 从存储中获取访问历史
      chrome.storage.local.get('visitedLinks', function(result) {
        let storedLinks = result.visitedLinks || {};
        
        // 清理过期记录
        const now = Date.now();
        let retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 默认7天
        
        // 根据设置确定保留时间
        if (settings.historyMode === 'session') {
          // 仅当前会话，使用会话存储，无需加载本地存储
          storedLinks = {};
        } else if (settings.historyMode === 'custom') {
          retentionPeriod = settings.customRetentionTime * 24 * 60 * 60 * 1000;
        }
        
        // 过滤出有效期内的链接
        if (settings.historyMode !== 'all') {
          const cutoffTime = now - retentionPeriod;
          Object.keys(storedLinks).forEach(url => {
            if (storedLinks[url] < cutoffTime) {
              delete storedLinks[url];
            }
          });
        }
        
        // 转换为Map
        for (const [url, timestamp] of Object.entries(storedLinks)) {
          visitedLinks.set(url, timestamp);
        }
        
        resolve();
      });
    });
  }
  
  // 标记页面上所有已访问链接
  function markVisitedLinksOnPage() {
    if (!settings.enabled || !settings.showCurrentPage) return;
    
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      processLink(link);
    });
  }
  
  // 处理单个链接
  function processLink(link) {
    if (!link || !link.href || markApplied.has(link)) return;
    
    const url = link.href;
    
    // 忽略javascript:, mailto:, tel: 等协议
    if (!url.startsWith('http')) return;
    
    // 检查是否访问过
    if (visitedLinks.has(url)) {
      // 添加到已处理集合
      markApplied.add(link);
      
      // 应用标记
      applyMarkStyle(link, visitedLinks.get(url));
    }
  }
  
  // 应用标记样式到链接
  function applyMarkStyle(link, visitTime) {
    // 确定访问时间类别
    const category = getVisitTimeCategory(visitTime);
    
    // 获取对应颜色
    const color = settings.colors[category];
    
    // 应用对应样式
    link.setAttribute('data-visited-marker', category);
    link.setAttribute('data-visited-time', visitTime);
    
    // 当设置为不可见时，我们仍然标记，但不显示标记样式
    if (!isCurrentlyVisible) {
      link.classList.add('visited-marker-hidden');
    } else {
      link.classList.remove('visited-marker-hidden');
    }
  }
  
  // 获取访问时间类别（最近、今天、更早）
  function getVisitTimeCategory(timestamp) {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    
    // 1小时内
    if (now - timestamp < hour) {
      return 'recent';
    }
    
    // 今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (timestamp >= today.getTime()) {
      return 'today';
    }
    
    // 更早
    return 'earlier';
  }
  
  // 添加自定义样式
  function addCustomStyles() {
    // 移除现有样式（如果有）
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // 创建样式元素
    const styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    
    // 生成样式规则
    const styleRules = createStyleRules();
    styleElement.textContent = styleRules;
    
    // 添加到文档头
    document.head.appendChild(styleElement);
  }
  
  // 创建样式规则
  function createStyleRules() {
    let rules = '';
    
    // 基本样式
    rules += `
      /* 隐藏标记样式但保持链接可见 */
      a.visited-marker-hidden[data-visited-marker] {
        outline: none !important;
        background-color: transparent !important;
        border-bottom: none !important;
      }
    `;
    
    // 边框样式
    if (settings.markStyle === 'border') {
      rules += `
        a[data-visited-marker="recent"]:not(.visited-marker-hidden) {
          outline: 2px solid ${settings.colors.recent} !important;
          outline-offset: 1px;
        }
        
        a[data-visited-marker="today"]:not(.visited-marker-hidden) {
          outline: 2px solid ${settings.colors.today} !important;
          outline-offset: 1px;
        }
        
        a[data-visited-marker="earlier"]:not(.visited-marker-hidden) {
          outline: 2px solid ${settings.colors.earlier} !important;
          outline-offset: 1px;
        }
      `;
    }
    
    // 背景高亮样式
    else if (settings.markStyle === 'background') {
      rules += `
        a[data-visited-marker="recent"]:not(.visited-marker-hidden) {
          background-color: ${settings.colors.recent}33 !important;
        }
        
        a[data-visited-marker="today"]:not(.visited-marker-hidden) {
          background-color: ${settings.colors.today}33 !important;
        }
        
        a[data-visited-marker="earlier"]:not(.visited-marker-hidden) {
          background-color: ${settings.colors.earlier}33 !important;
        }
      `;
    }
    
    // 下划线样式
    else if (settings.markStyle === 'underline') {
      rules += `
        a[data-visited-marker="recent"]:not(.visited-marker-hidden) {
          border-bottom: 2px solid ${settings.colors.recent} !important;
        }
        
        a[data-visited-marker="today"]:not(.visited-marker-hidden) {
          border-bottom: 2px solid ${settings.colors.today} !important;
        }
        
        a[data-visited-marker="earlier"]:not(.visited-marker-hidden) {
          border-bottom: 2px solid ${settings.colors.earlier} !important;
        }
      `;
    }
    
    // 悬浮控制按钮样式
    rules += `
      #visited-links-float-button {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-color: white;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 9999;
        font-size: 20px;
        line-height: 1;
        user-select: none;
        opacity: 0.8;
        transition: opacity 0.3s;
      }
      
      #visited-links-float-button:hover {
        opacity: 1;
      }
    `;
    
    return rules;
  }
  
  // 设置MutationObserver以监听动态内容
  function setupMutationObserver() {
    // 如果禁用或不显示当前页面，则不启动观察
    if (!settings.enabled || !settings.showCurrentPage) return;
    
    const observer = new MutationObserver(mutations => {
      let hasNewLinks = false;
      
      mutations.forEach(mutation => {
        // 处理新增的节点
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 如果是元素节点，可能是链接或者包含链接
              if (node.tagName === 'A' && node.href) {
                processLink(node);
                hasNewLinks = true;
              } else {
                // 查找这个元素下的所有链接
                const links = node.querySelectorAll('a[href]');
                if (links.length > 0) {
                  links.forEach(link => {
                    processLink(link);
                  });
                  hasNewLinks = true;
                }
              }
            }
          });
        }
      });
    });
    
    // 配置并启动观察
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // 添加悬浮控制按钮
  function addFloatingControlButton() {
    if (floatButton) return; // 避免重复添加
    
    floatButton = document.createElement('div');
    floatButton.id = 'visited-links-float-button';
    floatButton.title = '点击显示/隐藏标记';
    floatButton.innerHTML = '👁️';
    floatButton.addEventListener('click', toggleVisibility);
    
    document.body.appendChild(floatButton);
  }
  
  // 移除悬浮控制按钮
  function removeFloatingControlButton() {
    if (floatButton && floatButton.parentNode) {
      floatButton.parentNode.removeChild(floatButton);
      floatButton = null;
    }
  }
  
  // 切换标记可见性
  function toggleVisibility() {
    isCurrentlyVisible = !isCurrentlyVisible;
    
    const links = document.querySelectorAll('a[data-visited-marker]');
    links.forEach(link => {
      if (isCurrentlyVisible) {
        link.classList.remove('visited-marker-hidden');
      } else {
        link.classList.add('visited-marker-hidden');
      }
    });
    
    // 更新按钮状态
    if (floatButton) {
      floatButton.innerHTML = isCurrentlyVisible ? '👁️' : '👁️‍🗨️';
      floatButton.title = isCurrentlyVisible ? '点击隐藏标记' : '点击显示标记';
    }
    
    // 显示操作提示
    showNotification(isCurrentlyVisible ? '已显示标记' : '已隐藏标记');
  }
  
  // 处理来自弹出窗口或后台脚本的消息
  function handleMessages(message, sender, sendResponse) {
    if (!message || !message.type) {
      if (sendResponse) sendResponse({ success: false, error: 'Invalid message' });
      return true;
    }
    
    console.log('Content script received message:', message.type);
    
    switch (message.type) {
      case 'toggleExtension':
        settings.enabled = message.enabled;
        updateVisibilityBasedOnSettings();
        break;
        
      case 'toggleCurrentPage':
        settings.showCurrentPage = message.showCurrentPage;
        updateVisibilityBasedOnSettings();
        break;
        
      case 'updateMarkStyle':
        settings.markStyle = message.markStyle;
        addCustomStyles();
        break;
        
      case 'updateColors':
        settings.colors = message.colors;
        addCustomStyles();
        break;
        
      case 'applySettings':
        // 更新全局设置
        settings = {...settings, ...message.settings};
        
        // 更新UI
        addCustomStyles();
        updateVisibilityBasedOnSettings();
        updateFloatButtonVisibility();
        break;
      
      case 'toggleVisibility':
        // 直接触发显示/隐藏标记
        toggleVisibility();
        break;
        
      case 'forceMarkLink':
        // 强制标记特定链接
        if (message.url) {
          const links = document.querySelectorAll(`a[href="${message.url}"]`);
          links.forEach(link => {
            // 添加到已处理集合
            markApplied.add(link);
            // 应用标记
            applyMarkStyle(link, Date.now());
          });
          showNotification('已标记链接');
        }
        break;
        
      case 'ignoreLink':
        // 忽略特定链接
        if (message.url) {
          const links = document.querySelectorAll(`a[href="${message.url}"]`);
          links.forEach(link => {
            // 移除标记
            link.removeAttribute('data-visited-marker');
            link.removeAttribute('data-visited-time');
            link.classList.remove('visited-marker-hidden');
            // 从已处理集合中移除
            markApplied.delete(link);
          });
          showNotification('已忽略链接');
        }
        break;
        
      case 'disablePage':
        // 禁用当前页面的新标记
        setPageMarkingState(false);
        showNotification('已禁用此页面的新标记');
        break;
        
      case 'enablePage':
        // 启用当前页面的标记
        setPageMarkingState(true);
        showNotification('已启用此页面的标记');
        break;
        
      case 'siteMuted':
        if (message.domain) {
          // 当前站点被静音
          showNotification(`已将 ${message.domain} 添加到排除列表`);
        }
        break;
        
      case 'addManualMark':
        // 手动添加标记模式
        enableManualMarkMode();
        break;
    }
    
    if (sendResponse) {
      sendResponse({ success: true });
    }
    
    return true;
  }
  
  // 根据设置更新可见性
  function updateVisibilityBasedOnSettings() {
    const shouldBeVisible = settings.enabled && settings.showCurrentPage;
    
    // 如果当前状态与期望状态不同，更新
    if (isCurrentlyVisible !== shouldBeVisible) {
      isCurrentlyVisible = shouldBeVisible;
      
      const links = document.querySelectorAll('a[data-visited-marker]');
      links.forEach(link => {
        if (isCurrentlyVisible) {
          link.classList.remove('visited-marker-hidden');
        } else {
          link.classList.add('visited-marker-hidden');
        }
      });
      
      // 更新按钮状态
      if (floatButton) {
        floatButton.innerHTML = isCurrentlyVisible ? '👁️' : '👁️‍🗨️';
        floatButton.title = isCurrentlyVisible ? '点击隐藏标记' : '点击显示标记';
      }
    }
  }
  
  // 更新悬浮按钮可见性
  function updateFloatButtonVisibility() {
    if (settings.showControlButton && !floatButton) {
      addFloatingControlButton();
    } else if (!settings.showControlButton && floatButton) {
      removeFloatingControlButton();
    }
  }
  
  // 记录链接点击
  document.addEventListener('click', function(e) {
    if (!isPageMarkingEnabled) return; // 如果页面禁用了标记，不记录新的访问
    
    // 检查点击的是否是链接
    let target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'A' && target.href && target.href.startsWith('http')) {
        // 记录访问
        registerLinkVisit(target.href);
        break;
      }
      target = target.parentNode;
    }
  }, true);
  
  // 注册链接访问
  function registerLinkVisit(url) {
    const now = Date.now();
    
    // 更新内存中的访问记录
    visitedLinks.set(url, now);
    
    // 更新存储
    chrome.storage.local.get('visitedLinks', function(result) {
      const storedLinks = result.visitedLinks || {};
      storedLinks[url] = now;
      chrome.storage.local.set({ 'visitedLinks': storedLinks });
    });
  }
  
  // 显示通知
  function showNotification(message) {
    // 检查是否已有通知元素
    let notification = document.querySelector('.visited-links-notification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'visited-links-notification';
      document.body.appendChild(notification);
    }
    
    // 设置消息
    notification.textContent = message;
    
    // 显示通知
    setTimeout(() => {
      notification.classList.add('show');
      
      // 3秒后自动隐藏
      setTimeout(() => {
        notification.classList.remove('show');
        
        // 动画结束后移除元素
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 3000);
    }, 10);
  }
  
  // 启用手动标记模式
  function enableManualMarkMode() {
    // 创建消息提示框（不再是全屏覆盖层）
    const messageBox = document.createElement('div');
    messageBox.className = 'visited-links-message-box';
    
    const message = document.createElement('div');
    message.className = 'visited-links-message';
    message.textContent = '点击选择要标记的链接';
    
    const instruction = document.createElement('span');
    instruction.textContent = '再次点击或按 Enter 标记选中的链接，Esc 退出标记模式';
    message.appendChild(instruction);
    
    messageBox.appendChild(message);
    document.body.appendChild(messageBox);
    
    // 添加光标样式
    document.body.classList.add('visited-links-mark-mode');
    
    // 存储所有可标记的链接
    const markableLinks = Array.from(document.querySelectorAll('a[href^="http"]'));
    let currentHighlightedLink = null;
    
    // 高亮当前选中的链接
    function highlightLink(link) {
      if (currentHighlightedLink) {
        currentHighlightedLink.classList.remove('visited-links-highlight');
      }
      if (link) {
        link.classList.add('visited-links-highlight');
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        currentHighlightedLink = link;
      }
    }
    
    // 标记链接
    function markLink(link) {
      if (link && link.href && link.href.startsWith('http')) {
        registerLinkVisit(link.href);
        processLink(link);
        showNotification('已标记链接');
        exitMarkMode();
      }
    }
    
    // 处理键盘导航
    function handleKeyDown(e) {
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (markableLinks.length > 0) {
            const currentIndex = markableLinks.indexOf(currentHighlightedLink);
            let nextIndex;
            if (e.shiftKey) {
              // Shift+Tab: 向前选择
              nextIndex = currentIndex <= 0 ? markableLinks.length - 1 : currentIndex - 1;
            } else {
              // Tab: 向后选择
              nextIndex = currentIndex >= markableLinks.length - 1 ? 0 : currentIndex + 1;
            }
            highlightLink(markableLinks[nextIndex]);
          }
          break;
          
        case 'Enter':
          // 标记当前选中的链接
          if (currentHighlightedLink) {
            markLink(currentHighlightedLink);
          }
          break;
          
        case 'Escape':
          exitMarkMode();
          break;
      }
    }
    
    // 点击处理
    function handleClick(e) {
      let target = e.target;
      
      // 忽略消息框自身的点击
      if (messageBox.contains(target)) {
        return;
      }
      
      // 查找最近的链接元素
      while (target && target !== document.body) {
        if (target.tagName === 'A' && target.href && target.href.startsWith('http')) {
          e.preventDefault(); // 阻止链接跳转
          
          // 如果点击的是当前高亮的链接，则标记它
          if (target === currentHighlightedLink) {
            markLink(target);
          } else {
            // 否则高亮这个链接
            highlightLink(target);
            message.textContent = '再次点击或按 Enter 标记此链接';
            message.appendChild(instruction);
          }
          return;
        }
        target = target.parentNode;
      }
      
      // 如果点击的不是链接，显示提示
      if (!target || target === document.body) {
        message.textContent = '未找到链接，请点击一个有效的链接';
        setTimeout(() => {
          message.textContent = '点击选择要标记的链接';
          message.appendChild(instruction);
        }, 1500);
      }
    }
    
    // 退出标记模式
    function exitMarkMode() {
      document.body.classList.remove('visited-links-mark-mode');
      if (currentHighlightedLink) {
        currentHighlightedLink.classList.remove('visited-links-highlight');
      }
      if (messageBox.parentNode) {
        messageBox.parentNode.removeChild(messageBox);
      }
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    }
    
    // 绑定事件
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown);
    
    // 30秒后自动退出
    setTimeout(exitMarkMode, 30000);
  }
  
  // 启动插件
  init();

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      // 检查页面标记状态
      checkPageMarkingState().then(enabled => {
        isPageMarkingEnabled = enabled;
        
        // 重新加载访问历史并更新标记
        loadVisitedLinks().then(() => {
          // 清除已处理的标记集合，以允许重新处理所有链接
          markApplied.clear();
          // 重新标记所有链接
          markVisitedLinksOnPage();
        });
      });
    }
  });

  // 监听浏览器后退/前进
  window.addEventListener('popstate', function() {
    // 检查页面标记状态
    checkPageMarkingState().then(enabled => {
      isPageMarkingEnabled = enabled;
      
      // 重新加载访问历史并更新标记
      loadVisitedLinks().then(() => {
        // 清除已处理的标记集合，以允许重新处理所有链接
        markApplied.clear();
        // 重新标记所有链接
        markVisitedLinksOnPage();
      });
    });
  });
})(); 