// Shared mock behaviour: sheets, chips, weight keypad, toasts, filters,
// row actions, chess time-control switcher and simple field validation.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isVisible = (el) => !!el && document.contains(el) && el.getClientRects().length > 0;

  /* ---------- Sheets ---------- */
  let lastOpener = null;

  function focusFallback() {
    const el = $('[data-focus-fallback]') || $('.tab-add');
    if (el) el.focus({ preventScroll: true });
  }

  function openSheet(id, opener) {
    const layer = document.getElementById(id);
    if (!layer) return;
    $$('.sheet-layer').forEach((l) => { if (l !== layer && !l.hidden) closeSheet(l, false); });
    if (opener) lastOpener = opener;
    layer.hidden = false;
    layer.dispatchEvent(new CustomEvent('sheet:open', { detail: { opener } }));
    requestAnimationFrame(() => {
      layer.classList.add('is-open');
      const target = $('[data-autofocus]', layer) || $('button, a, input, textarea', layer);
      if (target) target.focus({ preventScroll: true });
    });
  }

  function closeSheet(layer, restoreFocus = true) {
    if (!layer || layer.hidden) return;
    layer.classList.remove('is-open');
    const finish = () => { if (!layer.classList.contains('is-open')) layer.hidden = true; };
    if (reduceMotion) finish(); else setTimeout(finish, 170);
    if (restoreFocus) {
      if (isVisible(lastOpener)) lastOpener.focus({ preventScroll: true });
      else focusFallback();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = $$('.sheet-layer').find((l) => !l.hidden);
    if (open) closeSheet(open);
  });

  /* ---------- Toast ---------- */
  const toast = $('.toast');
  let toastTimer = null;
  let undoFn = null;

  function showToast(message, { undo = null, persist = false } = {}) {
    if (!toast) return;
    clearTimeout(toastTimer);
    $('.toast-msg', toast).textContent = message;
    const undoBtn = $('.toast-undo', toast);
    undoFn = undo;
    if (undoBtn) undoBtn.hidden = !undo;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-shown'));
    if (!persist) toastTimer = setTimeout(hideToast, 4000);
  }

  function hideToast() {
    if (!toast) return;
    toast.classList.remove('is-shown');
    setTimeout(() => { if (!toast.classList.contains('is-shown')) toast.hidden = true; }, reduceMotion ? 0 : 170);
  }

  /* ---------- Weight keypad ---------- */
  const weightSheet = document.getElementById('sheet-weight');
  let weightValue = '';
  let weightFresh = true;

  function renderWeight() {
    const out = $('[data-weight-value]');
    if (out) out.textContent = weightValue || '0';
    const save = $('[data-save-weight]');
    const n = parseFloat(weightValue);
    const ok = !Number.isNaN(n) && n >= 30 && n <= 300;
    if (save) save.disabled = !ok;
    const err = document.getElementById('w-error');
    if (err) err.hidden = ok || weightValue === '' || weightFresh;
  }

  if (weightSheet) {
    weightSheet.addEventListener('sheet:open', (e) => {
      const opener = e.detail.opener;
      const prefill = (opener && opener.dataset.prefill) || weightSheet.dataset.prefill || '';
      weightValue = prefill;
      weightFresh = true;
      const note = $('[data-weight-note]', weightSheet);
      const noteText = (opener && opener.dataset.note) || weightSheet.dataset.note;
      if (note && noteText) note.textContent = noteText;
      const date = document.getElementById('w-date');
      const iso = (opener && opener.dataset.date) || weightSheet.dataset.date;
      if (date && iso) date.value = iso;
      renderWeight();
    });
  }

  function pressKey(key) {
    if (weightFresh && key !== 'back') { weightValue = ''; }
    weightFresh = false;
    if (key === 'back') {
      weightValue = weightValue.slice(0, -1);
    } else if (key === '.') {
      if (!weightValue.includes('.')) weightValue = (weightValue || '0') + '.';
    } else {
      const [, dec] = weightValue.split('.');
      if (dec !== undefined && dec.length >= 1) return renderWeight();
      if (!weightValue.includes('.') && weightValue.replace('.', '').length >= 3) return renderWeight();
      weightValue += key;
    }
    renderWeight();
  }

  /* ---------- Chips ---------- */
  function selectChip(chip) {
    const group = chip.closest('[data-chips]');
    if (!group) return;
    $$('[aria-pressed]', group).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    group.dispatchEvent(new CustomEvent('chips:change', { detail: { value: chip.dataset.value, chip } }));
  }

  // Log form: category swaps the type chips; custom duration reveals an input.
  const category = $('[data-chips="category"]');
  if (category) {
    category.addEventListener('chips:change', (e) => {
      const cat = e.detail.value;
      category.setAttribute('data-tone', cat);
      $$('[data-types]').forEach((g) => { g.hidden = g.dataset.types !== cat; });
      const types = $(`[data-types="${cat}"]`);
      if (types && !$('[aria-pressed="true"]', types)) {
        const first = $('[aria-pressed]', types);
        if (first) selectChip(first);
      }
    });
  }
  const duration = $('[data-chips="duration"]');
  if (duration) {
    duration.addEventListener('chips:change', (e) => {
      const custom = document.getElementById('custom-duration');
      if (!custom) return;
      custom.hidden = e.detail.value !== 'custom';
      if (!custom.hidden) { const input = $('input', custom); if (input) input.focus(); }
    });
  }

  // Log history: category filter.
  const filter = $('[data-chips="filter"]');
  function applyFilter(value) {
    $$('[data-row]').forEach((row) => {
      if (row.dataset.deleted === 'true') { row.hidden = true; return; }
      row.hidden = value !== 'all' && row.dataset.cat !== value;
    });
    $$('[data-day-group]').forEach((g) => { g.hidden = !$$('[data-row]', g).some((r) => !r.hidden); });
    const empty = $('[data-filter-empty]');
    if (empty) empty.hidden = $$('[data-row]').some((r) => !r.hidden);
  }
  if (filter) filter.addEventListener('chips:change', (e) => applyFilter(e.detail.value));
  const currentFilter = () => {
    const pressed = filter && $('[aria-pressed="true"]', filter);
    return pressed ? pressed.dataset.value : 'all';
  };

  // Chess: time-control switcher.
  const tc = $('[data-chips="tc"]');
  if (tc && window.CHESS_DATA) {
    tc.addEventListener('chips:change', (e) => {
      const d = window.CHESS_DATA[e.detail.value];
      if (!d) return;
      $$('[data-chess]').forEach((el) => {
        const key = el.dataset.chess;
        if (key === 'status') el.innerHTML = d.status;
        else if (d[key] !== undefined) el.textContent = d[key];
      });
      $$('[data-series]').forEach((g) => { g.hidden = g.dataset.series !== e.detail.value; });
    });
  }

  /* ---------- Session row actions ---------- */
  let activeRow = null;
  const actions = document.getElementById('sheet-actions');
  function resetActions() {
    if (!actions) return;
    const main = $('[data-action-main]', actions);
    const confirm = $('[data-action-confirm]', actions);
    if (main) main.hidden = false;
    if (confirm) confirm.hidden = true;
  }

  /* ---------- Validation ---------- */
  function validateField(input) {
    const err = document.getElementById(`${input.id}-error`);
    const raw = input.value.trim();
    let ok = true;
    if (input.hasAttribute('data-required') && raw === '') ok = false;
    if (ok && raw !== '' && (input.dataset.min || input.dataset.max)) {
      const n = parseFloat(raw);
      if (Number.isNaN(n)) ok = false;
      if (input.dataset.min && n < parseFloat(input.dataset.min)) ok = false;
      if (input.dataset.max && n > parseFloat(input.dataset.max)) ok = false;
    }
    input.setAttribute('aria-invalid', String(!ok));
    if (err) err.hidden = ok;
    return ok;
  }
  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.matches('[data-validate]')) validateField(t);
  });

  /* ---------- Click delegation ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    const opener = t.closest('[data-open]');
    if (opener) { e.preventDefault(); openSheet(opener.dataset.open, opener); return; }

    const closer = t.closest('[data-close]');
    if (closer) { closeSheet(closer.closest('.sheet-layer')); return; }

    const chip = t.closest('[data-chips] [aria-pressed]');
    if (chip) { selectChip(chip); return; }

    const key = t.closest('[data-key]');
    if (key) { pressKey(key.dataset.key); return; }

    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      const target = document.getElementById(toggle.dataset.toggle);
      if (target) {
        target.hidden = !target.hidden;
        toggle.setAttribute('aria-expanded', String(!target.hidden));
        if (!target.hidden) { const f = $('input, button', target); if (f) f.focus(); }
      }
      return;
    }

    if (t.closest('[data-save-weight]')) {
      const value = weightValue;
      closeSheet(weightSheet);
      showToast(`Weight saved · ${value} kg`, { undo: () => showToast('Entry removed') });
      return;
    }

    if (t.closest('[data-save-session]')) {
      const typeChip = $('[data-types]:not([hidden]) [aria-pressed="true"]');
      const durChip = $('[data-chips="duration"] [aria-pressed="true"]');
      let minutes = durChip ? durChip.dataset.value : '';
      if (minutes === 'custom') {
        const input = document.getElementById('dur-custom');
        if (!input || !validateField(input)) { if (input) input.focus(); return; }
        minutes = input.value.trim();
      }
      const type = typeChip ? typeChip.textContent.trim() : 'Session';
      showToast(`${type} · ${minutes} min saved`, { undo: () => showToast('Session removed') });
      return;
    }

    if (t.closest('.toast-undo')) {
      const fn = undoFn; undoFn = null;
      if (fn) fn(); else hideToast();
      return;
    }

    const row = t.closest('[data-row]');
    if (row && actions) {
      activeRow = row;
      $('[data-action-title]', actions).textContent = row.dataset.title;
      $('[data-action-sub]', actions).textContent = row.dataset.sub;
      resetActions();
      openSheet('sheet-actions', row);
      return;
    }

    if (t.closest('[data-delete-ask]')) {
      $('[data-action-main]', actions).hidden = true;
      $('[data-action-confirm]', actions).hidden = false;
      const cancel = $('[data-delete-cancel]', actions);
      if (cancel) cancel.focus();
      return;
    }
    if (t.closest('[data-delete-cancel]')) { resetActions(); const d = $('[data-delete-ask]', actions); if (d) d.focus(); return; }
    if (t.closest('[data-delete-confirm]')) {
      const removed = activeRow;
      if (removed) { removed.dataset.deleted = 'true'; applyFilter(currentFilter()); }
      closeSheet(actions);
      showToast(`${removed ? removed.dataset.title : 'Session'} deleted`, {
        undo: () => {
          if (removed) { removed.dataset.deleted = 'false'; applyFilter(currentFilter()); }
          showToast('Session restored');
        },
      });
      return;
    }

    const refresh = t.closest('[data-refresh]');
    if (refresh) {
      const label = $('[data-sync-text]');
      refresh.setAttribute('aria-busy', 'true');
      if (label) label.textContent = 'Syncing with Lichess…';
      setTimeout(() => {
        refresh.removeAttribute('aria-busy');
        if (label) label.textContent = 'Synced just now';
      }, 900);
      return;
    }

    const submit = t.closest('[data-submit-href]');
    if (submit) {
      const form = submit.closest('[data-form]') || document;
      const fields = $$('[data-validate]', form);
      const results = fields.map(validateField);
      const firstBad = fields[results.indexOf(false)];
      if (firstBad) { firstBad.focus(); return; }
      window.location.href = submit.dataset.submitHref;
      return;
    }

    const toastBtn = t.closest('[data-toast]');
    if (toastBtn) { showToast(toastBtn.dataset.toast); return; }

    const pick = t.closest('[data-pick-file]');
    if (pick) { const input = document.getElementById(pick.dataset.pickFile); if (input) input.click(); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'file' && t.files && t.files[0]) {
      showToast(`Backup restored from ${t.files[0].name}`);
      t.value = '';
    }
  });

  /* ---------- Deep links used by the review board ---------- */
  const hash = window.location.hash.replace('#', '');
  if (hash === 'quick-add') openSheet('sheet-quick', null);
  if (hash === 'weight') openSheet('sheet-weight', $('[data-open="sheet-weight"]'));
  if (hash === 'saved') {
    const msg = toast && toast.dataset.demo;
    if (msg) showToast(msg, { undo: () => showToast('Session removed'), persist: true });
  }
})();
