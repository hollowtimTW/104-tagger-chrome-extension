document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-button');
  const settingNameInput = document.getElementById('settingNameInput');
  const keywordsInput = document.getElementById('keywordsInput');
  const highlightThresholdInput = document.getElementById('highlightThresholdInput');
  const statusMessageDiv = document.getElementById('statusMessage');

  const AUTO_SAVE_DELAY = 500;
  let currentActiveSettingId = null;
  let saveTimer = null;

  const defaultSettings = {
      setting1: { name: '預設組 1', keywords: [], highlightThreshold: 3 },
      setting2: { name: '預設組 2', keywords: [], highlightThreshold: 3 },
      setting3: { name: '預設組 3', keywords: [], highlightThreshold: 3 }
  };
  let allStoredSettings = {};

  function showStatus(message, isError = false) {
    statusMessageDiv.textContent = message;
    statusMessageDiv.classList.remove('error', 'show');
    if (isError) {
        statusMessageDiv.classList.add('error');
    }
    statusMessageDiv.classList.add('show');
    setTimeout(() => {
      statusMessageDiv.classList.remove('show');
    }, 1500);
  }

  function loadAllSettings() {
    const keysToGet = Object.keys(defaultSettings).concat('currentActiveSettingId');

    chrome.storage.sync.get(keysToGet, (data) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading settings:', chrome.runtime.lastError);
            showStatus('載入設定時發生錯誤', true);
            return;
        }

        allStoredSettings = {};
        Object.keys(defaultSettings).forEach(id => {
            allStoredSettings[id] = { ...defaultSettings[id], ...(data[id] || {}) };
        });

        const storedActiveId = data.currentActiveSettingId;
        if (storedActiveId && allStoredSettings[storedActiveId]) {
            currentActiveSettingId = storedActiveId;
        } else {
            currentActiveSettingId = 'setting1';
            chrome.storage.sync.set({ currentActiveSettingId: 'setting1' }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error setting active setting ID:', chrome.runtime.lastError);
                }
            });
        }
        selectTab(currentActiveSettingId);
        Object.keys(allStoredSettings).forEach(id => {
            updateTabButtonName(id, allStoredSettings[id].name);
        });
    });
  }

  function saveCurrentSetting() {
    if (!currentActiveSettingId) return;

    const name = settingNameInput.value.trim() || allStoredSettings[currentActiveSettingId].name;
    const keywords = keywordsInput.value.trim().split(',').map(kw => kw.trim()).filter(kw => kw !== '');
    const threshold = parseInt(highlightThresholdInput.value);
    const validThreshold = (!isNaN(threshold) && threshold >= 1) ? threshold : 3;

    allStoredSettings[currentActiveSettingId] = {
      name: name,
      keywords: keywords,
      highlightThreshold: validThreshold
    };

    chrome.storage.sync.set({ [currentActiveSettingId]: allStoredSettings[currentActiveSettingId] }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving setting:', chrome.runtime.lastError);
        showStatus('儲存失敗', true);
        return;
      }
      showStatus('已儲存！');
      updateTabButtonName(currentActiveSettingId, name);
      sendActiveSettingToContent(allStoredSettings[currentActiveSettingId]);
    });
  }

  function clearSetting(settingIdToClear) {
    if (confirm(`確定要清除 "${allStoredSettings[settingIdToClear].name}" 這組設定嗎？`)) {
      allStoredSettings[settingIdToClear] = { ...defaultSettings[settingIdToClear] };

      chrome.storage.sync.set({ [settingIdToClear]: allStoredSettings[settingIdToClear] }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error clearing setting:', chrome.runtime.lastError);
          showStatus('清除失敗', true);
          return;
        }
        showStatus('已清除！');
        updateTabButtonName(settingIdToClear, allStoredSettings[settingIdToClear].name);

        if (currentActiveSettingId === settingIdToClear) {
          displaySettingInForm(allStoredSettings[settingIdToClear]);
          sendClearAllTagsToContent();
        }
      });
    }
  }

  function displaySettingInForm(setting) {
    settingNameInput.value = setting.name;
    keywordsInput.value = setting.keywords.join(', ');
    highlightThresholdInput.value = setting.highlightThreshold;
  }

  function selectTab(settingId) {
    tabButtons.forEach(btn => btn.classList.remove('active'));

    const selectedButton = document.querySelector(`.tab-button[data-setting-id="${settingId}"]`);
    if (selectedButton) {
      selectedButton.classList.add('active');
      currentActiveSettingId = settingId;
      chrome.storage.sync.set({ currentActiveSettingId: settingId }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error setting active setting ID:', chrome.runtime.lastError);
        }
      });

      displaySettingInForm(allStoredSettings[settingId]);
      sendActiveSettingToContent(allStoredSettings[settingId]);
    }
  }

  function updateTabButtonName(settingId, name) {
    const button = document.querySelector(`.tab-button[data-setting-id="${settingId}"]`);
    if (button) {
        button.textContent = name;
    }
  }

  function sendActiveSettingToContent(setting) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError);
        return;
      }

      const activeTab = tabs[0];
      if (activeTab && activeTab.id && activeTab.url && activeTab.url.includes('104.com.tw/jobs/search')) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "activeSettingUpdated",
          setting: setting
        }).catch(error => {
            console.warn("Could not send message to content script. Content script might not be loaded on this tab or tab URL mismatch.", error);
        });
      } else {
        console.log("Not on a 104 jobs search page. Message not sent to content script.");
      }
    });
  }

  function sendClearAllTagsToContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError);
        return;
      }

      const activeTab = tabs[0];
      if (activeTab && activeTab.id && activeTab.url && activeTab.url.includes('104.com.tw/jobs/search')) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "clearAllTags"
        }).catch(error => {
            console.warn("Could not send clear message to content script.", error);
        });
      } else {
        console.log("Not on a 104 jobs search page. Clear message not sent.");
      }
    });
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectTab(button.dataset.settingId);
    });
    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        clearSetting(button.dataset.settingId);
    });
  });

  [settingNameInput, keywordsInput, highlightThresholdInput].forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveCurrentSetting, AUTO_SAVE_DELAY);
    });
  });

  loadAllSettings();
});