// One-off: give spots added before profile-stats.sql a city, so their ratings and hangouts count on city leaderboards.
// Usage: npm run backfill:cities  (needs EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env)
// Safe to re-run; only spots without a city are looked up.
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { cityFromAddress, type NominatimAddress } from '../lib/cities';

const PAGE_SIZE = 500;
// Nominatim's usage policy allows one request per second.
const REQUEST_GAP_MS = 1100;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the backfill.');
}

// Node 20 has no global WebSocket, which supabase-js requires even though this script never uses realtime.
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

type SpaceRow = { id: string; name: string; latitude: number; longitude: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Read everything first: updating as we page would shift rows out of the `city is null` filter.
async function spotsWithoutCity() {
  const spots: SpaceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('spaces')
      .select('id, name, latitude, longitude')
      .is('city', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading spaces failed: ${error.message}`);
    spots.push(...((data || []) as SpaceRow[]));
    if (!data || data.length < PAGE_SIZE) return spots;
  }
}

async function lookupCity(latitude: number, longitude: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'ThirdSpaceExpoApp/1.0' } }
  );
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const place = (await response.json()) as { address?: NominatimAddress };
  return cityFromAddress(place.address);
}

async function main() {
  const spots = await spotsWithoutCity();
  let filled = 0;
  const missed: string[] = [];

  for (const [index, spot] of spots.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    try {
      const city = await lookupCity(spot.latitude, spot.longitude);
      if (!city) {
        missed.push(spot.name);
        continue;
      }
      const { error } = await supabase.from('spaces').update({ city }).eq('id', spot.id);
      if (error) throw new Error(error.message);
      filled += 1;
      console.log(`${spot.name}: ${city}`);
    } catch (error) {
      missed.push(spot.name);
      console.warn(`${spot.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`Filled in ${filled} of ${spots.length} spots.`);
  if (missed.length > 0) console.log(`No city for: ${missed.join(', ')}. Re-run later to retry them.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
