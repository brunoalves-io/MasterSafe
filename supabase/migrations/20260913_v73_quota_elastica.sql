-- MasterSafe V7.3.0 — Quota Elástica Zero Custo
-- Teto global do beta: 850 MiB.
-- Teto individual: até 500 MiB, recalculado conforme o espaço já usado pelos outros usuários.
-- Limite técnico por arquivo: 26 MiB (UI comunica 25 MB para absorver overhead criptográfico).

begin;

create or replace function public.plan_storage_limit(p_plan text)
returns bigint
language sql
immutable
as $$
  select 524288000::bigint;
$$;

create or replace function public.plan_file_limit(p_plan text)
returns bigint
language sql
immutable
as $$
  select 27262976::bigint;
$$;

create or replace function public.get_storage_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_user_used bigint := 0;
  v_global_used bigint := 0;
  v_other_used bigint := 0;
  v_limit bigint := 0;
  v_remaining bigint := 0;
  v_global_remaining bigint := 0;
  v_user_max constant bigint := 524288000;
  v_file_limit constant bigint := 27262976;
  v_global_limit constant bigint := 891289600;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select coalesce(sum(ciphertext_size), 0) into v_user_used
  from public.vault_documents
  where user_id = v_user and deleted_at is null;

  select coalesce(sum(ciphertext_size), 0) into v_global_used
  from public.vault_documents
  where deleted_at is null;

  v_other_used := greatest(0, v_global_used - v_user_used);

  v_limit := greatest(
    v_user_used,
    least(v_user_max, greatest(0::bigint, v_global_limit - v_other_used))
  );

  v_remaining := greatest(0::bigint, v_limit - v_user_used);
  v_global_remaining := greatest(0::bigint, v_global_limit - v_global_used);

  return jsonb_build_object(
    'mode', 'elastic',
    'used', v_user_used,
    'limit', v_limit,
    'remaining', v_remaining,
    'maxLimit', v_user_max,
    'fileLimit', v_file_limit,
    'displayFileLimit', 26214400::bigint,
    'globalUsed', v_global_used,
    'globalLimit', v_global_limit,
    'globalRemaining', v_global_remaining
  );
end;
$$;

grant execute on function public.get_storage_quota() to authenticated;

create or replace function public.check_storage_quota(p_document_id uuid, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing bigint := 0;
  v_user_without bigint := 0;
  v_global_without bigint := 0;
  v_other_used bigint := 0;
  v_current_user_total bigint := 0;
  v_proposed_user_total bigint := 0;
  v_proposed_global_total bigint := 0;
  v_dynamic_limit bigint := 0;
  v_user_max constant bigint := 524288000;
  v_file_limit constant bigint := 27262976;
  v_global_limit constant bigint := 891289600;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_size < 0 then raise exception 'INVALID_SIZE'; end if;

  select coalesce(ciphertext_size, 0) into v_existing
  from public.vault_documents
  where user_id = v_user and id = p_document_id and deleted_at is null;

  if p_size <= coalesce(v_existing, 0) then
    return jsonb_build_object(
      'allowed', true, 'reason', null, 'mode', 'elastic',
      'fileLimit', v_file_limit, 'maxLimit', v_user_max,
      'globalLimit', v_global_limit, 'existing', coalesce(v_existing, 0)
    );
  end if;

  if p_size > v_file_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'FILE_TOO_LARGE', 'mode', 'elastic',
      'fileLimit', v_file_limit, 'maxLimit', v_user_max, 'globalLimit', v_global_limit
    );
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_user_without
  from public.vault_documents
  where user_id = v_user and deleted_at is null and id <> p_document_id;

  select coalesce(sum(ciphertext_size), 0) into v_global_without
  from public.vault_documents
  where deleted_at is null and id <> p_document_id;

  v_other_used := greatest(0, v_global_without - v_user_without);
  v_current_user_total := v_user_without + coalesce(v_existing, 0);
  v_proposed_user_total := v_user_without + p_size;
  v_proposed_global_total := v_global_without + p_size;

  v_dynamic_limit := greatest(
    v_current_user_total,
    least(v_user_max, greatest(0::bigint, v_global_limit - v_other_used))
  );

  if v_proposed_global_total > v_global_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'BETA_CAPACITY_REACHED', 'mode', 'elastic',
      'used', v_current_user_total, 'requested', p_size,
      'limit', v_dynamic_limit, 'maxLimit', v_user_max,
      'fileLimit', v_file_limit,
      'globalUsed', v_global_without + coalesce(v_existing, 0),
      'globalLimit', v_global_limit
    );
  end if;

  if v_proposed_user_total > v_dynamic_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'STORAGE_QUOTA_EXCEEDED', 'mode', 'elastic',
      'used', v_current_user_total, 'requested', p_size,
      'limit', v_dynamic_limit, 'maxLimit', v_user_max,
      'fileLimit', v_file_limit,
      'globalUsed', v_global_without + coalesce(v_existing, 0),
      'globalLimit', v_global_limit
    );
  end if;

  return jsonb_build_object(
    'allowed', true, 'reason', null, 'mode', 'elastic',
    'used', v_current_user_total, 'requested', p_size,
    'limit', v_dynamic_limit,
    'remaining', greatest(0::bigint, v_dynamic_limit - v_current_user_total),
    'maxLimit', v_user_max, 'fileLimit', v_file_limit,
    'globalUsed', v_global_without + coalesce(v_existing, 0),
    'globalLimit', v_global_limit
  );
end;
$$;

grant execute on function public.check_storage_quota(uuid, bigint) to authenticated;

create or replace function public.enforce_vault_document_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing bigint := 0;
  v_user_without bigint := 0;
  v_global_without bigint := 0;
  v_other_used bigint := 0;
  v_current_user_total bigint := 0;
  v_proposed_user_total bigint := 0;
  v_proposed_global_total bigint := 0;
  v_dynamic_limit bigint := 0;
  v_needs_check boolean := false;
  v_user_max constant bigint := 524288000;
  v_file_limit constant bigint := 27262976;
  v_global_limit constant bigint := 891289600;
begin
  if new.deleted_at is not null then return new; end if;

  if tg_op = 'INSERT' then
    v_needs_check := true;
    v_existing := 0;
  elsif tg_op = 'UPDATE' then
    v_existing := case when old.deleted_at is null then coalesce(old.ciphertext_size, 0) else 0 end;
    v_needs_check := old.deleted_at is not null
      or coalesce(new.ciphertext_size, 0) > coalesce(old.ciphertext_size, 0);
  end if;

  if not v_needs_check then return new; end if;

  perform pg_advisory_xact_lock(731983451);

  if coalesce(new.ciphertext_size, 0) > v_file_limit then
    raise exception 'FILE_TOO_LARGE';
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_user_without
  from public.vault_documents
  where user_id = new.user_id and deleted_at is null and id <> new.id;

  select coalesce(sum(ciphertext_size), 0) into v_global_without
  from public.vault_documents
  where deleted_at is null and id <> new.id;

  v_other_used := greatest(0, v_global_without - v_user_without);
  v_current_user_total := v_user_without + v_existing;
  v_proposed_user_total := v_user_without + coalesce(new.ciphertext_size, 0);
  v_proposed_global_total := v_global_without + coalesce(new.ciphertext_size, 0);

  v_dynamic_limit := greatest(
    v_current_user_total,
    least(v_user_max, greatest(0::bigint, v_global_limit - v_other_used))
  );

  if v_proposed_global_total > v_global_limit then
    raise exception 'BETA_CAPACITY_REACHED';
  end if;

  if v_proposed_user_total > v_dynamic_limit then
    raise exception 'STORAGE_QUOTA_EXCEEDED';
  end if;

  return new;
end;
$$;

update storage.buckets
set file_size_limit = 27262976
where id = 'vault';

comment on function public.plan_storage_limit(text) is 'MasterSafe V7.3: teto individual de 500 MiB; a quota efetiva é elástica conforme o espaço usado por outros usuários.';
comment on function public.plan_file_limit(text) is 'MasterSafe V7.3: 26 MiB técnicos por arquivo para suportar 25 MB + overhead criptográfico.';
comment on function public.get_storage_quota() is 'MasterSafe V7.3: snapshot da quota elástica do usuário autenticado.';
comment on function public.check_storage_quota(uuid, bigint) is 'MasterSafe V7.3: valida upload usando quota elástica, teto individual de 500 MiB e teto global de 850 MiB.';

commit;
