-- 028: Mode Test per kampanye.
-- Kampanye dengan test_mode = true tidak menghasilkan reward apa pun
-- (baik reward pesan maupun reward referral) bagi worker yang mengirimnya.

alter table public.campaigns
  add column if not exists test_mode boolean not null default false;

create or replace function public.credit_message_reward(_message_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  owner uuid;
  total numeric := 0;
  upline uuid;
  lvl int := 1;
  rate numeric;
  is_test boolean;
begin
  select * into s from public.app_settings where id = 'global';
  if s is null or s.rewards_enabled is not true then
    return 0;
  end if;

  select user_id into owner from public.message_queue where id = _message_id and status = 'sent';
  if owner is null then
    return 0;
  end if;

  -- Kampanye uji coba: pengiriman tetap berjalan, tetapi tanpa reward.
  select c.test_mode into is_test
  from public.message_queue q
  join public.campaigns c on c.id = q.campaign_id
  where q.id = _message_id;
  if is_test is true then
    return 0;
  end if;

  if s.reward_per_message > 0 then
    insert into public.reward_ledger (user_id, kind, amount, message_id, level)
    values (owner, 'message', s.reward_per_message, _message_id, 0)
    on conflict do nothing;
    total := total + s.reward_per_message;
  end if;

  upline := (select referred_by from public.profiles where user_id = owner);
  while upline is not null and lvl <= least(s.referral_levels, 3) loop
    rate := case lvl
      when 1 then s.referral_rate_l1
      when 2 then s.referral_rate_l2
      else s.referral_rate_l3
    end;
    if rate > 0 then
      insert into public.reward_ledger (user_id, kind, amount, message_id, source_user_id, level)
      values (upline, 'referral', rate, _message_id, owner, lvl)
      on conflict do nothing;
      total := total + rate;
    end if;
    upline := (select referred_by from public.profiles where user_id = upline);
    lvl := lvl + 1;
  end loop;

  return total;
end $$;

grant execute on function public.credit_message_reward(uuid) to authenticated, service_role;
