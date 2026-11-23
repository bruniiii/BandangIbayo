-- ═════════════════════════════════════════════
-- 3_suppliers_drivers.sql — SAMPLE SUPPLIERS, DRIVERS, VANS,
-- DESTINATIONS AND PICKUP POINTS (System Maintenance → Trips)
--
-- Adds only what isn't there yet (same name = skipped), so it's safe to run
-- more than once and keeps anything you added yourself.
-- If the symposium tours are there (2_symposium_data.sql), it also links
-- them: each tour gets a saved driver and van, each expense line its
-- supplier, and joiners of the finished trips rate the suppliers.
-- 2_symposium_data.sql already does all this. Use this file only if you
-- ran an older 2_symposium_data.sql (or want the samples without the demo).
-- ═════════════════════════════════════════════

begin;

do $$
declare
  v_tables text[] := array['suppliers', 'fleet_drivers', 'fleet_vans', 'destinations', 'pickup_spots', 'tour_vehicles', 'tour_expense_lines', 'inclusion_ratings'];
  v_tbl text;
  d uuid[];
  v uuid[];
  r record;
  i int := 0;
begin
  -- The database's own checks for people using the website stay off while this runs.
  foreach v_tbl in array v_tables loop
    if to_regclass('public.' || v_tbl) is not null then
      execute format('alter table public.%I disable trigger user', v_tbl);
    end if;
  end loop;

  -- ── Destinations ──
  insert into public.destinations (name, region)
  select x.n, x.r from (values
    ('Kabayan, Benguet', 'CAR (Cordillera)'), ('Itogon, Benguet', 'CAR (Cordillera)'), ('Sagada, Mountain Province', 'CAR (Cordillera)'),
    ('Basco, Batanes', 'Cagayan Valley'), ('Baler, Aurora', 'Central Luzon'), ('San Antonio, Zambales', 'Central Luzon'),
    ('Capas, Tarlac', 'Central Luzon'), ('El Nido, Palawan', 'MIMAROPA'), ('Coron, Palawan', 'MIMAROPA'),
    ('General Luna, Siargao', 'Caraga'), ('Tagaytay, Cavite', 'CALABARZON'), ('San Juan, La Union', 'Ilocos Region')) as x(n, r)
  where not exists (select 1 from public.destinations y where lower(y.name) = lower(x.n));

  -- ── Pickup points ──
  insert into public.pickup_spots (name, address, lat, lng)
  select x.n, x.a, x.la, x.lo from (values
    ('Cubao (Araneta City Bus Port)', 'Araneta City, Cubao, Quezon City', 14.6197, 121.0537),
    ('SM North EDSA (The Block entrance)', 'North Ave. cor. EDSA, Quezon City', 14.6566, 121.0305),
    ('Petron NLEX Balintawak', 'NLEX Balintawak, Quezon City', 14.6612, 121.0013),
    ('Petron SCTEX Dinalupihan', 'SCTEX, Dinalupihan, Bataan', 14.8790, 120.4650),
    ('Malolos Crossing (Jollibee)', 'MacArthur Hwy, Malolos, Bulacan', 14.8436, 120.8114),
    ('Makati (Greenbelt 3)', 'Esperanza St., Makati City', 14.5528, 121.0210)) as x(n, a, la, lo)
  where not exists (select 1 from public.pickup_spots y where lower(y.name) = lower(x.n));

  -- ── Drivers ──
  insert into public.fleet_drivers (name, contact)
  select x.n, x.c from (values ('Ramon Castillo', '09171234567'), ('Eduardo "Edong" Pascual', '09181239876'), ('Noel Villareal', '09221237788')) as x(n, c)
  where not exists (select 1 from public.fleet_drivers y where lower(y.name) = lower(x.n));

  -- ── Vans ──
  insert into public.fleet_vans (car_type, plate_number, color, notes, seats)
  select x.t, x.p, x.c, x.n, x.s from (values
    ('Toyota Hiace Grandia', 'NCA 4821', 'Pearl White', 'Blue "Bandang IBAYO" sticker on the windshield', 14),
    ('Nissan Urvan NV350', 'NBQ 7312', 'Silver', 'Roof rack for bags', 15),
    ('Toyota Hiace Commuter', 'DAB 2290', 'White', 'Orange curtains', 14)) as x(t, p, c, n, s)
  where not exists (select 1 from public.fleet_vans y where upper(replace(y.plate_number, ' ', '')) = upper(replace(x.p, ' ', '')));

  -- ── Suppliers ──
  insert into public.suppliers (name, supplier_type, inclusion_name, contact_person, contact_number, destinations, default_rate, rate_basis, notes)
  select x.* from (values
    ('JM Van Rentals', 'van_rental', 'Round-trip van with driver', 'Jojo Manalo', '09171112233',
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'Baler, Aurora', 'San Antonio, Zambales', 'Capas, Tarlac', 'Tagaytay, Cavite', 'San Juan, La Union'], 9000::numeric, 'per_trip', 'Includes fuel, tolls and driver''s meals. Book 2 weeks ahead.'),
    ('Island Airport Shuttles', 'van_rental', 'Airport transfers', 'Lito Ramos', '09281114455',
       array['Basco, Batanes', 'El Nido, Palawan', 'Coron, Palawan', 'General Luna, Siargao'], 6000, 'per_trip', 'Partner vans at the airport for the island trips.'),
    ('Kabayan Mountain Guides', 'tour_guide', 'Local mountain guide', 'Jun Bayangan', '09191234455', array['Kabayan, Benguet'], 1000, 'per_trip', 'DENR-accredited. 1 guide per 7 hikers.'),
    ('Sagada Genuine Guides Association', 'tour_guide', 'Local tour guide', 'Manang Cora Dao-ey', '09201239911', array['Sagada, Mountain Province'], 1000, 'per_trip', 'Cave connection guides included.'),
    ('Ampucao Trail Guides', 'tour_guide', 'Local trail guide', 'Ben Tayaban', '09211230022', array['Itogon, Benguet'], 1000, 'per_trip', null),
    ('Island Hopping Guides PH', 'tour_guide', 'Local island guide', 'Rex Dumlao', '09231236677',
       array['Basco, Batanes', 'El Nido, Palawan', 'Coron, Palawan', 'General Luna, Siargao', 'San Antonio, Zambales', 'Baler, Aurora', 'Capas, Tarlac'], 1000, 'per_trip', null),
    ('Pundaquit Boatmen Association', 'boat', 'Boat transfers', 'Mang Tonyo Ladia', '09241237788', array['San Antonio, Zambales'], 3000, 'per_trip', 'Anawangin and Capones in one trip.'),
    ('El Nido Island Tours Co.', 'boat', 'Island hopping boat', 'Grace Abrina', '09251238899', array['El Nido, Palawan', 'Coron, Palawan'], 3000, 'per_trip', 'Lunch on board included.'),
    ('Siargao Island Boats', 'boat', 'Island hopping boat', 'Dodong Galarpe', '09261239900', array['General Luna, Siargao'], 3000, 'per_trip', null),
    ('Ganduyan Inn', 'accommodation', 'Inn accommodation', 'Ate Lyn', '09271230011', array['Sagada, Mountain Province'], 450, 'per_person', 'Hot shower, 4 per room.'),
    ('Ivatan Homestay', 'accommodation', 'Homestay', 'Nanay Rosa Agcaoili', '09281230022', array['Basco, Batanes'], 450, 'per_person', 'Traditional stone house.'),
    ('Lagoon Breeze Inn', 'accommodation', 'Beach-side inn', 'Mark Villaflor', '09291230033',
       array['El Nido, Palawan', 'Coron, Palawan', 'General Luna, Siargao', 'Baler, Aurora'], 450, 'per_person', null),
    ('Anawangin Campsite', 'accommodation', 'Tent and campsite', 'Kuya Ben', '09301230044', array['San Antonio, Zambales', 'Kabayan, Benguet'], 450, 'per_person', 'Tents for 2, sleeping mats included.'),
    ('Lola Ising''s Kitchen', 'food', 'Meals', 'Lola Ising', '09311230055',
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'San Antonio, Zambales', 'Capas, Tarlac', 'Baler, Aurora'], 250, 'per_person', 'Packed meals for hikes; vegetarian on request.'),
    ('Batanes Seafood Grill', 'food', 'Meals', 'Joel Hidalgo', '09321230066',
       array['Basco, Batanes', 'El Nido, Palawan', 'Coron, Palawan', 'General Luna, Siargao'], 250, 'per_person', null),
    ('Protected Area & Tourism Fees', 'attraction', 'Entrance & environmental fees', null, null,
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'Basco, Batanes', 'El Nido, Palawan', 'Coron, Palawan', 'General Luna, Siargao', 'San Antonio, Zambales', 'Capas, Tarlac', 'Baler, Aurora'], 250, 'per_person', 'Paid at the registration area.')
  ) as x(name, supplier_type, inclusion_name, contact_person, contact_number, destinations, default_rate, rate_basis, notes)
  where not exists (select 1 from public.suppliers y where lower(y.name) = lower(x.name));

  -- ── Link the symposium tours (when they're there) ──
  select array_agg(id order by array_position(array['Ramon Castillo', 'Eduardo "Edong" Pascual', 'Noel Villareal'], name)) into d
    from public.fleet_drivers where name in ('Ramon Castillo', 'Eduardo "Edong" Pascual', 'Noel Villareal');
  select array_agg(id order by array_position(array['NCA 4821', 'NBQ 7312', 'DAB 2290'], plate_number)) into v
    from public.fleet_vans where plate_number in ('NCA 4821', 'NBQ 7312', 'DAB 2290');
  for r in select id, title from public.tours order by start_date loop
    i := i + 1;
    update public.tour_vehicles tv
       set driver_id = fd.id, driver_name = fd.name, driver_contact = fd.contact,
           van_id = fv.id, car_type = fv.car_type, plate_number = fv.plate_number, vehicle_color = fv.color, vehicle_notes = fv.notes, updated_at = now()
      from public.fleet_drivers fd, public.fleet_vans fv
     where tv.tour_id = r.id
       and fd.id = d[case when r.title like 'Anawangin%' then 1 else 1 + (i % 3) end]
       and fv.id = v[case when r.title like 'Anawangin%' then 1 else 1 + (i % 3) end];
  end loop;

  -- Each expense line → the supplier of that kind that goes to the tour's destination.
  update public.tour_expense_lines l
     set supplier_id = (select s.id from public.suppliers s
                         where s.is_active and s.supplier_type = l.category and t.destination = any(s.destinations)
                         order by s.created_at, s.name limit 1),
         updated_at = now()
    from public.tours t
   where t.id = l.tour_id and l.supplier_id is null and l.category <> 'bag_tag'
     and exists (select 1 from public.suppliers s where s.is_active and s.supplier_type = l.category and t.destination = any(s.destinations));

  -- Joiners of the finished trips rate the suppliers (4 or 5 stars).
  if to_regclass('public.inclusion_ratings') is not null then
    insert into public.inclusion_ratings (tour_id, line_id, supplier_id, user_id, rating, created_at)
    select distinct on (b.user_id, l.tour_id, l.supplier_id)
           l.tour_id, l.id, l.supplier_id, b.user_id, case when abs(hashtext(b.user_id::text || l.id::text)) % 4 = 0 then 4 else 5 end,
           (t.end_date::timestamp + time '21:00') at time zone 'Asia/Manila' + interval '2 days'
      from public.tour_expense_lines l
      join public.tours t on t.id = l.tour_id
      join public.bookings b on b.tour_id = l.tour_id and b.checked_out_at is not null and b.user_id is not null
     where l.supplier_id is not null and t.end_date < (now() at time zone 'Asia/Manila')::date
       and not exists (select 1 from public.inclusion_ratings x where x.user_id = b.user_id and x.tour_id = l.tour_id and x.supplier_id = l.supplier_id)
     order by b.user_id, l.tour_id, l.supplier_id, l.sort_order;
  end if;

  foreach v_tbl in array v_tables loop
    if to_regclass('public.' || v_tbl) is not null then
      execute format('alter table public.%I enable trigger user', v_tbl);
    end if;
  end loop;

  raise notice 'Done: % suppliers, % drivers, % vans, % destinations, % pickup points. Tours linked: %.',
    (select count(*) from public.suppliers), (select count(*) from public.fleet_drivers), (select count(*) from public.fleet_vans),
    (select count(*) from public.destinations), (select count(*) from public.pickup_spots), (select count(*) from public.tours);
end $$;

commit;
