# Putting the latest updates live

## 1. Database (Supabase SQL Editor)

1. Open your project on supabase.com, then **SQL Editor**, then **New query**.
2. Paste all of `check_updates.sql` and click **Run**. Each row says `installed` or `NOT YET`.
3. If any row says `NOT YET`: open a new query, paste all of
   `install_updates.sql` and click **Run**. It installs every update
   from 20261111 to 20261122 in order. If something fails, nothing is changed and
   the error says which part. It's safe to run even if some are already installed.
4. Run `check_updates.sql` again. Every row should now say `installed`.

## 2. Edge functions (payments, auth, send-email)

These need a redeploy whenever their code changes. With the Supabase CLI, from
the project folder:

```
supabase login
supabase link --project-ref renugdlntgybazpikmbu
supabase functions deploy payments
supabase functions deploy auth
supabase functions deploy send-email
```

Or in the Supabase dashboard: **Edge Functions**, open each function, and paste
the code from `supabase/functions/<name>/index.ts` into its editor, then **Deploy**.
