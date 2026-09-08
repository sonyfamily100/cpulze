const ENGINES = ['chatgpt', 'gemini', 'perplexity'];
const THEMES = [
  ['staff', 'Staff'], ['room_quality', 'Room Quality'], ['cleanliness', 'Cleanliness'],
  ['dining', 'Dining'], ['checkin_out', 'Check-in/out'], ['value', 'Value'],
  ['noise', 'Noise'], ['maintenance', 'Maintenance'], ['wifi', 'Wi-Fi'],
  ['accessibility', 'Accessibility'], ['family_suitability', 'Family Suitability'],
  ['pricing_transparency', 'Pricing Transparency']
];

// Mirrors lib/themes.js — kept in sync manually since this is plain
// browser JS with no shared module loader. Used to canonicalize finding
// theme labels at render time (covers both new runs, which the backend
// already normalizes, and older saved runs which predate that fix).
const THEME_ALIASES = {
  staff: ['staff', 'service', 'employees'],
  room_quality: ['roomquality', 'room', 'rooms'],
  cleanliness: ['cleanliness', 'clean', 'hygiene'],
  dining: ['dining', 'food', 'restaurant', 'breakfast'],
  checkin_out: ['checkinout', 'checkin', 'checkout', 'frontdesk', 'reception'],
  value: ['value', 'valueformoney'],
  noise: ['noise', 'soundproofing'],
  maintenance: ['maintenance', 'repairs', 'aircon', 'airconditioning', 'hvac'],
  wifi: ['wifi', 'wireless', 'connectivity', 'internet'],
  accessibility: ['accessibility', 'disabled', 'wheelchair'],
  family_suitability: ['familysuitability', 'family', 'kids', 'children'],
  pricing_transparency: ['pricingtransparency', 'pricing', 'booking', 'fees', 'hiddenfees']
};
const THEME_LABELS = Object.fromEntries(THEMES);

function normalizeThemeStr(s) { return (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''); }

function matchThemeKey(rawLabel) {
  const n = normalizeThemeStr(rawLabel);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(THEME_ALIASES)) {
    if (aliases.some(a => n.includes(a) || a.includes(n))) return key;
  }
  return null;
}

function canonicalizeTheme(rawLabel) {
  const key = matchThemeKey(rawLabel);
  if (key) return THEME_LABELS[key];
  return (rawLabel || '').toString().trim();
}

// Legacy runs sometimes carried no theme field at all for API findings —
// only part_or_theme set to a bare "A"/"B"/"C". claim_summary conventionally
// opens with the theme as its subject, so try matching the leading 1-3
// words against the taxonomy; leave blank rather than guess wrong.
function inferThemeFromClaim(claimSummary) {
  const words = (claimSummary || '').trim().split(/\s+/).slice(0, 3);
  for (let n = words.length; n >= 1; n--) {
    const key = matchThemeKey(words.slice(0, n).join(' '));
    if (key) return THEME_LABELS[key];
  }
  return '';
}

// Mirrors lib/verify.js's extractPartTheme — recovers { part, theme } from
// whichever shape a saved finding has: current runs already carry separate
// part/theme fields; older runs only carry a combined part_or_theme in one
// of three shapes: "A - Some Theme" (dash format), a bare "A"/"B"/"C" for
// API rows (theme not captured, recovered via inferThemeFromClaim), or a
// bare theme key/label for consumer rows (no part).
function extractPartTheme(f) {
  if (f.part !== undefined || f.theme !== undefined) {
    return { part: f.part, theme: f.theme };
  }
  const raw = (f.part_or_theme || '').toString().trim();
  const source = (f.source || '').toString().trim().toLowerCase();

  const dashMatch = raw.match(/^([ABC])\s*-\s*(.+)$/);
  if (dashMatch) return { part: dashMatch[1], theme: dashMatch[2] };

  if (source === 'api' && /^[ABC]$/i.test(raw)) {
    return { part: raw.toUpperCase(), theme: inferThemeFromClaim(f.claim_summary) };
  }
  if (source === 'consumer') {
    return { part: '', theme: raw };
  }
  return { part: '', theme: raw };
}

// part is "A"/"B"/"C" for API findings, null (rendered as "–") for consumer
// findings — consumer-app answers aren't split into parts.
function normalizeFindingDisplay(f) {
  const isApi = (f.source || '').toString().trim().toLowerCase() === 'api';
  let part = (f.part || '').toString().trim().toUpperCase();
  if (!isApi) part = null;
  else if (!['A', 'B', 'C'].includes(part)) part = part || null;
  return { ...f, part, theme: canonicalizeTheme(f.theme) };
}

let hotels = [];
let activeId = null;
let showHiddenHotels = false;

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

async function loadHotels() {
  hotels = await api(`/api/hotels?includeHidden=${showHiddenHotels}`);
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('hotelList');
  list.innerHTML = '';

  // Toggle control to show or hide archived hotels
  const toggleContainer = document.createElement('div');
  toggleContainer.style.cssText = 'padding: 8px 10px; margin-bottom: 6px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--mute); user-select: none;';
  
  const toggleCheckbox = document.createElement('input');
  toggleCheckbox.type = 'checkbox';
  toggleCheckbox.id = 'showHiddenToggle';
  toggleCheckbox.checked = showHiddenHotels;
  toggleCheckbox.onchange = async () => {
    showHiddenHotels = toggleCheckbox.checked;
    await loadHotels();
  };

  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'showHiddenToggle';
  toggleLabel.style.cursor = 'pointer';
  toggleLabel.textContent = 'Show hidden hotels';

  toggleContainer.appendChild(toggleCheckbox);
  toggleContainer.appendChild(toggleLabel);
  list.appendChild(toggleContainer);

  hotels.forEach(h => {
    const div = document.createElement('div');
    div.className = 'hotel-item' + (h.id === activeId ? ' active' : '');
    if (h.hidden) {
      div.style.opacity = '0.65';
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'hotel-name';
    nameSpan.textContent = h.name + (h.hidden ? ' (hidden)' : '');
    nameSpan.onclick = () => { activeId = h.id; renderSidebar(); renderMain(); };

    const actionBtn = document.createElement('button');
    actionBtn.className = 'delete-hotel-btn';

    if (h.hidden) {
      actionBtn.textContent = '+';
      actionBtn.title = 'Restore ' + h.name;
      actionBtn.style.color = 'var(--teal, #10b981)';
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        unhideHotel(h.id, h.name);
      };
    } else {
      actionBtn.textContent = '-';
      actionBtn.title = 'Hide ' + h.name;
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        deleteHotel(h.id, h.name);
      };
    }

    div.appendChild(nameSpan);
    div.appendChild(actionBtn);
    list.appendChild(div);
  });
}

// Hides a hotel from view while keeping its data intact in Supabase
async function deleteHotel(id, name) {
  const confirmed = confirm(`Hide "${name}" from view?\n\nThis will remove it from the active sidebar list, but all data remains safely preserved in Supabase.`);
  if (!confirmed) return;
  try {
    await api('/api/hotels/' + id, { method: 'DELETE' });
    if (activeId === id) activeId = null;
    await loadHotels();
    renderMain();
  } catch (e) {
    alert('Failed to hide hotel: ' + e.message);
  }
}

// Restores an archived/hidden hotel back to the view
async function unhideHotel(id, name) {
  try {
    await api('/api/hotels/' + id + '/unhide', { method: 'POST' });
    await loadHotels();
    renderMain();
  } catch (e) {
    alert('Failed to restore hotel: ' + e.message);
  }
}

document.getElementById('addHotelBtn').onclick = async () => {
  const name = document.getElementById('newName').value.trim();
  const location = document.getElementById('newLocation').value.trim();
  if (!name) return;
  const h = await api('/api/hotels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, location })
  });
  document.getElementById('newName').value = '';
  document.getElementById('newLocation').value = '';
  await loadHotels();
  activeId = h.id; renderSidebar(); renderMain();
};

// Generic drag-and-drop wiring for a file-upload block. zoneId is the
// dashed-border container wrapping the input + button; fileInputId is the
// <input type="file"> inside it; uploadBtnId is the button whose existing
// onclick already reads fileInput.files[0] and performs the upload. Since
// that button already knows how to read the input, dropping a file just
// sets fileInput.files and clicks the button — no upload logic duplicated.
function enableDropZone(zoneId, fileInputId, uploadBtnId) {
  const zone = document.getElementById(zoneId);
  const fileInput = document.getElementById(fileInputId);
  const uploadBtn = document.getElementById(uploadBtnId);
  if (!zone || !fileInput || !uploadBtn) return;

  ['dragenter', 'dragover'].forEach(evt =>
    zone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('dragover');
    })
  );

  ['dragleave', 'drop'].forEach(evt =>
    zone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('dragover');
    })
  );

  zone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (!files.length) return;
    fileInput.files = files;
    uploadBtn.click();
  });
}

async function renderMain() {
  const main = document.getElementById('main');
  if (!activeId) { main.innerHTML = '<div class="empty">Add or select a hotel to begin.</div>'; return; }
  const hotel = await api('/api/hotels/' + activeId);
  document.getElementById('hotelCorpusCount').textContent = hotel.corpus.length ? hotel.corpus.length + ' corpus rows loaded' : '';

  main.innerHTML = `
    <div class="section">
      <h3>${escapeHtml(hotel.name)}</h3>
      <p class="hint">${escapeHtml(hotel.location || '')}</p>
    </div>

    <div class="section">
      <h3>1. API pipeline</h3>
      <p class="hint">Runs Part A, B, C sequentially for the selected engine using keys from your .env file.</p>
      ${ENGINES.map(e => engineRow(e, hotel)).join('')}
    </div>

    <div class="section">
      <h3>2. Corpus</h3>
      <p class="hint">Paste CSV text (url,reviewer,date,rating,title,text) or upload a file.</p>
      <textarea id="corpusPaste" placeholder="Paste CSV content here..." style="width:100%;min-height:80px;font-size:11px"></textarea>
      <div id="corpusDropZone" class="drop-zone" style="margin-top:8px">
        <p class="dz-hint">Drag &amp; drop a CSV here, or use the buttons below</p>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="corpusPasteBtn">Load pasted CSV</button>
          <input type="file" id="corpusFile" accept=".csv">
          <button id="corpusFileBtn">Upload file</button>
        </div>
      </div>
      ${corpusDisplay(hotel.corpus)}
    </div>

    <div class="section">
      <h3>3. Consumer app paste-in</h3>
      <p class="hint">Paste each consumer-app answer under its engine + theme, or upload a CSV to bulk-fill the grid below.</p>

      <div style="border:1px dashed var(--border);border-radius:8px;padding:12px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">Bulk upload (optional)</div>
        <p class="hint" style="margin-bottom:8px">Columns: <code>theme,chatgpt,gemini,perplexity</code>. Theme names are matched loosely (e.g. "Wi-Fi", "wifi", "Wi-Fi & Connectivity" all work).
          <a href="/api/consumer-csv-template" download style="color:var(--teal)">Download blank template</a>
        </p>
        <textarea id="consumerCsvPaste" placeholder="Paste CSV content here..." style="width:100%;min-height:60px;font-size:11px"></textarea>
        <div id="consumerCsvDropZone" class="drop-zone" style="margin-top:8px">
          <p class="dz-hint">Drag &amp; drop a CSV here, or use the buttons below</p>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="consumerCsvPasteBtn">Load pasted CSV</button>
            <input type="file" id="consumerCsvFile" accept=".csv">
            <button id="consumerCsvFileBtn">Upload file</button>
          </div>
        </div>
        <div id="consumerCsvReport" style="margin-top:8px;font-size:12px"></div>
      </div>

      <div class="theme-grid">
        <div class="head"></div>
        ${ENGINES.map(e => `<div class="head">${e}</div>`).join('')}
        ${THEMES.map(([key, label]) => `
          <div style="font-size:12px;font-weight:600;padding-top:6px">${label}</div>
          ${ENGINES.map(e => `<textarea data-engine="${e}" data-theme="${key}" placeholder="paste ${e} answer...">${escapeHtml((hotel.consumer_findings[e] && hotel.consumer_findings[e][key]) || '')}</textarea>`).join('')}
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h3>4. Verification</h3>
      <p class="hint">Runs Claude against API findings + consumer findings + corpus. Requires corpus loaded. Each run is saved — nothing is overwritten.</p>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="primary" id="verifyBtn">Run verification</button>
        <select id="historySelect" style="display:${hotel.verification_history.length ? 'inline-block' : 'none'}"></select>
        <button id="exportCsvBtn" style="display:${hotel.verification_history.length ? 'inline-block' : 'none'}">Export CSV</button>
      </div>
      <div id="verifyResults" style="margin-top:14px"></div>
      <div style="display:${hotel.email_history.length ? 'flex' : 'none'};gap:8px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;color:var(--mute)">Past emails:</label>
        <select id="emailHistorySelect">
          <option value="">— select a past email —</option>
        </select>
      </div>
      <div id="emailHistoryViewer" style="margin-top:10px"></div>
      <div style="display:${hotel.report_history.length ? 'flex' : 'none'};gap:8px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;color:var(--mute)">Past reports:</label>
        <select id="reportHistorySelect">
          <option value="">— select a past report —</option>
        </select>
      </div>
      <div id="reportHistoryViewer" style="margin-top:10px"></div>
    </div>
  `;

  ENGINES.forEach(e => {
    const btn = document.getElementById('run-' + e);
    if (btn) btn.onclick = () => runEngineApi(e);
  });

  document.getElementById('corpusPasteBtn').onclick = async () => {
    const csvText = document.getElementById('corpusPaste').value;
    if (!csvText.trim()) return;
    const r = await api('/api/hotels/' + activeId + '/corpus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText })
    });
    alert('Loaded ' + r.rows_loaded + ' rows');
    renderMain();
  };

  document.getElementById('corpusFileBtn').onclick = async () => {
    const fileInput = document.getElementById('corpusFile');
    if (!fileInput.files[0]) return;
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    const res = await fetch('/api/hotels/' + activeId + '/corpus', { method: 'POST', body: fd });
    const r = await res.json();
    alert('Loaded ' + (r.rows_loaded || 0) + ' rows');
    renderMain();
  };

  document.querySelectorAll('.theme-grid textarea').forEach(ta => {
    ta.addEventListener('blur', async () => {
      await api(`/api/hotels/${activeId}/consumer/${ta.dataset.engine}/${ta.dataset.theme}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ta.value })
      });
    });
  });

  async function handleConsumerCsvResult(res) {
    const reportBox = document.getElementById('consumerCsvReport');
    try {
      const r = await res.json();
      if (r.error) { reportBox.innerHTML = '<span style="color:var(--red)">' + escapeHtml(r.error) + '</span>'; return; }
      let html = `<span style="color:var(--teal)">Matched ${r.rows_matched} theme row(s), filled ${r.cells_filled} cell(s) across: ${r.engine_columns_found.join(', ')}.</span>`;
      if (r.rows_unmatched.length) {
        html += `<br><span style="color:var(--amber)">Could not match theme label(s): ${r.rows_unmatched.map(t => escapeHtml(t)).join(', ')}</span>`;
      }
      reportBox.innerHTML = html;
      renderMain(); // refresh grid to show newly loaded text
    } catch (e) {
      reportBox.innerHTML = '<span style="color:var(--red)">Upload failed: ' + escapeHtml(e.message) + '</span>';
    }
  }

  document.getElementById('consumerCsvPasteBtn').onclick = async () => {
    const csvText = document.getElementById('consumerCsvPaste').value;
    if (!csvText.trim()) return;
    const res = await fetch('/api/hotels/' + activeId + '/consumer-csv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText })
    });
    handleConsumerCsvResult(res);
  };

  document.getElementById('consumerCsvFileBtn').onclick = async () => {
    const fileInput = document.getElementById('consumerCsvFile');
    if (!fileInput.files[0]) return;
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    const res = await fetch('/api/hotels/' + activeId + '/consumer-csv', { method: 'POST', body: fd });
    handleConsumerCsvResult(res);
  };

  // Wire up drag-and-drop for both upload zones
  enableDropZone('corpusDropZone', 'corpusFile', 'corpusFileBtn');
  enableDropZone('consumerCsvDropZone', 'consumerCsvFile', 'consumerCsvFileBtn');

  document.getElementById('verifyBtn').onclick = async () => {
    const box = document.getElementById('verifyResults');
    box.innerHTML = 'Running verification...';
    try {
      const result = await api('/api/hotels/' + activeId + '/verify', { method: 'POST' });
      renderMain(); // full re-render so the history dropdown picks up the new run
    } catch (e) {
      box.innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(e.message) + '</span>';
    }
  };

  const historySelect = document.getElementById('historySelect');
  let currentRunIndex = hotel.verification_history.length - 1;
  if (hotel.verification_history.length) {
    historySelect.innerHTML = hotel.verification_history
      .map((v, i) => `<option value="${i}">${i === hotel.verification_history.length - 1 ? 'Latest — ' : ''}${new Date(v.run_at).toLocaleString()}</option>`)
      .reverse()
      .join('');
    historySelect.onchange = () => {
      currentRunIndex = Number(historySelect.value);
      renderVerification(hotel.verification_history[currentRunIndex], document.getElementById('verifyResults'), currentRunIndex, hotel.corpus, hotel);
    };
    renderVerification(hotel.verification_history[currentRunIndex], document.getElementById('verifyResults'), currentRunIndex, hotel.corpus, hotel);
  }

  document.getElementById('exportCsvBtn').onclick = () => {
    if (currentRunIndex < 0) return;
    window.open(`/api/hotels/${activeId}/verification-csv?run=${currentRunIndex}`, '_blank');
  };
}

function corpusDisplay(corpus) {
  if (!corpus || !corpus.length) {
    return '<p class="hint" style="margin-top:10px">No corpus loaded yet.</p>';
  }
  const ratingCounts = {};
  corpus.forEach(r => {
    const rating = (r.rating || '?').toString();
    ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
  });
  const ratingSummary = Object.keys(ratingCounts).sort().map(r => `${r}★: ${ratingCounts[r]}`).join('  ·  ');

  const rows = corpus.map((r, i) => `
    <tr onclick="document.getElementById('corpus-row-${i}').classList.toggle('open')" style="cursor:pointer">
      <td>${escapeHtml(r.rating || '')}★</td>
      <td>${escapeHtml(r.date || '')}</td>
      <td>${escapeHtml((r.title || '').slice(0, 60))}${(r.title || '').length > 60 ? '…' : ''}</td>
      <td style="color:var(--mute)">${escapeHtml((r.text || '').slice(0, 80))}${(r.text || '').length > 80 ? '… (click to expand)' : ''}</td>
    </tr>
    <tr id="corpus-row-${i}" class="collapsible corpus-detail-row">
      <td colspan="4">
        <div style="font-size:11px;color:var(--mute);margin-bottom:4px">${escapeHtml(r.reviewer || '(no reviewer)')} · ${escapeHtml(r.url || '')}</div>
        <div style="font-size:12px">${escapeHtml(r.text || '')}</div>
      </td>
    </tr>
  `).join('');

  return `
    <div style="margin-top:14px">
      <p class="hint"><strong>${corpus.length} rows loaded</strong> &nbsp;·&nbsp; ${ratingSummary}</p>
      <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
        <table style="width:100%">
          <thead style="position:sticky;top:0;background:var(--panel)">
            <tr><th>Rating</th><th>Date</th><th>Title</th><th>Text</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function engineRow(engine, hotel) {
  const findings = hotel.api_findings[engine];
  const done = findings && findings.partA;
  let resultsHtml = '';
  if (done) {
    resultsHtml = '<div style="margin:8px 0 4px 16px">' +
      ['A', 'B', 'C'].map(p => partResultBlock(engine, p, findings['part' + p])).join('') +
      '</div>';
  }
  return `<div class="engine-row">
    <span class="status-dot ${done ? 'ok' : 'no'}"></span>
    <span class="label">${engine}</span>
    <button id="run-${engine}">Run Part A/B/C</button>
  </div>${resultsHtml}`;
}

function partResultBlock(engine, part, result) {
  if (!result) return '';
  const groundedBadge = result.grounded
    ? '<span class="badge VERIFIED">grounded</span>'
    : '<span class="badge FABRICATED">ungrounded</span>';
  const citCount = (result.citations || []).length;
  const blockId = `result-${engine}-${part}`;
  return `
    <div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--bg)">
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="document.getElementById('${blockId}').classList.toggle('open')">
        <strong style="font-size:12px">Part ${part}</strong>
        ${groundedBadge}
        <span style="font-size:11px;color:var(--mute)">${citCount} citation${citCount === 1 ? '' : 's'}</span>
        <span style="font-size:11px;color:var(--mute);margin-left:auto">click to expand</span>
      </div>
      <div id="${blockId}" class="collapsible">
        <pre>${escapeHtml(result.raw_text || '(empty response)')}</pre>
        ${citCount ? '<div style="font-size:11px;color:var(--mute)"><strong>Citations:</strong><br>' + result.citations.map(c => escapeHtml(c)).join('<br>') + '</div>' : ''}
      </div>
    </div>`;
}

async function runEngineApi(engine) {
  const btn = document.getElementById('run-' + engine);
  btn.textContent = 'Running...'; btn.disabled = true;
  try {
    await api('/api/hotels/' + activeId + '/run-api/' + engine, { method: 'POST' });
    renderMain();
  } catch (e) {
    alert('Failed: ' + e.message);
    btn.textContent = 'Run Part A/B/C'; btn.disabled = false;
  }
}

function renderVerification(result, box, runIndex, corpus, hotel) {
  window.__currentVerificationRunIndex = runIndex;
  if (result.parse_error) {
    box.innerHTML = '<p style="color:var(--red)">Verification returned unparseable output.</p><pre>' + escapeHtml(result.raw_text || '') + '</pre>';
    return;
  }
  corpus = corpus || [];
  const corpusById = {};
  corpus.forEach((r, i) => { corpusById[r.id || (i + 1)] = r; });

  const findings = (result.findings || []).map(f => {
    const { part, theme } = extractPartTheme(f);
    return normalizeFindingDisplay({ ...f, part, theme, corpus_refs: f.corpus_refs || [] });
  });

  const notes = result.cross_findings_notes || [];
  const summary = result.summary || [];

  const uniq = key => [...new Set(findings.map(f => f[key]).filter(v => v !== undefined && v !== null && v !== ''))].sort();
  const filterSelect = (id, label, key) => `
    <label style="font-size:11px;color:var(--mute);margin-right:4px">${label}</label>
    <select id="${id}" style="font-size:12px;margin-right:10px">
      <option value="">All</option>
      ${uniq(key).map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}
    </select>`;

  box.innerHTML = `
    <div style="margin-bottom:10px">
      ${filterSelect('filterSource', 'Source', 'source')}
      ${filterSelect('filterEngine', 'Engine', 'engine')}
      ${filterSelect('filterPart', 'Part', 'part')}
      ${filterSelect('filterTheme', 'Theme', 'theme')}
      ${filterSelect('filterVerdict', 'Verdict', 'verdict')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <button id="selectAllBtn" style="font-size:12px">Select all (visible)</button>
      <button id="selectNoneBtn" style="font-size:12px">Select none</button>
      <span id="selectionCount" style="font-size:12px;color:var(--mute)">0 selected</span>
    </div>
    <table>
      <tr><th></th><th>#</th><th>Source</th><th>Engine</th><th>Part</th><th>Theme</th><th>Claim</th><th>Verdict</th><th>Evidence</th></tr>
      ${findings.map(f => {
        const refs = (f.corpus_refs || []).map(refId => {
          const row = corpusById[refId];
          return row && row.url
            ? `<a href="${escapeAttr(row.url)}" target="_blank" rel="noopener" title="${escapeAttr(row.rating || '')}★ ${escapeAttr(row.date || '')}">#${refId}</a>`
            : `#${refId}`;
        }).join(' ');
        return `<tr class="finding-row" data-source="${escapeAttr(f.source||'')}" data-engine="${escapeAttr(f.engine||'')}" data-part="${escapeAttr(f.part||'')}" data-theme="${escapeAttr(f.theme||'')}" data-verdict="${escapeAttr(f.verdict||'')}">
        <td><input type="checkbox" class="finding-checkbox" data-finding-id="${f.id}"></td>
        <td>${f.id !== undefined ? f.id : ''}</td>
        <td>${escapeHtml(f.source||'')}</td>
        <td>${escapeHtml(f.engine||'')}</td>
        <td>${escapeHtml(f.part || '–')}</td>
        <td>${escapeHtml(f.theme||'')}</td>
        <td>${escapeHtml(f.claim_summary||'')}</td>
        <td><span class="badge ${f.verdict}">${f.verdict}</span></td>
        <td>${escapeHtml(f.evidence||'')}${refs ? '<div style="margin-top:4px;font-size:11px">Corpus: ' + refs + '</div>' : ''}</td>
      </tr>`;
      }).join('')}
    </table>
    ${notes.length ? '<h4 style="font-size:12px;margin-top:14px">Cross-finding contradictions</h4><ul style="font-size:12px">' + notes.map(n => '<li>' + escapeHtml(n) + '</li>').join('') + '</ul>' : ''}
    ${summary.length ? `
      <div style="margin-top:16px;padding:12px;background:var(--teal-fill);border-radius:8px">
        <h4 style="font-size:12px;margin:0 0 8px">Summary</h4>
        <ul style="font-size:13px;margin:0;padding-left:18px">${summary.map(s => '<li>' + escapeHtml(s) + '</li>').join('')}</ul>
      </div>` : ''}
    ${findings.length ? `
      <div style="margin-top:16px">
        <button class="primary" id="generateEmailBtn" disabled>Generate Email (select findings above)</button>
        <button class="primary" id="generateReportBtn" disabled>Generate Client Report (select findings above)</button>
        <div id="emailSelectionPreview" style="margin-top:10px"></div>
        <div id="reportSelectionPreview" style="margin-top:10px"></div>
      </div>` : ''}
  `;

  const checkboxes = () => Array.from(box.querySelectorAll('.finding-checkbox'));
  const rows = () => Array.from(box.querySelectorAll('.finding-row'));
  const visibleCheckboxes = () => rows()
    .filter(tr => tr.style.display !== 'none')
    .map(tr => tr.querySelector('.finding-checkbox'));
  const genBtn = document.getElementById('generateEmailBtn');
  const genReportBtn = document.getElementById('generateReportBtn');
  const countEl = document.getElementById('selectionCount');

  function updateSelectionState() {
    const selected = checkboxes().filter(cb => cb.checked);
    countEl.textContent = `${selected.length} selected`;
    genBtn.disabled = selected.length === 0;
    genBtn.textContent = selected.length === 0
      ? 'Generate Email (select findings above)'
      : `Generate Email (${selected.length} selected)`;
    genReportBtn.disabled = selected.length === 0;
    genReportBtn.textContent = selected.length === 0
      ? 'Generate Client Report (select findings above)'
      : `Generate Client Report (${selected.length} selected)`;
  }

  checkboxes().forEach(cb => cb.addEventListener('change', updateSelectionState));

  document.getElementById('selectAllBtn').onclick = () => {
    visibleCheckboxes().forEach(cb => cb.checked = true);
    updateSelectionState();
  };
  document.getElementById('selectNoneBtn').onclick = () => {
    checkboxes().forEach(cb => cb.checked = false);
    updateSelectionState();
  };

  function applyFilters() {
    const src = document.getElementById('filterSource').value;
    const eng = document.getElementById('filterEngine').value;
    const part = document.getElementById('filterPart').value;
    const theme = document.getElementById('filterTheme').value;
    const verdict = document.getElementById('filterVerdict').value;
    rows().forEach(tr => {
      const matches = (!src || tr.dataset.source === src)
        && (!eng || tr.dataset.engine === eng)
        && (!part || tr.dataset.part === part)
        && (!theme || tr.dataset.theme === theme)
        && (!verdict || tr.dataset.verdict === verdict);
      tr.style.display = matches ? '' : 'none';
    });
  }
  ['filterSource', 'filterEngine', 'filterPart', 'filterTheme', 'filterVerdict'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  genBtn.onclick = async () => {
    const selectedIds = checkboxes().filter(cb => cb.checked).map(cb => Number(cb.dataset.findingId));
    const preview = document.getElementById('emailSelectionPreview');
    preview.innerHTML = 'Generating email from ' + selectedIds.length + ' selected finding(s)...';
    try {
      const result = await fetch(`/api/hotels/${activeId}/generate-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runIndex: window.__currentVerificationRunIndex, findingIds: selectedIds })
      }).then(r => r.json());
      renderEmailResult(preview, result, 'new');
      if (!result.error && !result.parse_error) {
        hotel.email_history.push(result);
        populateEmailHistorySelect();
      }
    } catch (e) {
      preview.innerHTML = '<span style="color:var(--red)">Request failed: ' + escapeHtml(e.message) + '</span>';
    }
  };

  const emailHistorySelect = document.getElementById('emailHistorySelect');
  const emailHistoryViewer = document.getElementById('emailHistoryViewer');
  function populateEmailHistorySelect() {
    if (!emailHistorySelect) return;
    emailHistorySelect.parentElement.style.display = hotel.email_history.length ? 'flex' : 'none';
    const emailOptions = hotel.email_history
      .map((entry, i) => ({ i, label: `${entry.generated_at ? new Date(entry.generated_at).toLocaleString() : 'unknown time'}${entry.subject ? ' — ' + entry.subject : ''}` }))
      .reverse();
    emailHistorySelect.innerHTML = '<option value="">— select a past email —</option>' +
      emailOptions.map(o => `<option value="${o.i}">${escapeHtml(o.label)}</option>`).join('');
    emailHistorySelect.value = '';
  }
  if (emailHistorySelect) {
    populateEmailHistorySelect();
    emailHistorySelect.onchange = () => {
      const idx = emailHistorySelect.value;
      if (idx === '') { emailHistoryViewer.innerHTML = ''; return; }
      renderEmailResult(emailHistoryViewer, hotel.email_history[Number(idx)], 'hist' + idx);
    };
  }

  genReportBtn.onclick = async () => {
    const selectedIds = checkboxes().filter(cb => cb.checked).map(cb => Number(cb.dataset.findingId));
    const preview = document.getElementById('reportSelectionPreview');
    preview.innerHTML = 'Generating client report from ' + selectedIds.length + ' selected finding(s)...';
    try {
      const result = await fetch(`/api/hotels/${activeId}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runIndex: window.__currentVerificationRunIndex, findingIds: selectedIds })
      }).then(r => r.json());
      if (result.error) {
        preview.innerHTML = '<span style="color:var(--red)">' + escapeHtml(result.error) + '</span>';
        return;
      }
      if (result.report && result.report.parse_error) {
        preview.innerHTML = '<span style="color:var(--red)">Report generation returned unparseable output.</span><pre>' + escapeHtml(result.report.raw_text || '') + '</pre>';
        return;
      }
      hotel.report_history.push(result.report);
      populateReportHistorySelect(hotel);
      renderReportResult(preview, hotel.report_history.length - 1, hotel, 'new');
    } catch (e) {
      preview.innerHTML = '<span style="color:var(--red)">Request failed: ' + escapeHtml(e.message) + '</span>';
    }
  };

  populateReportHistorySelect(hotel);
}

function renderEmailResult(container, result, idSuffix) {
  if (!result) { container.innerHTML = ''; return; }
  if (result.error) {
    container.innerHTML = '<span style="color:var(--red)">' + escapeHtml(result.error) + '</span>';
    return;
  }
  if (result.parse_error) {
    container.innerHTML = '<span style="color:var(--red)">Email generation returned unparseable output.</span><pre>' + escapeHtml(result.raw_text || '') + '</pre>';
    return;
  }
  const subjId = 'emailSubject-' + idSuffix;
  const bodyId = 'emailBody-' + idSuffix;
  const copyId = 'copyEmailBtn-' + idSuffix;
  container.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:8px;padding:12px">
      <div style="font-size:12px;color:var(--mute);margin-bottom:8px">
        ${result.generated_at ? '<strong>Generated:</strong> ' + escapeHtml(new Date(result.generated_at).toLocaleString()) + '<br>' : ''}
        <strong>Themes chosen:</strong> ${(result.themes_chosen || []).map(t => escapeHtml(t)).join(', ')}<br>
        <strong>Why:</strong> ${escapeHtml(result.convergence_reasoning || '')}
      </div>
      <label class="field-label">Subject</label>
      <input type="text" id="${subjId}" value="${escapeAttr(result.subject || '')}" style="width:100%;margin-bottom:8px">
      <label class="field-label">Body</label>
      <textarea id="${bodyId}" style="width:100%;min-height:180px;font-size:13px">${escapeHtml(result.body || '')}</textarea>
      <div style="margin-top:8px">
        <button id="${copyId}">Copy email</button>
      </div>
    </div>`;

  document.getElementById(copyId).onclick = () => {
    const subject = document.getElementById(subjId).value;
    const body = document.getElementById(bodyId).value;
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
  };
}

function populateReportHistorySelect(hotel) {
  const reportHistorySelect = document.getElementById('reportHistorySelect');
  const reportHistoryViewer = document.getElementById('reportHistoryViewer');
  if (!reportHistorySelect) return;
  reportHistorySelect.parentElement.style.display = hotel.report_history.length ? 'flex' : 'none';
  const reportOptions = hotel.report_history
    .map((entry, i) => ({ i, label: `${entry.generated_at ? new Date(entry.generated_at).toLocaleString() : 'unknown time'} — ${(entry.status || 'draft').toUpperCase()}` }))
    .reverse();
  reportHistorySelect.innerHTML = '<option value="">— select a past report —</option>' +
    reportOptions.map(o => `<option value="${o.i}">${escapeHtml(o.label)}</option>`).join('');
  reportHistorySelect.value = '';
  reportHistorySelect.onchange = () => {
    const idx = reportHistorySelect.value;
    if (idx === '') { reportHistoryViewer.innerHTML = ''; return; }
    renderReportResult(reportHistoryViewer, Number(idx), hotel, 'hist' + idx);
  };
}

function renderReportResult(container, reportIndex, hotel, idSuffix) {
  const report = hotel.report_history[reportIndex];
  if (!report) { container.innerHTML = ''; return; }

  const statusClass = report.status === 'approved' ? 'approved' : 'draft';
  const execId = `reportExec-${idSuffix}`;
  const closingId = `reportClosing-${idSuffix}`;
  const nextStepsId = `reportNextSteps-${idSuffix}`;

  const themeCards = (report.theme_sections || []).map((s, ti) => `
    <div class="report-theme-card">
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">${escapeHtml(s.theme)}</div>
      <div style="font-size:12px;color:var(--mute);font-style:italic;margin-bottom:8px">"${escapeHtml(s.question_asked)}"</div>
      <div class="report-engine-grid">
        ${ENGINES.map(e => `
          <div>
            <label class="field-label">${e}</label>
            <textarea id="reportTheme-${idSuffix}-${ti}-engine-${e}" style="width:100%;min-height:50px;font-size:12px">${escapeHtml((s.responses_by_engine || {})[e] || '')}</textarea>
          </div>`).join('')}
      </div>
      <label class="field-label">Source context</label>
      <textarea id="reportTheme-${idSuffix}-${ti}-source" style="width:100%;min-height:40px;font-size:12px">${escapeHtml(s.source_context || '')}</textarea>
      <label class="field-label">Recommendation</label>
      <textarea id="reportTheme-${idSuffix}-${ti}-rec" style="width:100%;min-height:40px;font-size:12px">${escapeHtml(s.recommendation || '')}</textarea>
      <label class="field-label">What the owner can do</label>
      <textarea id="reportTheme-${idSuffix}-${ti}-owner" style="width:100%;min-height:40px;font-size:12px">${escapeHtml(s.owner_actions || '')}</textarea>
    </div>`).join('');

  const pricingRows = (report.pricing || []).map((t, pi) => `
    <div style="display:grid;grid-template-columns:1fr 100px 2fr;gap:8px;margin-bottom:6px">
      <input id="reportPricing-${idSuffix}-${pi}-name" value="${escapeAttr(t.name || '')}">
      <input id="reportPricing-${idSuffix}-${pi}-price" value="${escapeAttr(t.price || '')}">
      <input id="reportPricing-${idSuffix}-${pi}-desc" value="${escapeAttr(t.description || '')}">
    </div>`).join('');

  container.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="report-status ${statusClass}">${report.status || 'draft'}</span>
        <span style="font-size:11px;color:var(--mute)">
          ${report.generated_at ? 'Generated ' + new Date(report.generated_at).toLocaleString() : ''}
          ${report.approved_at ? ' · Approved ' + new Date(report.approved_at).toLocaleString() : ''}
        </span>
      </div>

      <label class="field-label">Executive summary</label>
      <textarea id="${execId}" style="width:100%;min-height:80px;font-size:13px">${escapeHtml(report.executive_summary || '')}</textarea>

      <h4 style="font-size:12px;margin:16px 0 8px">Theme sections</h4>
      ${themeCards || '<p class="hint">No theme sections.</p>'}

      <label class="field-label">Closing note</label>
      <textarea id="${closingId}" style="width:100%;min-height:50px;font-size:13px">${escapeHtml(report.closing_note || '')}</textarea>

      <label class="field-label">Next steps</label>
      <textarea id="${nextStepsId}" style="width:100%;min-height:50px;font-size:13px">${escapeHtml(report.next_steps || '')}</textarea>

      <h4 style="font-size:12px;margin:16px 0 8px">Pricing (shared template — edit centrally in lib/reportTemplate.js, or override just this report below)</h4>
      ${pricingRows}

      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="reportSaveBtn-${idSuffix}">Save draft</button>
        <button class="primary" id="reportApproveBtn-${idSuffix}">${report.status === 'approved' ? 'Re-approve after edits' : 'Approve & sign off'}</button>
        <button id="reportViewBtn-${idSuffix}">View client report</button>
        <button id="reportDownloadBtn-${idSuffix}">Download HTML</button>
      </div>
      <div id="reportSaveStatus-${idSuffix}" style="margin-top:8px;font-size:12px"></div>
    </div>`;

  function collectEdits() {
    const theme_sections = (report.theme_sections || []).map((s, ti) => {
      const responses_by_engine = {};
      ENGINES.forEach(e => {
        const val = document.getElementById(`reportTheme-${idSuffix}-${ti}-engine-${e}`).value.trim();
        if (val) responses_by_engine[e] = val;
      });
      return {
        theme: s.theme,
        question_asked: s.question_asked,
        responses_by_engine,
        source_context: document.getElementById(`reportTheme-${idSuffix}-${ti}-source`).value,
        recommendation: document.getElementById(`reportTheme-${idSuffix}-${ti}-rec`).value,
        owner_actions: document.getElementById(`reportTheme-${idSuffix}-${ti}-owner`).value
      };
    });
    const pricing = (report.pricing || []).map((t, pi) => ({
      name: document.getElementById(`reportPricing-${idSuffix}-${pi}-name`).value,
      price: document.getElementById(`reportPricing-${idSuffix}-${pi}-price`).value,
      description: document.getElementById(`reportPricing-${idSuffix}-${pi}-desc`).value
    }));
    return {
      executive_summary: document.getElementById(execId).value,
      theme_sections,
      closing_note: document.getElementById(closingId).value,
      next_steps: document.getElementById(nextStepsId).value,
      pricing
    };
  }

  const statusBox = document.getElementById(`reportSaveStatus-${idSuffix}`);

  async function saveEdits() {
    const body = collectEdits();
    const updated = await api(`/api/hotels/${activeId}/reports/${reportIndex}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    hotel.report_history[reportIndex] = updated;
    return updated;
  }

  document.getElementById(`reportSaveBtn-${idSuffix}`).onclick = async () => {
    statusBox.textContent = 'Saving...';
    try {
      await saveEdits();
      statusBox.textContent = 'Draft saved.';
      renderReportResult(container, reportIndex, hotel, idSuffix);
      populateReportHistorySelect(hotel);
    } catch (e) {
      statusBox.innerHTML = '<span style="color:var(--red)">Save failed: ' + escapeHtml(e.message) + '</span>';
    }
  };

  document.getElementById(`reportApproveBtn-${idSuffix}`).onclick = async () => {
    statusBox.textContent = 'Saving and approving...';
    try {
      await saveEdits();
      const approved = await api(`/api/hotels/${activeId}/reports/${reportIndex}/approve`, { method: 'POST' });
      hotel.report_history[reportIndex] = approved;
      statusBox.textContent = 'Approved — ready to share with the client.';
      renderReportResult(container, reportIndex, hotel, idSuffix);
      populateReportHistorySelect(hotel);
    } catch (e) {
      statusBox.innerHTML = '<span style="color:var(--red)">Approve failed: ' + escapeHtml(e.message) + '</span>';
    }
  };

  document.getElementById(`reportViewBtn-${idSuffix}`).onclick = () => {
    window.open(`/api/hotels/${activeId}/reports/${reportIndex}/export`, '_blank');
  };
  document.getElementById(`reportDownloadBtn-${idSuffix}`).onclick = () => {
    window.open(`/api/hotels/${activeId}/reports/${reportIndex}/export?download=1`, '_blank');
  };
}

function escapeAttr(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function escapeHtml(s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

loadHotels();
