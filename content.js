// PiKVM Enhancements v1.0
// stream-audio and stream-mic start as feature-disabled in the HTML.
// They are only enabled after JanusStreamer connects and receives features
// from the Janus plugin. We must wait for that before applying settings,
// otherwise __resetStream() reads allow_audio=false and starts without audio.

const DEFAULTS = {
  audioEnabled: true, audioVolume: 100, micDefault: 'keep', micLinksAudio: false,
  reduceNavbar: false,
  hideAtx: false, hideDrive: false, hideMacro: false, hideText: false, hideShortcuts: false,
  hideLogo: false,
  pasteShortcut: { code: 'KeyV', alt: true, ctrl: false, shift: false, meta: false },
  gbpcKeySwap: false,
  optionQCmd: false,
  optionTabCmd: false,
};
const NAVBAR_ITEMS = [
  { key: 'hideAtx', id: 'atx-dropdown' },
  { key: 'hideDrive', id: 'msd-dropdown' },
  { key: 'hideMacro', id: 'macro-dropdown' },
  { key: 'hideText', id: 'text-dropdown' },
  { key: 'hideShortcuts', id: 'shortcuts-dropdown' },
];
const COMPACT_NAVBAR_CSS = `
  ul#navbar li.right, ul#navbar li.left { height: 24px !important; }
  ul#navbar li .menu-item { gap: 5px !important; padding-left: 8px !important; padding-right: 8px !important; font-size: 11px !important; }
  ul#navbar li .menu-item img { height: 12px !important; }
  #pikvm-audio-controls button { height: 18px !important; font-size: 10px !important; padding: 0 4px !important; line-height: 1 !important; }
`;
const BTN_STYLE = 'font-size:12px;padding:2px 7px;border-radius:3px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;background:rgba(255,255,255,0.08);color:#ddd;font-family:monospace;';

// Module-level settings kept live — no page reload needed after popup changes
let settings = { ...DEFAULTS };
function getSettings() {
  return new Promise(resolve => chrome.storage.local.get(DEFAULTS, s => { Object.assign(settings, s); resolve(settings); }));
}
function applyNavbarItemVisibility() {
  let css = NAVBAR_ITEMS.filter(i => settings[i.key]).map(i => `#${i.id}{display:none!important}`).join('\n');
  if (settings.hideLogo) css += '\nul#navbar img[src*="logo.svg"]{display:none!important}';
  let style = document.getElementById('pikvm-navbar-hidden-items');
  if (!style) {
    style = document.createElement('style');
    style.id = 'pikvm-navbar-hidden-items';
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function applyNavbarCompact(enabled) {
  const existing = document.getElementById('pikvm-navbar-compact');
  if (enabled && !existing) {
    const style = document.createElement('style');
    style.id = 'pikvm-navbar-compact';
    style.textContent = COMPACT_NAVBAR_CSS;
    document.head.appendChild(style);
  } else if (!enabled && existing) {
    existing.remove();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [k, {newValue}] of Object.entries(changes)) settings[k] = newValue;
  if ('reduceNavbar' in changes) applyNavbarCompact(changes.reduceNavbar.newValue);
  if (NAVBAR_ITEMS.some(i => i.key in changes) || 'hideLogo' in changes) applyNavbarItemVisibility();
  if ('pasteShortcut' in changes) updateShortcutAttr();
  if ('gbpcKeySwap' in changes || 'optionQCmd' in changes || 'optionTabCmd' in changes) updateKeyboardAttrs();
});

// keyboard-intercept.js (MAIN world) reads these attributes to know the current config.
function updateShortcutAttr() {
  document.documentElement.setAttribute('data-pikvm-shortcut', JSON.stringify(settings.pasteShortcut || null));
}
function updateKeyboardAttrs() {
  document.documentElement.setAttribute('data-pikvm-gbpc-swap', settings.gbpcKeySwap ? '1' : '0');
  document.documentElement.setAttribute('data-pikvm-option-q', settings.optionQCmd ? '1' : '0');
  document.documentElement.setAttribute('data-pikvm-option-tab', settings.optionTabCmd ? '1' : '0');
}

// keyboard-intercept.js fires window.postMessage when shortcut matches; we handle the paste.
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.__pikvm === 'paste') pasteClipboard();
  if (ev.data?.__pikvm === 'exitToFullTab') exitToFullTab();
});

// Fullscreen <-> full-tab toggle.
// requestFullscreen() must be called from a user gesture (button click or MAIN world keydown).
// exitFullscreen() needs no gesture; after it fires PiKVM removes window-full-tab, so we
// re-click the full-tab button via setTimeout(0) to let PiKVM's fullscreenchange run first.
let _exitToFullTab = false;
function exitToFullTab() {
  _exitToFullTab = true;
  document.exitFullscreen?.();
}
function updateFullscreenBtn() {
  const btn = document.getElementById('pikvm-fullscreen-btn');
  if (!btn) return;
  if (document.fullscreenElement) {
    btn.innerHTML = '&#9650;';
    btn.title = 'Return to stretched tab mode';
  } else {
    btn.innerHTML = '&#x2922;';
    btn.title = 'Go to full-screen mode';
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && _exitToFullTab) {
    _exitToFullTab = false;
    // PiKVM's fullscreenchange already ran (registered first), removing window-full-tab.
    // Re-enable full-tab after current event handlers complete.
    setTimeout(() => document.querySelector('[data-wm-window-set-full-tab]')?.click(), 0);
  }
  updateFullscreenBtn();
});

function setAudio(slider, volume) {
  slider.value = String(volume);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function setMic(mic, enabled) {
  if (mic.checked === enabled) return;
  // PiKVM uses addEventListener('click') — not el.onclick.
  // dispatchEvent bypasses the display:none restriction that blocks .click().
  mic.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function showToast(message) {
  const existing = document.getElementById('pikvm-audio-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'pikvm-audio-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: 'rgba(30,30,30,0.92)', color: '#fff',
    padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
    fontFamily: 'monospace', zIndex: '999999',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'opacity 0.4s', opacity: '1',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const textarea = document.getElementById('hid-pak-text');
    const pasteBtn = document.getElementById('hid-pak-button');
    if (!textarea || !pasteBtn) return;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    pasteBtn.click();
    showToast(`PiKVM \u2014 Pasted ${text.length} chars`);
  } catch (e) {
    showToast(`PiKVM \u2014 Clipboard error: ${e.message}`);
  }
}

function updateButtons(slider, mic) {
  const vol = Number(slider.value);
  // Inline navbar buttons: show volume %
  for (const btn of document.querySelectorAll('.pikvm-audio-btn')) {
    btn.textContent = vol > 0 ? `\u{1F50A} ${vol}%` : '\u{1F507} off';
    btn.style.opacity = vol > 0 ? '1' : '0.6';
  }
  for (const btn of document.querySelectorAll('.pikvm-mic-btn')) {
    btn.textContent = mic.checked ? '\uD83C\uDF99 on' : '\uD83C\uDF99 off';
    btn.style.opacity = mic.checked ? '1' : '0.6';
  }
  // Floating buttons: icon only
  for (const btn of document.querySelectorAll('.pikvm-audio-btn-f')) {
    btn.textContent = vol > 0 ? '\u{1F50A}' : '\u{1F507}';
    btn.style.opacity = vol > 0 ? '1' : '0.5';
  }
  for (const btn of document.querySelectorAll('.pikvm-mic-btn-f')) {
    btn.textContent = '\uD83C\uDF99';
    btn.style.opacity = mic.checked ? '1' : '0.5';
  }
}

function injectNavbarButtons(slider, mic, onReady) {
  if (document.getElementById('pikvm-audio-controls')) return;
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const systemLi = [...navbar.querySelectorAll('li')]
    .find(li => li.querySelector('span')?.textContent?.trim() === 'System');
  const systemDiv = systemLi?.querySelector('.menu-button');
  if (!systemDiv) return;

  // Inline: inject into the System div so the navbar height is unchanged
  const inline = document.createElement('span');
  inline.id = 'pikvm-audio-controls';
  inline.style.cssText = 'display:inline-flex;gap:4px;margin-left:8px;vertical-align:middle;';
  inline.innerHTML = `
    <button class="pikvm-audio-btn" title="Toggle audio" style="${BTN_STYLE}"></button>
    <button class="pikvm-mic-btn" title="Toggle mic" style="${BTN_STYLE}"></button>
    <button class="pikvm-paste-btn" title="Paste clipboard" style="${BTN_STYLE}">&#x1F4CB;</button>`;
  systemDiv.appendChild(inline);

  // Floating: icon-only buttons split around the ••• button.
  // Top (above •••): fullscreen, X normalize. Bottom (below •••): Audio, Mic, Paste.
  const FLOAT_BTN_STYLE = 'font-size:14px;padding:2px 5px;border-radius:3px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;background:rgba(255,255,255,0.07);color:#ddd;line-height:1;';
  const FLOAT_CSS = 'position:fixed;display:none;flex-direction:column;gap:3px;padding:3px 4px;z-index:9999;';
  const floatingTop = document.createElement('div');
  floatingTop.id = 'pikvm-audio-floating-top';
  floatingTop.style.cssText = FLOAT_CSS;
  floatingTop.innerHTML = `
    <button id="pikvm-fullscreen-btn" title="Go to full-screen mode" style="${FLOAT_BTN_STYLE}">&#x2922;</button>
    <button id="pikvm-normalize-btn" title="Normalize window" style="${FLOAT_BTN_STYLE}">&#10005;</button>`;
  document.body.appendChild(floatingTop);

  const floatingBottom = document.createElement('div');
  floatingBottom.id = 'pikvm-audio-floating';
  floatingBottom.style.cssText = FLOAT_CSS;
  floatingBottom.innerHTML = `
    <button class="pikvm-audio-btn-f" title="Toggle audio" style="${FLOAT_BTN_STYLE}"></button>
    <button class="pikvm-mic-btn-f" title="Toggle mic" style="${FLOAT_BTN_STYLE}"></button>
    <button class="pikvm-paste-btn" title="Paste clipboard" style="${FLOAT_BTN_STYLE}">&#x1F4CB;</button>`;
  document.body.appendChild(floatingBottom);
  const navbarShowBtn = document.getElementById('navbar-show-button');

  updateButtons(slider, mic);

  function onAudioClick() {
    const newVol = Number(slider.value) > 0 ? 0 : settings.audioVolume;
    setAudio(slider, newVol);
    updateButtons(slider, mic);
    showToast(`PiKVM \u2014 Audio: ${newVol > 0 ? newVol + '%' : 'off'}`);
  }
  function onMicClick() {
    const enabling = !mic.checked;
    if (enabling && settings.micLinksAudio && Number(slider.value) === 0) {
      setAudio(slider, settings.audioVolume);
    }
    setMic(mic, enabling);
    updateButtons(slider, mic);
    showToast(`PiKVM \u2014 Mic: ${mic.checked ? 'on' : 'off'}`);
  }

  for (const btn of document.querySelectorAll('.pikvm-audio-btn, .pikvm-audio-btn-f')) btn.addEventListener('click', onAudioClick);
  for (const btn of document.querySelectorAll('.pikvm-mic-btn, .pikvm-mic-btn-f')) btn.addEventListener('click', onMicClick);
  for (const btn of document.querySelectorAll('.pikvm-paste-btn')) btn.addEventListener('click', pasteClipboard);
  document.getElementById('pikvm-fullscreen-btn').addEventListener('click', () => {
    if (document.fullscreenElement) exitToFullTab();
    else document.documentElement.requestFullscreen?.();
  });
  document.getElementById('pikvm-normalize-btn').addEventListener('click', () => {
    document.querySelector('[data-wm-normalize]')?.click();
  });

  slider.addEventListener('input', () => updateButtons(slider, mic));
  mic.addEventListener('change', () => updateButtons(slider, mic));

  // Show floating buttons when navbar is hidden.
  // PiKVM hides the navbar via classList.toggle("hidden") so check that directly.
  const positionFloating = () => {
    const r = navbarShowBtn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    floatingTop.style.top = `${r.top - floatingTop.offsetHeight - 2}px`;
    floatingTop.style.left = `${cx - floatingTop.offsetWidth / 2}px`;
    floatingBottom.style.top = `${r.bottom + 2}px`;
    floatingBottom.style.left = `${cx - floatingBottom.offsetWidth / 2}px`;
  };
  const syncFloating = () => {
    const visible = navbar.classList.contains('hidden') && !!navbarShowBtn;
    floatingTop.style.display = visible ? 'flex' : 'none';
    floatingBottom.style.display = visible ? 'flex' : 'none';
    if (visible) requestAnimationFrame(positionFloating);
  };
  new MutationObserver(syncFloating).observe(navbar, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', syncFloating);
  syncFloating();
  // PiKVM may hide the navbar via a setTimeout(10ms) click handler after our initial check,
  // so re-sync after a short delay to catch that.
  setTimeout(syncFloating, 200);
  if (onReady) onReady(syncFloating);
}

function waitForFeature(el) {
  return new Promise(resolve => {
    if (!el.classList.contains('feature-disabled')) return resolve();
    const obs = new MutationObserver(() => {
      if (!el.classList.contains('feature-disabled')) {
        obs.disconnect();
        resolve();
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}

function showReloadToast() {
  const currentVersion = chrome.runtime.getManifest().version;
  chrome.storage.local.get(['_reloadFromVersion'], ({ _reloadFromVersion }) => {
    if (!_reloadFromVersion) return;
    chrome.storage.local.remove('_reloadFromVersion');
    const changed = _reloadFromVersion !== currentVersion;
    const msg = changed
      ? `v${_reloadFromVersion} \u2192 v${currentVersion}`
      : `v${currentVersion} (unchanged)`;
    const color = changed ? '#2a6a3a' : '#4a4a4a';
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:12px;right:12px;z-index:2147483647;background:${color};color:#fff;font:bold 13px monospace;padding:8px 14px;border-radius:6px;opacity:1;transition:opacity 0.5s;pointer-events:none;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    setTimeout(() => toast.remove(), 2500);
  });
}

async function init() {
  const slider = document.getElementById('stream-audio-volume-slider');
  const mic = document.getElementById('stream-mic-switch');
  const streamAudio = document.getElementById('stream-audio');
  if (!slider || !mic || !streamAudio) return false;

  await getSettings();
  updateShortcutAttr();
  updateKeyboardAttrs();
  showReloadToast();
  applyNavbarCompact(settings.reduceNavbar);
  applyNavbarItemVisibility();

  // Inject navbar buttons immediately (cosmetic, no stream interaction yet)
  let syncFloating;
  injectNavbarButtons(slider, mic, fn => { syncFloating = fn; });

  // Wait for Janus to connect and enable the stream-audio feature.
  // Only then will __resetStream() see allow_audio=true.
  await waitForFeature(streamAudio);
  syncFloating?.(); // re-sync in case navbar state changed during Janus init

  if (settings.audioEnabled && Number(slider.value) === 0) {
    setAudio(slider, settings.audioVolume);
  }

  if (settings.micDefault === 'on') setMic(mic, true);
  else if (settings.micDefault === 'off') setMic(mic, false);

  showToast(`PiKVM \u2014 Audio: ${slider.value}% | Mic: ${mic.checked ? 'on' : 'off'}`);

  // Toast when mic toggled via System menu (not our buttons)
  let micBtnActive = false;
  for (const btn of document.querySelectorAll('.pikvm-mic-btn, .pikvm-mic-btn-f')) {
    btn.addEventListener('mousedown', () => { micBtnActive = true; });
  }
  mic.addEventListener('change', () => {
    if (micBtnActive) { micBtnActive = false; return; }
    showToast(`PiKVM \u2014 Mic: ${mic.checked ? 'on' : 'off'}`);
  });

  return true;
}

(async () => {
  if (!await init()) {
    const observer = new MutationObserver(async () => {
      if (await init()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
