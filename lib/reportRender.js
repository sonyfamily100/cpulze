// Renders an approved (or draft, for internal preview) report into a single
// self-contained HTML page — no external assets, no dependency on this
// app's server once downloaded — so it can be emailed to a client, printed
// to PDF from the browser (the print stylesheet keeps theme blocks from
// splitting across pages), or handed off as a standalone demo file.

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ENGINE_LABELS = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity' };

function renderReportHtml(report) {
  const themeBlocks = (report.theme_sections || []).map(s => `
    <section class="theme-block">
      <h2>${esc(s.theme)}</h2>
      <p class="question">"${esc(s.question_asked)}"</p>
      <div class="responses">
        ${Object.entries(s.responses_by_engine || {}).map(([engine, text]) => `
          <div class="response">
            <div class="engine-label">${esc(ENGINE_LABELS[engine] || engine)}</div>
            <div class="engine-text">${esc(text)}</div>
          </div>`).join('')}
      </div>
      <p class="source-context">${esc(s.source_context)}</p>
      <div class="rec-grid">
        <div><div class="rec-label">Recommendation</div><p>${esc(s.recommendation)}</p></div>
        <div><div class="rec-label">What you can do</div><p>${esc(s.owner_actions)}</p></div>
      </div>
    </section>`).join('');

  const pricingBlock = (report.pricing || []).map(t => `
    <div class="tier">
      <div class="tier-name">${esc(t.name)}</div>
      <div class="tier-price">${esc(t.price)}</div>
      <p>${esc(t.description)}</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(report.hotel_name)} — AI Search Findings</title>
<style>
  :root{ --bg:#F7F6F2; --panel:#fff; --border:#DEDBD1; --text:#2C2C2A; --mute:#6B6A63; --teal:#0F6E56; --teal-fill:#E1F5EE; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
  .page{max-width:760px;margin:0 auto;padding:48px 24px}
  header{margin-bottom:32px}
  header .kicker{font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--mute)}
  header h1{font-size:26px;margin:6px 0 4px}
  header .loc{color:var(--mute);font-size:14px}
  .exec-summary{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px 22px;margin-bottom:36px}
  .exec-summary h2{font-size:13px;text-transform:uppercase;color:var(--mute);margin:0 0 10px}
  .theme-block{border-top:1px solid var(--border);padding:28px 0}
  .theme-block h2{font-size:18px;margin:0 0 6px}
  .question{color:var(--mute);font-style:italic;margin:0 0 14px}
  .responses{display:grid;gap:10px;margin-bottom:14px}
  .response{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
  .engine-label{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--teal);margin-bottom:4px}
  .source-context{font-size:13px;color:var(--mute);margin:0 0 14px}
  .rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .rec-label{font-size:11px;text-transform:uppercase;color:var(--mute);font-weight:700;margin-bottom:4px}
  .rec-grid p{margin:0;font-size:14px}
  .closing{margin-top:36px;padding:20px 22px;background:var(--teal-fill);border-radius:10px}
  .closing p{margin:0 0 8px}
  .closing p:last-child{margin-bottom:0}
  .pricing{margin-top:28px}
  .pricing h2{font-size:16px}
  .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .tier{border:1px solid var(--border);border-radius:10px;padding:16px;background:var(--panel)}
  .tier-name{font-weight:700;font-size:14px;margin-bottom:4px}
  .tier-price{color:var(--teal);font-weight:700;margin-bottom:8px}
  .tier p{font-size:12px;color:var(--mute);margin:0}
  footer{margin-top:40px;font-size:12px;color:var(--mute);text-align:center}
  @media print{ body{background:#fff} .page{padding:0} .theme-block{break-inside:avoid} }
  @media (max-width:640px){ .rec-grid,.tiers{grid-template-columns:1fr} }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="kicker">AI Search Findings Report</div>
    <h1>${esc(report.hotel_name)}</h1>
    <div class="loc">${esc(report.hotel_location || '')}</div>
  </header>

  <div class="exec-summary">
    <h2>Overview</h2>
    <p>${esc(report.executive_summary)}</p>
  </div>

  ${themeBlocks}

  <div class="closing">
    <p>${esc(report.closing_note)}</p>
    <p>${esc(report.next_steps)}</p>
  </div>

  <div class="pricing">
    <h2>Ways to work together</h2>
    <div class="tiers">${pricingBlock}</div>
  </div>

  <footer>Prepared for ${esc(report.hotel_name)} &middot; cpulze.com</footer>
</div>
</body>
</html>`;
}

module.exports = { renderReportHtml };
