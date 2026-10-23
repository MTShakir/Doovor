-- A name with accents keeps its letters in a link (PUB-01, PUB-02, D-375).
begin;
select plan(9);

select is(private.slugify('Sinéad''s Driving & Co'), 'sineads-driving-co', 'an accent loses its mark, and an apostrophe leaves no gap');
select is(private.slugify('Siân Ní Mháille'), 'sian-ni-mhaille', 'Welsh and Irish names keep their letters');
select is(private.slugify('Zoë D’Arcy-Smith'), 'zoe-darcy-smith', 'a curly apostrophe goes too, and a hyphen stays one');
select is(private.slugify('Gwŷr Dŵr'), 'gwyr-dwr', 'a Welsh circumflex on w and y');
select is(private.slugify('Æthelflæd Straße'), 'aethelflaed-strasse', 'æ and ß are written out');
select is(private.slugify('Łukasz Wiśniewski'), 'lukasz-wisniewski', 'and a Polish name');
select is(private.slugify('Quayside Driving School'), 'quayside-driving-school', 'a plain name is as it was');
select is(private.slugify('🚗'), 'n', 'a name with no letters still gets an address');

-- A new Business is given the address its name reads as.
select is(
  private.unique_slug('Sinéad''s Driving & Co', 'businesses'),
  'sineads-driving-co',
  'and that is the address a new Business is offered'
);

select * from finish();
rollback;
