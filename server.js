require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('./lib/db');
const { runEngine } = require('./lib/engineCalls');
const { runVerification, normalizeFinding } = require('./lib/verify');
const { runEmailGeneration } = require('./lib/emailGen');
const { runReportGeneration } = require('./lib/reportGen');
const { renderReportHtml } = require('./lib/reportRender');
const { THEMES: THEME_PAIRS, THEME_LABELS, matchThemeKey } = require('./lib/themes');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
const upload = multer();

const ENGINES = ['chatgpt', 'gemini', 'perplexity'];
const THEMES = THEME_PAIRS.map(([key]) => key);

// matchTheme kept as a thin alias so the rest of this file (written against
// the old name) doesn't need to change — logic now lives in lib/themes.js,
// shared with the verification-finding normalizer.
const matchTheme = matchThemeKey;

// --- Hotels ---
app.get('/api/hotels', async (req, res) => {
  try {
    const showHidden = req.query.includeHidden === 'true';
    res.json(await db.listHotels(showHidden));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Soft-deletes (hides) the hotel from the view instead of permanently deleting
app.delete('/api/hotels/:id', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    await db.hideHotel(req.params.id);
    res.json({ hidden: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Optional dedicated endpoint if you want explicit hide calls
app.post('/api/hotels/:id/hide', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    await db.hideHotel(req.params.id);
    res.json({ hidden: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restore/unhide a previously hidden hotel
app.post('/api/hotels/:id/unhide', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    await db.unhideHotel(req.params.id);
    res.json({ restored: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/hotels', async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    res.json(await db.createHotel(name, location || ''));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/hotels/:id', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    res.json(hotel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Corpus upload (CSV paste or file) ---
app.post('/api/hotels/:id/corpus', upload.single('file'), async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });

    let csvText = req.body.csvText;
    if (req.file) csvText = req.file.buffer.toString('utf8');
    if (!csvText) return res.status(400).json({ error: 'no CSV data provided' });

    const rows = parse(csvText, { columns: true, skip_empty_lines: true });
    hotel.corpus = rows.map((r, i) => ({ id: i + 1, ...r }));
    await db.saveHotel(hotel);
    res.json({ rows_loaded: rows.length });
  } catch (e) {
    res.status(400).json({ error: 'CSV parse failed: ' + e.message });
  }
});

// --- Consumer app paste-in (single cell) ---
// body: { text: "..." }
app.post('/api/hotels/:id/consumer/:engine/:theme', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    const { engine, theme } = req.params;
    if (!ENGINES.includes(engine)) return res.status(400).json({ error: 'unknown engine' });
    if (!THEMES.includes(theme)) return res.status(400).json({ error: 'unknown theme' });

    if (!hotel.consumer_findings[engine]) hotel.consumer_findings[engine] = {};
    hotel.consumer_findings[engine][theme] = req.body.text || '';
    await db.saveHotel(hotel);
    res.json({ saved: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Consumer app bulk CSV upload ---
// Expected columns: theme,chatgpt,gemini,perplexity
app.post('/api/hotels/:id/consumer-csv', upload.single('file'), async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });

    let csvText = req.body.csvText;
    if (req.file) csvText = req.file.buffer.toString('utf8');
    if (!csvText) return res.status(400).json({ error: 'no CSV data provided' });

    let rows;
    try {
      rows = parse(csvText, { columns: true, skip_empty_lines: true });
    } catch (e) {
      return res.status(400).json({ error: 'CSV parse failed: ' + e.message });
    }

    if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

    const themeCol = Object.keys(rows[0]).find(h => h.trim().toLowerCase() === 'theme');
    if (!themeCol) return res.status(400).json({ error: 'no "theme" column found in the CSV header' });

    const engineCols = {};
    ENGINES.forEach(e => {
      const found = Object.keys(rows[0]).find(h => h.trim().toLowerCase() === e);
      if (found) engineCols[e] = found;
    });
    if (!Object.keys(engineCols).length) {
      return res.status(400).json({ error: 'no engine columns found — expected one or more of: chatgpt, gemini, perplexity' });
    }

    const matched = [];
    const unmatched = [];
    let cellsFilled = 0;

    rows.forEach(row => {
      const rawTheme = row[themeCol];
      const themeKey = matchTheme(rawTheme);
      if (!themeKey) {
        unmatched.push(rawTheme);
        return;
      }
      matched.push({ rawTheme, themeKey });
      Object.entries(engineCols).forEach(([engine, col]) => {
        const value = (row[col] || '').trim();
        if (!value) return;
        if (!hotel.consumer_findings[engine]) hotel.consumer_findings[engine] = {};
        hotel.consumer_findings[engine][themeKey] = value;
        cellsFilled++;
      });
    });

    await db.saveHotel(hotel);
    res.json({
      rows_matched: matched.length,
      rows_unmatched: unmatched,
      cells_filled: cellsFilled,
      engine_columns_found: Object.keys(engineCols)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Blank CSV template download ---
app.get('/api/consumer-csv-template', (req, res) => {
  const lines = ['theme,chatgpt,gemini,perplexity'];
  THEMES.forEach(t => lines.push(`${THEME_LABELS[t]},,,`));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="consumer_app_template.csv"');
  res.send(lines.join('\n'));
});

// --- API pipeline trigger (per engine, runs Part A+B+C) ---
app.post('/api/hotels/:id/run-api/:engine', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    const { engine } = req.params;
    if (!ENGINES.includes(engine)) return res.status(400).json({ error: 'unknown engine' });

    const results = await runEngine(engine, hotel.name, hotel.location);
    hotel.api_findings[engine] = results;
    await db.saveHotel(hotel);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Verification engine ---
app.post('/api/hotels/:id/verify', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    if (!hotel.corpus.length) return res.status(400).json({ error: 'no corpus loaded — upload one first' });

    const verdict = await runVerification(hotel);
    const entry = { ...verdict, run_at: new Date().toISOString() };
    hotel.verification_history.push(entry);
    hotel.verification = entry; // "latest" pointer, kept for convenience
    await db.saveHotel(hotel);
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Verification CSV export ---
// ?run=<index into verification_history>, defaults to the latest run
function csvEscape(v) {
  const s = (v === undefined || v === null) ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
app.get('/api/hotels/:id/verification-csv', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    if (!hotel.verification_history.length) return res.status(400).json({ error: 'no verification runs yet' });

    const runIdx = req.query.run !== undefined ? Number(req.query.run) : hotel.verification_history.length - 1;
    const run = hotel.verification_history[runIdx];
    if (!run) return res.status(400).json({ error: 'invalid run index' });

    const fields = ['id', 'source', 'engine', 'part', 'theme', 'claim_summary', 'verdict', 'confidence', 'corpus_refs', 'evidence'];
    const lines = [fields.join(',')];
    (run.findings || []).forEach(f => {
      const normalized = normalizeFinding(f);
      lines.push(fields.map(k => csvEscape(k === 'id' ? f.id : normalized[k])).join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="verification_${hotel.name.replace(/[^a-z0-9]/gi, '_')}_run${runIdx}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Email generation ---
// body: { runIndex, findingIds }
app.post('/api/hotels/:id/generate-email', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });

    const { runIndex, findingIds } = req.body;
    const run = hotel.verification_history[runIndex];
    if (!run) return res.status(400).json({ error: 'invalid verification run index' });

    const selectedFindings = (run.findings || []).filter(f => (findingIds || []).includes(f.id));
    if (!selectedFindings.length) return res.status(400).json({ error: 'no matching findings for the given IDs' });

    const result = await runEmailGeneration(hotel, selectedFindings);
    const entry = { ...result, run_index: runIndex, finding_ids: findingIds, generated_at: new Date().toISOString() };
    hotel.email_history.push(entry);
    await db.saveHotel(hotel);
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Client report generation (draft) ---
// body: { runIndex, findingIds }
app.post('/api/hotels/:id/generate-report', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });

    const { runIndex, findingIds } = req.body;
    const run = hotel.verification_history[runIndex];
    if (!run) return res.status(400).json({ error: 'invalid verification run index' });

    const selectedFindings = (run.findings || []).filter(f => (findingIds || []).includes(f.id));
    if (!selectedFindings.length) return res.status(400).json({ error: 'no matching findings for the given IDs' });

    const report = await runReportGeneration(hotel, selectedFindings, run.findings);
    const now = new Date().toISOString();
    const entry = { ...report, run_index: runIndex, finding_ids: findingIds, generated_at: now, updated_at: now };
    hotel.report_history.push(entry);
    await db.saveHotel(hotel);
    res.json({ report: entry, index: hotel.report_history.length - 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Edit a report before sign-off ---
// body: any of { executive_summary, theme_sections, closing_note, next_steps, pricing }
app.put('/api/hotels/:id/reports/:reportIndex', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    const report = hotel.report_history[Number(req.params.reportIndex)];
    if (!report) return res.status(404).json({ error: 'report not found' });

    // pricing/services/perception_map/calendly_url are not editable per-report
    // by design — they're cpulze's real, centrally-defined offer (lib/reportTemplate.js)
    // and the report's actual computed data, not draft content awaiting review.
    const editable = ['executive_summary', 'theme_sections', 'closing_note', 'next_steps'];
    editable.forEach(key => {
      if (req.body[key] !== undefined) report[key] = req.body[key];
    });
    // Editing an already-approved report reopens it for sign-off — an
    // approval should only ever certify the content as it stood at the
    // moment of approval, never content edited afterward.
    if (report.status === 'approved') {
      report.status = 'draft';
      report.approved_at = null;
    }
    report.updated_at = new Date().toISOString();
    await db.saveHotel(hotel);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Approve / sign off a report for client sharing ---
app.post('/api/hotels/:id/reports/:reportIndex/approve', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    const report = hotel.report_history[Number(req.params.reportIndex)];
    if (!report) return res.status(404).json({ error: 'report not found' });

    report.status = 'approved';
    report.approved_at = new Date().toISOString();
    await db.saveHotel(hotel);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Client-safe standalone HTML export (view inline, or ?download=1) ---
app.get('/api/hotels/:id/reports/:reportIndex/export', async (req, res) => {
  try {
    const hotel = await db.getHotel(req.params.id);
    if (!hotel) return res.status(404).json({ error: 'not found' });
    const report = hotel.report_history[Number(req.params.reportIndex)];
    if (!report) return res.status(404).json({ error: 'report not found' });

    const html = renderReportHtml(report);
    res.setHeader('Content-Type', 'text/html');
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename="report_${hotel.name.replace(/[^a-z0-9]/gi, '_')}.html"`);
    }
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`cpulze-verify running at http://localhost:${PORT}`));
