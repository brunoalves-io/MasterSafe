-- MasterSafe V7.2.1 — ampliar quota gratuita do beta
-- Mantém custo fixo R$ 0 usando Supabase Free.
-- UI: 250 MB por usuário, 25 MB por arquivo.
-- Backend aceita ~26 MiB por arquivo para absorver pequeno overhead da cifra AES-GCM.
-- Teto global: 850 MiB, deixando margem antes do 1 GB do Supabase Free.

create or replace function public.plan_storage_limit(p_plan text)
returns bigint
language sql
immutable
as $$
  select 262144000::bigint; -- 250 MiB por usuário
$$;

create or replace function public.plan_file_limit(p_plan text)
returns bigint
language sql
immutable
as $$
  select 27262976::bigint; -- 26 MiB técnicos; UI limita a 25 MB
$$;

create or replace function public.check_storage_quota(p_document_id uuid, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_used bigint := 0;
  v_existing bigint := 0;
  v_global_used bigint := 0;
  v_limit constant bigint := 262144000;
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
      'allowed', true, 'plan', 'zero', 'limit', v_limit,
      'fileLimit', v_file_limit, 'globalLimit', v_global_limit,
      'existing', coalesce(v_existing, 0)
    );
  end if;

  if p_size > v_file_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'FILE_TOO_LARGE', 'plan', 'zero',
      'limit', v_limit, 'fileLimit', v_file_limit, 'globalLimit', v_global_limit
    );
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_used
  from public.vault_documents
  where user_id = v_user and deleted_at is null and id <> p_document_id;

  if v_used + p_size > v_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'STORAGE_QUOTA_EXCEEDED', 'plan', 'zero',
      'used', v_used, 'requested', p_size, 'limit', v_limit,
      'fileLimit', v_file_limit, 'globalLimit', v_global_limit
    );
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_global_used
  from public.vault_documents
  where deleted_at is null and id <> p_document_id;

  return jsonb_build_object(
    'allowed', (v_global_used + p_size) <= v_global_limit,
    'reason', case when (v_global_used + p_size) <= v_global_limit then null else 'BETA_CAPACITY_REACHED' end,
    'plan', 'zero', 'used', v_used, 'requested', p_size,
    'limit', v_limit, 'fileLimit', v_file_limit,
    'globalUsed', v_global_used, 'globalLimit', v_global_limit
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
  v_used bigint := 0;
  v_global_used bigint := 0;
  v_limit constant bigint := 262144000;
  v_file_limit constant bigint := 27262976;
  v_global_limit constant bigint := 891289600;
  v_needs_check boolean := false;
begin
  if new.deleted_at is not null then return new; end if;

  if tg_op = 'INSERT' then
    v_needs_check := true;
  elsif tg_op = 'UPDATE' then
    v_needs_check := old.deleted_at is not null
      or coalesce(new.ciphertext_size, 0) > coalesce(old.ciphertext_size, 0);
  end if;

  if not v_needs_check then return new; end if;

  if coalesce(new.ciphertext_size, 0) > v_file_limit then
    raise exception 'FILE_TOO_LARGE';
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_used
  from public.vault_documents
  where user_id = new.user_id and deleted_at is null and id <> new.id;

  if v_used + coalesce(new.ciphertext_size, 0) > v_limit then
    raise exception 'STORAGE_QUOTA_EXCEEDED';
  end if;

  select coalesce(sum(ciphertext_size), 0) into v_global_used
  from public.vault_documents
  where deleted_at is null and id <> new.id;

  if v_global_used + coalesce(new.ciphertext_size, 0) > v_global_limit then
    raise exception 'BETA_CAPACITY_REACHED';
  end if;

  return new;
end;
$$;

update storage.buckets
set file_size_limit = 27262976
where id = 'vault';

comment on function public.plan_storage_limit(text) is 'MasterSafe V7.2.1: 250 MiB por usuário no beta gratuito.';
comment on function public.plan_file_limit(text) is 'MasterSafe V7.2.1: cerca de 26 MiB técnicos por arquivo para suportar 25 MB de arquivo + overhead criptográfico.';
