// Static "assembly line" content shared by every generated report — kept
// separate from lib/reportGen.js so a single edit here (a question's
// wording, a pricing figure) rolls out to every hotel's report without
// touching the Claude prompt or having the model re-invent it per run.

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

// PLACEHOLDER FIGURES — replace "[PRICE]" with real cpulze pricing before
// any report goes to a client. Kept as one static block so every report
// quotes the same numbers; editing here changes every report generated
// from this point on (a report already generated keeps whatever pricing
// was current at generation time, since it's copied into the saved record).
const PRICING_TIERS = [
  {
    name: 'Snapshot Audit',
    price: '[PRICE]',
    description: 'A one-time check of what AI assistants currently tell prospective guests, verified against real reviews.'
  },
  {
    name: 'Quarterly Monitoring',
    price: '[PRICE]',
    description: 'Snapshot Audit repeated every quarter, with a trend view of how AI answers change over time.'
  },
  {
    name: 'Managed Response',
    price: '[PRICE]',
    description: 'Quarterly Monitoring plus hands-on help correcting the sources AI assistants draw from.'
  }
];

function nextStepsBoilerplate(hotelName) {
  return `If any of this looks worth acting on, the next step is a short call to walk through these findings together and agree what's worth fixing first at ${hotelName}. No obligation — just a conversation about what AI is currently telling prospective guests and what, if anything, is worth changing.`;
}

module.exports = { THEME_QUESTIONS, themeQuestion, PRICING_TIERS, nextStepsBoilerplate };
