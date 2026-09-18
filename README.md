# Rex Kwon Do - Website Timer Blocker

A Chrome extension that blocks websites after configurable time limits per session, helping you stay focused and avoid time-wasting sites.

## Features

- ⏱️ **Configurable time limits** - Set custom time limits for any website
- 🔄 **Two-session system** - First session allows one unblock, second session enforces a break
- 🔒 **5-minute lockout** - After completing both sessions, sites are locked for 5 minutes
- 📊 **Live timer display** - See how much time you have left on blocked sites
- ⚙️ **Easy configuration** - Simple popup interface to manage blocked websites
- ⏳ **One-off sessions** - Replace the active site's timer once, then go directly to lockout

## Installation

1. Clone this repository or download as ZIP
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `Rex Kwon Do` folder
6. The extension is now installed!

## Usage

1. Click the extension icon in your Chrome toolbar
2. Add websites you want to block (e.g., `x.com`, `twitter.com`)
3. Set time limits in seconds for each website
4. Click "Save Settings"
5. When you visit a blocked website, a timer will appear showing time remaining
6. After the time limit expires:
   - **First session**: You can unblock once for work-related tasks
   - **Second session**: Expiration starts the lockout immediately
   - **After second session**: 5-minute lockout period

Timers use persisted deadlines, so reloading does not reset them. Leaving a configured website
clears that tab's timer instead of allowing it to block a different website.

One-off sessions start immediately when that website is active, or are saved for its next visit.
They cannot bypass an active lockout and go directly to a new 5-minute lockout when they expire.

## Default Settings

- Default time limit: 30 seconds
- Pre-configured sites: `x.com`, `twitter.com` (30 seconds each)

## Files

- `manifest.json` - Extension configuration
- `shared.js` - Shared hostname and duration validation
- `background.js` - Service worker handling timers and blocking logic
- `content.js` - Content script for timer display and blocking overlays
- `popup.html/js/css` - Settings popup interface

## Development

This extension uses Chrome Extension Manifest V3.

Run the automated state-machine and validation tests with:

```bash
npm test
```

## License

MIT
