(function (root) {
  const DEFAULT_TIME = 30;
  const MIN_TIME = 1;
  const MAX_TIME = 3600;

  function parseInteger(value, min, max, fallback = null) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
    return parsed;
  }

  function hostnameFromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.hostname.toLowerCase().replace(/^www\./, '') || null;
    } catch {
      return null;
    }
  }

  function hostnameFromInput(value) {
    const input = String(value || '').trim();
    if (!input) return null;

    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (url.username || url.password || url.port || url.search || url.hash) return null;
      if (url.pathname && url.pathname !== '/') return null;
      return url.hostname.toLowerCase().replace(/^www\./, '') || null;
    } catch {
      return null;
    }
  }

  function normalizeSettings(value) {
    const defaultTime = parseInteger(value?.defaultTime, MIN_TIME, MAX_TIME, DEFAULT_TIME);
    const websites = {};

    for (const [input, duration] of Object.entries(value?.websites || {})) {
      const hostname = hostnameFromUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!hostname) continue;
      websites[hostname] = parseInteger(duration, MIN_TIME, MAX_TIME, defaultTime);
    }

    return { websites, defaultTime };
  }

  const api = {
    DEFAULT_TIME,
    MIN_TIME,
    MAX_TIME,
    hostnameFromInput,
    hostnameFromUrl,
    normalizeSettings,
    parseInteger,
  };

  root.RexRules = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
