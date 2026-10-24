-- =====================================================================
-- Prophone Béziers — sample data. Run AFTER schema.sql.
-- Prices are plausible market placeholders: the owner edits them in /admin.
-- Re-runnable: existing rows are left untouched.
-- =====================================================================

insert into public.brands (name, sort_order) values
  ('Apple', 1), ('Samsung', 2), ('Xiaomi', 3), ('Huawei', 4),
  ('Google Pixel', 5), ('Oppo', 6), ('OnePlus', 7)
on conflict (name) do nothing;

insert into public.repair_types (name_fr, name_en, icon, sort_order) values
  ('Remplacement écran',     'Screen replacement',   'screen',  1),
  ('Remplacement batterie',  'Battery replacement',  'battery', 2),
  ('Connecteur de charge',   'Charging port',        'plug',    3),
  ('Vitre arrière',          'Back glass',           'back',    4),
  ('Appareil photo',         'Camera',               'camera',  5),
  ('Dégât des eaux',         'Water damage',         'drop',    6),
  ('Problème logiciel',      'Software issue',       'code',    7)
on conflict (name_fr) do nothing;

-- Models ---------------------------------------------------------------
with m(brand, name, ord) as (values
  ('Apple','iPhone 15 Pro',1), ('Apple','iPhone 15',2), ('Apple','iPhone 14',3),
  ('Apple','iPhone 13',4), ('Apple','iPhone 12',5), ('Apple','iPhone 11',6),
  ('Samsung','Galaxy S24',1), ('Samsung','Galaxy S23',2), ('Samsung','Galaxy A54',3),
  ('Samsung','Galaxy A34',4),
  ('Xiaomi','Redmi Note 13',1), ('Xiaomi','Xiaomi 13T',2),
  ('Huawei','P30 Pro',1),
  ('Google Pixel','Pixel 8',1), ('Google Pixel','Pixel 7',2),
  ('Oppo','Reno 10',1),
  ('OnePlus','OnePlus 11',1)
)
insert into public.models (brand_id, name, sort_order)
select b.id, m.name, m.ord from m join public.brands b on b.name = m.brand
on conflict (brand_id, name) do nothing;

-- Prices: base values per model, adjusted per repair type -------------------
-- columns: model, screen, battery, charging port, back glass, camera, water, software
with p(model, screen, battery, port, back, camera, water, soft) as (values
  ('iPhone 15 Pro', 279, 119, 99, 149, 139, 89, 39),
  ('iPhone 15',     229, 109, 89, 139, 129, 89, 39),
  ('iPhone 14',     189,  99, 85, 129, 119, 79, 39),
  ('iPhone 13',     149,  79, 75, 109,  99, 79, 35),
  ('iPhone 12',     129,  69, 69,  99,  89, 69, 35),
  ('iPhone 11',      99,  59, 65,  79,  79, 69, 35),
  ('Galaxy S24',    249, 119, 89, 129, 129, 89, 39),
  ('Galaxy S23',    199,  99, 85, 119, 119, 79, 39),
  ('Galaxy A54',    119,  59, 59,  69,  79, 69, 35),
  ('Galaxy A34',     99,  55, 55,  59,  69, 59, 35),
  ('Redmi Note 13',  79,  45, 49,  49,  59, 59, 30),
  ('Xiaomi 13T',    139,  69, 65,  79,  89, 69, 35),
  ('P30 Pro',       129,  59, 59,  79,  89, 69, 35),
  ('Pixel 8',       189,  89, 79, 109, 109, 79, 39),
  ('Pixel 7',       149,  79, 69,  99,  99, 69, 35),
  ('Reno 10',       119,  59, 59,  69,  79, 59, 35),
  ('OnePlus 11',    169,  79, 69,  99,  99, 69, 35)
), unpivot as (
  select model, 'Remplacement écran' as rt, screen as price, 45 as mins from p
  union all select model, 'Remplacement batterie', battery, 30 from p
  union all select model, 'Connecteur de charge',  port,    60 from p
  union all select model, 'Vitre arrière',         back,    90 from p
  union all select model, 'Appareil photo',        camera,  60 from p
  union all select model, 'Dégât des eaux',        water,  1440 from p
  union all select model, 'Problème logiciel',     soft,    45 from p
)
insert into public.prices (model_id, repair_type_id, price, est_time_minutes, is_available)
select mo.id, r.id, u.price, u.mins, true
from unpivot u
join public.models mo on mo.name = u.model
join public.repair_types r on r.name_fr = u.rt
on conflict (model_id, repair_type_id) do nothing;

-- Site settings -----------------------------------------------------------
insert into public.site_settings (key, value) values
('shop', '{
  "phone": "+33 7 74 00 00 74",
  "whatsapp": "33774000074",
  "email": "",
  "address": "11 Av. Maréchal Foch, 34500 Béziers",
  "facebook": "https://www.facebook.com/",
  "google_review_url": "https://www.google.com/maps/search/?api=1&query=Prophone+B%C3%A9ziers+11+Av.+Mar%C3%A9chal+Foch+34500+B%C3%A9ziers",
  "hours": {
    "mon": [["14:00","19:00"]],
    "tue": [["10:00","19:00"]],
    "wed": [["10:00","19:00"]],
    "thu": [["10:00","19:00"]],
    "fri": [["10:00","19:00"]],
    "sat": [["10:00","19:00"]],
    "sun": []
  }
}'::jsonb),
('promo', '{"enabled": false, "text_fr": "", "text_en": "", "link": ""}'::jsonb)
on conflict (key) do nothing;
