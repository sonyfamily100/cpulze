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

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

async function loadHotels() {
  hotels = await api('/api/hotels');
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('hotelList');
  list.innerHTML = '';
  hotels.forEach(h => {
    const div = document.createElement('div');
    div.className = 'hotel-item' + (h.id === activeId ? ' active' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'hotel-name';
    nameSpan.textContent = h.name;
    nameSpan.onclick = () => { activeId = h.id; renderSidebar(); renderMain(); };

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-hotel-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Delete ' + h.name;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteHotel(h.id, h.name);
    };

    div.appendChild(nameSpan);
    div.appendChild(delBtn);
    list.appendChild(div);
  });
}

// Deletes a hotel (and everything nested under it — corpus, api_findings,
// consumer_findings, verification_history, email_history) via the server.
// Confirms first since this is irreversible. If the active hotel is the one
// being deleted, clears activeId so renderMain() falls back to the empty state.
async function deleteHotel(id, name) {
  const confirmed = confirm(`Delete "${name}"?\n\nThis permanently removes its corpus, API findings, consumer findings, verification history, and generated emails. This cannot be undone.`);
  if (!confirmed) return;
  try {
    await api('/api/hotels/' + id, { method: 'DELETE' });
    if (activeId === id) activeId = null;
    await loadHotels();
    renderMain();
  } catch (e) {
    alert('Failed to delete hotel: ' + e.message);
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

  // Wire up drag-and-drop for both upload zones. Must be called here
  // (inside renderMain) rather than once at page load, since main.innerHTML
  // is rebuilt from scratch every render and would otherwise leave stale
  // listeners attached to detached elements.
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
    // show latest by default
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

  // Normalize older runs that only have the combined part_or_theme field,
  // then canonicalize part (A/B/C or blank) and theme (standard label) for
  // every finding regardless of source or when the run was generated.
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
        <div id="emailSelectionPreview" style="margin-top:10px"></div>
      </div>` : ''}
  `;

  const checkboxes = () => Array.from(box.querySelectorAll('.finding-checkbox'));
  const rows = () => Array.from(box.querySelectorAll('.finding-row'));
  const visibleCheckboxes = () => rows()
    .filter(tr => tr.style.display !== 'none')
    .map(tr => tr.querySelector('.finding-checkbox'));
  const genBtn = document.getElementById('generateEmailBtn');
  const countEl = document.getElementById('selectionCount');

  function updateSelectionState() {
    const selected = checkboxes().filter(cb => cb.checked);
    countEl.textContent = `${selected.length} selected`;
    genBtn.disabled = selected.length === 0;
    genBtn.textContent = selected.length === 0
      ? 'Generate Email (select findings above)'
      : `Generate Email (${selected.length} selected)`;
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
        // Server already saved this to email_history — mirror that locally
        // so the "Past emails" dropdown includes it without a full re-render
        // (which would wipe this preview and the current selection state).
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
}

// Renders a generated-email result (subject/body/themes/reasoning, or an
// error/parse-error state) into the given container. Shared by the
// "Generate Email" flow and the "Past emails" history viewer so both stay
// visually and behaviorally identical. idSuffix keeps element ids unique
// when both a fresh preview and a history entry are on screen at once.
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

function escapeAttr(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function escapeHtml(s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

loadHotels();
