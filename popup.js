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

let saveTimer = null;
let currentPasteShortcut = DEFAULTS.pasteShortcut;

function formatShortcut(s) {
  if (!s) return '';
  const parts = [];
  if (s.ctrl) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  if (s.meta) parts.push('Meta');
  parts.push(s.code.replace(/^Key/, '').replace(/^Digit/, ''));
  return parts.join('+');
}

function readForm() {
  return {
    audioEnabled: document.getElementById('audio-enabled').checked,
    audioVolume: parseInt(document.getElementById('audio-volume').value),
    micDefault: document.querySelector('input[name="mic"]:checked').value,
    micLinksAudio: document.getElementById('mic-links-audio').checked,
    reduceNavbar: document.getElementById('reduce-navbar').checked,
    hideAtx: document.getElementById('hide-atx').checked,
    hideDrive: document.getElementById('hide-drive').checked,
    hideMacro: document.getElementById('hide-macro').checked,
    hideText: document.getElementById('hide-text').checked,
    hideShortcuts: document.getElementById('hide-shortcuts').checked,
    hideLogo: document.getElementById('hide-logo').checked,
    gbpcKeySwap: document.getElementById('gbpc-key-swap').checked,
    optionQCmd: document.getElementById('option-q-cmd').checked,
    optionTabCmd: document.getElementById('option-tab-cmd').checked,
    pasteShortcut: currentPasteShortcut,
  };
}

function flashSaved() {
  const btn = document.getElementById('save');
  btn.textContent = 'Saved!';
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('saved'); }, 1200);
}

function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set(readForm(), flashSaved), 300);
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(DEFAULTS, s => {
    document.getElementById('audio-enabled').checked = s.audioEnabled;
    document.getElementById('audio-volume').value = s.audioVolume;
    document.getElementById('vol-label').textContent = s.audioVolume + '%';
    document.querySelector(`input[name="mic"][value="${s.micDefault}"]`).checked = true;
    document.getElementById('mic-links-audio').checked = s.micLinksAudio;
    document.getElementById('reduce-navbar').checked = s.reduceNavbar;
    document.getElementById('hide-atx').checked = s.hideAtx;
    document.getElementById('hide-drive').checked = s.hideDrive;
    document.getElementById('hide-macro').checked = s.hideMacro;
    document.getElementById('hide-text').checked = s.hideText;
    document.getElementById('hide-shortcuts').checked = s.hideShortcuts;
    document.getElementById('hide-logo').checked = s.hideLogo;
    document.getElementById('gbpc-key-swap').checked = s.gbpcKeySwap;
    document.getElementById('option-q-cmd').checked = s.optionQCmd;
    document.getElementById('option-tab-cmd').checked = s.optionTabCmd;
    currentPasteShortcut = s.pasteShortcut;
    document.getElementById('paste-shortcut').value = formatShortcut(s.pasteShortcut);
  });

  document.getElementById('audio-volume').addEventListener('input', e => {
    document.getElementById('vol-label').textContent = e.target.value + '%';
    autoSave();
  });

  document.querySelectorAll('input[type="checkbox"], input[type="radio"]')
    .forEach(el => el.addEventListener('change', autoSave));

  const shortcutInput = document.getElementById('paste-shortcut');
  shortcutInput.addEventListener('keydown', e => {
    e.preventDefault();
    if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;
    currentPasteShortcut = { code: e.code, alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey };
    shortcutInput.value = formatShortcut(currentPasteShortcut);
    shortcutInput.blur();
    autoSave();
  });
  shortcutInput.addEventListener('focus', () => { shortcutInput.value = '\u2026'; });
  shortcutInput.addEventListener('blur', () => { shortcutInput.value = formatShortcut(currentPasteShortcut); });

  document.getElementById('paste-shortcut-clear').addEventListener('click', () => {
    currentPasteShortcut = null;
    shortcutInput.value = '';
    autoSave();
  });

  document.getElementById('save').addEventListener('click', () => {
    clearTimeout(saveTimer);
    chrome.storage.local.set(readForm(), flashSaved);
  });

  const version = chrome.runtime.getManifest().version;
  document.getElementById('reload').title = `Reload extension (v${version})`;
  document.getElementById('reload').addEventListener('click', async () => {
    await chrome.storage.local.set({ _reloadFromVersion: version });
    const tabs = await chrome.tabs.query({ url: ['https://*/kvm/*', 'http://*/kvm/*'] });
    for (const tab of tabs) {
      chrome.tabs.reload(tab.id);
    }
    chrome.runtime.reload();
  });
});
