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
  left join public.orderfly_customer_sync_jobs existing_job
    on existing_job.booking_id = b.id
  where b.organization_id = p_organization_id
    and l.booking_id is null
    and (
      coalesce(btrim(coalesce(b.guest_email, '')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$', false)
      or coalesce(
        char_length(btrim(coalesce(b.guest_phone, ''))) <= 80
        and btrim(coalesce(b.guest_phone, '')) ~ '^\+?[0-9[:space:]()./-]+$'
        and char_length(regexp_replace(
          case
            when btrim(coalesce(b.guest_phone, '')) like '00%'
              then substring(btrim(coalesce(b.guest_phone, '')) from 3)
            else btrim(coalesce(b.guest_phone, ''))
          end,
          '[^0-9]', '', 'g'
        )) between 7 and 15,
        false
      )
    )
    and (
      existing_job.booking_id is null
      or (
        existing_job.organization_id = b.organization_id
        and existing_job.location_id = b.location_id
        and existing_job.status = 'skipped'
        and existing_job.last_error in (
          'Booking has no valid guest email for consumer identity resolution.',
          'Booking has no valid email or phone for consumer identity resolution.'
        )
      )
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
      and current_job.organization_id = excluded.organization_id
      and current_job.location_id = excluded.location_id
      and current_job.last_error in (
        'Booking has no valid guest email for consumer identity resolution.',
        'Booking has no valid email or phone for consumer identity resolution.'
      );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

revoke all on function public.orderfly_backfill_booking_customer_sync(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.orderfly_backfill_booking_customer_sync(uuid, timestamptz, integer)
  to service_role;
