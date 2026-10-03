// One-off: extract calendar events from reviews and space descriptions written before space_events existed.
// Usage: npm run backfill:events  (needs EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env)
// Safe to re-run; existing rows are skipped via the (source_type, source_id, dedupe_key) unique key.
import { createClient } from '@supabase/supabase-js';
import { buildEventRows, extractEvents, type EventRow } from '../lib/events';

const PAGE_SIZE = 500;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the backfill.');
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

type RatingRow = {
  id: string;
  user_id: string;
  space_id: string;
  review_text: string | null;
  created_at: string;
  spaces: { is_secret: boolean | null } | null;
};

type SpaceRow = {
  id: string;
  description: string | null;
  hours: string | null;
  updated_at: string;
  is_secret: boolean | null;
};

async function* pages<T>(table: string, columns: string, filter?: (query: any) => any) {
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns).order('created_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
    const rows = (data || []) as T[];
    if (rows.length > 0) yield rows;
    if (rows.length < PAGE_SIZE) return;
  }
}

async function save(rows: EventRow[]) {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('space_events')
    .upsert(rows, { onConflict: 'source_type,source_id,dedupe_key', ignoreDuplicates: true });
  if (error) throw new Error(`Writing space_events failed: ${error.message}`);
}

async function main() {
  let ratingEvents = 0;
  let spaceEvents = 0;

  for await (const ratings of pages<RatingRow>(
    'ratings',
    'id, user_id, space_id, review_text, created_at, spaces(is_secret)',
    (query) => query.not('review_text', 'is', null)
  )) {
    const rows = ratings
      .filter((rating) => !rating.spaces?.is_secret)
      .flatMap((rating) => buildEventRows(extractEvents(rating.review_text, rating.created_at), {
        source_type: 'rating',
        source_id: rating.id,
        space_id: rating.space_id,
        source_user_id: rating.user_id,
        source_created_at: rating.created_at,
      }));
    await save(rows);
    ratingEvents += rows.length;
  }

  for await (const spaces of pages<SpaceRow>('spaces', 'id, description, hours, updated_at, is_secret')) {
    const rows = spaces
      .filter((space) => !space.is_secret)
      .flatMap((space) => buildEventRows(
        extractEvents([space.description, space.hours].filter(Boolean).join('. '), space.updated_at),
        { source_type: 'space', source_id: space.id, space_id: space.id, source_created_at: space.updated_at }
      ));
    await save(rows);
    spaceEvents += rows.length;
  }

  console.log(`Extracted ${ratingEvents} events from reviews and ${spaceEvents} from space descriptions.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
