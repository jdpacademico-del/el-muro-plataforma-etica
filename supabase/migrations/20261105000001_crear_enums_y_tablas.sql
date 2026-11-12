-- ==============================================================================
-- MIGRACIÓN 01: ENUMs, Tipos Personalizados y Tablas Principales
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-05
-- ==============================================================================

-- 1. EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ENUMS Y TIPOS PERSONALIZADOS
-- ==============================================================================

-- Estados posibles de una publicación en el ciclo de moderación
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_publicacion') THEN
        CREATE TYPE estado_publicacion AS ENUM (
            'pendiente',
            'publicada',
            'en_revision',
            'oculta',
            'rechazada',
            'expirada'
        );
    END IF;
END $$;

-- Categorías temáticas oficiales de la comunidad estudiantil
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_enum') THEN
        CREATE TYPE categoria_enum AS ENUM (
            'Sugerencias e ideas',
            'Académico',
            'Objetos perdidos',
            'Eventos y actividades',
            'Curiosidades',
            'Emprendimientos y clasificados',
            'Comunidad'
        );
    END IF;
END $$;

-- Tipos de reacciones estándar permitidas
-- ('corazon' => ❤️, 'risas' => 😂, 'idea' => 💡, 'sorpresa' => 😮, 'aplauso' => 🙌, 'triste' => 😢)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_reaccion') THEN
        CREATE TYPE tipo_reaccion AS ENUM (
            'corazon',
            'risas',
            'idea',
            'sorpresa',
            'aplauso',
            'triste'
        );
    END IF;
END $$;

-- ==============================================================================
-- 3. TABLAS PRINCIPALES
-- ==============================================================================

-- 3.1. INSTITUCIONES UNIVERSITARIAS / EDUCATIVAS
CREATE TABLE IF NOT EXISTS instituciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    codigo_acceso VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE instituciones IS 'Instituciones y universidades autorizadas con su código institucional de acceso.';
COMMENT ON COLUMN instituciones.codigo_acceso IS 'Código secreto institucional requerido para que los estudiantes publiquen de forma anónima.';

-- 3.2. PUBLICACIONES
CREATE TABLE IF NOT EXISTS publicaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id UUID NOT NULL REFERENCES instituciones(id) ON DELETE RESTRICT,
    categoria categoria_enum NOT NULL,
    titulo VARCHAR(100) NOT NULL,
    descripcion TEXT,
    imagen_url TEXT,
    etiquetas TEXT[] DEFAULT '{}'::TEXT[],
    visitor_id_hash TEXT NOT NULL,
    estado estado_publicacion NOT NULL DEFAULT 'publicada',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + INTERVAL '48 hours'),
    reportes_count INT NOT NULL DEFAULT 0,

    -- Restricciones de integridad
    CONSTRAINT check_titulo_no_vacio CHECK (length(trim(titulo)) > 0),
    CONSTRAINT check_max_tres_etiquetas CHECK (array_length(etiquetas, 1) IS NULL OR array_length(etiquetas, 1) <= 3),
    CONSTRAINT check_reportes_no_negativos CHECK (reportes_count >= 0)
);

COMMENT ON TABLE publicaciones IS 'Publicaciones efímeras del muro con ciclo de vida de 48 horas y conteo de reportes.';
COMMENT ON COLUMN publicaciones.visitor_id_hash IS 'Hash unidireccional anónimo del visitante para trazabilidad anti-spam sin almacenar datos personales.';
COMMENT ON COLUMN publicaciones.expires_at IS 'Fecha y hora UTC exacta de caducidad automática de la publicación (48h por defecto).';

-- 3.3. REACCIONES
CREATE TABLE IF NOT EXISTS reacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    reaccion tipo_reaccion NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    -- Garantiza una sola reacción activa por visitante en cada publicación
    CONSTRAINT uq_reacciones_publicacion_visitor UNIQUE (publicacion_id, visitor_id)
);

COMMENT ON TABLE reacciones IS 'Reacciones únicas emitidas por cada visitante sobre las publicaciones.';

-- 3.4. REPORTES COMUNITARIOS
CREATE TABLE IF NOT EXISTS reportes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    motivo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    -- Evita reportes duplicados de la misma persona sobre una misma publicación
    CONSTRAINT uq_reportes_publicacion_visitor UNIQUE (publicacion_id, visitor_id),
    CONSTRAINT check_motivo_no_vacio CHECK (length(trim(motivo)) > 0)
);

COMMENT ON TABLE reportes IS 'Reportes ciudadanos enviados por los visitantes para la moderación comunitaria.';

-- 3.5. ANUNCIOS PATROCINADOS
CREATE TABLE IF NOT EXISTS anuncios_patrocinados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(150) NOT NULL,
    imagen_url TEXT,
    enlace_url TEXT,
    fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    fecha_fin TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + INTERVAL '30 days'),
    activo BOOLEAN NOT NULL DEFAULT true,
    verificado_pago BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT check_fechas_anuncio CHECK (fecha_fin > fecha_inicio)
);

COMMENT ON TABLE anuncios_patrocinados IS 'Banners y promociones locales/estudiantiles auditadas y pagadas.';

-- 3.6. HISTORIAL DE MODERACIÓN
CREATE TABLE IF NOT EXISTS historial_moderacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID REFERENCES publicaciones(id) ON DELETE SET NULL,
    moderador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accion_realizada VARCHAR(100) NOT NULL,
    justificacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE historial_moderacion IS 'Bitácora inmutable de auditoría para decisiones tomadas por moderadores o administradores.';

-- ==============================================================================
-- 4. ÍNDICES ESTRATÉGICOS PARA MÁXIMO RENDIMIENTO
-- ==============================================================================

-- Índice parcial de alto rendimiento para el feed activo (excluye publicaciones ocultas o vencidas)
CREATE INDEX IF NOT EXISTS idx_publicaciones_feed_activo 
    ON publicaciones (institucion_id, created_at DESC) 
    WHERE estado = 'publicada';

-- Índice para consultas por fecha de expiración (procesos de limpieza/cron)
CREATE INDEX IF NOT EXISTS idx_publicaciones_expires_at 
    ON publicaciones (expires_at);

-- Índice por categoría
CREATE INDEX IF NOT EXISTS idx_publicaciones_categoria 
    ON publicaciones (categoria);

-- Índice de reacciones por publicación
CREATE INDEX IF NOT EXISTS idx_reacciones_publicacion 
    ON reacciones (publicacion_id);

-- Índice de reportes por publicación
CREATE INDEX IF NOT EXISTS idx_reportes_publicacion 
    ON reportes (publicacion_id);

-- Índice de anuncios vigentes
CREATE INDEX IF NOT EXISTS idx_anuncios_vigentes 
    ON anuncios_patrocinados (fecha_inicio, fecha_fin) 
    WHERE activo = true AND verificado_pago = true;
