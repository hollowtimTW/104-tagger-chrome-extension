(function () {
  'use strict';

  let currentKeywords = [];
  let regex = null;
  let highlightThreshold = 1;

  const tagStyle = `
    display: inline-block;
    margin: 4px 6px 0 0;
    padding: 4px 8px;
    font-size: 14px;
    background-color: #d32f2f;
    color: #fff;
    border-radius: 4px;
    font-weight: bold;
    flex-shrink: 0;
  `;

  const highlightInfoStyle = `
      background: linear-gradient(45deg, #ff6b35, #f7931e);
      color: #fff;
      font-weight: 900;
      padding: 6px 12px;
      margin-top: 4px;
      margin-bottom: 10px;
      border-radius: 6px;
      font-size: 15px;
      display: inline-block;
      white-space: nowrap;
      box-shadow: 0 3px 8px rgba(255, 107, 53, 0.4);
      border: 2px solid #ff8a65;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
      animation: pulse-glow 2s ease-in-out infinite alternate;
      position: relative;
      z-index: 1000;
  `;

  const highlightedItemClass = 'extension-highlighted-job-item';
  const highlightInfoClass = 'extension-highlight-info';
  const keywordTagsClass = 'keyword-tags-104';

  function injectStyles() {
      if (document.getElementById('extension-custom-styles')) {
          return;
      }
      const style = document.createElement('style');
      style.id = 'extension-custom-styles';
      style.textContent = `
          .${highlightedItemClass} {
              border: 2px solid #ff9800 !important;
              box-shadow: 0 0 8px rgba(255, 152, 0, 0.5) !important;
              background-color: #fff3e0 !important;
              padding: 10px !important;
              margin-bottom: 10px !important;
              border-radius: 8px !important;
          }
          .${keywordTagsClass} {
              display: flex !important;
              flex-wrap: wrap !important;
          }
          .${keywordTagsClass} span {
              ${tagStyle}
          }
          .${highlightInfoClass} {
              ${highlightInfoStyle}
          }
          @keyframes pulse-glow {
              0% {
                  transform: scale(1);
                  opacity: 1;
              }
              100% {
                  transform: scale(1.05);
                  opacity: 0.8;
              }
          }
      `;
      document.head.appendChild(style);
  }

  function clearAllInjectedElements() {
      document.querySelectorAll(`.${keywordTagsClass}`).forEach(tagDiv => tagDiv.remove());
      document.querySelectorAll(`.${highlightedItemClass}`).forEach(item => item.classList.remove(highlightedItemClass));
      document.querySelectorAll(`.${highlightInfoClass}`).forEach(info => info.remove());
      document.querySelectorAll('[data-taggerr-processed="true"]').forEach(item => {
          item.removeAttribute('data-taggerr-processed');
      });
  }

  function extractKeywordsFromElement(el) {
    const text = el.textContent || '';
    const foundMatches = new Set();

    if (!regex || currentKeywords.length === 0) {
      return { keywords: [], count: 0 };
    }

    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        foundMatches.add(match[0].toUpperCase());
    }
    return { keywords: Array.from(foundMatches), count: foundMatches.size };
  }

  function appendTags(el, keywordsToDisplay) {
    if (el.querySelector(`.${keywordTagsClass}`)) {
        return;
    }
    if (!keywordsToDisplay.length || !el || !el.isConnected) return;

    const tagContainer = document.createElement('div');
    tagContainer.className = keywordTagsClass;
    tagContainer.style.marginTop = '8px';

    keywordsToDisplay.forEach(kw => {
      const tag = document.createElement('span');
      tag.textContent = kw;
      tagContainer.appendChild(tag);
    });

    el.appendChild(tagContainer);
  }

  function processJobItems(forceAll = false) {
    // Prevent observer from being triggered by our own DOM changes
    if (observer) {
        observer.disconnect();
    }

    if (forceAll) {
      clearAllInjectedElements();
    }

    if (currentKeywords.length === 0 || !regex) {
      startObserving();
      return;
    }

    const items = document.querySelectorAll('.job-list-item:not([data-taggerr-processed="true"]), .job-list-container:not([data-taggerr-processed="true"])');

    items.forEach(item => {
      if (item && item.isConnected) {
        item.setAttribute('data-taggerr-processed', 'true');
        const { keywords: matchedKeywordsNormalized, count: matchedCount } = extractKeywordsFromElement(item);

        const keywordsToDisplay = currentKeywords.filter(kw =>
            matchedKeywordsNormalized.includes(kw.toUpperCase())
        );

        if (keywordsToDisplay.length > 0) {
            appendTags(item, keywordsToDisplay);
        }

        if (matchedCount >= highlightThreshold) {
            item.classList.add(highlightedItemClass);

            const highlightInfo = document.createElement('div');
            highlightInfo.className = highlightInfoClass;
            highlightInfo.textContent = `🔥 高度符合！`;

            const companyNameEl = item.querySelector('.comp-name');
            if (companyNameEl) {
                companyNameEl.insertAdjacentElement('afterend', highlightInfo);
            } else {
                item.prepend(highlightInfo);
            }
        }
      }
    });

    startObserving();
  }

  function applySetting(setting) {
      currentKeywords = setting.keywords || [];
      highlightThreshold = setting.highlightThreshold || 1;

      if (currentKeywords.length > 0) {
          // Sort by length descending to match longer keywords first
          const sortedKeywords = [...currentKeywords].sort((a, b) => b.length - a.length);
          const keywordsForRegex = sortedKeywords.map(k => {
              const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              // Add word boundaries for purely English/Number words to prevent partial matches
              if (/^[a-zA-Z0-9_]+$/.test(k)) {
                  return `(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`;
              }
              return escaped;
          }).join('|');
          regex = new RegExp(keywordsForRegex, 'gi');
      } else {
          regex = null;
      }
      processJobItems(true);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
          if (request.type === "activeSettingUpdated") {
              applySetting(request.setting);
              sendResponse({ success: true });
          } else if (request.type === "clearAllTags") {
              clearAllInjectedElements();
              currentKeywords = [];
              regex = null;
              sendResponse({ success: true });
          }
      } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ success: false, error: error.message });
      }
      return true;
  });

  function initialLoadAndProcess() {
    chrome.storage.sync.get('currentActiveSettingId', (data) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting current active setting ID:', chrome.runtime.lastError);
            return;
        }

        if (data.currentActiveSettingId) {
            const activeId = data.currentActiveSettingId;
            chrome.storage.sync.get(activeId, (settingData) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting setting data:', chrome.runtime.lastError);
                    return;
                }

                if (settingData[activeId]) {
                    applySetting(settingData[activeId]);
                } else {
                    chrome.storage.sync.remove('currentActiveSettingId', () => {
                        if (chrome.runtime.lastError) {
                            console.error('Error removing active setting ID:', chrome.runtime.lastError);
                        }
                    });
                    clearAllInjectedElements();
                }
            });
        } else {
            clearAllInjectedElements();
        }
        injectStyles();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        let needsUpdate = false;
        for (const key in changes) {
            if (key.startsWith('setting') || key === 'currentActiveSettingId') {
                needsUpdate = true;
                break;
            }
        }
        if (needsUpdate) {
            initialLoadAndProcess();
        }
    }
  });

  initialLoadAndProcess();

  let debounceTimer;
  const observer = new MutationObserver((mutationsList) => {
    try {
      const relevantChange = mutationsList.some(mutation =>
        Array.from(mutation.addedNodes).some(node =>
          node.nodeType === 1 && (node.matches('.job-list-item') || node.matches('.job-list-container') || node.closest('.job-list-item') || node.closest('.job-list-container'))
        )
      );

      if (relevantChange) {
        if (document.body) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            processJobItems();
          }, 300);
        } else {
          observer.disconnect();
        }
      }
    } catch (error) {
      console.error('Error in MutationObserver:', error);
    }
  });

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    clearTimeout(debounceTimer);
  });

  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  startObserving();
})();