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

    const row = document.createElement('div');
    row.className = 'website-item-row';

    const websiteInfo = document.createElement('div');
    websiteInfo.className = 'website-info';
    websiteInfo.innerHTML = `
      <div class="website-url">${url}</div>
      <div class="website-time">${time} seconds</div>
    `;

    const controls = document.createElement('div');
    controls.className = 'website-controls';

    const oneoffBtn = document.createElement('button');
    oneoffBtn.className = 'oneoff-btn';
    oneoffBtn.textContent = 'One-off';
    oneoffBtn.addEventListener('click', () => toggleOneoffForm(item));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeWebsite(url));

    controls.appendChild(oneoffBtn);
    controls.appendChild(removeBtn);
    row.appendChild(websiteInfo);
    row.appendChild(controls);

    const oneoffForm = document.createElement('div');
    oneoffForm.className = 'oneoff-form hidden';
    oneoffForm.innerHTML = `
      <input type="number" class="oneoff-minutes" placeholder="minutes" min="1" max="120">
      <button class="oneoff-start-btn">Start one-off session</button>
    `;
    oneoffForm.querySelector('.oneoff-start-btn').addEventListener('click', () => {
      const minutes = parseInt(oneoffForm.querySelector('.oneoff-minutes').value);
      startOneoffSession(url, minutes, item);
    });

    item.appendChild(row);
    item.appendChild(oneoffForm);
    container.appendChild(item);
  });
}

function toggleOneoffForm(item) {
  const form = item.querySelector('.oneoff-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    form.querySelector('.oneoff-minutes').focus();
  }
}

async function startOneoffSession(url, minutes, item) {
  if (!minutes || minutes < 1) {
    showStatus('Please enter a valid number of minutes', 'error');
    return;
  }

  const key = `oneoff_${url}`;
  const duration = minutes * 60; // convert to seconds

  try {
    await chrome.storage.session.set({ [key]: { duration } });
    item.querySelector('.oneoff-form').classList.add('hidden');
    showStatus(`One-off started: ${minutes} min on ${url}`, 'success');
  } catch (error) {
    console.error('Error starting one-off session:', error);
    showStatus('Error starting one-off session', 'error');
  }
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
  status.style.color = type === 'error' ? '#c0152a' : '#f0a500';
  
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

