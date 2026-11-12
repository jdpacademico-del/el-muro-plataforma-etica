-- ==============================================================================
-- MIGRACIÓN 02: Triggers y Funciones Postgres (Backend Enforcement)
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-05
-- ==============================================================================

-- ==============================================================================
-- 1. TRIGGERS PARA MODERACIÓN COMUNITARIA AUTOMÁTICA
-- ==============================================================================

-- 1.1. Incrementa reportes_count al crearse un nuevo reporte
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

-- 1.2. Decrementa reportes_count si un reporte es descartado o eliminado por moderación
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

-- 1.3. Ocultamiento Preventivo Automático (Umbral >= 3 reportes)
-- Cambia el estado a 'en_revision' para sacarla inmediatamente del feed público sin borrarla permanentemente.
CREATE OR REPLACE FUNCTION fn_tr_ocultamiento_preventivo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si alcanza o supera el umbral de 3 reportes y sigue activa en 'publicada'
    IF NEW.reportes_count >= 3 AND OLD.estado = 'publicada' THEN
        NEW.estado := 'en_revision';

        -- Auditoría interna automática en historial_moderacion
        INSERT INTO historial_moderacion (
            publicacion_id,
            moderador_id,
            accion_realizada,
            justificacion
        ) VALUES (
            NEW.id,
            NULL, -- Sistema autónomo
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

-- ==============================================================================
-- 2. FUNCIÓN RPC: CONSULTAR FEED PÚBLICO (FILTRADO Y VIGENCIA)
-- ==============================================================================

-- Devuelve publicaciones activas, no vencidas, con conteo y desglose de reacciones
CREATE OR REPLACE FUNCTION obtener_feed_publico(
    p_institucion_id UUID DEFAULT NULL,
    p_categoria categoria_enum DEFAULT NULL,
    p_limite INT DEFAULT 50,
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
    reacciones_detalle JSONB
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
        COALESCE(sub_r.reacciones_json, '{}'::jsonb) AS reacciones_detalle
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

COMMENT ON FUNCTION obtener_feed_publico IS 'Retorna el feed de publicaciones activas no expiradas con conteos de reacciones y filtros opcionales.';

-- ==============================================================================
-- 3. FUNCIÓN RPC: CREACIÓN ANÓNIMA CON CÓDIGO INSTITUCIONAL VÁLIDO
-- ==============================================================================

-- Valida el código institucional antes de insertar de forma anónima
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
    -- 1. Validar que la institución existe, está activa y coincide el código
    SELECT EXISTS (
        SELECT 1 
        FROM instituciones 
        WHERE id = p_institucion_id 
          AND activa = true 
          AND UPPER(TRIM(codigo_acceso)) = UPPER(TRIM(p_codigo_acceso))
    ) INTO v_valido;

    IF NOT v_valido THEN
        RAISE EXCEPTION 'Código de acceso institucional inválido o la institución se encuentra inactiva.'
            USING ERRCODE = '28000'; -- Invalid authorization specification
    END IF;

    -- 2. Validar restricción de etiquetas (máximo 3)
    IF p_etiquetas IS NOT NULL AND array_length(p_etiquetas, 1) > 3 THEN
        RAISE EXCEPTION 'Solo se permite un máximo de 3 etiquetas por publicación.'
            USING ERRCODE = '22023'; -- Invalid parameter value
    END IF;

    -- 3. Validar título no vacío
    IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
        RAISE EXCEPTION 'El título de la publicación es obligatorio.'
            USING ERRCODE = '23502';
    END IF;

    -- 4. Inserción protegida con valores normalizados
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

COMMENT ON FUNCTION crear_publicacion_con_codigo IS 'Endpoint RPC para insertar publicaciones anónimas validando el código secreto de la institución.';

-- ==============================================================================
-- 4. FUNCIÓN HELPER: VALIDAR CÓDIGO INSTITUCIONAL (SIN EXPONERLO)
-- ==============================================================================

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

COMMENT ON FUNCTION validar_codigo_institucion IS 'Verifica si un código institucional ingresado es correcto sin retornar el código real al cliente.';

-- ==============================================================================
-- 5. VISTA SQL PARA CONSULTAS DIRECTAS DEL FEED PÚBLICO
-- ==============================================================================

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

COMMENT ON VIEW vista_feed_publico IS 'Vista protegida con publicaciones vigentes y aprobadas.';
