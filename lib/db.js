const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function blankHotel(id, name, location) {
  return {
    id, name, location,
    created_at: new Date().toISOString(),
    hidden: false,           // flag to control sidebar visibility
    api_findings: {},        // { chatgpt: {partA, partB, partC}, gemini: {...}, perplexity: {...} }
    consumer_findings: {},   // { chatgpt: {staff: "...", room_quality: "...", ...}, gemini: {...}, perplexity: {...} }
    corpus: [],              // [{ url, reviewer, date, rating, title, text }]
    verification: null,      // most recent verification result (kept for convenience)
    verification_history: [], // every verification run ever made, oldest first
    email_history: [],       // every generated email, oldest first
    report_history: []       // every generated client report (draft or approved), oldest first
  };
}

function rowToHotel(row) {
  const hotel = { id: row.id, name: row.name, location: row.location, created_at: row.created_at, ...row.data };
  // backward-compat: older hotel records won't have these fields yet
  if (hotel.hidden === undefined) {
    hotel.hidden = false;
  }
  if (!Array.isArray(hotel.verification_history)) {
    hotel.verification_history = hotel.verification ? [hotel.verification] : [];
  }
  if (!Array.isArray(hotel.email_history)) {
    hotel.email_history = [];
  }
  if (!Array.isArray(hotel.report_history)) {
    hotel.report_history = [];
  }
  return hotel;
}

// Fetches hotels and filters out items where hidden === true
async function listHotels() {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, name, location, created_at, data')
    .order('created_at', { ascending: true });

  if (error) throw error;
  
  // Exclude hidden hotels from the list
  return (data || [])
    .filter(row => !row.data || row.data.hidden !== true)
    .map(row => ({
      id: row.id,
      name: row.name,
      location: row.location,
      created_at: row.created_at
    }));
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

// Marks hotel as hidden instead of removing it from Supabase
async function hideHotel(id) {
  const hotel = await getHotel(id);
  if (!hotel) return null;
  hotel.hidden = true;
  return saveHotel(hotel);
}

// Preserved in case you still need a hard-delete utility elsewhere
async function deleteHotel(id) {
  const { error } = await supabase.from('hotels').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { listHotels, getHotel, saveHotel, createHotel, hideHotel, deleteHotel };
