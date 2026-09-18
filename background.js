if (typeof importScripts === 'function') importScripts('shared.js');

const DEFAULT_SETTINGS = {
  websites: { 'x.com': 30, 'twitter.com': 30 },
  defaultTime: 30,
};

let settings = DEFAULT_SETTINGS;

const sessionKey = (hostname) => `session_${hostname}`;
const lockoutKey = (hostname) => `lockout_${hostname}`;
const blockedKey = (hostname) => `blocked_${hostname}`;
const oneoffKey = (hostname) => `oneoff_${hostname}`;
const timerKey = (tabId) => `timer_${tabId}`;

async function loadSettings() {
  const result = await chrome.storage.sync.get(['blockerSettings']);
  settings = result.blockerSettings
    ? RexRules.normalizeSettings(result.blockerSettings)
    : RexRules.normalizeSettings(DEFAULT_SETTINGS);
  return settings;
}

async function clearTabTimer(tabId, notify = true) {
  await chrome.storage.session.remove([timerKey(tabId)]);
  if (notify) sendToTab(tabId, { action: 'clear' });
}

async function getHostState(hostname) {
  const keys = [sessionKey(hostname), lockoutKey(hostname), blockedKey(hostname)];
  const result = await chrome.storage.session.get(keys);
  const lockoutEnd = result[lockoutKey(hostname)] || 0;

  if (lockoutEnd && lockoutEnd <= Date.now()) {
    await chrome.storage.session.remove(keys);
    return { sessionCount: 0, lockoutEnd: 0, firstBlocked: false };
  }

  return {
    sessionCount: result[sessionKey(hostname)] || 0,
    lockoutEnd,
    firstBlocked: Boolean(result[blockedKey(hostname)]),
  };
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
}

async function tabsForHost(hostname) {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => tab.id && RexRules.hostnameFromUrl(tab.url) === hostname);
}

async function clearHostTimers(hostname) {
  const allSessionData = await chrome.storage.session.get(null);
  const keys = Object.entries(allSessionData)
    .filter(([key, value]) => key.startsWith('timer_') && value?.hostname === hostname)
    .map(([key]) => key);
  if (keys.length) await chrome.storage.session.remove(keys);
}

async function broadcastToHost(hostname, message) {
  const tabs = await tabsForHost(hostname);
  tabs.forEach((tab) => sendToTab(tab.id, message));
}

async function startTabTimer(tabId, hostname, duration, isOneoff = false) {
  const timer = {
    hostname,
    duration,
    endTime: Date.now() + duration * 1000,
    isOneoff,
  };
  await chrome.storage.session.set({ [timerKey(tabId)]: timer });
  sendToTab(tabId, { action: 'startTimer', ...timer });
  return timer;
}

async function startLockout(hostname) {
  const lockoutEnd = Date.now() + 5 * 60 * 1000;
  await clearHostTimers(hostname);
  await chrome.storage.session.remove([blockedKey(hostname)]);
  await chrome.storage.session.set({
    [lockoutKey(hostname)]: lockoutEnd,
    [sessionKey(hostname)]: 2,
  });
  await broadcastToHost(hostname, { action: 'showLockout', hostname, lockoutEnd });
  return lockoutEnd;
}

async function expireTimer(tabId, timer) {
  const currentUrl = (await chrome.tabs.get(tabId).catch(() => null))?.url;
  if (RexRules.hostnameFromUrl(currentUrl) !== timer.hostname) {
    await clearTabTimer(tabId, false);
    return { action: 'clear' };
  }

  if (timer.endTime > Date.now()) {
    const transition = { action: 'startTimer', ...timer };
    sendToTab(tabId, transition);
    return transition;
  }

  await clearTabTimer(tabId, false);
  const state = await getHostState(timer.hostname);
  if (state.lockoutEnd > Date.now()) {
    const transition = {
      action: 'showLockout',
      hostname: timer.hostname,
      lockoutEnd: state.lockoutEnd,
    };
    sendToTab(tabId, transition);
    return transition;
  }

  if (timer.isOneoff || state.sessionCount >= 1) {
    const lockoutEnd = await startLockout(timer.hostname);
    return { action: 'showLockout', hostname: timer.hostname, lockoutEnd };
  }

  await clearHostTimers(timer.hostname);
  await chrome.storage.session.set({ [blockedKey(timer.hostname)]: true });
  const transition = {
    action: 'showFirstBlock',
    hostname: timer.hostname,
    duration: timer.duration,
  };
  await broadcastToHost(timer.hostname, transition);
  return transition;
}

async function handleTabVisit(tabId, url) {
  await loadSettings();
  const hostname = RexRules.hostnameFromUrl(url);

  if (!hostname || !Object.hasOwn(settings.websites, hostname)) {
    await clearTabTimer(tabId);
    return;
  }

  const state = await getHostState(hostname);
  if (state.lockoutEnd > Date.now()) {
    await clearTabTimer(tabId, false);
    sendToTab(tabId, { action: 'showLockout', hostname, lockoutEnd: state.lockoutEnd });
    return;
  }

  const stored = await chrome.storage.session.get([timerKey(tabId), oneoffKey(hostname)]);
  const existingTimer = stored[timerKey(tabId)];
  const queuedOneoff = stored[oneoffKey(hostname)];

  if (existingTimer?.hostname === hostname) {
    if (existingTimer.endTime <= Date.now()) await expireTimer(tabId, existingTimer);
    else sendToTab(tabId, { action: 'startTimer', ...existingTimer });
    return;
  }

  if (existingTimer) await clearTabTimer(tabId, false);

  if (queuedOneoff) {
    await chrome.storage.session.remove([oneoffKey(hostname)]);
    await startTabTimer(tabId, hostname, queuedOneoff.duration, true);
    return;
  }

  if (state.firstBlocked) {
    sendToTab(tabId, {
      action: 'showFirstBlock',
      hostname,
      duration: settings.websites[hostname],
    });
    return;
  }

  await startTabTimer(tabId, hostname, settings.websites[hostname]);
}

async function unblock(hostname) {
  const state = await getHostState(hostname);
  if (!state.firstBlocked || state.sessionCount !== 0) {
    throw new Error('This site is not waiting for its first-session unblock');
  }

  await chrome.storage.session.remove([blockedKey(hostname)]);
  await chrome.storage.session.set({ [sessionKey(hostname)]: 1 });
  const tabs = await tabsForHost(hostname);
  await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id)));
}

async function startOneoffSession(hostname, duration) {
  await loadSettings();
  if (!Object.hasOwn(settings.websites, hostname)) throw new Error('Website is not configured');
  if (!Number.isInteger(duration) || duration < 60 || duration > 120 * 60) {
    throw new Error('One-off duration must be between 1 and 120 minutes');
  }

  const state = await getHostState(hostname);
  if (state.lockoutEnd > Date.now()) throw new Error('One-off sessions cannot bypass a lockout');

  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs.find((tab) => RexRules.hostnameFromUrl(tab.url) === hostname);
  if (!activeTab?.id) {
    await chrome.storage.session.set({ [oneoffKey(hostname)]: { duration } });
    return { started: false };
  }

  await chrome.storage.session.remove([oneoffKey(hostname)]);
  await clearTabTimer(activeTab.id, false);
  await startTabTimer(activeTab.id, hostname, duration, true);
  return { started: true };
}

async function reconcileOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id || !tab.url) return;
    await clearTabTimer(tab.id, false);
    await handleTabVisit(tab.id, tab.url);
  }));
}

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'pageReady':
      if (sender.tab?.id && sender.tab.url) await handleTabVisit(sender.tab.id, sender.tab.url);
      return { success: true };
    case 'timerExpired': {
      if (!sender.tab?.id) return { success: false };
      const result = await chrome.storage.session.get([timerKey(sender.tab.id)]);
      const timer = result[timerKey(sender.tab.id)];
      if (!timer) return { success: false, error: 'Timer state not found' };
      const transition = await expireTimer(sender.tab.id, timer);
      return { success: true, transition };
    }
    case 'unblock':
      await unblock(RexRules.hostnameFromUrl(sender.tab?.url));
      return { success: true };
    case 'checkLockoutExpired': {
      const hostname = RexRules.hostnameFromUrl(sender.tab?.url);
      const state = await getHostState(hostname);
      return { expired: !state.lockoutEnd, lockoutEnd: state.lockoutEnd };
    }
    case 'startOneoff': {
      const hostname = RexRules.hostnameFromInput(request.siteName);
      if (!hostname) throw new Error('Invalid website');
      return { success: true, ...(await startOneoffSession(hostname, request.duration)) };
    }
    case 'settingsUpdated':
      await loadSettings();
      await reconcileOpenTabs();
      return { success: true };
    default:
      return { success: false, error: 'Unknown action' };
  }
}

chrome.runtime.onStartup.addListener(loadSettings);
chrome.runtime.onInstalled.addListener(loadSettings);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url) await handleTabVisit(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) handleTabVisit(tabId, tab.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTimer(tabId, false);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});

loadSettings();

if (typeof module !== 'undefined') {
  module.exports = {
    clearTabTimer,
    expireTimer,
    getHostState,
    handleMessage,
    handleTabVisit,
    loadSettings,
    startOneoffSession,
    timerKey,
  };
}
