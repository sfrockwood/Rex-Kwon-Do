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

function createTimerDisplay() {
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
    top: 20px !important;
    right: 20px !important;
    background: rgba(0, 0, 0, 0.8) !important;
    color: white !important;
    padding: 8px 12px !important;
    border-radius: 6px !important;
    font-family: Arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: bold !important;
    z-index: 2147483647 !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    pointer-events: none !important;
  `;
  
  console.log('Timer: Creating timer display');
  
  // Try multiple attachment points for better persistence
  const attachPoint = document.body || document.documentElement;
  attachPoint.appendChild(timerDisplay);
  startTimer();
  
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

function startTimer() {
  if (!timerDisplay) return;
  
  startTime = Date.now();
  const timeLimit = getTimeLimit();
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, timeLimit - elapsed);
    
    if (remaining > 0) {
      timerDisplay.textContent = `${remaining}s left`;
      
      // Change color as time runs out
      if (remaining <= 10) {
        timerDisplay.style.background = 'rgba(220, 53, 69, 0.9)';
      } else if (remaining <= 20) {
        timerDisplay.style.background = 'rgba(255, 193, 7, 0.9)';
      }
    } else {
      timerDisplay.textContent = 'Time\'s up!';
      timerDisplay.style.background = 'rgba(220, 53, 69, 0.9)';
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
    console.log('Timer: Received block message, blocking site');
    blockSite().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Timer: Error in blockSite:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'startTimer') {
    console.log('Timer: Received startTimer message');
    createTimerDisplay();
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
    
    // Show block overlay based on session count
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
    background: rgb(0, 0, 0) !important;
    color: white !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: Arial, sans-serif !important;
    font-size: 24px !important;
    text-align: center !important;
    z-index: 2147483647 !important;
  `;
  
  const unblockButtonHtml = isFirstSession ? `
    <button id="unblock-btn" style="
      margin-top: 20px;
      padding: 10px 20px;
      font-size: 16px;
      background: #1DA1F2;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    ">I need to do work-related tasks (unblock for this session)</button>
  ` : '';
  
  const sessionMessage = isFirstSession ? '' : '<p style="color: #ff6b6b !important; font-size: 18px !important;">No more unblocks available.<br>Take a break!</p>';
  
  overlay.innerHTML = `
    <div style="color: white !important;">
      <h2 style="color: white !important;">Time's up!</h2>
      <p style="color: white !important;">You've spent ${timeLimit} seconds on ${siteName} this session.</p>
      <p style="color: white !important;">Take a break and come back later.</p>
      ${sessionMessage}
      ${unblockButtonHtml}
    </div>
  `;
  
  document.body.appendChild(overlay);
  console.log('Timer: Block overlay added to DOM', { sessionCount, isFirstSession });
  
  // If this is the second session block (no unblock button), start the 5-minute lockout
  if (!isFirstSession) {
    console.log('Timer: Second session block, starting 5-minute lockout');
    chrome.runtime.sendMessage({ 
      action: 'startLockout',
      siteName: siteName 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Timer: Error sending startLockout message:', chrome.runtime.lastError);
      } else {
        console.log('Timer: StartLockout message sent successfully:', response);
      }
    });
  }
  
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
    background: rgb(0, 0, 0) !important;
    color: white !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: Arial, sans-serif !important;
    font-size: 24px !important;
    text-align: center !important;
    z-index: 2147483647 !important;
  `;
  
  overlay.innerHTML = `
    <div style="color: white !important;">
      <h2 style="color: white !important;">🔒 Site Locked</h2>
      <p style="color: white !important;">You completed both sessions for this site.</p>
      <p style="color: #ff6b6b !important; font-size: 20px !important;">Lockout: ${remainingMinutes} minutes remaining</p>
      <p style="color: white !important; font-size: 18px !important;">Take a real break and come back later!</p>
    </div>
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
              const countdownElement = overlay.querySelector('p[style*="color: #ff6b6b"]');
              if (countdownElement) {
                countdownElement.textContent = `Lockout: ${remaining} minutes remaining`;
              }
            }
          }
        });
      }
    });
  }, 60000);
}