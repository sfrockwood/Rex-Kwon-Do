document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('add-website').addEventListener('click', addWebsite);
document.getElementById('save-settings').addEventListener('click', saveSettings);

let settings = {
  websites: {
    'x.com': 30,
    'twitter.com': 30
  },
  defaultTime: 30
};

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['blockerSettings']);
    if (result.blockerSettings) {
      settings = result.blockerSettings;
    }
    
    document.getElementById('default-time').value = settings.defaultTime;
    renderWebsitesList();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function renderWebsitesList() {
  const container = document.getElementById('websites-list');
  container.innerHTML = '';
  
  const websites = Object.entries(settings.websites);
  
  if (websites.length === 0) {
    container.innerHTML = '<div class="empty-state">No websites configured</div>';
    return;
  }
  
  websites.forEach(([url, time]) => {
    const item = document.createElement('div');
    item.className = 'website-item';
    
    const websiteInfo = document.createElement('div');
    websiteInfo.className = 'website-info';
    websiteInfo.innerHTML = `
      <div class="website-url">${url}</div>
      <div class="website-time">${time} seconds</div>
    `;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeWebsite(url));
    
    item.appendChild(websiteInfo);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function addWebsite() {
  const urlInput = document.getElementById('new-website');
  const timeInput = document.getElementById('new-time');
  
  const url = urlInput.value.trim();
  const time = parseInt(timeInput.value) || settings.defaultTime;
  
  if (!url) {
    showStatus('Please enter a website URL', 'error');
    return;
  }
  
  // Clean up URL (remove protocol, www, trailing slash)
  const cleanUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
  
  settings.websites[cleanUrl] = time;
  
  urlInput.value = '';
  timeInput.value = '';
  
  renderWebsitesList();
  showStatus('Website added! Remember to save settings.', 'success');
}

function removeWebsite(url) {
  delete settings.websites[url];
  renderWebsitesList();
  showStatus('Website removed! Remember to save settings.', 'success');
}

async function saveSettings() {
  settings.defaultTime = parseInt(document.getElementById('default-time').value) || 30;
  
  try {
    await chrome.storage.sync.set({ blockerSettings: settings });
    showStatus('Settings saved successfully!', 'success');
    
    // Notify background script of settings change
    chrome.runtime.sendMessage({ action: 'settingsUpdated' });
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', 'error');
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = type === 'error' ? '#dc3545' : '#28a745';
  
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

