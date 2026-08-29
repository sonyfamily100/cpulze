const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function blankHotel(id, name, location) {
  return {
    id, name, location,
    created_at: new Date().toISOString(),
    api_findings: {},        // { chatgpt: {partA, partB, partC}, gemini: {...}, perplexity: {...} }
    consumer_findings: {},   // { chatgpt: {staff: "...", room_quality: "...", ...}, gemini: {...}, perplexity: {...} }
    corpus: [],              // [{ url, reviewer, date, rating, title, text }]
    verification: null,      // most recent verification result (kept for convenience)
    verification_history: [], // every verification run ever made, oldest first
    email_history: []        // every generated email, oldest first
  };
}

function rowToHotel(row) {
  const hotel = { id: row.id, name: row.name, location: row.location, created_at: row.created_at, ...row.data };
  // backward-compat: older hotel records won't have these fields yet
  if (!Array.isArray(hotel.verification_history)) {
    hotel.verification_history = hotel.verification ? [hotel.verification] : [];
  }
  if (!Array.isArray(hotel.email_history)) {
    hotel.email_history = [];
  }
  return hotel;
}

async function listHotels() {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, name, location, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function getHotel(id) {
  const { data, error } = await supabase.from('hotels').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToHotel(data);
}

async function saveHotel(hotel) {
  const { id, name, location, created_at, ...rest } = hotel;
  const { error } = await supabase
    .from('hotels')
    .upsert({ id, name, location, created_at, data: rest });
  if (error) throw error;
  return hotel;
}

async function createHotel(name, location) {
  const id = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hotel = blankHotel(id, name, location);
  return saveHotel(hotel);
}
async function deleteHotel(id) {
  const { error } = await supabase.from('hotels').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { listHotels, getHotel, saveHotel, createHotel, deleteHotel };
