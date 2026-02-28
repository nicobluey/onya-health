begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'request_status'
      and e.enumlabel = 'awaiting_payment'
  ) then
    alter type public.request_status add value 'awaiting_payment';
  end if;
end
$$;

commit;
