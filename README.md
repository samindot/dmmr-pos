# DMMR POS — Loyverse Analytics

Web dashboard for analyzing archived Loyverse sales data. This project is analytics-first; it does not replace Loyverse POS or write sales/booking data back to Loyverse.

## Stack
- React + Vite
- Cloudflare Pages
- Supabase Postgres
- GitHub as source of truth

## Local development
1. Install Node.js (LTS).
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in the Supabase project URL and public anon/publishable key.
5. Run `npm run dev`.

## Security
- Never commit Supabase service-role keys or Loyverse access tokens.
- Sales data must be protected by Supabase Row Level Security (RLS).
- The initial SQL enables RLS without permissive public policies. Configure approved-user access before connecting real data.
- Loyverse API synchronization should run server-side (e.g. a Supabase Edge Function), not in browser code.

## Data migration
Import existing Google Sheets archive into the staging/import process only after checking column mappings and deduplication keys. Do not delete or overwrite the original Sheets archive.

## Initial schema
See `supabase/schema.sql`.
