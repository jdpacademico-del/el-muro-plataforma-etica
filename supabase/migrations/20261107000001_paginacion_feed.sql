-- ==============================================================================
-- Migración: Optimización de Paginación y Carga Progresiva del Feed
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- ==============================================================================

-- Eliminar versión anterior para permitir cambio en la firma de retorno (nueva columna total_count)
DROP FUNCTION IF EXISTS obtener_feed_publico(UUID, categoria_enum, INT, INT);

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

GRANT EXECUTE ON FUNCTION obtener_feed_publico TO anon, authenticated;
COMMENT ON FUNCTION obtener_feed_publico IS 'Retorna el feed de publicaciones activas no expiradas con total_count para paginación y carga progresiva.';
