create or replace function public.orderfly_backfill_booking_customer_sync(
  p_organization_id uuid,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  inserted_count integer := 0;
begin
  insert into public.orderfly_customer_sync_jobs as current_job (
    booking_id,
    organization_id,
    location_id,
    status,
    next_attempt_at
  )
  select
    b.id,
    b.organization_id,
    b.location_id,
    'pending',
    now()
  from public.bookings b
  join public.orderfly_organization_mappings om
    on om.organization_id = b.organization_id
   and om.is_active = true
  join public.orderfly_location_mappings lm
    on lm.organization_id = b.organization_id
   and lm.restaurant_location_id = b.location_id
   and lm.is_active = true
  left join public.booking_consumer_customer_links l
    on l.booking_id = b.id
  where b.organization_id = p_organization_id
    and l.booking_id is null
    and (
      nullif(btrim(b.guest_email), '') is not null
      or nullif(regexp_replace(coalesce(b.guest_phone, ''), '[^0-9]', '', 'g'), '') is not null
    )
    and (p_since is null or b.created_at >= p_since)
  order by b.created_at asc
  limit greatest(1, least(coalesce(p_limit, 500), 5000))
  on conflict (booking_id) do update
    set status = 'pending',
        attempt_count = 0,
        next_attempt_at = now(),
        last_http_status = null,
        last_error = null,
        updated_at = now()
    where current_job.status = 'skipped'
      and current_job.last_error = 'Booking has no valid guest email for consumer identity resolution.';

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

revoke all on function public.orderfly_backfill_booking_customer_sync(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.orderfly_backfill_booking_customer_sync(uuid, timestamptz, integer)
  to service_role;
