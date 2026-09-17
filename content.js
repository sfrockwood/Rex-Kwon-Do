// ── THEME ──────────────────────────────────────────────────────────────
// Change ACTIVE_THEME to 'karate' to switch visual styles.
const ACTIVE_THEME = 'karate';

const THEMES = {
  americana: {
    icon: '🦅',
    blockTitle: 'FOCUS BROKEN',
    lockoutTitle: 'STAND DOWN',
    tagline: 'Honor the break. Come back stronger.',
    quote: '"Bow to your sensei."',
    bg: '#080c1a', gold: '#f0a500', red: '#c0152a', blue: '#1a3a6e', text: '#f0ece0',
    timerGlow: '0 0 0 1px #f0a500, 0 2px 12px rgba(192, 21, 42, 0.5)',
    overlayBg: '#080c1a',
    blockTitleColor: '#f0a500', blockTitleShadow: '3px 3px 0 #c0152a',
    lockoutTitleColor: '#c0152a', lockoutTitleShadow: '3px 3px 0 #f0a500',
    noUnblockColor: '#c0152a',
    unblockBg: '#1a3a6e', unblockText: '#f0a500', unblockBorder: '#f0a500',
    overlayTopAccent: `<div style="position:absolute;top:0;left:0;width:100%;height:10px;background:repeating-linear-gradient(90deg,#c0152a 0px,#c0152a 24px,#f0ece0 24px,#f0ece0 48px,#1a3a6e 48px,#1a3a6e 72px);"></div>`,
    overlayBottomAccent: `<div style="position:absolute;bottom:0;left:0;width:100%;height:6px;background:repeating-linear-gradient(90deg,#1a3a6e 0px,#1a3a6e 24px,#f0ece0 24px,#f0ece0 48px,#c0152a 48px,#c0152a 72px);"></div>`,
  },
  karate: {
    icon: '🐉',
    blockTitle: 'FORGET ABOUT IT!',
    lockoutTitle: 'BREAK THE WRIST, WALK AWAY!',
    lockoutImage: 'break-the-wrist.png',
    tagline: 'A warrior knows when to retreat.',
    quote: '"A true champion is disciplined in all things."',
    bg: '#0a0000', gold: '#ffd700', red: '#cc0000', blue: '#550000', text: '#fff8f0',
    timerGlow: '0 0 0 1px #ffd700, 0 2px 12px rgba(204, 0, 0, 0.5)',
    overlayBg: 'radial-gradient(circle at 50% 50%, rgba(5,0,0,0.25) 0%, rgba(5,0,0,0.1) 35%, transparent 65%), repeating-conic-gradient(from 0deg at 50% 50%, #1a0000 0deg 9deg, #2a0000 9deg 18deg)',
    blockTitleColor: '#ffd700', blockTitleShadow: '3px 3px 0 #cc0000',
    lockoutTitleColor: '#cc0000', lockoutTitleShadow: '3px 3px 0 #ffd700',
    noUnblockColor: '#cc0000',
    unblockBg: '#440000', unblockText: '#ffd700', unblockBorder: '#ffd700',
    overlayImage: 'eagle.png',
    overlayTopAccent: `<div style="position:absolute;top:10px;left:10px;right:10px;bottom:10px;border:1px solid rgba(255,215,0,0.25);pointer-events:none;"></div>`,
    overlayBottomAccent: '',
  },
};

const T = THEMES[ACTIVE_THEME];

let isBlocked = false;
let settings = null;
let timerDisplay = null;
let startTime = null;
let timerInterval = null;

// Load settings when content script loads
loadSettings();

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['blockerSettings']);
    if (result.blockerSettings) {
      settings = result.blockerSettings;
    } else {
      settings = {
        websites: { 'x.com': 30, 'twitter.com': 30 },
        defaultTime: 30
      };
    }
    console.log('Timer: Settings loaded', settings);
    // Try to create timer after settings load
    if (document.readyState === 'complete') {
      createTimerDisplay();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = {
      websites: { 'x.com': 30, 'twitter.com': 30 },
      defaultTime: 30
    };
  }
}

function getTimeLimit() {
  if (!settings) return 30;
  
  const hostname = window.location.hostname.replace(/^www\./, '');
  return settings.websites[hostname] || settings.defaultTime;
}

function isCurrentSiteBlocked() {
  if (!settings) return false;
  const hostname = window.location.hostname.replace(/^www\./, '');
  return settings.websites.hasOwnProperty(hostname);
}

function createTimerDisplay(customDuration = null) {
  console.log('Timer: createTimerDisplay called', {
    hasTimer: !!timerDisplay,
    isBlocked: isCurrentSiteBlocked(),
    hostname: window.location.hostname,
    settings: settings
  });
  
  if (timerDisplay) {
    console.log('Timer: Already exists, skipping');
    return;
  }
  
  if (!isCurrentSiteBlocked()) {
    console.log('Timer: Site not blocked, skipping');
    return;
  }
  
  timerDisplay = document.createElement('div');
  timerDisplay.id = 'website-timer-display';
  timerDisplay.style.cssText = `
    position: fixed !important;
    top: 16px !important;
    right: 16px !important;
    background: ${T.bg} !important;
    color: ${T.gold} !important;
    padding: 6px 12px !important;
    border: 2px solid ${T.red} !important;
    box-shadow: ${T.timerGlow} !important;
    font-family: Impact, Arial, sans-serif !important;
    font-size: 15px !important;
    font-weight: normal !important;
    letter-spacing: 3px !important;
    text-transform: uppercase !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  `;
  
  console.log('Timer: Creating timer display');
  
  // Try multiple attachment points for better persistence
  const attachPoint = document.body || document.documentElement;
  attachPoint.appendChild(timerDisplay);
  startTimer(customDuration);
  
  // Watch for DOM changes that might remove our timer
  const observer = new MutationObserver(() => {
    if (timerDisplay && !document.contains(timerDisplay)) {
      console.log('Timer: Timer was removed from DOM, recreating');
      timerDisplay = null;
      setTimeout(createTimerDisplay, 200);
    }
  });
  
  // Observe both body and documentElement for changes
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  
  // Periodic check to ensure timer stays visible
  const persistenceCheck = setInterval(() => {
    if (!timerDisplay || !document.contains(timerDisplay)) {
      console.log('Timer: Periodic check - timer missing, recreating');
      if (timerDisplay) removeTimerDisplay();
      setTimeout(createTimerDisplay, 100);
    }
  }, 2000);
  
  // Store the interval so we can clean it up later
  if (!window.timerPersistenceInterval) {
    window.timerPersistenceInterval = persistenceCheck;
  }
}

function startTimer(customDuration = null) {
  if (!timerDisplay) return;

  startTime = Date.now();
  const timeLimit = customDuration !== null ? customDuration : getTimeLimit();
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, timeLimit - elapsed);
    
    if (remaining > 0) {
      timerDisplay.textContent = `${remaining}S LEFT`;

      if (remaining <= 10) {
        timerDisplay.style.background = T.red;
        timerDisplay.style.color = T.text;
      } else if (remaining <= 20) {
        timerDisplay.style.background = T.blue;
        timerDisplay.style.color = T.gold;
      }
    } else {
      timerDisplay.textContent = `TIME'S UP!`;
      timerDisplay.style.background = T.red;
      timerDisplay.style.color = T.text;
      clearInterval(timerInterval);
      
      // Fallback: If background script doesn't block us, block ourselves
      console.log('Timer: Time expired, waiting for background script block message');
      setTimeout(() => {
        if (!isBlocked) {
          console.log('Timer: No block message received, blocking ourselves');
          blockSite();
        }
      }, 1000);
    }
  }, 1000);
}

function removeTimerDisplay() {
  if (timerDisplay) {
    timerDisplay.remove();
    timerDisplay = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Initialize timer when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createTimerDisplay);
} else {
  createTimerDisplay();
}

// Clean up when page unloads
window.addEventListener('beforeunload', removeTimerDisplay);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Timer: Received message from background script:', request);
  
  if (request.action === 'block' && !isBlocked) {
    if (request.isOneoff) {
      console.log('Timer: Received one-off block message, going straight to lockout');
      isBlocked = true;
      removeTimerDisplay();
      const siteName = window.location.hostname;
      chrome.runtime.sendMessage({ action: 'startLockout', siteName }, () => {
        showLockoutOverlay(siteName, 5);
      });
      sendResponse({ success: true });
    } else {
      console.log('Timer: Received block message, blocking site');
      blockSite().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Timer: Error in blockSite:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    }
  } else if (request.action === 'startTimer') {
    console.log('Timer: Received startTimer message');
    createTimerDisplay(request.duration || null);
    sendResponse({ success: true });
  } else {
    console.log('Timer: Ignored message (already blocked or unknown action)');
  }
});

async function blockSite() {
  isBlocked = true;
  console.log('Timer: blockSite() called');
  
  const timeLimit = getTimeLimit();
  const siteName = window.location.hostname;
  
  try {
    console.log(`Timer: Requesting session status for ${siteName}`);
    
    // Get session status using promise instead of callback
    const response = await new Promise((resolve, reject) => {
      console.log('Timer: Sending getSessionStatus message to background script');
      
      chrome.runtime.sendMessage({ 
        action: 'getSessionStatus', 
        siteName: siteName 
      }, (response) => {
        console.log('Timer: Received response from background script:', response);
        console.log('Timer: chrome.runtime.lastError:', chrome.runtime.lastError);
        
        if (chrome.runtime.lastError) {
          console.error('Timer: Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`));
        } else if (!response) {
          console.error('Timer: No response received from background script');
          reject(new Error('No response from background script'));
        } else {
          console.log('Timer: Successfully received response:', response);
          resolve(response);
        }
      });
    });
    
    console.log('Timer: Session status response:', response);
    
    const { sessionCount, lockoutEnd } = response;
    const now = Date.now();
    
    // Check if still in lockout
    if (lockoutEnd > now) {
      console.log('Timer: Site is in lockout, showing lockout overlay');
      const remainingMinutes = Math.ceil((lockoutEnd - now) / 60000);
      showLockoutOverlay(siteName, remainingMinutes);
      return;
    }
    
    // Second session expired → go straight to lockout screen
    if (sessionCount >= 1) {
      console.log('Timer: Second session expired, starting lockout and showing lockout screen');
      chrome.runtime.sendMessage({ action: 'startLockout', siteName }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Timer: Error starting lockout:', chrome.runtime.lastError);
        }
        showLockoutOverlay(siteName, 5);
      });
      return;
    }

    // First session block
    console.log(`Timer: Showing block overlay for ${siteName} with sessionCount: ${sessionCount}`);
    showBlockOverlay(siteName, timeLimit, sessionCount);
    
  } catch (error) {
    console.error('Timer: Error getting session status:', error);
    // Proceed with default (first session)
    console.log('Timer: Using default session (0) due to error');
    showBlockOverlay(siteName, timeLimit, 0);
  }
}

function showBlockOverlay(siteName, timeLimit, sessionCount) {
  // sessionCount: 0 = first session (show unblock button), 1 = second session (no unblock button)
  const isFirstSession = sessionCount === 0;
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'timer-block-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: ${T.overlayBg} !important;
    color: ${T.text} !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: Arial, sans-serif !important;
    text-align: center !important;
    z-index: 2147483647 !important;
  `;

  const unblockButtonHtml = isFirstSession ? `
    <button id="unblock-btn" style="
      margin-top: 28px; padding: 16px 40px; font-size: 16px;
      font-family: Impact, Arial, sans-serif; letter-spacing: 3px;
      text-transform: uppercase; cursor: pointer;
      background: ${T.unblockBg}; color: ${T.unblockText}; border: 2px solid ${T.unblockBorder};
    ">★ I Need to Handle Something ★</button>
  ` : '';

  const sessionMessage = isFirstSession ? '' : `
    <p style="
      color: ${T.noUnblockColor} !important;
      font-family: Impact, Arial, sans-serif !important;
      font-size: 18px !important; letter-spacing: 3px !important;
      text-transform: uppercase !important; margin-top: 16px !important;
    ">No more unblocks.<br>Stand down.</p>
  `;

  const textContent = `
    <h2 style="
      font-family: Impact, Arial, sans-serif !important; font-size: 64px !important;
      letter-spacing: 8px !important; margin: 0 0 10px 0 !important;
      text-transform: uppercase !important;
      color: ${T.blockTitleColor} !important; text-shadow: ${T.blockTitleShadow} !important;
    ">${T.blockTitle}</h2>

    <p style="
      color: ${T.gold} !important; font-family: Impact, Arial, sans-serif !important;
      font-size: 18px !important; letter-spacing: 4px !important;
      text-transform: uppercase !important; margin: 0 0 12px 0 !important; opacity: 0.85 !important;
    ">${T.tagline}</p>

    <p style="color: ${T.text} !important; font-size: 16px !important; margin: 4px 0 !important; letter-spacing: 1px !important; opacity: 0.7 !important;">
      ${timeLimit} seconds on ${siteName}
    </p>

    ${sessionMessage}
    ${unblockButtonHtml}
  `;

  const heroHtml = T.overlayImage ? (() => {
    const imgUrl = chrome.runtime.getURL(T.overlayImage);
    return `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <img src="${imgUrl}" style="
          height: 64vh; object-fit: contain; flex-shrink: 0; pointer-events: none;
        ">
        <div style="margin-top: -22vh; position: relative; z-index: 1; text-align: center; padding: 0 40px; width: 100%;">
          ${textContent}
        </div>
      </div>
    `;
  })() : `
    <div style="font-size: 56px; margin-bottom: 10px; line-height: 1;">${T.icon}</div>
    ${textContent}
  `;

  overlay.innerHTML = `
    ${T.overlayTopAccent}
    ${heroHtml}
    ${T.overlayBottomAccent}
  `;
  
  document.body.appendChild(overlay);
  console.log('Timer: Block overlay added to DOM', { sessionCount, isFirstSession });

  // Add click handler for unblock button if it exists
  if (isFirstSession) {
    const unblockBtn = document.getElementById('unblock-btn');
    if (unblockBtn) {
      console.log('Timer: Adding click handler to unblock button');
      unblockBtn.addEventListener('click', async () => {
        console.log(`Timer: Unblock button clicked for ${siteName}`);
        
        try {
          // Send unblock message to background script and wait for response
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
              action: 'unblock',
              siteName: siteName 
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          console.log(`Timer: Unblock successful for ${siteName}, response:`, response);
          console.log('Timer: Page should reload shortly...');
        } catch (error) {
          console.error(`Timer: Error unblocking ${siteName}:`, error);
        }
      });
    } else {
      console.error('Timer: Could not find unblock button in DOM');
    }
  }
}

function showLockoutOverlay(siteName, remainingMinutes) {
  const overlay = document.createElement('div');
  overlay.id = 'timer-block-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: ${T.overlayBg} !important;
    color: ${T.text} !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: Arial, sans-serif !important;
    text-align: center !important;
    z-index: 2147483647 !important;
  `;

  const lockoutTextContent = `
    <h2 style="
      font-family: Impact, Arial, sans-serif !important; font-size: 64px !important;
      letter-spacing: 8px !important; margin: 0 0 10px 0 !important;
      text-transform: uppercase !important;
      color: ${T.blockTitleColor} !important; text-shadow: ${T.blockTitleShadow} !important;
    ">${T.lockoutTitle}</h2>

    <p id="lockout-countdown-display" style="
      color: ${T.gold} !important; font-family: Impact, Arial, sans-serif !important;
      font-size: 32px !important; letter-spacing: 5px !important;
      text-transform: uppercase !important; margin: 12px 0 4px 0 !important;
    ">${remainingMinutes} MIN LOCKOUT</p>

    <p style="
      color: ${T.text} !important; font-family: Impact, Arial, sans-serif !important;
      font-size: 11px !important; letter-spacing: 4px !important;
      text-transform: uppercase !important; margin: 10px 0 0 0 !important; opacity: 0.5 !important;
    ">${T.quote}</p>
  `;

  const lockoutHeroHtml = T.lockoutImage ? (() => {
    const imgUrl = chrome.runtime.getURL(T.lockoutImage);
    return `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <img src="${imgUrl}" style="
          height: 64vh; object-fit: contain; flex-shrink: 0; pointer-events: none;
        ">
        <div style="margin-top: -22vh; position: relative; z-index: 1; text-align: center; padding: 0 40px; width: 100%;">
          ${lockoutTextContent}
        </div>
      </div>
    `;
  })() : `
    <div style="font-size: 56px; margin-bottom: 10px; line-height: 1;">${T.icon}</div>
    ${lockoutTextContent}
  `;

  overlay.innerHTML = `
    ${T.overlayTopAccent}
    ${lockoutHeroHtml}
    ${T.overlayBottomAccent}
  `;
  
  document.body.appendChild(overlay);
  
  // Update countdown every minute and check if lockout expired
  const countdown = setInterval(() => {
    chrome.runtime.sendMessage({ 
      action: 'checkLockoutExpired',
      siteName: siteName 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Timer: Error checking lockout expiry:', chrome.runtime.lastError);
        return;
      }
      
      if (response.expired) {
        console.log('Timer: Lockout expired, reloading page');
        clearInterval(countdown);
        location.reload();
      } else {
        // Update countdown display
        chrome.runtime.sendMessage({ 
          action: 'getSessionStatus', 
          siteName: siteName 
        }, (statusResponse) => {
          if (!chrome.runtime.lastError && statusResponse.lockoutEnd) {
            const now = Date.now();
            const remaining = Math.ceil((statusResponse.lockoutEnd - now) / 60000);
            
            if (remaining > 0) {
              const countdownElement = overlay.querySelector('#lockout-countdown-display');
              if (countdownElement) {
                countdownElement.textContent = `${remaining} MIN LOCKOUT`;
              }
            }
          }
        });
      }
    });
  }, 60000);
}