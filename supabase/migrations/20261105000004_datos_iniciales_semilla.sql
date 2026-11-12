-- ==============================================================================
-- MIGRACIÓN 04: Datos Semilla Iniciales (Opcional para pruebas y desarrollo)
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-05
-- ==============================================================================

-- Inserción de Instituciones de Prueba
INSERT INTO instituciones (id, nombre, codigo_acceso, activa)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Universidad de Córdoba (Unicórdoba)', 'UNICORDOBA2026', true),
    ('22222222-2222-2222-2222-222222222222', 'Universidad Pontificia Bolivariana (UPB)', 'UPB2026', true),
    ('33333333-3333-3333-3333-333333333333', 'Universidad del Sinú (Unisinú)', 'UNISINU2026', true),
    ('44444444-4444-4444-4444-444444444444', 'Universidad de Antioquia (UdeA)', 'UDEA2026', true),
    ('55555555-5555-5555-5555-555555555555', 'Universidad Nacional de Colombia (UNAL)', 'UNAL2026', true)
ON CONFLICT (codigo_acceso) DO NOTHING;

-- Publicaciones Iniciales de Demostración
INSERT INTO publicaciones (
    id,
    institucion_id,
    categoria,
    titulo,
    descripcion,
    imagen_url,
    etiquetas,
    visitor_id_hash,
    estado,
    created_at,
    expires_at
) VALUES 
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Académico',
        '¿Horario continuado en biblioteca central?',
        '¿Alguien sabe si mañana la biblioteca abre en jornada continua? Necesito entregar la tesis de grado con urgencia.',
        NULL,
        ARRAY['tesis', 'biblioteca'],
        'visitor_seed_hash_01',
        'publicada',
        timezone('utc', now()) - INTERVAL '3 hours',
        timezone('utc', now()) + INTERVAL '45 hours'
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222',
        'Eventos y actividades',
        '¡Felicitaciones a la selección de fútbol!',
        'Un aplauso enorme para la selección del campus por la gran victoria en el torneo interuniversitario.',
        'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80',
        ARRAY['deportes', 'futbol', 'campus'],
        'visitor_seed_hash_02',
        'publicada',
        timezone('utc', now()) - INTERVAL '12 hours',
        timezone('utc', now()) + INTERVAL '36 hours'
    )
ON CONFLICT (id) DO NOTHING;

-- Reacciones de Demostración
INSERT INTO reacciones (publicacion_id, visitor_id, reaccion)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'demo_visitor_1', 'corazon'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'demo_visitor_2', 'idea'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'demo_visitor_1', 'aplauso'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'demo_visitor_3', 'corazon')
ON CONFLICT (publicacion_id, visitor_id) DO NOTHING;
