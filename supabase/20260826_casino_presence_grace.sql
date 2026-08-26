-- Apply once in the Supabase SQL editor for already provisioned projects.
-- A short WebView reconnect (reload, Telegram background/foreground or a
-- brief Render deploy) must not make an otherwise seated player appear AFK.
create or replace function public.casino_heartbeat(
  p_table_id text,
  p_user_id text
) returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.casino_table_seats
  set state = 'seated', presence_expires_at = now() + interval '3 minutes'
  where table_id = p_table_id and user_id = p_user_id
    and state in ('reserved', 'seated', 'afk', 'leaving')
  returning presence_expires_at;
$$;
