create extension if not exists pgcrypto;

create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_set_updated_at on public.app_state;
create trigger app_state_set_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

insert into public.app_state (id, payload)
values ('runtime-state', '{}'::jsonb)
on conflict (id) do nothing;

-- Enable RLS and restrict access to authenticated service role
alter table public.app_state enable row level security;

drop policy if exists "Allow all operations for service role" on public.app_state;
create policy "Allow all operations for service role" on public.app_state
  for all to service_role using (true) with check (true);
