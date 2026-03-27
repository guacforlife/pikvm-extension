// PiKVM Audio Extension — keyboard intercept (MAIN world)
// Runs in PiKVM's own JS world so stopPropagation reliably blocks PiKVM's HID handler.
// Shortcut config is read from DOM attributes set by content.js (isolated world).
// Uses window.postMessage to trigger paste in the isolated world.

(function () {
  document.documentElement.setAttribute('data-pikvm-ki', '1');

  function getShortcut() {
    try {
      return JSON.parse(document.documentElement.getAttribute('data-pikvm-shortcut') || 'null');
    } catch { return null; }
  }

  function matchShortcut(ev) {
    const s = getShortcut();
    return s && s.code
      && ev.code === s.code
      && ev.altKey === s.alt
      && ev.ctrlKey === s.ctrl
      && ev.shiftKey === s.shift
      && ev.metaKey === s.meta;
  }

  // The modifier keys (Alt, Ctrl, etc.) fire keydown BEFORE the trigger key,
  // so the remote already has them held when we intercept. Inject fake keyup
  // events directly into PiKVM's handler to release them before paste text arrives.
  function releaseShortcutModifiers() {
    const s = getShortcut();
    if (!s) return;
    const mods = [];
    if (s.alt)   mods.push({ code: 'AltLeft',     key: 'Alt' });
    if (s.ctrl)  mods.push({ code: 'ControlLeft',  key: 'Control' });
    if (s.shift) mods.push({ code: 'ShiftLeft',    key: 'Shift' });
    if (s.meta)  mods.push({ code: 'MetaLeft',     key: 'Meta' });
    if (!mods.length) return;

    const el = hidEl();
    if (!el?.onkeyup) return;
    for (const mod of mods) {
      el.onkeyup(new KeyboardEvent('keyup', { code: mod.code, key: mod.key }));
    }
  }

  // Helper: get PiKVM's HID capture element.
  function hidEl() {
    return document.getElementById('stream-window')
        || document.getElementById('keyboard-window')
        || document.getElementById('mouse-window');
  }

  // Helper: read a boolean config attribute from the root element.
  function configEnabled(attr) {
    return document.documentElement.getAttribute(attr) === '1';
  }

  // GBPC fix: prevent PiKVM WebUI's built-in key remap from firing.
  // PiKVM's keyboard.js __keyboardHandler has a hardcoded remap:
  //   IntlBackslash + key in ["`","~"] → Backquote
  //   Backquote     + key in ["§","±"] → IntlBackslash
  // Correct for standard British, wrong for GBPC where the characters are
  // on the opposite physical keys. We neutralize ev.key so the remap
  // condition never matches, letting the original code pass through unchanged.
  function neutralizeGbpcRemap(ev) {
    if (ev.code !== 'IntlBackslash' && ev.code !== 'Backquote') return false;
    if (!configEnabled('data-pikvm-gbpc-swap')) return false;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const el = hidEl();
    const handler = ev.type === 'keydown' ? 'onkeydown' : 'onkeyup';
    if (!el?.[handler]) return true;
    el[handler](new KeyboardEvent(ev.type, {
      code: ev.code, key: 'Unidentified',
      shiftKey: ev.shiftKey, altKey: ev.altKey,
      ctrlKey: ev.ctrlKey, metaKey: ev.metaKey,
    }));
    return true;
  }

  // App-switcher state: true while Option is held and we're cycling through apps.
  // Meta is kept held on the remote so the app-switcher stays visible.
  let appSwitchActive = false;

  window.addEventListener('keyup', function (ev) {
    if (neutralizeGbpcRemap(ev)) return;
    if (appSwitchActive && (ev.code === 'AltLeft' || ev.code === 'AltRight')) {
      appSwitchActive = false;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const el = hidEl();
      if (!el?.onkeyup) return;
      // Release Meta on remote — closes app switcher and switches to selected app
      el.onkeyup(new KeyboardEvent('keyup', { code: 'MetaLeft', key: 'Meta' }));
    }
  }, true);

  window.addEventListener('keydown', function (ev) {
    if (neutralizeGbpcRemap(ev)) return;
    // Option+Q → Cmd+Q on remote (prevents Chrome from quitting locally).
    if (ev.code === 'KeyQ' && ev.altKey && !ev.ctrlKey && !ev.metaKey && configEnabled('data-pikvm-option-q')) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const el = hidEl();
      if (!el?.onkeydown || !el?.onkeyup) return;
      // Release Alt on remote (already held from physical keydown)
      el.onkeyup(new KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt' }));
      el.onkeydown(new KeyboardEvent('keydown', { code: 'MetaLeft', key: 'Meta', metaKey: true }));
      el.onkeydown(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q', metaKey: true }));
      el.onkeyup(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q' }));
      el.onkeyup(new KeyboardEvent('keyup', { code: 'MetaLeft', key: 'Meta' }));
      return;
    }
    // Option+Tab → Cmd+Tab on remote. Hold Option to keep the app switcher open,
    // press Tab/Shift+Tab to cycle through apps, release Option to confirm.
    if (ev.code === 'Tab' && ev.altKey && !ev.ctrlKey && !ev.metaKey && configEnabled('data-pikvm-option-tab')) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const el = hidEl();
      if (!el?.onkeydown || !el?.onkeyup) return;
      if (!appSwitchActive) {
        appSwitchActive = true;
        // Release Alt on remote (already held from physical keydown)
        el.onkeyup(new KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt' }));
        // Hold Meta on remote — keeps app switcher open
        el.onkeydown(new KeyboardEvent('keydown', { code: 'MetaLeft', key: 'Meta', metaKey: true }));
      }
      // Each Tab press cycles to next/previous app
      el.onkeydown(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', metaKey: true, shiftKey: ev.shiftKey }));
      el.onkeyup(new KeyboardEvent('keyup', { code: 'Tab', key: 'Tab', metaKey: true }));
      return;
    }
    if (ev.code === 'F11') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      if (!document.fullscreenElement) {
        // requestFullscreen requires a user gesture — call it here in MAIN world keydown.
        document.documentElement.requestFullscreen?.();
      } else {
        // exitFullscreen needs no gesture; let content.js handle the full-tab restore.
        window.postMessage({ __pikvm: 'exitToFullTab' }, '*');
      }
      return;
    }
    if (matchShortcut(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      releaseShortcutModifiers();
      window.postMessage({ __pikvm: 'paste' }, '*');
    }
  }, true);
})();
