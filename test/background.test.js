const test = require('node:test');
const assert = require('node:assert/strict');

function createStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      if (keys === null) return structuredClone(data);
      const selected = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(data, key)) selected[key] = structuredClone(data[key]);
      }
      return selected;
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
}

function event() {
  return { addListener() {} };
}

async function setup({ session = {}, tabs = [{ id: 1, url: 'https://example.com', active: true }] } = {}) {
  const sessionStorage = createStorage(session);
  const syncStorage = createStorage({
    blockerSettings: { websites: { 'example.com': 30 }, defaultTime: 30 },
  });
  const messages = [];
  const reloads = [];

  global.RexRules = require('../shared.js');
  global.chrome = {
    storage: { session: sessionStorage, sync: syncStorage },
    runtime: {
      lastError: null,
      onStartup: event(),
      onInstalled: event(),
      onMessage: event(),
    },
    tabs: {
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
      async get(tabId) {
        const tab = tabs.find((item) => item.id === tabId);
        if (!tab) throw new Error('Missing tab');
        return tab;
      },
      async query(query) {
        if (query.active) return tabs.filter((tab) => tab.active);
        return tabs;
      },
      sendMessage(tabId, message, callback) {
        messages.push({ tabId, message });
        callback?.();
      },
      async reload(tabId) {
        reloads.push(tabId);
      },
    },
  };

  delete require.cache[require.resolve('../background.js')];
  const api = require('../background.js');
  await api.loadSettings();
  return { api, messages, reloads, session: sessionStorage.data, tabs };
}

test('leaving a configured host clears its timer instead of blocking the next site', async () => {
  const context = await setup();
  await context.api.handleTabVisit(1, 'https://example.com');
  assert.ok(context.session.timer_1);

  context.tabs[0].url = 'https://unconfigured.test';
  await context.api.handleTabVisit(1, context.tabs[0].url);

  assert.equal(context.session.timer_1, undefined);
  assert.equal(context.messages.at(-1).message.action, 'clear');
  assert.equal(context.messages.some(({ message }) => message.action === 'showFirstBlock'), false);
});

test('reloading the same host preserves the original deadline', async () => {
  const context = await setup();
  await context.api.handleTabVisit(1, 'https://example.com');
  const originalEnd = context.session.timer_1.endTime;

  await context.api.handleTabVisit(1, 'https://www.example.com/another-page');

  assert.equal(context.session.timer_1.endTime, originalEnd);
  assert.equal(context.messages.at(-1).message.endTime, originalEnd);
});

test('first-session expiration remains blocked across reloads', async () => {
  const context = await setup({
    session: {
      timer_1: { hostname: 'example.com', duration: 30, endTime: Date.now() - 1, isOneoff: false },
    },
  });

  const response = await context.api.handleMessage(
    { action: 'timerExpired' },
    { tab: context.tabs[0] }
  );
  assert.equal(context.session['blocked_example.com'], true);
  assert.equal(context.messages.at(-1).message.action, 'showFirstBlock');
  assert.equal(response.transition.action, 'showFirstBlock');

  await context.api.handleTabVisit(1, 'https://example.com');
  assert.equal(context.session.timer_1, undefined);
  assert.equal(context.messages.at(-1).message.action, 'showFirstBlock');
});

test('an expired lockout resets the session before a new timer starts', async () => {
  const context = await setup({
    session: {
      'session_example.com': 2,
      'lockout_example.com': Date.now() - 1,
    },
  });

  await context.api.handleTabVisit(1, 'https://example.com');

  assert.equal(context.session['session_example.com'], undefined);
  assert.equal(context.session['lockout_example.com'], undefined);
  assert.equal(context.session.timer_1.hostname, 'example.com');
});

test('second-session expiration starts a host-wide lockout', async () => {
  const context = await setup({
    session: {
      'session_example.com': 1,
      timer_1: { hostname: 'example.com', duration: 30, endTime: Date.now() - 1, isOneoff: false },
    },
  });

  const response = await context.api.handleMessage(
    { action: 'timerExpired' },
    { tab: context.tabs[0] }
  );

  assert.equal(context.session['session_example.com'], 2);
  assert.ok(context.session['lockout_example.com'] > Date.now());
  assert.equal(context.messages.at(-1).message.action, 'showLockout');
  assert.equal(response.transition.action, 'showLockout');
  assert.equal(response.transition.lockoutEnd, context.session['lockout_example.com']);
});

test('one-off sessions replace the active timer but cannot bypass lockout', async () => {
  const context = await setup({ session: { 'blocked_example.com': true } });
  await context.api.handleTabVisit(1, 'https://example.com');

  const result = await context.api.startOneoffSession('example.com', 600);
  assert.deepEqual(result, { started: true });
  assert.equal(context.session.timer_1.duration, 600);
  assert.equal(context.session.timer_1.isOneoff, true);
  assert.equal(context.session['blocked_example.com'], true);

  context.session['lockout_example.com'] = Date.now() + 60_000;
  await assert.rejects(
    context.api.startOneoffSession('example.com', 600),
    /cannot bypass a lockout/
  );
});
