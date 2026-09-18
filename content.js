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
    unblockBg: '#440000', unblockText: '#ffd700', unblockBorder: '#ffd700',
    overlayImage: 'eagle.png',
    overlayTopAccent: `<div style="position:absolute;top:10px;left:10px;right:10px;bottom:10px;border:1px solid rgba(255,215,0,0.25);pointer-events:none;"></div>`,
    overlayBottomAccent: '',
  },
};

const T = THEMES[ACTIVE_THEME];
let timerDisplay = null;
let timerInterval = null;
let timerEndTime = 0;
let expirationSent = false;
let lockoutInterval = null;

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function removeOverlay() {
  document.getElementById('timer-block-overlay')?.remove();
  if (lockoutInterval) clearInterval(lockoutInterval);
  lockoutInterval = null;
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerEndTime = 0;
  timerDisplay?.remove();
  timerDisplay = null;
}

function clearUi() {
  stopTimer();
  removeOverlay();
  expirationSent = false;
}

function ensureTimerDisplay() {
  if (timerDisplay && document.contains(timerDisplay)) return;

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
  (document.body || document.documentElement).appendChild(timerDisplay);
}

function updateTimer() {
  ensureTimerDisplay();
  const remaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));

  if (remaining > 0) {
    timerDisplay.textContent = `${remaining}S LEFT`;
    timerDisplay.style.background = remaining <= 10 ? T.red : remaining <= 20 ? T.blue : T.bg;
    timerDisplay.style.color = remaining <= 10 ? T.text : T.gold;
    return;
  }

  timerDisplay.textContent = `TIME'S UP!`;
  timerDisplay.style.background = T.red;
  timerDisplay.style.color = T.text;
  clearInterval(timerInterval);
  timerInterval = null;

  if (!expirationSent) {
    expirationSent = true;
    sendMessage({ action: 'timerExpired' })
      .then((response) => {
        if (!response?.success) throw new Error(response?.error || 'Unable to expire timer');
        if (response.transition && !document.getElementById('timer-block-overlay')) {
          handleCommand(response.transition);
        }
      })
      .catch(() => {
        expirationSent = false;
        timerInterval = setInterval(updateTimer, 1000);
      });
  }
}

function startTimer(endTime) {
  clearUi();
  timerEndTime = endTime;
  updateTimer();
  if (timerEndTime > Date.now()) timerInterval = setInterval(updateTimer, 1000);
}

function createOverlay() {
  clearUi();
  const overlay = document.createElement('div');
  overlay.id = 'timer-block-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    inset: 0 !important;
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
  return overlay;
}

function heroHtml(content, imageName = T.overlayImage) {
  if (!imageName) {
    return `<div style="font-size:56px;margin-bottom:10px;line-height:1;">${T.icon}</div>${content}`;
  }

  return `
    <div style="display:flex;flex-direction:column;align-items:center;width:100%;">
      <img src="${chrome.runtime.getURL(imageName)}" style="height:50vh;object-fit:contain;flex-shrink:0;pointer-events:none;">
      <div style="position:relative;z-index:1;text-align:center;padding:12px 40px 0;width:100%;">
        ${content}
      </div>
    </div>
  `;
}

function showFirstBlock(hostname, duration) {
  const overlay = createOverlay();
  const content = `
    <h2 style="font-family:Impact,Arial,sans-serif!important;font-size:64px!important;letter-spacing:8px!important;margin:0 0 10px!important;text-transform:uppercase!important;color:${T.blockTitleColor}!important;text-shadow:${T.blockTitleShadow}!important;">${T.blockTitle}</h2>
    <p style="color:${T.gold}!important;font-family:Impact,Arial,sans-serif!important;font-size:18px!important;letter-spacing:4px!important;text-transform:uppercase!important;margin:0 0 12px!important;opacity:.85!important;">${T.tagline}</p>
    <p style="color:${T.text}!important;font-size:16px!important;margin:4px 0!important;letter-spacing:1px!important;opacity:.7!important;">${duration} seconds on ${hostname}</p>
    <button id="unblock-btn" style="margin-top:28px;padding:16px 40px;font-size:16px;font-family:Impact,Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;cursor:pointer;background:${T.unblockBg};color:${T.unblockText};border:2px solid ${T.unblockBorder};">★ I Need to Handle Something ★</button>
  `;
  overlay.innerHTML = `${T.overlayTopAccent}${heroHtml(content)}${T.overlayBottomAccent}`;
  (document.body || document.documentElement).appendChild(overlay);

  overlay.querySelector('#unblock-btn').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const response = await sendMessage({ action: 'unblock' }).catch((error) => ({ error: error.message }));
    if (!response?.success) {
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = response?.error || 'Unable to unblock';
    }
  });
}

function lockoutContent(remainingMinutes) {
  return `
    <h2 style="font-family:Impact,Arial,sans-serif!important;font-size:64px!important;letter-spacing:8px!important;margin:0 0 10px!important;text-transform:uppercase!important;color:${T.blockTitleColor}!important;text-shadow:${T.blockTitleShadow}!important;">${T.lockoutTitle}</h2>
    <p id="lockout-countdown-display" style="color:${T.gold}!important;font-family:Impact,Arial,sans-serif!important;font-size:32px!important;letter-spacing:5px!important;text-transform:uppercase!important;margin:12px 0 4px!important;">${remainingMinutes} MIN LOCKOUT</p>
    <p style="color:${T.text}!important;font-family:Impact,Arial,sans-serif!important;font-size:12px!important;letter-spacing:4px!important;text-transform:uppercase!important;margin:10px 0 0!important;opacity:.8!important;">${T.quote}</p>
  `;
}

function showLockout(lockoutEnd) {
  const overlay = createOverlay();
  const remainingMinutes = Math.max(1, Math.ceil((lockoutEnd - Date.now()) / 60000));
  overlay.innerHTML = `${T.overlayTopAccent}${heroHtml(lockoutContent(remainingMinutes), T.lockoutImage)}${T.overlayBottomAccent}`;
  (document.body || document.documentElement).appendChild(overlay);

  let checkingExpiry = false;
  const updateLockout = async () => {
    const remaining = lockoutEnd - Date.now();
    const display = overlay.querySelector('#lockout-countdown-display');
    if (remaining > 0) {
      if (display) display.textContent = `${Math.ceil(remaining / 60000)} MIN LOCKOUT`;
      return;
    }
    if (checkingExpiry) return;
    checkingExpiry = true;
    const response = await sendMessage({ action: 'checkLockoutExpired' }).catch(() => null);
    if (response?.expired) location.reload();
    else checkingExpiry = false;
  };
  lockoutInterval = setInterval(updateLockout, 1000);
}

function handleCommand(request) {
  if (request.action === 'clear') clearUi();
  if (request.action === 'startTimer') startTimer(request.endTime);
  if (request.action === 'showFirstBlock') showFirstBlock(request.hostname, request.duration);
  if (request.action === 'showLockout') showLockout(request.lockoutEnd);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleCommand(request);
  sendResponse({ success: true });
});

window.addEventListener('beforeunload', clearUi);
sendMessage({ action: 'pageReady' }).catch(() => {});
