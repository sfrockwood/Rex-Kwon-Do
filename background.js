let tabTimers = {};
let blockedTabs = {};
let settings = {
  websites: {
    'x.com': 30,
    'twitter.com': 30
  },
  defaultTime: 30
};

// Load settings on startup
chrome.runtime.onStartup.addListener(loadSettings);
chrome.runtime.onInstalled.addListener(loadSettings);

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['blockerSettings']);
    if (result.blockerSettings) {
      settings = result.blockerSettings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function isBlockedWebsite(url) {
  if (!url) return false;
  
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return settings.websites.hasOwnProperty(hostname);
}

function getTimeLimit(url) {
  if (!url) return settings.defaultTime;
  
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return settings.websites[hostname] || settings.defaultTime;
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await loadSettings();
  const tabId = activeInfo.tabId;
  chrome.tabs.get(tabId, async (tab) => {
    if (isBlockedWebsite(tab.url)) {
      const shouldBlock = await checkIfShouldBlock(tab.url);
      if (shouldBlock.block) {
        console.log('Background: Site should be immediately blocked');
        chrome.tabs.sendMessage(tabId, { action: 'block' });
      } else {
        console.log('Background: Starting normal timer');
        startTimer(tabId, tab.url);
        // Tell content script to start timer display
        chrome.tabs.sendMessage(tabId, { action: 'startTimer' });
      }
    }
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isBlockedWebsite(tab.url)) {
    await loadSettings();
    const shouldBlock = await checkIfShouldBlock(tab.url);
    if (shouldBlock.block) {
      console.log('Background: Site should be immediately blocked');
      chrome.tabs.sendMessage(tabId, { action: 'block' });
    } else {
      console.log('Background: Starting normal timer');
      startTimer(tabId, tab.url);
      // Tell content script to start timer display
      chrome.tabs.sendMessage(tabId, { action: 'startTimer' });
    }
  }
});

async function checkIfShouldBlock(url) {
  const siteName = new URL(url).hostname;
  const lockoutKey = `lockout_${siteName}`;
  
  try {
    const result = await chrome.storage.session.get([lockoutKey]);
    const lockoutEnd = result[lockoutKey] || 0;
    const now = Date.now();
    
    // If in 5-minute lockout period, block immediately
    if (lockoutEnd > now) {
      const remainingMinutes = Math.ceil((lockoutEnd - now) / 60000);
      console.log(`Background: ${siteName} is in 5-minute lockout until ${new Date(lockoutEnd).toLocaleTimeString()} (${remainingMinutes} mins remaining)`);
      return { block: true, reason: 'lockout' };
    }
    
    // Otherwise allow normal timer to start
    console.log(`Background: ${siteName} not in lockout, allowing normal timer`);
    return { block: false };
  } catch (error) {
    console.error('Background: Error checking lockout status:', error);
    return { block: false };
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTab(tabId);
});

function startTimer(tabId, url) {
  if (blockedTabs[tabId] || tabTimers[tabId]) return;
  
  const timeLimit = getTimeLimit(url) * 1000; // Convert to milliseconds
  console.log(`Background: Starting timer for tab ${tabId}, time limit: ${timeLimit}ms`);
  
  tabTimers[tabId] = setTimeout(() => {
    console.log(`Background: Timer expired for tab ${tabId}, sending block message`);
    blockedTabs[tabId] = true;
    chrome.tabs.sendMessage(tabId, { action: 'block' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Background: Error sending block message:', chrome.runtime.lastError);
      } else {
        console.log('Background: Block message sent successfully');
      }
    });
    delete tabTimers[tabId];
  }, timeLimit);
}

function cleanupTab(tabId) {
  if (tabTimers[tabId]) {
    clearTimeout(tabTimers[tabId]);
    delete tabTimers[tabId];
  }
  delete blockedTabs[tabId];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background: Received message:', request.action, 'from', sender.tab?.url || 'unknown');
  
  if (request.action === 'getSessionStatus') {
    const siteName = request.siteName;
    const sessionKey = `session_${siteName}`;
    const lockoutKey = `lockout_${siteName}`;
    
    console.log(`Background: Processing getSessionStatus for ${siteName}`);
    
    // Handle async operation properly
    (async () => {
      try {
        const result = await chrome.storage.session.get([sessionKey, lockoutKey]);
        const sessionCount = result[sessionKey] || 0; // 0 = first session, 1 = second session
        const lockoutEnd = result[lockoutKey] || 0;
        
        console.log(`Background: Session status request for ${siteName}`);
        console.log(`Background: Storage keys checked: ${sessionKey}, ${lockoutKey}`);
        console.log(`Background: Raw storage result:`, result);
        console.log(`Background: Parsed values:`, { sessionCount, lockoutEnd, now: Date.now() });
        
        sendResponse({ sessionCount, lockoutEnd });
      } catch (error) {
        console.error('Background: Error getting session status:', error);
        sendResponse({ sessionCount: 0, lockoutEnd: 0 });
      }
    })();
    
    return true; // Keep message channel open for async response
    
  } else if (request.action === 'unblock') {
    const tabId = sender.tab.id;
    const siteName = request.siteName || new URL(sender.tab.url).hostname;
    
    console.log(`Background: Processing unblock for ${siteName}`);
    
    // Handle async operation properly  
    (async () => {
      try {
        // Move from session 0 to session 1 (first unblock used)
        const sessionKey = `session_${siteName}`;
        
        await chrome.storage.session.set({ [sessionKey]: 1 });
        console.log(`Background: ${siteName} moved to session 1 (second session will have no unblock)`);
        
        // Verify it was set correctly
        const verification = await chrome.storage.session.get([sessionKey]);
        console.log(`Background: Verification - ${sessionKey} is now:`, verification[sessionKey]);
        
        delete blockedTabs[tabId];
        chrome.tabs.reload(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error(`Background: Error setting session for ${siteName}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep message channel open
    
  } else if (request.action === 'startLockout') {
    const siteName = request.siteName;
    
    console.log(`Background: Processing startLockout for ${siteName}`);
    
    // Handle async operation properly
    (async () => {
      try {
        // This happens when second session timer expires (no unblock button shown)
        const lockoutKey = `lockout_${siteName}`;
        const sessionKey = `session_${siteName}`;
        const lockoutEnd = Date.now() + (5 * 60 * 1000); // 5 minutes from now
        
        await chrome.storage.session.set({ 
          [lockoutKey]: lockoutEnd,
          [sessionKey]: 2 // Mark as in lockout state
        });
        console.log(`Background: Started 5-minute lockout for ${siteName} until ${new Date(lockoutEnd).toLocaleTimeString()}`);
        sendResponse({ success: true });
      } catch (error) {
        console.error(`Background: Error starting lockout for ${siteName}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep message channel open
    
  } else if (request.action === 'checkLockoutExpired') {
    const siteName = request.siteName;
    
    console.log(`Background: Processing checkLockoutExpired for ${siteName}`);
    
    // Handle async operation properly
    (async () => {
      try {
        // Check if lockout has expired and reset if so
        const lockoutKey = `lockout_${siteName}`;
        const sessionKey = `session_${siteName}`;
        
        const result = await chrome.storage.session.get([lockoutKey]);
        const lockoutEnd = result[lockoutKey] || 0;
        const now = Date.now();
        
        if (lockoutEnd > 0 && now > lockoutEnd) {
          // Lockout expired, reset to session 0
          await chrome.storage.session.remove([lockoutKey, sessionKey]);
          console.log(`Background: Lockout expired for ${siteName}, reset to session 0`);
          sendResponse({ expired: true });
        } else {
          sendResponse({ expired: false });
        }
      } catch (error) {
        console.error('Background: Error checking lockout expiry:', error);
        sendResponse({ expired: false });
      }
    })();
    
    return true; // Keep message channel open
    
  } else if (request.action === 'settingsUpdated') {
    console.log('Background: Processing settingsUpdated');
    
    // Handle async operation properly
    (async () => {
      try {
        await loadSettings();
        sendResponse({ success: true });
      } catch (error) {
        console.error('Background: Error updating settings:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep message channel open
  }
  
  // If no action matched, log it
  console.log('Background: Unknown action received:', request.action);
});

// Initialize settings
loadSettings();