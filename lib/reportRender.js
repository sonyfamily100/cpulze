// Renders an approved (or draft, for internal preview) report into a single
// self-contained, interactive HTML page — no external assets but the Google
// Fonts cpulze.com itself uses, no dependency on this app's server once
// downloaded. Design system (fonts, colors, component patterns) is pulled
// from cpulze.com directly, not invented — see the "brand assets" thread
// that produced this file for where each token came from.

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slug(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ENGINE_LABELS = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity' };
const ENGINE_COLOR_VAR = { chatgpt: '--eng-chatgpt', gemini: '--eng-gemini', perplexity: '--eng-perplexity' };

const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.6"/></svg>';
const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 6.6L21 10l-5 4.6L17.4 21 12 17.6 6.6 21 8 14.6 3 10l6.4-1.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ACTION_ICONS = {
  website: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" stroke="currentColor" stroke-width="1.4"/></svg>',
  ota_listing: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.6"/></svg>',
  article_correction: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5V6a2 2 0 012-2h11a2 2 0 012 2v13.5" stroke="currentColor" stroke-width="1.6"/><path d="M4 19.5A1.5 1.5 0 015.5 18H19M8 8h7M8 11.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  review_reply: '<svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.6"/></svg>',
  owner_voice: STAR_ICON
};

let quoteToggleCounter = 0;

// Verbatim quotes can be an entire raw pasted response (long, sometimes with
// citation clutter) — shown by default as a short Claude-written preview
// with a "Show full response" toggle, never the substance itself rewritten.
// A summarized (API-sourced) quote is already one short sentence, so it
// renders in full with no toggle.
function renderQuote(q) {
  const colorVar = ENGINE_COLOR_VAR[q.engine] || '--text-muted';
  const engineHead = `
            <div class="eng-name"><span class="eng-dot" style="background:var(${colorVar})"></span><span style="color:var(${colorVar})">${esc(ENGINE_LABELS[q.engine] || q.engine)}</span></div>`;

  if (q.mode === 'verbatim' && q.summary) {
    const toggleId = 'qfull-' + (quoteToggleCounter++);
    return `
        <div class="quote verbatim">
          <div class="quote-engine">${engineHead}<span class="quote-src-tag">As collected</span></div>
          <p class="quote-summary-label">Summary of response</p>
          <p>${esc(q.summary)}</p>
          <button class="quote-toggle" data-toggle="${toggleId}">Show full response ↓</button>
          <div class="quote-full" id="${toggleId}" hidden><p>&ldquo;${esc(q.text)}&rdquo;</p></div>
        </div>`;
  }
  const cls = q.mode === 'verbatim' ? 'quote verbatim' : 'quote';
  const tag = q.mode === 'verbatim' ? 'As collected' : 'Summarized from API response';
  const text = q.mode === 'verbatim' ? `&ldquo;${esc(q.text)}&rdquo;` : esc(q.text);
  return `
        <div class="${cls}">
          <div class="quote-engine">${engineHead}<span class="quote-src-tag">${tag}</span></div>
          <p>${text}</p>
        </div>`;
}

function renderSourceLine(source) {
  if (source && source.type === 'corpus' && source.url) {
    return `
      <div class="source-line">
        ${STAR_ICON}
        <div class="source-line-body">
          <p>Traced to a specific guest review.</p>
          <a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label || source.url)} ↗</a>
        </div>
      </div>`;
  }
  return `
      <div class="source-line">
        ${STAR_ICON}
        <div class="source-line-body">
          <p>No matching guest-review citation found automatically.</p>
          <span class="source-placeholder">${source && source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label || source.url)} ↗</a>` : '+ add a source link manually'}</span>
        </div>
      </div>`;
}

function renderAction(a, hotelName, themeLabel) {
  const icon = ACTION_ICONS[a.type] || ACTION_ICONS.website;
  if (a.type === 'review_reply') {
    return `
        <div class="action-row">
          <div class="a-label">${icon}${esc(a.label)}</div>
          <div class="a-value reply"><span class="copy-tag" data-copy>Copy</span>${esc(a.content)}${a.keywords.length ? `<div class="kw-row">${a.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div>` : ''}</div>
        </div>`;
  }
  if (a.type === 'owner_voice') {
    const feedSlug = slug(hotelName);
    return `
        <div class="action-row">
          <div class="a-label">${icon}${esc(a.label)}</div>
          <div class="a-value">
            ${esc(a.content)}
            <div class="ov-preview">
              <div class="ov-preview-bar"><span>Preview — hotel's Owner Voice feed</span><span class="ov-url">${esc(feedSlug)}.cpulze.com/owner-voice</span></div>
              <div class="ov-entry">
                <div class="ov-entry-top"><span class="ov-theme-tag">${esc(themeLabel)}</span><span class="ov-badge">Ownership update</span><span class="ov-date">[Month Year]</span></div>
                <p>${esc(a.content)}</p>
              </div>
            </div>
          </div>
        </div>`;
  }
  return `
        <div class="action-row">
          <div class="a-label">${icon}${esc(a.label)}</div>
          <div class="a-value">${esc(a.content)}${a.keywords.length ? `<div class="kw-row">${a.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div>` : ''}</div>
        </div>`;
}

// The "query -> response -> source" journey lives HERE, per finding, using
// real content — not as a disconnected static explainer at the top of the
// report that never varies. Trust badges move to where the citation
// actually is (step 03), since that's the one place they mean something
// concrete rather than a generic claim.
function renderThemePanel(s, hotelName) {
  const quotesHtml = (s.quotes || []).map(renderQuote).join('');
  const actionsHtml = (s.actions || []).map(a => renderAction(a, hotelName, s.theme)).join('');
  return `
  <div class="panel">
    <div class="panel-head">
      <span class="sev-chip ${s.severity === 'critical' ? 'crit' : s.severity}">${s.severity === 'critical' ? 'Critical' : s.severity === 'high' ? 'High' : 'Watch'}</span>
      <h3>${esc(s.theme)}</h3>
    </div>
    <div class="panel-body">
      <div class="step-label"><span class="step-num">01</span>Query searched</div>
      <div class="theme-q">"${esc(s.question_asked)}"</div>

      ${s.root_cause ? `<div class="root-cause"><div class="rc-label">Why this is likely happening</div><p>${esc(s.root_cause)}</p></div>` : ''}

      <div class="step-label"><span class="step-num">02</span>AI response</div>
      <div class="quotes">${quotesHtml}</div>

      <div class="step-label"><span class="step-num">03</span>Source &amp; attribution
        <span class="trust-badges inline">
          <span class="trust-badge"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>Verified</span>
        </span>
      </div>
      ${renderSourceLine(s.source)}
      ${s.attribution ? `<p class="attribution">${esc(s.attribution)}</p>` : ''}

      ${actionsHtml ? `<div class="actions-label">Recommended next steps</div><div class="actions">${actionsHtml}</div>` : ''}
    </div>
  </div>`;
}

function renderPerceptionMap(pm) {
  if (!pm || !pm.rows || !pm.rows.length) return '';
  const rowsHtml = pm.rows.map((row, i) => {
    const lastRow = i === pm.rows.length - 1;
    const borderStyle = lastRow ? ' style="border-bottom:none"' : '';
    const rowLabel = `<div class="cov-row-label"${borderStyle}>${esc(row.theme)}</div>`;
    const cells = row.cells.map(c => {
      if (c.status === 'open') {
        return `<div class="cov-cell open ${c.severity === 'critical' ? 'crit' : c.severity}"${borderStyle}><span class="cov-dot"></span></div>`;
      }
      if (c.status === 'locked') {
        return `<div class="cov-cell locked"${borderStyle}>${LOCK_ICON}</div>`;
      }
      return `<div class="cov-cell empty"${borderStyle}>–</div>`;
    }).join('');
    return rowLabel + cells;
  }).join('');

  return `
  <div class="grid-shell">
    <div class="grid-legend">
      <div class="legend-item"><span class="legend-swatch" style="background:var(--critical)"></span>Critical</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--high)"></span>High</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--watch)"></span>Watch</div>
      <div class="legend-item" style="margin-left:auto"><span style="display:inline-flex;width:11px;height:11px">${LOCK_ICON}</span> Not shown in this report</div>
    </div>
    <div class="cov-grid">
      <div class="cov-head-cell corner">Theme</div>
      ${(pm.engines || []).map(e => `<div class="cov-head-cell">${esc(e)}</div>`).join('')}
      ${rowsHtml}
    </div>
  </div>`;
}

// Who's Winning is deliberately excluded here — it's not part of the
// bundle-eligible trio (AI Mirror / Owner Voice / Keep Vigil), so it gets
// its own distinct card after the bundle box instead of sitting in this
// numbered list, per the "specialist service" framing.
function renderServices(services, hotelSlug) {
  return (services || []).filter(svc => svc.key !== 'winning').map(svc => {
    const isCurrent = svc.key === 'mirror';
    const gateNote = svc.requiresMirror ? '<span class="service-gate">Requires AI Mirror</span>' : '';
    return `
    <div class="service-row${isCurrent ? ' current' : ''}">
      <div class="service-num">${esc(svc.num)}</div>
      <div><div class="service-name">${esc(svc.name)}</div><div class="service-tagline">${esc(svc.tagline)} — ${esc(svc.priceLabel)}, ${esc(svc.priceNote)}</div></div>
      <div class="service-status-col">
        <span class="service-status ${isCurrent ? 'viewing' : 'available'}">${isCurrent ? 'Viewing' : 'Ask us'}</span>
        ${gateNote}
      </div>
    </div>`;
  }).join('');
}

function renderSpecialist(services) {
  const svc = (services || []).find(s => s.key === 'winning');
  if (!svc) return '';
  return `
  <div class="specialist-card">
    <div class="specialist-num">${esc(svc.num)}</div>
    <div class="specialist-body">
      <div class="specialist-label">Specialist service</div>
      <div class="specialist-name">${esc(svc.name)}</div>
      <div class="specialist-tagline">${esc(svc.tagline)} — ${esc(svc.priceLabel)}, ${esc(svc.priceNote)}</div>
    </div>
    <div class="service-status-col">
      <span class="service-status specialist-status">Ask us</span>
      <span class="service-gate">Requires AI Mirror</span>
    </div>
  </div>`;
}

function renderBundle(bundle) {
  if (!bundle) return '';
  return `
  <div class="bundle-box">
    <div class="bundle-left">
      <div class="bundle-label">The master bundle</div>
      <div class="bundle-includes">${esc(bundle.includesLabel)}</div>
    </div>
    <div class="bundle-right">
      <div class="bundle-price">${esc(bundle.priceLabel)}</div>
      <div class="bundle-savings">saves ${esc(bundle.savingsLabel)} vs buying separately</div>
    </div>
  </div>`;
}

function renderReportHtml(report) {
  const hotelSlug = slug(report.hotel_name);
  const storageKey = 'cpulze_progress_' + (report.share_token || (hotelSlug + '_' + slug(report.generated_at || ''))) + '_v1';
  const pm = report.perception_map || { rows: [], engines: [], totalChecked: 0, unlockedCount: 0 };
  const themeBlocks = (report.theme_sections || []).map(s => renderThemePanel(s, report.hotel_name)).join('');
  const generatedDate = report.generated_at ? new Date(report.generated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const hasLocked = pm.totalChecked > pm.unlockedCount;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(report.hotel_name)} — AI Mirror</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    color-scheme: light;
    --cream-50: #faf7f3; --cream-100: #f3ede3; --cream-200: #e8ddd0;
    --paper-raised: #ffffff;
    --text: #15100b; --text-mid: #3a2e22; --text-muted: #7a6e60;
    --border: #e0d8cc;
    --navy-950: #07111f; --navy-900: #0c1c30; --navy-800: #122640;
    --on-navy: #f3efe7; --on-navy-mid: rgba(243,239,231,0.72); --on-navy-muted: rgba(243,239,231,0.45); --on-navy-border: rgba(255,255,255,0.1);
    --gold-300: #e8c97a; --gold-400: #d4a84a; --gold-500: #c4903a; --gold-600: #a67530;
    --gold-bg: #fdf5e6; --gold-bg-border: rgba(196,144,58,0.35);
    --critical: #a8382c; --critical-fill: #f7e6e2;
    --high: #a15a1e; --high-fill: #f6e9d8;
    --watch: #556b58; --watch-fill: #e6ebe4;
    --eng-chatgpt: #2f5fa8; --eng-gemini: #a1531f; --eng-perplexity: #147a63;
    --specialist: #5856d6; --specialist-fill: rgba(88,86,214,0.08); --specialist-border: rgba(88,86,214,0.3);
    --shadow: 0 1px 2px rgba(21,16,11,0.04), 0 10px 28px rgba(21,16,11,0.07);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      color-scheme: dark;
      --cream-50: var(--navy-950); --cream-100: var(--navy-900); --cream-200: var(--navy-800);
      --paper-raised: #102035;
      --text: var(--on-navy); --text-mid: var(--on-navy-mid); --text-muted: var(--on-navy-muted);
      --border: var(--on-navy-border);
      --gold-bg: rgba(196,144,58,0.12); --gold-bg-border: rgba(212,168,74,0.4);
      --critical: #e08d7e; --critical-fill: #35201c;
      --high: #dba15c; --high-fill: #332614;
      --watch: #a8bcaa; --watch-fill: #202a21;
      --eng-chatgpt: #8db0e8; --eng-gemini: #e0966a; --eng-perplexity: #5fc7ab;
      --specialist: #9694ea; --specialist-fill: rgba(150,148,234,0.14); --specialist-border: rgba(150,148,234,0.35);
      --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 10px 28px rgba(0,0,0,0.4);
    }
  }
  :root[data-theme="dark"]{
    color-scheme: dark;
    --cream-50: var(--navy-950); --cream-100: var(--navy-900); --cream-200: var(--navy-800);
    --paper-raised: #102035;
    --text: var(--on-navy); --text-mid: var(--on-navy-mid); --text-muted: var(--on-navy-muted);
    --border: var(--on-navy-border);
    --gold-bg: rgba(196,144,58,0.12); --gold-bg-border: rgba(212,168,74,0.4);
    --critical: #e08d7e; --critical-fill: #35201c;
    --high: #dba15c; --high-fill: #332614;
    --watch: #a8bcaa; --watch-fill: #202a21;
    --eng-chatgpt: #8db0e8; --eng-gemini: #e0966a; --eng-perplexity: #5fc7ab;
    --specialist: #9694ea; --specialist-fill: rgba(150,148,234,0.14); --specialist-border: rgba(150,148,234,0.35);
    --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 10px 28px rgba(0,0,0,0.4);
  }

  *{box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact}
  body{margin:0; background:var(--cream-50); color:var(--text); font-family:"DM Sans",system-ui,-apple-system,sans-serif; font-size:16px; line-height:1.65; -webkit-font-smoothing:antialiased}
  .mono{font-family:"DM Mono",ui-monospace,monospace; font-variant-numeric:tabular-nums}
  h1,h2,h3{text-wrap:balance; margin:0; font-family:"Cormorant Garamond",Georgia,serif; font-weight:500}
  a{color:inherit}
  ::selection{background:var(--gold-400); color:var(--navy-950)}
  .wrap{max-width:920px; margin:0 auto; padding:0 28px}
  .kicker{font-family:"DM Mono",monospace; font-size:11px; font-weight:600; color:var(--gold-500); letter-spacing:1.4px; text-transform:uppercase; display:inline-flex; align-items:center; gap:8px; margin-bottom:16px}
  .kicker::before{content:""; width:18px; height:1px; background:var(--gold-400)}

  .masthead{padding:44px 0 40px; border-bottom:1px solid var(--border)}
  .masthead-top{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:36px}
  .brand{display:flex; align-items:center; gap:8px}
  .brand-dot{width:6px; height:6px; border-radius:50%; background:var(--gold-500); animation:pulse 2.5s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1} 50%{opacity:.45}}
  .brand-name{font-family:"Cormorant Garamond",serif; font-size:19px; font-weight:600}
  .masthead-right{display:flex; align-items:center; gap:14px}
  .masthead-date{font-size:12px; color:var(--text-muted)}
  .theme-toggle{width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--paper-raised); display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-muted)}
  .theme-toggle:hover{border-color:var(--gold-500); color:var(--gold-500)}
  .theme-toggle svg{width:15px; height:15px}
  .theme-toggle .moon{display:none}
  :root[data-theme="dark"] .theme-toggle .sun{display:none}
  :root[data-theme="dark"] .theme-toggle .moon{display:block}
  .masthead h1{font-size:42px; line-height:1.1; letter-spacing:-0.01em; max-width:17ch}
  .masthead .loc{font-size:14.5px; color:var(--text-muted); margin-top:12px}
  .masthead .loc strong{color:var(--text-mid); font-weight:600}
  .masthead-note{font-size:13.5px; color:var(--text-muted); margin:16px 0 0; max-width:56ch; line-height:1.55}

  .step-label{display:flex; align-items:center; gap:9px; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:600; margin:0 0 9px}
  .step-label:not(:first-child){margin-top:20px}
  .step-num{font-family:"DM Mono",monospace; font-size:11px; color:var(--gold-500); font-weight:600}
  .trust-badges{display:flex; gap:6px}
  .trust-badges.inline{margin-left:auto}
  .trust-badge{display:inline-flex; align-items:center; gap:5px; font-family:"DM Mono",monospace; font-size:10px; font-weight:600; padding:3px 8px 3px 6px; border-radius:20px; background:var(--gold-bg); border:0.5px solid var(--gold-bg-border); color:var(--gold-600); text-transform:uppercase; letter-spacing:0.3px}
  .trust-badge svg{width:9px; height:9px}

  .perception{padding:52px 0 46px; border-bottom:1px solid var(--border)}
  .perception-head{display:flex; justify-content:space-between; align-items:flex-end; gap:24px; margin-bottom:26px; flex-wrap:wrap}
  .perception-head h2{font-size:28px; max-width:24ch}
  .perception-stat{text-align:right; flex:0 0 auto}
  .perception-stat .num{font-family:"Cormorant Garamond",serif; font-size:38px; font-weight:600; line-height:1; color:var(--gold-600)}
  .perception-stat .num span{color:var(--text-muted); font-size:20px; font-weight:400; font-family:"DM Mono",monospace}
  .perception-stat .cap{font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin-top:5px; font-family:"DM Mono",monospace}
  .grid-shell{border:1px solid var(--border); border-radius:14px; overflow:hidden; background:var(--paper-raised); box-shadow:var(--shadow)}
  .grid-legend{display:flex; align-items:center; gap:18px; padding:13px 18px; border-bottom:1px solid var(--border); font-size:11px; color:var(--text-muted)}
  .legend-item{display:flex; align-items:center; gap:6px}
  .legend-item svg{width:100%; height:100%; display:block; color:var(--text-muted)}
  .legend-swatch{width:8px; height:8px; border-radius:2.5px}
  .cov-grid{display:grid; grid-template-columns:138px repeat(3,1fr)}
  .cov-head-cell{padding:9px 10px; font-family:"DM Mono",monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:500; border-bottom:1px solid var(--border); text-align:center}
  .cov-head-cell.corner{text-align:left}
  .cov-row-label{padding:9px 12px; font-size:12.5px; font-weight:600; color:var(--text-mid); border-bottom:1px solid var(--border); border-right:1px solid var(--border); display:flex; align-items:center}
  .cov-cell{border-bottom:1px solid var(--border); border-right:1px solid var(--border); min-height:36px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:12px}
  .cov-grid > *:nth-child(4n){border-right:none}
  .cov-cell.locked{background:repeating-linear-gradient(135deg, var(--cream-200) 0 1px, transparent 1px 7px)}
  .cov-cell.locked svg{width:11px; height:11px; opacity:0.6}
  .cov-cell.empty{opacity:0.35}
  .cov-dot{width:8px; height:8px; border-radius:50%}
  .cov-cell.open.crit .cov-dot{background:var(--critical)}
  .cov-cell.open.high .cov-dot{background:var(--high)}
  .cov-cell.open.watch .cov-dot{background:var(--watch)}
  .perception-cta{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:20px; padding:17px 22px; border-radius:12px; background:var(--gold-bg); border:0.5px solid var(--gold-bg-border); flex-wrap:wrap}
  .perception-cta p{margin:0; font-size:13.5px; color:var(--text-mid); max-width:52ch}
  .perception-cta strong{color:var(--gold-600)}
  .btn-ghost{flex:0 0 auto; font-family:"DM Sans",sans-serif; font-size:12.5px; font-weight:600; padding:9px 16px; border-radius:8px; border:1px solid var(--gold-500); color:var(--gold-600); background:transparent; cursor:pointer; white-space:nowrap; text-decoration:none}

  .findings{padding:52px 0 20px}
  .findings > .section-label{font-family:"DM Mono",monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); font-weight:500; margin-bottom:22px}
  .panel{border:1px solid var(--border); border-radius:16px; background:var(--paper-raised); box-shadow:var(--shadow); margin-bottom:26px; overflow:hidden}
  .panel-head{display:flex; align-items:flex-start; gap:12px; padding:22px 26px 18px; border-bottom:1px solid var(--border); flex-wrap:wrap}
  .sev-chip{display:inline-flex; align-items:center; gap:5px; font-family:"DM Mono",monospace; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; padding:4px 9px; border-radius:6px; flex:0 0 auto; margin-top:3px}
  .sev-chip.crit{background:var(--critical-fill); color:var(--critical)}
  .sev-chip.high{background:var(--high-fill); color:var(--high)}
  .sev-chip.watch{background:var(--watch-fill); color:var(--watch)}
  .panel-head h3{font-size:23px}
  .theme-q{font-size:15px; color:var(--text-mid); font-style:italic; font-family:"Cormorant Garamond",serif}
  .panel-body{padding:22px 26px 28px}
  .root-cause{border-left:2px solid var(--gold-400); padding-left:16px; margin-bottom:22px}
  .root-cause .rc-label{font-family:"DM Mono",monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--gold-600); font-weight:600; margin-bottom:5px}
  .root-cause p{margin:0; font-size:14.5px; font-family:"Cormorant Garamond",serif; font-style:italic; color:var(--text-mid); line-height:1.55}
  .quotes{display:flex; flex-direction:column; gap:9px; margin-bottom:16px}
  .quote{display:flex; gap:12px; padding:13px 15px; border-radius:10px; background:var(--cream-100); border:1px solid var(--border)}
  .quote-engine{flex:0 0 auto; display:flex; flex-direction:column; gap:3px; width:100px}
  .quote-engine .eng-name{display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em}
  .eng-dot{width:7px; height:7px; border-radius:50%}
  .quote-src-tag{font-family:"DM Mono",monospace; font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.3px}
  .quote p{margin:0; font-size:13.5px; line-height:1.55; color:var(--text-mid)}
  .quote-summary-label{font-family:"DM Mono",monospace; font-size:9.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin:0 0 3px !important}
  .quote-toggle{margin-top:8px; font-family:"DM Sans",sans-serif; font-size:11.5px; font-weight:600; color:var(--gold-600); background:none; border:none; padding:0; cursor:pointer}
  .quote-toggle:hover{color:var(--gold-500)}
  .quote-full{margin-top:10px; padding-top:10px; border-top:1px dashed var(--border)}
  .quote-full p{font-family:"DM Mono",monospace; font-size:12px; line-height:1.6}
  .quote.verbatim p{font-family:"DM Mono",monospace; font-size:12px; line-height:1.65}
  .source-line{display:flex; align-items:flex-start; gap:9px; padding:13px 16px; border-radius:9px; background:var(--cream-100); border-left:2px solid var(--gold-400); margin-bottom:14px}
  .source-line svg{width:13px; height:13px; color:var(--gold-500); flex:0 0 auto; margin-top:3px}
  .source-line-body{flex:1; min-width:0}
  .source-line-body p{margin:0 0 5px; font-size:13px; color:var(--text-mid); line-height:1.5}
  .source-line-body a{font-family:"DM Mono",monospace; font-size:11.5px; color:var(--gold-600); text-decoration:none; border-bottom:1px dotted var(--gold-500)}
  .source-placeholder{font-family:"DM Mono",monospace; font-size:11.5px; color:var(--text-muted); font-style:italic}
  .attribution{font-size:13px; color:var(--text-mid); line-height:1.6; margin:0 0 24px}
  .actions-label{font-family:"DM Mono",monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted); font-weight:600; margin-bottom:12px}
  .actions{display:flex; flex-direction:column; gap:1px; background:var(--border); border:1px solid var(--border); border-radius:11px; overflow:hidden}
  .action-row{display:grid; grid-template-columns:150px 1fr; gap:16px; padding:14px 16px; background:var(--paper-raised)}
  .action-row .a-label{display:flex; align-items:flex-start; gap:8px; font-size:11.5px; font-weight:600; color:var(--text)}
  .action-row .a-label svg{width:14px; height:14px; margin-top:1px; flex:0 0 auto; color:var(--gold-500)}
  .action-row .a-value{font-size:13px; color:var(--text-mid); line-height:1.55}
  .action-row .a-value.reply{background:var(--cream-100); border:1px dashed var(--border); border-radius:8px; padding:11px 13px; font-family:"DM Mono",monospace; font-size:11.5px; line-height:1.65; position:relative}
  .copy-tag{position:absolute; top:8px; right:10px; font-size:9.5px; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.04em; cursor:pointer}
  .copy-tag:hover{color:var(--gold-500)}
  .kw-row{display:flex; flex-wrap:wrap; gap:6px; margin-top:9px}
  .kw{font-family:"DM Mono",monospace; font-size:10px; padding:3px 8px; border-radius:20px; background:var(--gold-bg); border:0.5px solid var(--gold-bg-border); color:var(--gold-600)}
  .ov-preview{margin-top:6px; border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--cream-100)}
  .ov-preview-bar{display:flex; align-items:center; justify-content:space-between; padding:8px 13px; background:var(--navy-900); font-family:"DM Mono",monospace; font-size:10px; color:var(--on-navy-muted)}
  .ov-preview-bar .ov-url{color:var(--gold-300)}
  .ov-entry{padding:14px 15px; display:flex; flex-direction:column; gap:7px}
  .ov-entry-top{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .ov-theme-tag{font-family:"DM Mono",monospace; font-size:10px; font-weight:600; padding:3px 8px; border-radius:4px; background:var(--gold-bg); color:var(--gold-600); text-transform:uppercase; letter-spacing:0.3px}
  .ov-badge{font-family:"DM Mono",monospace; font-size:9.5px; font-weight:600; padding:3px 8px; border-radius:20px; background:var(--watch-fill); color:var(--watch); text-transform:uppercase; letter-spacing:0.3px}
  .ov-date{margin-left:auto; font-family:"DM Mono",monospace; font-size:10.5px; color:var(--text-muted)}
  .ov-entry p{margin:0; font-size:12.5px; color:var(--text-mid); line-height:1.5}

  .services{padding:54px 0; border-top:1px solid var(--border)}
  .services-intro{max-width:56ch; margin-bottom:32px}
  .services-intro h2{font-size:26px; margin-bottom:12px}
  .services-intro p{font-size:14.5px; color:var(--text-mid); line-height:1.65; margin:0}
  .services-list{display:flex; flex-direction:column; gap:1px; background:var(--border); border:1px solid var(--border); border-radius:14px; overflow:hidden}
  .service-row{display:grid; grid-template-columns:44px 1fr auto; align-items:center; gap:18px; padding:20px 22px; background:var(--paper-raised)}
  .service-row.current{background:var(--gold-bg)}
  .service-num{font-family:"Cormorant Garamond",serif; font-size:22px; font-weight:600; color:var(--text-muted)}
  .service-row.current .service-num{color:var(--gold-600)}
  .service-name{font-size:18px; margin-bottom:3px}
  .service-tagline{font-size:12.5px; color:var(--text-muted)}
  .service-status-col{display:flex; flex-direction:column; align-items:flex-end; gap:5px}
  .service-status{font-family:"DM Mono",monospace; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; padding:5px 11px; border-radius:20px; white-space:nowrap}
  .service-status.viewing{background:var(--gold-500); color:#fff}
  .service-status.available{background:var(--cream-100); color:var(--text-muted); border:1px solid var(--border)}
  .service-gate{font-family:"DM Mono",monospace; font-size:9.5px; color:var(--text-muted); white-space:nowrap}

  .bundle-box{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:16px; padding:20px 24px; border-radius:14px; background:var(--navy-950); color:var(--on-navy); flex-wrap:wrap}
  .bundle-label{font-family:"DM Mono",monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--gold-400); font-weight:600; margin-bottom:5px}
  .bundle-includes{font-family:"Cormorant Garamond",serif; font-size:19px; color:#fff}
  .bundle-right{text-align:right}
  .bundle-price{font-family:"Cormorant Garamond",serif; font-size:28px; font-weight:600; color:var(--gold-300); line-height:1}
  .bundle-savings{font-size:11.5px; color:var(--on-navy-mid); margin-top:4px}

  .specialist-card{display:grid; grid-template-columns:44px 1fr auto; align-items:center; gap:18px; margin-top:14px; padding:20px 22px; border-radius:14px; background:var(--specialist-fill); border:1px solid var(--specialist-border)}
  .specialist-num{font-family:"Cormorant Garamond",serif; font-size:22px; font-weight:600; color:var(--specialist)}
  .specialist-label{font-family:"DM Mono",monospace; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--specialist); margin-bottom:4px}
  .specialist-name{font-size:18px; margin-bottom:3px; font-family:"Cormorant Garamond",serif}
  .specialist-tagline{font-size:12.5px; color:var(--text-muted)}
  .specialist-status{background:var(--specialist); color:#fff}

  .cta-band{background:var(--navy-950); color:var(--on-navy); padding:64px 0; margin-top:8px}
  .cta-inner{display:flex; align-items:center; justify-content:space-between; gap:32px; flex-wrap:wrap}
  .cta-band .kicker{color:var(--gold-400)}
  .cta-band .kicker::before{background:var(--gold-400)}
  .cta-band h2{font-size:30px; max-width:19ch; color:#fff}
  .cta-band p{font-size:14px; color:var(--on-navy-mid); margin:10px 0 0; max-width:42ch; line-height:1.6}
  .btn-solid{flex:0 0 auto; font-family:"DM Sans",sans-serif; font-size:14px; font-weight:700; padding:14px 26px; border-radius:9px; border:none; background:var(--gold-500); color:var(--navy-950); cursor:pointer; white-space:nowrap; text-decoration:none; display:inline-block}
  footer{padding:28px 0 46px; text-align:center; font-size:11.5px; color:var(--text-muted)}

  @media print{
    body{background:#fff}
    .theme-toggle{display:none}
    .copy-tag{display:none}
    .quote-toggle{display:none}
    .quote-full[hidden]{display:block !important}
    details:not([open]) > *:not(summary){display:block !important}
    .panel{break-inside:avoid}
  }
  @media (max-width:720px){
    .cov-grid{grid-template-columns:96px repeat(3,1fr)}
    .masthead h1{font-size:30px}
    .quote{flex-direction:column; gap:6px}
    .quote-engine{width:auto; flex-direction:row}
    .action-row{grid-template-columns:1fr}
    .service-row{grid-template-columns:32px 1fr; row-gap:8px}
    .service-status{grid-column:2}
  }
</style>
</head>
<body>

<div class="wrap masthead">
  <div class="masthead-top">
    <div class="brand"><span class="brand-dot"></span><span class="brand-name">cpulze</span></div>
    <div class="masthead-right">
      <div class="masthead-date mono">${esc(generatedDate)}</div>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
        <svg class="sun" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <svg class="moon" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>
  <div class="kicker">AI Mirror — Diagnostic Report</div>
  <h1>What AI is telling your future guests</h1>
  <div class="loc"><strong>${esc(report.hotel_name)}</strong> · ${esc(report.hotel_location || '')}</div>
  <p class="masthead-note">Every finding below traces a real question, through ChatGPT, Gemini &amp; Perplexity's actual answers, weighed against real guest reviews.</p>
</div>

${pm.totalChecked ? `
<div class="wrap perception">
  <div class="perception-head">
    <div>
      <div class="kicker">AI Perception Map</div>
      <h2>${hasLocked ? "You're seeing a fraction of what we checked" : 'Every check in this run is shown below'}</h2>
    </div>
    <div class="perception-stat">
      <div class="num">${pm.unlockedCount}<span> / ${pm.totalChecked}</span></div>
      <div class="cap">unlocked below</div>
    </div>
  </div>
  ${renderPerceptionMap(pm)}
  ${hasLocked ? `
  <div class="perception-cta">
    <p><strong>${pm.totalChecked - pm.unlockedCount} more checks</strong> already exist for this property — we just haven't unlocked them here.</p>
    <a class="btn-ghost" href="#cta">See the rest →</a>
  </div>` : ''}
</div>` : ''}

<div class="wrap findings">
  <div class="kicker">Evidence Inventory</div>
  <div class="section-label">${(report.theme_sections || []).length} of ${pm.totalChecked || (report.theme_sections || []).length} checks unlocked for this report</div>
  ${themeBlocks}
</div>

<div class="wrap services">
  <div class="services-intro">
    <div class="kicker">Four ways to shape the narrative</div>
    <h2>You're reading an AI Mirror</h2>
    <p>This report is one of four connected views cpulze builds for a hotel's AI narrative. The other three require AI Mirror first — a discovery call is where we open them.</p>
  </div>
  <div class="services-list">${renderServices(report.services, hotelSlug)}</div>
  ${renderBundle(report.master_bundle)}
  ${renderSpecialist(report.services)}
</div>

<div class="cta-band" id="cta">
  <div class="wrap cta-inner">
    <div>
      <div class="kicker">Next step</div>
      <h2>Want to see the rest?</h2>
      <p>${esc(report.unlock_cta || '')} Book a call and we'll open the full Perception Map live.</p>
    </div>
    <a class="btn-solid" href="${esc(report.calendly_url || '#')}" target="_blank" rel="noopener">Book Discovery Call</a>
  </div>
</div>

<footer>Prepared for ${esc(report.hotel_name)} &middot; cpulze.com</footer>

<script>
(function(){
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  var KEY = 'cpulze_report_theme';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch(e){}
  if (btn) btn.addEventListener('click', function(){
    var current = root.getAttribute('data-theme');
    var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch(e){}
  });

  document.querySelectorAll('[data-copy]').forEach(function(tag){
    tag.addEventListener('click', function(){
      var box = tag.closest('.reply') || tag.parentElement;
      var text = box.textContent.replace(/^(Copy|Copied)/, '').trim();
      navigator.clipboard && navigator.clipboard.writeText(text).catch(function(){});
      tag.textContent = 'Copied'; setTimeout(function(){ tag.textContent = 'Copy'; }, 1500);
    });
  });

  document.querySelectorAll('.quote-toggle').forEach(function(btn){
    btn.addEventListener('click', function(){
      var full = document.getElementById(btn.dataset.toggle);
      if (!full) return;
      var showing = !full.hidden;
      full.hidden = showing;
      btn.textContent = showing ? 'Show full response ↓' : 'Show less ↑';
    });
  });
})();
</script>
</body>
</html>`;
}

module.exports = { renderReportHtml };
