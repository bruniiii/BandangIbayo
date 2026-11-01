# Putting the latest updates live

## 1. Database (Supabase SQL Editor)

1. Open your project on supabase.com, then **SQL Editor**, then **New query**.
2. Paste all of `check_updates.sql` and click **Run**. Each row says `installed` or `NOT YET`.
3. If any row says `NOT YET`: open a new query, paste all of
   `install_updates.sql` and click **Run**. It installs every update
   from 20261111 to 20261203 in order. If something fails, nothing is changed and
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
supabase functions deploy routes --no-verify-jwt
```

The `routes` function (maps) needs a free OpenRouteService key, set once:
`supabase secrets set ORS_API_KEY=<your key>`

Or in the Supabase dashboard: **Edge Functions**, open each function, and paste
the code from `supabase/functions/<name>/index.ts` into its editor, then **Deploy**.

## 3. Back up the database first

Before running a big SQL file (like `install_updates.sql`), save a copy of the
database so nothing can be lost:

- **Paid Supabase plan:** Supabase saves a backup every day. See them in the
  dashboard: **Database → Backups**.
- **Free plan (or to keep your own copy):** in a terminal in the project folder:

  ```
  supabase login
  supabase link --project-ref renugdlntgybazpikmbu
  supabase db dump -f backup-roles.sql --role-only
  supabase db dump -f backup-schema.sql
  supabase db dump -f backup-data.sql --data-only
  ```

  Keep the three files somewhere safe (not in GitHub: they hold joiners'
  personal details).

## 4. Practice trip (before the first real tour)

Do this once with two phones: one for the "driver", one for a joiner.

1. In Tour Management, make a test tour for **today** with 2–3 pickup points
   near you, a starting point and destination on the map, and a **Van leaves at** time.
2. Book it with a joiner test account and pick one of the pickup points.
3. In Tracking Management → the tour → **Driver Link**, copy the link and open
   it on the driver phone. Tap **Start Trip** and allow location.
4. On the joiner phone, open Tracking: the van should move on the map with a
   live ETA.
5. Walk or drive to the first pickup point: within about 250 m it turns
   **Arrived** and the joiner gets "The van is here".
6. Turn the driver phone's screen off for 12 minutes: admins should get
   "The van's location stopped updating". Turn it back on: it shares again.
7. Tap **End Trip**. Archive or delete the test tour afterwards.

## 5. Automatic checks

`npm test` runs the automatic tests (maps, times, notification links, phone
and name checks, dates). On GitHub, every pull request also runs the style
check, the tests and the build (`.github/workflows/ci.yml`): a red ✗ on the
pull request means something broke, before it reaches the live site.
