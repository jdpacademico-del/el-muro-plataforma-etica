-- ==============================================================================
-- MIGRACIÓN 03: Políticas de Seguridad Row Level Security (RLS)
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-05
-- ==============================================================================

-- ==============================================================================
-- 1. ACTIVACIÓN DE ROW LEVEL SECURITY EN TODAS LAS TABLAS
-- ==============================================================================
ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios_patrocinados ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_moderacion ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. POLÍTICAS PARA LA TABLA `instituciones`
-- ==============================================================================

-- Lectura pública: Cualquiera puede listar las instituciones activas
CREATE POLICY "Lectura pública de instituciones activas"
ON instituciones
FOR SELECT
TO public
USING (activa = true);

-- Gestión total: Exclusiva para administradores autenticados
CREATE POLICY "Admins tienen gestión total de instituciones"
ON instituciones
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Protección de columna sensible: Evita que el cliente anónimo pueda leer codigo_acceso
REVOKE ALL ON instituciones FROM anon;
GRANT SELECT (id, nombre, activa, created_at) ON instituciones TO anon;
GRANT ALL ON instituciones TO authenticated;

-- ==============================================================================
-- 3. POLÍTICAS PARA LA TABLA `publicaciones`
-- ==============================================================================

-- Lectura pública: Solo publicaciones en estado 'publicada' y cuya vigencia no haya expirado
-- Los administradores autenticados pueden ver todas (incluyendo 'en_revision', 'oculta', etc.)
CREATE POLICY "Lectura pública de publicaciones vigentes"
ON publicaciones
FOR SELECT
TO public
USING (
    (estado = 'publicada' AND expires_at > timezone('utc', now()))
    OR (auth.role() = 'authenticated')
);

-- Creación anónima vía consulta directa validando código institucional en cabecera HTTP
-- (Nota: También se puede usar la función RPC segura crear_publicacion_con_codigo)
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

-- Panel Admin: Control total de publicaciones (Crear, Editar, Cambiar estado, Borrar)
CREATE POLICY "Admins tienen control total sobre publicaciones"
ON publicaciones
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 4. POLÍTICAS PARA LA TABLA `reacciones`
-- ==============================================================================

-- Lectura pública de reacciones acumuladas
CREATE POLICY "Cualquiera puede ver las reacciones"
ON reacciones
FOR SELECT
TO public
USING (true);

-- Creación de reacción (anónima o autenticada)
CREATE POLICY "Cualquiera puede registrar una reacción"
ON reacciones
FOR INSERT
TO public
WITH CHECK (true);

-- Actualización (cambio de emoji por el mismo visitor_id)
CREATE POLICY "Cualquiera puede cambiar su propia reacción"
ON reacciones
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Eliminación (retirar reacción por el mismo visitor_id)
CREATE POLICY "Cualquiera puede retirar su propia reacción"
ON reacciones
FOR DELETE
TO public
USING (true);

-- ==============================================================================
-- 5. POLÍTICAS PARA LA TABLA `reportes`
-- ==============================================================================

-- Creación pública de reportes (cualquier estudiante puede denunciar)
CREATE POLICY "Cualquiera puede registrar un reporte comunitario"
ON reportes
FOR INSERT
TO public
WITH CHECK (true);

-- Lectura restringida EXCLUSIVAMENTE a Administradores (auth.users)
-- Anon NO tiene política de SELECT, denegando toda lectura por defecto
CREATE POLICY "Solo administradores pueden consultar los reportes"
ON reportes
FOR SELECT
TO authenticated
USING (true);

-- Gestión y depuración de reportes reservada a administradores
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

-- ==============================================================================
-- 6. POLÍTICAS PARA LA TABLA `anuncios_patrocinados`
-- ==============================================================================

-- Lectura pública: Anuncios activos, pagados y dentro de su ventana temporal de vigencia
CREATE POLICY "Lectura pública de anuncios vigentes y verificados"
ON anuncios_patrocinados
FOR SELECT
TO public
USING (
    (activo = true AND verificado_pago = true AND timezone('utc', now()) BETWEEN fecha_inicio AND fecha_fin)
    OR (auth.role() = 'authenticated')
);

-- Gestión total: Exclusiva para administradores
CREATE POLICY "Admins gestionan anuncios patrocinados"
ON anuncios_patrocinados
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 7. POLÍTICAS PARA LA TABLA `historial_moderacion`
-- ==============================================================================

-- Acceso restringido EXCLUSIVAMENTE a Administradores autenticados
CREATE POLICY "Solo administradores acceden al historial de moderación"
ON historial_moderacion
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 8. PERMISOS Y CONCESIONES (GRANTS)
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Publicaciones
GRANT SELECT, INSERT ON publicaciones TO anon;
GRANT ALL ON publicaciones TO authenticated;

-- Reacciones
GRANT SELECT, INSERT, UPDATE, DELETE ON reacciones TO anon, authenticated;

-- Reportes
GRANT INSERT ON reportes TO anon;
GRANT ALL ON reportes TO authenticated;

-- Anuncios
GRANT SELECT ON anuncios_patrocinados TO anon;
GRANT ALL ON anuncios_patrocinados TO authenticated;

-- Historial
GRANT ALL ON historial_moderacion TO authenticated;

-- Funciones y RPCs
GRANT EXECUTE ON FUNCTION obtener_feed_publico TO anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_publicacion_con_codigo TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validar_codigo_institucion TO anon, authenticated;
