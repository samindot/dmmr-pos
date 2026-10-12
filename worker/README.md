# DMMR POS — direct Loyverse sync Worker

This Worker syncs Loyverse receipts, line items, and payments directly into the dedicated DMMR POS Supabase project. It is separate from the Cloudflare Pages frontend.

## Schedule

Cron: `0 * * * *` (once per hour, at minute 0 UTC). Cron Triggers use UTC.

## Required Worker secrets

Set these in Cloudflare Dashboard → Workers & Pages → `dmmr-pos-loyverse-sync` → Settings → Variables and Secrets:

- `LOYVERSE_ACCESS_TOKEN` — Loyverse API access token with **RECEIPTS_READ** permission.
- `SUPABASE_URL` — URL of the DMMR POS Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role/secret key for the DMMR POS Supabase project only. Never put this in frontend variables, GitHub, or Cloudflare Pages.
- `SYNC_TRIGGER_SECRET` — long random secret used to authorize a manual sync request.
- `ENABLE_WRITES` — a Worker variable, not a secret. Keep it unset or set to `false` for the first test. Set to `true` only after checking identifier compatibility.

Mark all four as secrets where the dashboard allows it.

## Deploy

From the `worker` directory:

```sh
npx wrangler deploy
```

Then configure the four secrets with Wrangler (run locally, do not commit values):

```sh
npx wrangler secret put LOYVERSE_ACCESS_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SYNC_TRIGGER_SECRET
```

Use either the Cloudflare Dashboard or Wrangler to set secrets; do not do both unless you intend to update the same values.

## Test

**Safe by default:** unless `ENABLE_WRITES=true`, `/sync` only fetches recent receipts from Loyverse and returns counts plus a few non-sensitive identifier diagnostics. It does not write to Supabase. Check that the API can be reached and compare one or more receipt numbers with existing rows before enabling writes.

Health check:

```sh
curl https://<worker-hostname>/health
```

Manual sync (keep the trigger secret private):

```sh
curl -X POST https://<worker-hostname>/sync \
  -H 'Authorization: Bearer <SYNC_TRIGGER_SECRET>'
```

The manual route is authenticated. Do not share the secret or paste it into GitHub issues. Once the dry-run diagnostics confirm the key strategy, set Worker variable `ENABLE_WRITES=true` and run a manual sync before relying on the hourly schedule.

## Sync behavior and limits

- Requests `/v1.0/receipts` with `updated_at_min` set to 72 hours before each run. This overlap is intended to catch delayed receipts, edits, and retries.
- Uses cursor pagination with a 250-receipt page size and a guard of 20 pages. If more than 5,000 receipts match, it fails visibly rather than silently claiming a complete sync.
- Upserts receipt rows first, then their line items and payments, using stable unique keys to make retries idempotent.
- Never deletes historical rows from Supabase. Existing rows older than the API-accessible window remain as the dashboard archive.
- A successful/failed run is recorded in `public.sync_runs`.
- This first version assumes the receipt identifier used by the existing table is `receipt.id` when present, otherwise `receipt.receipt_number`. Before enabling the hourly schedule, compare one API receipt key with an existing `public.receipts.loyverse_receipt_id`; if they differ, align the key strategy before the first production sync to avoid duplicate receipt rows.
- Loyverse API plan restrictions still apply. This Worker does not bypass Free-plan history restrictions.
