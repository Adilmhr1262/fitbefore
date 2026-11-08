/* FitBefore — personal measurement notebook.
   All data lives in localStorage on this device. Dimensions are stored in
   centimetres and converted for display (1 inch = 2.54 cm exactly). */
(function () {
  'use strict';

  var STORAGE_KEY = 'fitbefore.v1';
  var CM_PER_IN = 2.54;
  var TIGHT_CM = 5; /* clearance under 5 cm is flagged tight */
  var MAX_DIM_CM = 100000; /* sanity cap: 1 km */

  var state = { spaces: [], items: [], unit: 'cm' };
  var fit = { spaceId: null, itemId: null, rotated: false };
  var tab = 'spaces';
  var spaceQuery = '';
  var itemQuery = '';

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function esc(s) { return String(s == null ? '' : s); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtNum(v, unit) {
    if (unit === 'in') {
      var inches = v / CM_PER_IN;
      var r = Math.round(inches * 100) / 100;
      return (Number.isInteger(r) ? String(r) : String(r)) + ' in';
    }
    var cm = Math.round(v * 10) / 10;
    return (Number.isInteger(cm) ? String(cm) : String(cm)) + ' cm';
  }
  function fmtDim(w, d, h, unit) {
    var parts = [fmtNum(w, unit) + ' W', fmtNum(d, unit) + ' D'];
    if (h != null) parts.push(fmtNum(h, unit) + ' H');
    return parts.join(' × ');
  }
  function fmtSigned(cm, unit) {
    var sign = cm > 0 ? '+' : '';
    if (unit === 'in') {
      var inches = Math.round((cm / CM_PER_IN) * 100) / 100;
      return sign + inches + ' in';
    }
    var v = Math.round(cm * 10) / 10;
    return sign + v + ' cm';
  }
  function parseDim(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (s === '') return null;
    var v = Number(s);
    if (!Number.isFinite(v)) return NaN;
    return v;
  }

  /* ---------- persistence ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || data.app !== 'fitbefore' || data.version !== 1) return;
      if (Array.isArray(data.spaces)) state.spaces = data.spaces.filter(validSpace);
      if (Array.isArray(data.items)) state.items = data.items.filter(validItem);
      if (data.unit === 'in' || data.unit === 'cm') state.unit = data.unit;
    } catch (e) { /* corrupt storage: start empty */ }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        app: 'fitbefore', version: 1,
        spaces: state.spaces, items: state.items, unit: state.unit
      }));
    } catch (e) { toast('Could not save — browser storage is full or unavailable.', true); }
  }

  /* ---------- validation ---------- */
  function validDim(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_DIM_CM;
  }
  function validSpace(s) {
    return s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.trim() !== '' &&
      validDim(s.width) && validDim(s.depth) &&
      (s.height == null || validDim(s.height));
  }
  function validItem(i) {
    return validSpace(i) &&
      (i.link == null || i.link === '' || (typeof i.link === 'string' && /^https?:\/\//i.test(i.link))) &&
      (i.notes == null || typeof i.notes === 'string');
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || data.app !== 'fitbefore' || data.version !== 1) return 'Not a FitBefore backup file.';
    if (!Array.isArray(data.spaces) || !Array.isArray(data.items)) return 'Backup is missing its spaces or furniture lists.';
    var ids = {};
    var all = data.spaces.concat(data.items);
    for (var k = 0; k < all.length; k++) {
      if (ids[all[k] && all[k].id]) return 'Backup has two entries sharing one id.';
      ids[all[k] && all[k].id] = true;
    }
    for (var a = 0; a < data.spaces.length; a++) if (!validSpace(data.spaces[a])) return 'Backup has an invalid space entry.';
    for (var b = 0; b < data.items.length; b++) if (!validItem(data.items[b])) return 'Backup has an invalid furniture entry.';
    if (data.unit != null && data.unit !== 'cm' && data.unit !== 'in') return 'Backup has an unknown unit.';
    return null;
  }

  /* ---------- toasts ---------- */
  var toastTimer = null;
  function toast(msg, isError) {
    var root = $('toastRoot');
    root.textContent = '';
    var t = el('div', 'toast' + (isError ? ' error' : ''), msg);
    root.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { root.textContent = ''; }, 4000);
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    tab = name;
    var panels = { spaces: 'panel-spaces', furniture: 'panel-furniture', fit: 'panel-fit' };
    Object.keys(panels).forEach(function (k) {
      $(panels[k]).hidden = k !== name;
      $('tab' + k.charAt(0).toUpperCase() + k.slice(1)).setAttribute('aria-current', k === name ? 'page' : 'false');
    });
    if (name === 'fit') renderFit();
  }

  /* ---------- lists ---------- */
  function renderSpaces() {
    var q = spaceQuery.trim().toLowerCase();
    var list = state.spaces.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; });
    $('spaceCount').textContent = state.spaces.length === 0 ? '' :
      list.length + ' of ' + state.spaces.length + ' space' + (state.spaces.length === 1 ? '' : 's');
    $('spaceEmpty').style.display = state.spaces.length === 0 ? '' : 'none';
    var ul = $('spaceList');
    ul.textContent = '';
    if (state.spaces.length && !list.length) {
      var none = el('li', 'empty', 'No spaces match "' + spaceQuery + '".');
      ul.appendChild(none);
      return;
    }
    list.forEach(function (s) {
      var li = el('li', 'card');
      var body = el('div');
      body.appendChild(el('h3', null, s.name));
      body.appendChild(el('p', 'dims', fmtDim(s.width, s.depth, s.height, state.unit)));
      li.appendChild(body);
      var acts = el('div', 'card-actions');
      var edit = el('button', 'btn', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () { openSpaceDialog(s); });
      var del = el('button', 'btn btn-danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () { openConfirm('Delete space "' + s.name + '"?', function () {
        state.spaces = state.spaces.filter(function (x) { return x.id !== s.id; });
        if (fit.spaceId === s.id) fit.spaceId = null;
        save(); renderAll(); toast('Space deleted.');
      }); });
      acts.appendChild(edit); acts.appendChild(del);
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }

  function renderItems() {
    var q = itemQuery.trim().toLowerCase();
    var list = state.items.filter(function (i) { return !q || i.name.toLowerCase().indexOf(q) !== -1; });
    $('itemCount').textContent = state.items.length === 0 ? '' :
      list.length + ' of ' + state.items.length + ' item' + (state.items.length === 1 ? '' : 's');
    $('itemEmpty').style.display = state.items.length === 0 ? '' : 'none';
    var ul = $('itemList');
    ul.textContent = '';
    if (state.items.length && !list.length) {
      ul.appendChild(el('li', 'empty', 'No furniture matches "' + itemQuery + '".'));
      return;
    }
    list.forEach(function (it) {
      var li = el('li', 'card');
      var body = el('div');
      body.appendChild(el('h3', null, it.name));
      body.appendChild(el('p', 'dims', fmtDim(it.width, it.depth, it.height, state.unit)));
      if (it.notes) body.appendChild(el('p', 'notes', it.notes));
      if (it.link) {
        var pw = el('p', 'link');
        var a = el('a', null, it.link);
        a.href = it.link; a.target = '_blank'; a.rel = 'noopener';
        pw.appendChild(a); body.appendChild(pw);
      }
      li.appendChild(body);
      var acts = el('div', 'card-actions');
      var edit = el('button', 'btn', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () { openItemDialog(it); });
      var del = el('button', 'btn btn-danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () { openConfirm('Delete furniture "' + it.name + '"?', function () {
        state.items = state.items.filter(function (x) { return x.id !== it.id; });
        if (fit.itemId === it.id) fit.itemId = null;
        save(); renderAll(); toast('Furniture deleted.');
      }); });
      acts.appendChild(edit); acts.appendChild(del);
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }

  /* ---------- fit check ---------- */
  function fitDims(space, item, rotated) {
    var iw = rotated ? item.depth : item.width;
    var id = rotated ? item.width : item.depth;
    return { width: { space: space.width, item: iw }, depth: { space: space.depth, item: id },
      height: (space.height != null && item.height != null) ? { space: space.height, item: item.height } : null };
  }

  function renderFit() {
    var hasBoth = state.spaces.length > 0 && state.items.length > 0;
    $('fitEmpty').style.display = hasBoth ? 'none' : '';
    $('fitEmptyText').textContent = state.spaces.length === 0 && state.items.length === 0
      ? 'Add at least one space and one piece of furniture first.'
      : state.spaces.length === 0 ? 'Add at least one space first.'
      : 'Add at least one piece of furniture first.';
    $('fitMain').hidden = !hasBoth;
    $('printFitBtn').disabled = !hasBoth;
    if (!hasBoth) return;

    var spaceSel = $('fitSpace'), itemSel = $('fitItem');
    function fillSelect(sel, entries, selectedId, fallback) {
      var cur = sel.value || selectedId || fallback;
      sel.textContent = '';
      entries.forEach(function (e) {
        var o = document.createElement('option');
        o.value = e.id; o.textContent = e.name + ' — ' + fmtDim(e.width, e.depth, e.height, state.unit);
        sel.appendChild(o);
      });
      if (entries.some(function (e) { return e.id === cur; })) sel.value = cur;
      else sel.value = entries[0].id;
    }
    fillSelect(spaceSel, state.spaces, fit.spaceId, null);
    fillSelect(itemSel, state.items, fit.itemId, null);
    fit.spaceId = spaceSel.value;
    fit.itemId = itemSel.value;
    $('fitRotate').checked = fit.rotated;
    renderFitResult();
  }

  function renderFitResult() {
    var space = state.spaces.find(function (s) { return s.id === fit.spaceId; });
    var item = state.items.find(function (i) { return i.id === fit.itemId; });
    if (!space || !item) return;
    var dims = fitDims(space, item, fit.rotated);
    var rows = $('dimRows');
    rows.textContent = '';
    var verdict = 'fits';
    var tightDims = [];
    var excessDims = [];
    var compared = 0;

    ['width', 'depth', 'height'].forEach(function (key) {
      var d = dims[key];
      var tr = document.createElement('tr');
      var label = key.charAt(0).toUpperCase() + key.slice(1) + (key !== 'height' && fit.rotated ? ' (rotated)' : '');
      tr.appendChild(el('th', null, label)).scope = 'row';
      if (!d) {
        var td = el('td', 'dim-missing', 'Not compared — height missing on one side');
        td.colSpan = 3;
        tr.appendChild(td);
        rows.appendChild(tr);
        return;
      }
      compared++;
      var clear = d.space - d.item;
      tr.appendChild(el('td', 'num', fmtNum(d.space, state.unit)));
      tr.appendChild(el('td', 'num', fmtNum(d.item, state.unit)));
      var ctd = document.createElement('td');
      ctd.className = 'num';
      var span = el('span', null, fmtSigned(clear, state.unit));
      if (clear < 0) { span.className = 'clearance-bad'; excessDims.push(key); verdict = 'nofit'; }
      else if (clear < TIGHT_CM) { span.className = 'clearance-tight'; tightDims.push(key); }
      else { span.className = 'clearance-ok'; }
      ctd.appendChild(span);
      tr.appendChild(ctd);
      rows.appendChild(tr);
    });
    if (verdict !== 'nofit' && tightDims.length) verdict = 'tight';

    var vEl = $('fitVerdict');
    var noteEl = $('fitVerdictNote');
    vEl.className = 'verdict ' + verdict;
    if (verdict === 'nofit') {
      vEl.textContent = 'Does not fit';
      noteEl.textContent = 'The ' + excessDims.join(' and ') + ' exceed' + (excessDims.length === 1 ? 's' : '') +
        ' the space. Try rotating the footprint, or pick a different space or item.';
    } else if (verdict === 'tight') {
      vEl.textContent = 'Fits — tight';
      noteEl.textContent = 'It fits, but the ' + tightDims.join(' and ') + ' clearance is under ' +
        fmtNum(TIGHT_CM, state.unit) + '. Allow room for hands, skirting, or uneven walls.';
    } else {
      vEl.textContent = 'Fits';
      noteEl.textContent = 'Every compared dimension fits with room to spare.';
    }

    $('fitHeightNote').textContent = dims.height ? '' :
      'Height was not compared: ' + (space.height == null ? 'the space has no height recorded' : 'the furniture has no height recorded') + '.';
    $('fitItemNote').textContent = item.notes ? 'Notes: ' + item.notes : '';
    var linkWrap = $('fitItemLinkWrap');
    if (item.link) {
      linkWrap.hidden = false;
      var a = $('fitItemLink');
      a.href = item.link; a.textContent = 'Open product page';
    } else linkWrap.hidden = true;

    drawDiagram(space, item, fit.rotated, verdict);
    buildPrintReport(space, item, dims, verdict, tightDims, excessDims);
  }

  function drawDiagram(space, item, rotated, verdict) {
    var svg = $('fitSvg');
    svg.textContent = '';
    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }
    var W = 440, H = 340, pad = 44;
    var iw = rotated ? item.depth : item.width;
    var idp = rotated ? item.width : item.depth;
    var maxW = Math.max(space.width, iw), maxD = Math.max(space.depth, idp);
    var scale = Math.min((W - pad * 2) / maxW, (H - pad * 2) / maxD);
    var sw = space.width * scale, sd = space.depth * scale;
    var iwPx = iw * scale, idPx = idp * scale;
    var sx = (W - sw) / 2, sy = (H - sd) / 2;
    var ix = (W - iwPx) / 2, iy = (H - idPx) / 2;

    /* item rect (drawn first so the space outline sits on top where it fits) */
    var itemFill = verdict === 'nofit' ? 'rgba(185,28,28,0.18)' : 'rgba(13,148,136,0.25)';
    var itemStroke = verdict === 'nofit' ? '#b91c1c' : '#0d9488';
    svg.appendChild(mk('rect', { x: ix, y: iy, width: iwPx, height: idPx, fill: itemFill, stroke: itemStroke, 'stroke-width': 2, rx: 3 }));
    svg.appendChild(mk('rect', { x: sx, y: sy, width: sw, height: sd, fill: 'none', stroke: '#1f2937', 'stroke-width': 2, rx: 3 }));

    /* labels */
    function label(x, y, text, anchor) {
      var t = mk('text', { x: x, y: y, 'text-anchor': anchor || 'middle', 'font-size': 12, 'font-family': 'ui-monospace, Menlo, Consolas, monospace', fill: '#1f2937' });
      t.textContent = text;
      svg.appendChild(t);
    }
    label(W / 2, sy - 8, 'Space: ' + fmtDim(space.width, space.depth, null, state.unit), 'middle');
    label(W / 2, iy + idPx / 2 + 4, 'Item: ' + fmtDim(iw, idp, null, state.unit), 'middle');
    /* dimension lines */
    svg.appendChild(mk('line', { x1: sx, y1: sy + sd + 16, x2: sx + sw, y2: sy + sd + 16, stroke: '#6b7280', 'stroke-width': 1 }));
    svg.appendChild(mk('line', { x1: sx, y1: sy + sd + 12, x2: sx, y2: sy + sd + 20, stroke: '#6b7280', 'stroke-width': 1 }));
    svg.appendChild(mk('line', { x1: sx + sw, y1: sy + sd + 12, x2: sx + sw, y2: sy + sd + 20, stroke: '#6b7280', 'stroke-width': 1 }));
    label(W / 2, sy + sd + 32, fmtNum(space.width, state.unit) + ' wide');
    svg.setAttribute('aria-label', 'Scaled top-down diagram: space ' + fmtDim(space.width, space.depth, null, state.unit) +
      ', furniture ' + fmtDim(iw, idp, null, state.unit) + (rotated ? ' (rotated)' : '') + '. ' + $('fitVerdict').textContent + '.');
  }

  function buildPrintReport(space, item, dims, verdict, tightDims, excessDims) {
    var r = $('printReport');
    r.textContent = '';
    r.appendChild(el('h2', null, 'FitBefore — fit report'));
    r.appendChild(el('p', null, 'Space: ' + space.name + ' — ' + fmtDim(space.width, space.depth, space.height, state.unit)));
    r.appendChild(el('p', null, 'Furniture: ' + item.name + ' — ' + fmtDim(item.width, item.depth, item.height, state.unit) + (fit.rotated ? ' (rotated)' : '')));
    var v = verdict === 'nofit' ? 'Does not fit' : verdict === 'tight' ? 'Fits — tight' : 'Fits';
    r.appendChild(el('p', null, 'Result: ' + v));
    var ul = el('ul');
    ['width', 'depth', 'height'].forEach(function (key) {
      var d = dims[key];
      var li = el('li', null, d
        ? key + ': space ' + fmtNum(d.space, state.unit) + ', furniture ' + fmtNum(d.item, state.unit) + ', clearance ' + fmtSigned(d.space - d.item, state.unit)
        : key + ': not compared (height missing on one side)');
      ul.appendChild(li);
    });
    r.appendChild(ul);
    r.appendChild(el('p', null, 'Dimensions only. This does not check whether the item passes through doors or can be assembled inside the space.'));
  }

  /* ---------- dialogs ---------- */
  var dialog = $('dialog');
  var dialogMode = null; /* {kind:'space'|'item'|'confirm', entry, onConfirm} */
  var lastFocus = null;

  function openDialog(title, confirmLabel) {
    lastFocus = document.activeElement;
    $('dialogTitle').textContent = title;
    $('dialogConfirm').textContent = confirmLabel;
    $('dialogError').hidden = true;
    $('dialogError').textContent = '';
    $('main').inert = true;
    document.querySelector('.site-header').inert = true;
    document.querySelector('.tabs').inert = true;
    document.querySelector('.site-footer').inert = true;
    dialog.showModal();
    var first = dialog.querySelector('input, select, textarea, button:not(#dialogCancel)');
    if (first) first.focus();
  }
  function closeDialog() {
    if (dialog.open) dialog.close();
    $('main').inert = false;
    document.querySelector('.site-header').inert = false;
    document.querySelector('.tabs').inert = false;
    document.querySelector('.site-footer').inert = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  dialog.addEventListener('close', function () {
    $('main').inert = false;
    document.querySelector('.site-header').inert = false;
    document.querySelector('.tabs').inert = false;
    document.querySelector('.site-footer').inert = false;
  });
  $('dialogCancel').addEventListener('click', closeDialog);
  dialog.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button, input, select, textarea, a[href]'))
      .filter(function (n) { return !n.disabled; });
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function dimFields(prefix, entry) {
    var body = $('dialogBody');
    var row = el('div', 'field-row');
    function numField(id, label, value, required) {
      var wrap = el('div', 'field');
      var lab = el('label', null, label + (required ? ' *' : ''));
      lab.htmlFor = id;
      var inp = document.createElement('input');
      inp.type = 'number'; inp.id = id; inp.min = '0'; inp.step = 'any';
      inp.inputMode = 'decimal';
      inp.placeholder = state.unit;
      if (value != null) inp.value = String(value);
      if (required) inp.required = true;
      wrap.appendChild(lab); wrap.appendChild(inp);
      return wrap;
    }
    row.appendChild(numField(prefix + 'W', 'Width (' + state.unit + ')', entry ? toDisplay(entry.width) : null, true));
    row.appendChild(numField(prefix + 'D', 'Depth (' + state.unit + ')', entry ? toDisplay(entry.depth) : null, true));
    row.appendChild(numField(prefix + 'H', 'Height (' + state.unit + ', optional)', entry && entry.height != null ? toDisplay(entry.height) : null, false));
    body.appendChild(row);
    var hint = el('p', 'hint', 'Enter dimensions in ' + (state.unit === 'cm' ? 'centimetres' : 'inches') + '. They are stored in centimetres.');
    body.appendChild(hint);
  }
  function toDisplay(cm) {
    if (state.unit === 'in') return Math.round((cm / CM_PER_IN) * 100) / 100;
    return Math.round(cm * 10) / 10;
  }
  function toCm(displayValue) { return state.unit === 'in' ? displayValue * CM_PER_IN : displayValue; }

  function readDims(prefix) {
    var w = parseDim($(prefix + 'W').value);
    var d = parseDim($(prefix + 'D').value);
    var hRaw = $(prefix + 'H').value.trim();
    var h = hRaw === '' ? null : parseDim(hRaw);
    if (Number.isNaN(w) || w == null || w <= 0) return { error: 'Width must be a number greater than 0.' };
    if (Number.isNaN(d) || d == null || d <= 0) return { error: 'Depth must be a number greater than 0.' };
    if (hRaw !== '' && (Number.isNaN(h) || h <= 0)) return { error: 'Height must be a number greater than 0, or left empty.' };
    if (toCm(w) > MAX_DIM_CM || toCm(d) > MAX_DIM_CM || (h != null && toCm(h) > MAX_DIM_CM)) return { error: 'A dimension is unrealistically large.' };
    return { width: toCm(w), depth: toCm(d), height: h == null ? null : toCm(h) };
  }

  function textField(id, label, value, opts) {
    opts = opts || {};
    var wrap = el('div', 'field');
    var lab = el('label', null, label + (opts.required ? ' *' : ''));
    lab.htmlFor = id;
    var inp;
    if (opts.textarea) { inp = document.createElement('textarea'); }
    else {
      inp = document.createElement('input');
      inp.type = opts.type || 'text';
    }
    inp.id = id;
    if (value != null) inp.value = value;
    if (opts.required) inp.required = true;
    if (opts.placeholder) inp.placeholder = opts.placeholder;
    wrap.appendChild(lab); wrap.appendChild(inp);
    return wrap;
  }

  function openSpaceDialog(entry) {
    dialogMode = { kind: 'space', entry: entry || null };
    var body = $('dialogBody');
    body.textContent = '';
    body.appendChild(textField('fName', 'Name', entry ? entry.name : '', { required: true, placeholder: 'e.g. Desk alcove' }));
    dimFields('f', entry);
    openDialog(entry ? 'Edit space' : 'Add a space', 'Save');
  }
  function openItemDialog(entry) {
    dialogMode = { kind: 'item', entry: entry || null };
    var body = $('dialogBody');
    body.textContent = '';
    body.appendChild(textField('fName', 'Name', entry ? entry.name : '', { required: true, placeholder: 'e.g. Oak desk' }));
    dimFields('f', entry);
    body.appendChild(textField('fLink', 'Product link (optional)', entry ? entry.link || '' : '', { type: 'url', placeholder: 'https://…' }));
    body.appendChild(textField('fNotes', 'Notes (optional)', entry ? entry.notes || '' : '', { textarea: true, placeholder: 'Colour, seller, delivery notes…' }));
    openDialog(entry ? 'Edit furniture' : 'Add furniture', 'Save');
  }
  function openConfirm(message, onConfirm) {
    dialogMode = { kind: 'confirm', onConfirm: onConfirm };
    var body = $('dialogBody');
    body.textContent = '';
    body.appendChild(el('p', 'confirm-text', message));
    openDialog('Are you sure?', 'Delete');
    $('dialogConfirm').classList.add('btn-danger');
  }

  $('dialogForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('dialogError');
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    if (dialogMode.kind === 'confirm') {
      $('dialogConfirm').classList.remove('btn-danger');
      var cb = dialogMode.onConfirm;
      closeDialog();
      cb();
      return;
    }
    var name = $('fName').value.trim();
    if (!name) { fail('Name is required.'); return; }
    var dims = readDims('f');
    if (dims.error) { fail(dims.error); return; }
    if (dialogMode.kind === 'space') {
      var s = dialogMode.entry || { id: newId() };
      s.name = name; s.width = dims.width; s.depth = dims.depth; s.height = dims.height;
      if (!dialogMode.entry) state.spaces.push(s);
      save(); closeDialog(); renderAll();
      toast(dialogMode.entry ? 'Space updated.' : 'Space added.');
    } else {
      var link = $('fLink').value.trim();
      if (link && !/^https?:\/\//i.test(link)) { fail('Product link must start with http:// or https://.'); return; }
      var it = dialogMode.entry || { id: newId() };
      it.name = name; it.width = dims.width; it.depth = dims.depth; it.height = dims.height;
      it.link = link; it.notes = $('fNotes').value.trim();
      if (!dialogMode.entry) state.items.push(it);
      save(); closeDialog(); renderAll();
      toast(dialogMode.entry ? 'Furniture updated.' : 'Furniture added.');
    }
  });
  dialog.addEventListener('cancel', function () { $('dialogConfirm').classList.remove('btn-danger'); });

  /* ---------- export / import ---------- */
  $('exportBtn').addEventListener('click', function () {
    var data = JSON.stringify({ app: 'fitbefore', version: 1, spaces: state.spaces, items: state.items, unit: state.unit }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fitbefore-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Backup downloaded.');
  });
  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (e) { toast('That file is not valid JSON.', true); $('importFile').value = ''; return; }
      var problem = validateBackup(data);
      if (problem) { toast('Import rejected: ' + problem + ' Nothing changed.', true); $('importFile').value = ''; return; }
      openConfirm('Import this backup? It replaces everything saved here (' + data.spaces.length + ' spaces, ' + data.items.length + ' furniture items).', function () {
        state.spaces = data.spaces; state.items = data.items;
        if (data.unit) state.unit = data.unit;
        fit.spaceId = null; fit.itemId = null; fit.rotated = false;
        save(); renderAll(); toast('Backup imported.');
      });
      $('importFile').value = '';
    };
    reader.readAsText(file);
  });

  /* ---------- units ---------- */
  function setUnit(unit) {
    state.unit = unit;
    $('unitCm').setAttribute('aria-pressed', unit === 'cm' ? 'true' : 'false');
    $('unitIn').setAttribute('aria-pressed', unit === 'in' ? 'true' : 'false');
    save(); renderAll();
  }
  $('unitCm').addEventListener('click', function () { setUnit('cm'); });
  $('unitIn').addEventListener('click', function () { setUnit('in'); });

  /* ---------- wiring ---------- */
  $('tabSpaces').addEventListener('click', function () { setTab('spaces'); });
  $('tabFurniture').addEventListener('click', function () { setTab('furniture'); });
  $('tabFit').addEventListener('click', function () { setTab('fit'); });
  $('addSpaceBtn').addEventListener('click', function () { openSpaceDialog(null); });
  $('addItemBtn').addEventListener('click', function () { openItemDialog(null); });
  document.querySelectorAll('[data-open-space]').forEach(function (b) {
    b.addEventListener('click', function () { openSpaceDialog(null); });
  });
  document.querySelectorAll('[data-open-item]').forEach(function (b) {
    b.addEventListener('click', function () { openItemDialog(null); });
  });
  $('spaceSearch').addEventListener('input', function () { spaceQuery = this.value; renderSpaces(); });
  $('itemSearch').addEventListener('input', function () { itemQuery = this.value; renderItems(); });
  $('fitSpace').addEventListener('change', function () { fit.spaceId = this.value; renderFitResult(); });
  $('fitItem').addEventListener('change', function () { fit.itemId = this.value; renderFitResult(); });
  $('fitRotate').addEventListener('change', function () { fit.rotated = this.checked; renderFitResult(); });
  $('printFitBtn').addEventListener('click', function () { window.print(); });

  function renderAll() {
    $('unitCm').setAttribute('aria-pressed', state.unit === 'cm' ? 'true' : 'false');
    $('unitIn').setAttribute('aria-pressed', state.unit === 'in' ? 'true' : 'false');
    renderSpaces(); renderItems();
    if (tab === 'fit') renderFit();
  }

  load();
  renderAll();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline support unavailable */ });
    });
  }
})();
