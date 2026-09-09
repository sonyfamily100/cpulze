// Static "assembly line" content shared by every generated report — kept
// separate from lib/reportGen.js so a single edit here (a question's
// wording, a price, a service description) rolls out to every hotel's
// report without touching the Claude prompt or having the model re-invent
// it per run. Pricing/service copy here is cpulze's real, current offer —
// pulled from cpulze.com and confirmed in conversation, not a placeholder.

// The plain-language question a prospective guest might type into an AI
// assistant for each theme. Used as the report's read-only "question asked"
// line — generated once here, not by Claude, so wording stays identical
// across every hotel and every run.
const THEME_QUESTIONS = {
  staff: 'What is the staff like at {hotel}?',
  room_quality: 'How are the rooms at {hotel}?',
  cleanliness: 'Is {hotel} clean?',
  dining: "What's the food and dining like at {hotel}?",
  checkin_out: "What's check-in and check-out like at {hotel}?",
  value: 'Is {hotel} good value for money?',
  noise: 'Is {hotel} noisy?',
  maintenance: 'Is everything well-maintained at {hotel}?',
  wifi: 'Does {hotel} have good Wi-Fi?',
  accessibility: 'Is {hotel} accessible for guests with mobility needs?',
  family_suitability: 'Is {hotel} good for families with children?',
  pricing_transparency: 'Are there any hidden fees at {hotel}?'
};

function themeQuestion(themeKey, hotelName) {
  const template = THEME_QUESTIONS[themeKey] || 'What do AI assistants say about {hotel} on this topic?';
  return template.replace('{hotel}', hotelName);
}

// Severity is a model judgment (reputational risk, not a mechanical mapping
// off the verdict enum) but the label/styling per level is fixed here so
// every report renders the same three tiers consistently.
const SEVERITY_LEVELS = ['critical', 'high', 'watch'];
const SEVERITY_META = {
  critical: { label: 'Critical', cls: 'crit' },
  high: { label: 'High', cls: 'high' },
  watch: { label: 'Watch', cls: 'watch' }
};

function normalizeSeverity(raw) {
  const s = (raw || '').toString().trim().toLowerCase();
  return SEVERITY_LEVELS.includes(s) ? s : 'watch';
}

// The kinds of recommended action a theme can carry. Claude picks which
// apply per theme (not every theme gets every type) but must never invent a
// type outside this list — keeps the report's action vocabulary fixed and
// keeps "what cpulze recommends" scoped to digital-record work, never
// hospitality-operations advice.
const ACTION_TYPES = {
  website: { label: 'Website content' },
  ota_listing: { label: 'OTA listing content' },
  article_correction: { label: 'Correct an outdated article' },
  review_reply: { label: 'Reply to a review' },
  owner_voice: { label: 'Owner Voice entry' }
};

// --- Real cpulze pricing (confirmed 2026-03) ---
// AI Mirror is the baseline — everything else requires it. A single report
// can be unlocked ad-hoc; that fee is fully creditable toward the annual
// plan within the window below, so trying it once never costs extra if a
// hotel commits.
const PRICING = {
  currency: '£',
  unlockOneReport: 700,          // ad-hoc: unlock every finding in THIS report
  unlockCreditWindowDays: 60,    // credit is valid this long after the ad-hoc purchase
  aiMirrorAnnual: 1200,          // AI Mirror, 3 deliverables/year
  aiMirrorDeliverablesPerYear: 3,
  ownerVoiceAnnual: 1000,        // requires AI Mirror
  keepVigilAnnual: 1000,         // requires AI Mirror
  masterBundleAnnual: 2500,      // AI Mirror + Owner Voice + Keep Vigil
  whosWinningOneTime: 500        // one competitor, requires AI Mirror
};

// upgradeTopUp: what's left to pay if a hotel already bought the ad-hoc
// unlock and now wants the full annual AI Mirror plan (which is what "3
// deliverables" actually is — the ad-hoc purchase counts as the first one).
PRICING.upgradeTopUp = PRICING.aiMirrorAnnual - PRICING.unlockOneReport;

function formatGBP(amount) {
  return PRICING.currency + Number(amount).toLocaleString('en-GB');
}

// The four real services and cpulze.com's own language for each — but
// numbered by DISPLAY order in the report (bundle-eligible trio first,
// Who's Winning last as the specialist add-on), not the site's own index
// order, so the numbers read 01-04 in sequence wherever they appear rather
// than skipping a number when Who's Winning is pulled into its own card.
const SERVICES = [
  {
    key: 'mirror', num: '01', name: 'AI Mirror', tagline: 'The diagnostic view',
    priceLabel: `${formatGBP(PRICING.aiMirrorAnnual)}/yr`,
    priceNote: `${PRICING.aiMirrorDeliverablesPerYear} deliverables a year`,
    requiresMirror: false
  },
  {
    key: 'voice', num: '02', name: 'Owner Voice', tagline: 'The authored record',
    priceLabel: `${formatGBP(PRICING.ownerVoiceAnnual)}/yr`,
    priceNote: 'continuous updates + hosting for the live page',
    requiresMirror: true
  },
  {
    key: 'vigil', num: '03', name: 'Keep Vigil', tagline: 'The ongoing watch',
    priceLabel: `${formatGBP(PRICING.keepVigilAnnual)}/yr`,
    priceNote: 'continuous monitoring between deliverables',
    requiresMirror: true
  },
  {
    key: 'winning', num: '04', name: "Who's Winning", tagline: 'The competitive lens',
    priceLabel: formatGBP(PRICING.whosWinningOneTime),
    priceNote: 'one-time, one competitor',
    requiresMirror: true
  }
];

// The master bundle is AI Mirror + Owner Voice + Keep Vigil (NOT Who's
// Winning, which stays a separate one-time add-on). Computed from the same
// PRICING numbers above so it can never drift out of sync with them.
const MASTER_BUNDLE = {
  priceLabel: `${formatGBP(PRICING.masterBundleAnnual)}/yr`,
  includesLabel: 'AI Mirror + Owner Voice + Keep Vigil',
  separateTotal: PRICING.aiMirrorAnnual + PRICING.ownerVoiceAnnual + PRICING.keepVigilAnnual,
  get savingsLabel() { return formatGBP(this.separateTotal - PRICING.masterBundleAnnual); }
};

const CALENDLY_URL = 'https://calendly.com/ovais-cpulze/30min';

function unlockCtaLine() {
  return `${formatGBP(PRICING.unlockOneReport)} unlocks every check in this report. Go further — commit to the year (${PRICING.aiMirrorDeliverablesPerYear} deliverables) — for just ${formatGBP(PRICING.upgradeTopUp)} more.`;
}

function nextStepsBoilerplate(hotelName) {
  return `The next step is a short call to walk through the full findings set together and agree what's worth acting on first at ${hotelName}. No obligation — just a conversation about what AI is currently telling prospective guests and what's worth changing.`;
}

module.exports = {
  THEME_QUESTIONS, themeQuestion,
  SEVERITY_LEVELS, SEVERITY_META, normalizeSeverity,
  ACTION_TYPES,
  PRICING, SERVICES, MASTER_BUNDLE, CALENDLY_URL, unlockCtaLine,
  nextStepsBoilerplate
};
