-- An instructor's own colour on the page a learner sees (D-210).
--
-- It was sold on the pricing page and existed nowhere, which is how somebody ends up asking where
-- it is. It is one colour rather than a palette: a colour picker with five slots is a way to make
-- a page unreadable in five ways, and one colour is enough to stop a booking page looking like
-- everybody else's.
--
-- The colour has to carry white writing on a button and read as a heading on white, which is the
-- same ratio both ways up, so one rule decides it: at least 4.5 to 1 against white. The same rule
-- runs in the picker, in the Server Action and here, and packages/core/src/colour.ts owns it.

alter table public.businesses
  add column brand_colour text
    constraint businesses_brand_colour_format check (brand_colour is null or brand_colour ~ '^#[0-9A-F]{6}$');

comment on column public.businesses.brand_colour is
  'The Business own colour on its public booking page, as #RRGGBB (D-210). Null is the default black.';

-- ---------------------------------------------------------------------------------------
-- readable_on_white: the same 4.5 to 1 the picker applies, so the database is not the weak one.
--
-- WCAG relative luminance, which is not a thing Postgres has, so it is written out. The three
-- channels are gamma corrected and weighted, and the ratio is against white, whose luminance is 1.
-- ---------------------------------------------------------------------------------------
create or replace function private.readable_on_white(p_colour text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_channels numeric[];
  v_linear numeric[] := array[]::numeric[];
  v_c numeric;
  v_luminance numeric;
begin
  if p_colour is null or p_colour !~ '^#[0-9A-Fa-f]{6}$' then
    return false;
  end if;

  v_channels := array[
    ('x' || substr(p_colour, 2, 2))::bit(8)::integer / 255.0,
    ('x' || substr(p_colour, 4, 2))::bit(8)::integer / 255.0,
    ('x' || substr(p_colour, 6, 2))::bit(8)::integer / 255.0
  ];

  foreach v_c in array v_channels loop
    v_linear := v_linear || case
      when v_c <= 0.03928 then v_c / 12.92
      else power((v_c + 0.055) / 1.055, 2.4)
    end;
  end loop;

  v_luminance := 0.2126 * v_linear[1] + 0.7152 * v_linear[2] + 0.0722 * v_linear[3];
  -- White's luminance is 1, so the ratio is 1.05 over the colour's own.
  return (1.05 / (v_luminance + 0.05)) >= 4.5;
end;
$$;

revoke all on function private.readable_on_white(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- set_brand_colour: the owner picks it, and only on a plan that carries it.
--
-- Which plans carry it lives in packages/config/src/plans.ts as `customBookingColours`, the way
-- every other entitlement does. This mirrors it, because a rule enforced only in TypeScript is a
-- rule anybody with a session can walk around.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_brand_colour(p_business_id uuid, p_colour text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colour text := nullif(upper(btrim(coalesce(p_colour, ''))), '');
  v_plan public.plan_key;
  v_before text;
begin
  if not private.auth_has_permission(p_business_id, 'manage_profile') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select b.plan, b.brand_colour into v_plan, v_before
    from public.businesses b where b.id = p_business_id;
  if v_plan = 'free' then
    raise exception 'PLAN_REQUIRED';
  end if;

  if v_colour is not null then
    if v_colour !~ '^#[0-9A-F]{6}$' then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "colour"}';
    end if;
    if not private.readable_on_white(v_colour) then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "colour", "reason": "contrast"}';
    end if;
  end if;

  update public.businesses set brand_colour = v_colour where id = p_business_id;

  perform private.write_audit('business.colour_set', 'business', p_business_id, p_business_id,
    jsonb_build_object('colour', v_before), jsonb_build_object('colour', v_colour));
  return v_colour;
end;
$$;

revoke all on function public.set_brand_colour(uuid, text) from public, anon;
grant execute on function public.set_brand_colour(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- booking_page, now carrying the colour and the logo.
--
-- The colour is served only while the plan carries it. A Business that drops to Free keeps what it
-- picked, so nothing is lost and picking it again costs nothing, but the page goes back to the
-- default: otherwise "your own colours" is a Pro feature everybody has.
-- ---------------------------------------------------------------------------------------
create or replace function public.booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'instructorId', i.id,
           'name', i.display_name,
           'photoPath', i.photo_path,
           'transmission', i.transmission,
           'car', nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), ''),
           'businessName', b.name,
           'instantBook', i.instant_book,
           'brandColour', case when b.plan <> 'free' then b.brand_colour end,
           'logoUrl', case when b.plan <> 'free' then b.logo_url end,
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'lessonTypeId', p.lesson_type_id,
                          'name', p.name,
                          'durationMinutes', p.duration_minutes,
                          'pricePence', p.price_pence
                        )
                        order by p.duration_minutes, p.name
                      )
                 -- One price for each lesson: the instructor's own where they have one (SCH-04, D-122).
                 from private.effective_lesson_prices(i.id) p
             ),
             '[]'::jsonb
           )
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     -- A link only takes bookings for somebody the platform has actually checked (INS-02),
     -- whose badge is still in date (INS-03), at a Business that is not suspended (ADM-02).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today())
     and b.status <> 'suspended';
$$;

-- The owner reads their own colour back to show it in the picker (D-123 keeps the plan columns
-- private, and this is not one of those: it is what their own page looks like).
grant select (brand_colour) on public.businesses to authenticated;
