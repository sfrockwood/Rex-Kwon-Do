const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../shared.js');

test('normalizes valid website hostnames', () => {
  assert.equal(rules.hostnameFromInput(' HTTPS://WWW.Example.com/ '), 'example.com');
  assert.equal(rules.hostnameFromUrl('https://www.example.com/a?page=1'), 'example.com');
});

test('rejects website inputs that cannot match a hostname', () => {
  assert.equal(rules.hostnameFromInput('example.com/path'), null);
  assert.equal(rules.hostnameFromInput('example.com:8080'), null);
  assert.equal(rules.hostnameFromInput('https://user@example.com'), null);
});

test('accepts only bounded whole-number durations', () => {
  assert.equal(rules.parseInteger('30', 1, 3600), 30);
  assert.equal(rules.parseInteger('1.5', 1, 3600), null);
  assert.equal(rules.parseInteger('-1', 1, 3600), null);
  assert.equal(rules.parseInteger('3601', 1, 3600), null);
});

test('repairs legacy settings into the canonical shape', () => {
  assert.deepEqual(
    rules.normalizeSettings({
      defaultTime: 45,
      websites: { 'WWW.Example.com': 10, 'https://news.example.com/path': -1 },
    }),
    { defaultTime: 45, websites: { 'example.com': 10, 'news.example.com': 45 } }
  );
});
