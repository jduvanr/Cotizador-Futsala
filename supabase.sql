-- Ejecuta esto en Supabase: SQL Editor > New query > Run
create table if not exists public.cotizaciones (
  id                uuid primary key,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now(),
  evento            text not null,
  organizador       text not null,
  telefono          text not null,
  fecha             date not null,
  lugar             text not null,
  deporte           text not null default 'Fútbol de salón',
  partidos          text not null,
  camaras           text not null,
  sin_servicios     text not null default '',
  valor_base        numeric not null,
  valor_cotizado    numeric not null,
  siguio_redes      boolean not null default false,
  valor_final       numeric not null,
  contacto_whatsapp boolean not null default false,
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo','contactado','negociando','cerrado','perdido')),
  notas             text not null default ''
);

create index if not exists cotizaciones_creado_idx on public.cotizaciones (creado desc);
create index if not exists cotizaciones_estado_idx on public.cotizaciones (estado);

-- Si ya habías creado la tabla antes, ejecuta solo esta línea para agregar la columna nueva:
alter table public.cotizaciones add column if not exists deporte text not null default 'Fútbol de salón';

-- Seguridad: con RLS activo y SIN políticas, la clave pública (anon) no puede leer ni escribir.
-- Solo el servidor, con la service_role key, accede a la tabla.
alter table public.cotizaciones enable row level security;
