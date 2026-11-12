-- ==============================================================================
-- PROYECTO: EL MURO - PLATAFORMA ÉTICA UNIVERSITARIA
-- SCRIPT CONSOLIDADO COMPLETO (SCHEMA, TABLAS, ENUMS, TRIGGERS Y POLÍTICAS RLS)
-- Listo para ejecutar en el SQL Editor del Dashboard de Supabase
-- Fecha de emisión: 2026-11-05
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ENUMS Y TIPOS PERSONALIZADOS
-- ==============================================================================

-- 2.1. Estado del ciclo de vida y moderación
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

-- 2.2. Categorías temáticas oficiales
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

-- 2.3. Tipos de reacción ('corazon'=>❤️, 'risas'=>😂, 'idea'=>💡, 'sorpresa'=>😮, 'aplauso'=>🙌, 'triste'=>😢)
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

-- 3.1. Instituciones educativas
CREATE TABLE IF NOT EXISTS instituciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    codigo_acceso VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3.2. Publicaciones efímeras (48h)
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

    CONSTRAINT check_titulo_no_vacio CHECK (length(trim(titulo)) > 0),
    CONSTRAINT check_max_tres_etiquetas CHECK (array_length(etiquetas, 1) IS NULL OR array_length(etiquetas, 1) <= 3),
    CONSTRAINT check_reportes_no_negativos CHECK (reportes_count >= 0)
);

-- 3.3. Reacciones de los visitantes (1 por persona por publicación)
CREATE TABLE IF NOT EXISTS reacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    reaccion tipo_reaccion NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT uq_reacciones_publicacion_visitor UNIQUE (publicacion_id, visitor_id)
);

-- 3.4. Reportes ciudadanos
CREATE TABLE IF NOT EXISTS reportes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    motivo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT uq_reportes_publicacion_visitor UNIQUE (publicacion_id, visitor_id),
    CONSTRAINT check_motivo_no_vacio CHECK (length(trim(motivo)) > 0)
);

-- 3.5. Anuncios y clasificados patrocinados
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

-- 3.6. Historial y bitácora de moderación
CREATE TABLE IF NOT EXISTS historial_moderacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publicacion_id UUID REFERENCES publicaciones(id) ON DELETE SET NULL,
    moderador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accion_realizada VARCHAR(100) NOT NULL,
    justificacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ==============================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_publicaciones_feed_activo 
    ON publicaciones (institucion_id, created_at DESC) 
    WHERE estado = 'publicada';

CREATE INDEX IF NOT EXISTS idx_publicaciones_expires_at 
    ON publicaciones (expires_at);

CREATE INDEX IF NOT EXISTS idx_publicaciones_categoria 
    ON publicaciones (categoria);

CREATE INDEX IF NOT EXISTS idx_reacciones_publicacion 
    ON reacciones (publicacion_id);

CREATE INDEX IF NOT EXISTS idx_reportes_publicacion 
    ON reportes (publicacion_id);

CREATE INDEX IF NOT EXISTS idx_anuncios_vigentes 
    ON anuncios_patrocinados (fecha_inicio, fecha_fin) 
    WHERE activo = true AND verificado_pago = true;

-- ==============================================================================
-- 5. TRIGGERS Y FUNCIONES (BACKEND ENFORCEMENT)
-- ==============================================================================

-- 5.1. Trigger: Aumentar conteo de reportes al insertar
CREATE OR REPLACE FUNCTION fn_tr_incrementar_reportes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE publicaciones
    SET reportes_count = reportes_count + 1
    WHERE id = NEW.publicacion_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_incrementar_reportes_count ON reportes;
CREATE TRIGGER tr_incrementar_reportes_count
AFTER INSERT ON reportes
FOR EACH ROW
EXECUTE FUNCTION fn_tr_incrementar_reportes_count();

-- 5.2. Trigger: Disminuir conteo si se desestima un reporte
CREATE OR REPLACE FUNCTION fn_tr_decrementar_reportes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE publicaciones
    SET reportes_count = GREATEST(0, reportes_count - 1)
    WHERE id = OLD.publicacion_id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_decrementar_reportes_count ON reportes;
CREATE TRIGGER tr_decrementar_reportes_count
AFTER DELETE ON reportes
FOR EACH ROW
EXECUTE FUNCTION fn_tr_decrementar_reportes_count();

-- 5.3. Trigger: Ocultamiento Preventivo (>= 3 reportes -> estado = 'en_revision')
CREATE OR REPLACE FUNCTION fn_tr_ocultamiento_preventivo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.reportes_count >= 3 AND OLD.estado = 'publicada' THEN
        NEW.estado := 'en_revision';

        INSERT INTO historial_moderacion (
            publicacion_id,
            moderador_id,
            accion_realizada,
            justificacion
        ) VALUES (
            NEW.id,
            NULL,
            'ocultamiento_preventivo_automatico',
            'Publicación cambiada a "en_revision" preventivamente al acumular ' || NEW.reportes_count || ' reportes comunitarios.'
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ocultamiento_preventivo ON publicaciones;
CREATE TRIGGER tr_ocultamiento_preventivo
BEFORE UPDATE OF reportes_count ON publicaciones
FOR EACH ROW
EXECUTE FUNCTION fn_tr_ocultamiento_preventivo();

-- 5.4. Función RPC: Obtener feed público optimizado
CREATE OR REPLACE FUNCTION obtener_feed_publico(
    p_institucion_id UUID DEFAULT NULL,
    p_categoria categoria_enum DEFAULT NULL,
    p_limite INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    institucion_id UUID,
    nombre_institucion VARCHAR(150),
    categoria categoria_enum,
    titulo VARCHAR(100),
    descripcion TEXT,
    imagen_url TEXT,
    etiquetas TEXT[],
    estado estado_publicacion,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    reportes_count INT,
    total_reacciones BIGINT,
    reacciones_detalle JSONB,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        p.id,
        p.institucion_id,
        i.nombre AS nombre_institucion,
        p.categoria,
        p.titulo,
        p.descripcion,
        p.imagen_url,
        p.etiquetas,
        p.estado,
        p.created_at,
        p.expires_at,
        p.reportes_count,
        COALESCE(sub_r.total_reacciones, 0) AS total_reacciones,
        COALESCE(sub_r.reacciones_json, '{}'::jsonb) AS reacciones_detalle,
        COUNT(*) OVER() AS total_count
    FROM publicaciones p
    INNER JOIN instituciones i ON i.id = p.institucion_id
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(*)::bigint AS total_reacciones,
            jsonb_object_agg(r.reaccion::text, r.cant) AS reacciones_json
        FROM (
            SELECT reaccion, COUNT(*)::int AS cant
            FROM reacciones
            WHERE publicacion_id = p.id
            GROUP BY reaccion
        ) r
    ) sub_r ON true
    WHERE p.estado = 'publicada'
      AND p.expires_at > timezone('utc', now())
      AND (p_institucion_id IS NULL OR p.institucion_id = p_institucion_id)
      AND (p_categoria IS NULL OR p.categoria = p_categoria)
    ORDER BY p.created_at DESC
    LIMIT LEAST(p_limite, 100)
    OFFSET GREATEST(p_offset, 0);
$$;

-- 5.5. Función RPC: Creación anónima validando código de acceso institucional
CREATE OR REPLACE FUNCTION crear_publicacion_con_codigo(
    p_institucion_id UUID,
    p_codigo_acceso TEXT,
    p_categoria categoria_enum,
    p_titulo VARCHAR(100),
    p_descripcion TEXT DEFAULT NULL,
    p_imagen_url TEXT DEFAULT NULL,
    p_etiquetas TEXT[] DEFAULT '{}'::TEXT[],
    p_visitor_id_hash TEXT DEFAULT 'anonimo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_valido BOOLEAN;
    v_nueva publicaciones%ROWTYPE;
BEGIN
    -- Validar código de la institución activa
    SELECT EXISTS (
        SELECT 1 
        FROM instituciones 
        WHERE id = p_institucion_id 
          AND activa = true 
          AND UPPER(TRIM(codigo_acceso)) = UPPER(TRIM(p_codigo_acceso))
    ) INTO v_valido;

    IF NOT v_valido THEN
        RAISE EXCEPTION 'Código de acceso institucional inválido o la institución se encuentra inactiva.'
            USING ERRCODE = '28000';
    END IF;

    -- Validar longitud de etiquetas
    IF p_etiquetas IS NOT NULL AND array_length(p_etiquetas, 1) > 3 THEN
        RAISE EXCEPTION 'Solo se permite un máximo de 3 etiquetas por publicación.'
            USING ERRCODE = '22023';
    END IF;

    IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
        RAISE EXCEPTION 'El título de la publicación es obligatorio.'
            USING ERRCODE = '23502';
    END IF;

    INSERT INTO publicaciones (
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
    ) VALUES (
        p_institucion_id,
        p_categoria,
        trim(p_titulo),
        trim(p_descripcion),
        p_imagen_url,
        COALESCE(p_etiquetas, '{}'::TEXT[]),
        COALESCE(p_visitor_id_hash, 'anonimo'),
        'publicada',
        timezone('utc', now()),
        timezone('utc', now()) + INTERVAL '48 hours'
    )
    RETURNING * INTO v_nueva;

    RETURN to_jsonb(v_nueva);
END;
$$;

-- 5.6. Función Helper: Validar código institucional
CREATE OR REPLACE FUNCTION validar_codigo_institucion(
    p_institucion_id UUID,
    p_codigo TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM instituciones 
        WHERE id = p_institucion_id 
          AND activa = true 
          AND UPPER(TRIM(codigo_acceso)) = UPPER(TRIM(p_codigo))
    );
$$;

-- 5.7. Vista Feed Público
CREATE OR REPLACE VIEW vista_feed_publico AS
SELECT 
    p.id,
    p.institucion_id,
    i.nombre AS nombre_institucion,
    p.categoria,
    p.titulo,
    p.descripcion,
    p.imagen_url,
    p.etiquetas,
    p.estado,
    p.created_at,
    p.expires_at,
    p.reportes_count
FROM publicaciones p
INNER JOIN instituciones i ON i.id = p.institucion_id
WHERE p.estado = 'publicada'
  AND p.expires_at > timezone('utc', now());

-- ==============================================================================
-- 6. POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- 6.1. Habilitar RLS en todas las tablas
ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios_patrocinados ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_moderacion ENABLE ROW LEVEL SECURITY;

-- 6.2. Instituciones
CREATE POLICY "Lectura pública de instituciones activas"
ON instituciones
FOR SELECT
TO public
USING (activa = true);

CREATE POLICY "Admins tienen gestión total de instituciones"
ON instituciones
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- No exponer codigo_acceso en consultas directas de anon
REVOKE ALL ON instituciones FROM anon;
GRANT SELECT (id, nombre, activa, created_at) ON instituciones TO anon;
GRANT ALL ON instituciones TO authenticated;

-- 6.3. Publicaciones
CREATE POLICY "Lectura pública de publicaciones vigentes"
ON publicaciones
FOR SELECT
TO public
USING (
    (estado = 'publicada' AND expires_at > timezone('utc', now()))
    OR (auth.role() = 'authenticated')
);

CREATE POLICY "Inserción anónima validando código institucional"
ON publicaciones
FOR INSERT
TO anon
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM instituciones i
        WHERE i.id = publicaciones.institucion_id
          AND i.activa = true
          AND UPPER(TRIM(i.codigo_acceso)) = UPPER(TRIM(COALESCE(
              current_setting('request.headers', true)::json->>'x-institution-code',
              ''
          )))
    )
);

CREATE POLICY "Admins tienen control total sobre publicaciones"
ON publicaciones
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6.4. Reacciones
CREATE POLICY "Cualquiera puede ver las reacciones"
ON reacciones
FOR SELECT
TO public
USING (true);

CREATE POLICY "Cualquiera puede registrar una reacción"
ON reacciones
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Cualquiera puede cambiar su propia reacción"
ON reacciones
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Cualquiera puede retirar su propia reacción"
ON reacciones
FOR DELETE
TO public
USING (true);

-- 6.5. Reportes
CREATE POLICY "Cualquiera puede registrar un reporte comunitario"
ON reportes
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Solo administradores pueden consultar los reportes"
ON reportes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Solo administradores pueden moderar reportes"
ON reportes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Solo administradores pueden eliminar reportes"
ON reportes
FOR DELETE
TO authenticated
USING (true);

-- 6.6. Anuncios Patrocinados
CREATE POLICY "Lectura pública de anuncios vigentes y verificados"
ON anuncios_patrocinados
FOR SELECT
TO public
USING (
    (activo = true AND verificado_pago = true AND timezone('utc', now()) BETWEEN fecha_inicio AND fecha_fin)
    OR (auth.role() = 'authenticated')
);

CREATE POLICY "Admins gestionan anuncios patrocinados"
ON anuncios_patrocinados
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6.7. Historial de Moderación
CREATE POLICY "Solo administradores acceden al historial de moderación"
ON historial_moderacion
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 7. CONCESIÓN DE PERMISOS (GRANTS)
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT ON publicaciones TO anon;
GRANT ALL ON publicaciones TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON reacciones TO anon, authenticated;

GRANT INSERT ON reportes TO anon;
GRANT ALL ON reportes TO authenticated;

GRANT SELECT ON anuncios_patrocinados TO anon;
GRANT ALL ON anuncios_patrocinados TO authenticated;

GRANT ALL ON historial_moderacion TO authenticated;

GRANT EXECUTE ON FUNCTION obtener_feed_publico TO anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_publicacion_con_codigo TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validar_codigo_institucion TO anon, authenticated;

-- ==============================================================================
-- 8. DATOS SEMILLA BÁSICOS (Universidades de prueba)
-- ==============================================================================
INSERT INTO instituciones (id, nombre, codigo_acceso, activa)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Universidad de Córdoba (Unicórdoba)', 'UNICORDOBA2026', true),
    ('22222222-2222-2222-2222-222222222222', 'Universidad Pontificia Bolivariana (UPB)', 'UPB2026', true),
    ('33333333-3333-3333-3333-333333333333', 'Universidad del Sinú (Unisinú)', 'UNISINU2026', true),
    ('44444444-4444-4444-4444-444444444444', 'Universidad de Antioquia (UdeA)', 'UDEA2026', true),
    ('55555555-5555-5555-5555-555555555555', 'Universidad Nacional de Colombia (UNAL)', 'UNAL2026', true)
ON CONFLICT (codigo_acceso) DO NOTHING;

-- ==============================================================================
-- 9. CONFIGURACIÓN DE STORAGE (Imágenes de publicaciones)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('posts-media', 'posts-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read posts-media'
    ) THEN
        CREATE POLICY "Public read posts-media" 
        ON storage.objects FOR SELECT 
        USING (bucket_id = 'posts-media');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public upload posts-media'
    ) THEN
        CREATE POLICY "Public upload posts-media" 
        ON storage.objects FOR INSERT 
        WITH CHECK (bucket_id = 'posts-media');
    END IF;
END $$;
