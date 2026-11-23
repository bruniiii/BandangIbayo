-- ─────────────────────────────────────────────
-- SCHEMA SNAPSHOT (read-only: it changes nothing)
-- Lists every table's columns, the triggers on each table, and which
-- database functions call the website's email/notification functions.
-- Run it in Supabase → SQL Editor, then copy the single result cell.
-- No data, passwords or keys are shown: only names and types.
-- ─────────────────────────────────────────────
with cols as (
  select c.table_name,
         string_agg(c.column_name || ' ' || c.data_type
                    || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end
                    || case when c.column_default is not null then ' =' || left(c.column_default, 40) else '' end,
                    ', ' order by c.ordinal_position) as cols
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
   group by c.table_name
),
trg as (
  select event_object_table as table_name, string_agg(distinct trigger_name || '>' || substring(action_statement from 'FUNCTION ([a-z0-9_.]+)'), ' ') as triggers
    from information_schema.triggers
   where event_object_schema = 'public'
   group by event_object_table
),
chk as (
  select rel.relname as table_name, string_agg(pg_get_constraintdef(con.oid), ' | ') as checks
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public' and con.contype in ('c', 'f', 'u')
   group by rel.relname
),
calls_out as (
  select string_agg(p.proname, ' ') as fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.prosrc ilike '%net.http%' or p.prosrc ilike '%functions/v1%')
)
select string_agg(
         '## ' || cols.table_name || E'\n' || cols.cols
         || coalesce(E'\nTRIGGERS: ' || trg.triggers, '')
         || coalesce(E'\nCHECKS: ' || left(chk.checks, 1500), ''),
         E'\n\n' order by cols.table_name)
       || E'\n\n## CALLS OUT: ' || coalesce((select fns from calls_out), 'none') as snapshot
  from cols left join trg using (table_name) left join chk using (table_name);
