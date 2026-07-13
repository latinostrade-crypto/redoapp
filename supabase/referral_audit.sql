-- Read-only production audit for the legacy-to-granular referral migration.
-- Run in Supabase SQL Editor before and after deploying the backend.

with legacy_users as (
  select user_payload
  from public.app_state state
  cross join lateral jsonb_array_elements(state.payload -> 'users') as user_payload
  where state.id = 'runtime-state'
),
granular_users as (
  select payload as user_payload
  from public.app_state
  where id like 'user:%'
)
select
  (select count(*) from legacy_users) as legacy_users,
  (select count(*) from granular_users) as granular_users,
  (select count(*) from legacy_users legacy
    where not exists (
      select 1 from granular_users granular
      where granular.user_payload ->> 'userId' = legacy.user_payload ->> 'userId'
    )) as legacy_users_waiting_for_migration;

-- These are the historical users that the patched backend will preserve and
-- migrate into user:* rows on startup. Do not delete runtime-state until this
-- query returns no rows and a verified backup exists.
with legacy_users as (
  select user_payload
  from public.app_state state
  cross join lateral jsonb_array_elements(state.payload -> 'users') as user_payload
  where state.id = 'runtime-state'
),
granular_users as (
  select payload as user_payload
  from public.app_state
  where id like 'user:%'
)
select
  legacy.user_payload ->> 'userId' as user_id,
  legacy.user_payload ->> 'referredByUserId' as referred_by_user_id,
  coalesce(legacy.user_payload ->> 'referralStatus', 'pending') as referral_status,
  legacy.user_payload ->> 'referralAssignedAt' as assigned_at
from legacy_users legacy
where legacy.user_payload ? 'referredByUserId'
  and not exists (
    select 1 from granular_users granular
    where granular.user_payload ->> 'userId' = legacy.user_payload ->> 'userId'
  )
order by assigned_at desc nulls last;

-- Checks for referral rows whose inviter is no longer present in the loaded
-- granular data. Any returned rows need manual recovery from runtime-state or
-- a Supabase backup before the legacy snapshot is retired.
with granular_users as (
  select payload as user_payload
  from public.app_state
  where id like 'user:%'
)
select
  referred.user_payload ->> 'userId' as referred_user_id,
  referred.user_payload ->> 'referredByUserId' as missing_inviter_user_id,
  coalesce(referred.user_payload ->> 'referralStatus', 'pending') as referral_status
from granular_users referred
where referred.user_payload ? 'referredByUserId'
  and not exists (
    select 1 from granular_users inviter
    where inviter.user_payload ->> 'userId' = referred.user_payload ->> 'referredByUserId'
  )
order by referred_user_id;
