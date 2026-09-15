-- The skill map lesson records are written against (PRG-02, PRD Appendix A, M4-01).
--
-- Reference data, as postcodes are: anybody may read it, and only migrations write it. The areas
-- follow the DVSA driving test report, in its order. packages/core/src/skills.ts holds the same
-- list for the app, and a test on each side pins both to Appendix A.

create table public.skills (
  code text primary key check (code ~ '^[A-Z][A-Z-]{1,11}$'),
  position smallint not null unique check (position between 1 and 99),
  name text not null unique check (char_length(name) between 1 and 80),
  -- What the area covers. A lesson record rates the area as a whole.
  sub_skills text[] not null default '{}'
);

comment on table public.skills is
  'Reference data: the DVSA-aligned skill areas from PRD Appendix A (PRG-02). Written by migrations only.';

alter table public.skills enable row level security;

grant select on public.skills to anon, authenticated;
create policy skills_select_all on public.skills for select to anon, authenticated using (true);

insert into public.skills (code, position, name, sub_skills) values
  ('CTRL', 1, 'Controls', array['Accelerator', 'Clutch', 'Gears', 'Footbrake', 'Parking brake', 'Steering', 'Ancillary controls']),
  ('COCKPIT', 2, 'Cockpit checks and Show me Tell me', array['Seat', 'Mirrors', 'Doors', 'Seatbelt', 'Vehicle safety questions']),
  ('MOVEOFF', 3, 'Moving off', array['Safely', 'Under control', 'On a hill', 'At an angle']),
  ('MIRRORS', 4, 'Use of mirrors', array['Signalling', 'Change direction', 'Change speed']),
  ('SIGNALS', 5, 'Signals', array['Necessary', 'Correctly', 'Timed']),
  ('CLEAR', 6, 'Clearance to obstructions', '{}'),
  ('RESPONSE', 7, 'Response to signs and signals', array['Traffic signs', 'Road markings', 'Traffic lights', 'Traffic controllers', 'Other road users']),
  ('SPEED', 8, 'Use of speed', '{}'),
  ('FOLLOW', 9, 'Following distance', '{}'),
  ('PROGRESS', 10, 'Progress', array['Appropriate speed', 'Undue hesitation']),
  ('JUNCTIONS', 11, 'Junctions', array['Approach speed', 'Observation', 'Turning right', 'Turning left', 'Cutting corners']),
  ('ROUNDABOUT', 12, 'Roundabouts', array['Approach', 'Lane choice', 'Signals', 'Exit']),
  ('JUDGEMENT', 13, 'Judgement', array['Overtaking', 'Meeting', 'Crossing']),
  ('POSITION', 14, 'Positioning', array['Normal driving', 'Lane discipline']),
  ('PEDX', 15, 'Pedestrian crossings', '{}'),
  ('STOPS', 16, 'Position for normal stops', '{}'),
  ('AWARE', 17, 'Awareness and planning', array['Hazard perception', 'Anticipation']),
  ('E-STOP', 18, 'Emergency stop', '{}'),
  ('MANOEUVRE', 19, 'Manoeuvres', array['Parallel park', 'Bay park forward', 'Bay park reverse', 'Pull up on right and reverse']),
  ('DUALCW', 20, 'Dual carriageways and fast roads', array['Joining', 'Lane changes', 'Leaving']),
  ('RURAL', 21, 'Rural roads', array['Bends', 'Narrow roads', 'Passing places']),
  ('INDEP', 22, 'Independent driving', array['Following sat nav', 'Following signs']),
  ('ECO', 23, 'Eco-safe driving', array['Planning', 'Control']);
