-- ==============================================================================
-- Migración: Política de Eliminación en Storage + Restricción de Tamaño
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-10
-- ==============================================================================
-- Agrega la política faltante de DELETE en Storage para que los administradores
-- autenticados puedan eliminar imágenes huérfanas del bucket 'posts-media'.
-- También agrega la política de UPDATE para reemplazos si se necesita.

-- 1. Política de DELETE: Solo usuarios autenticados (admins)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin delete posts-media'
    ) THEN
        CREATE POLICY "Admin delete posts-media" 
        ON storage.objects FOR DELETE 
        TO authenticated
        USING (bucket_id = 'posts-media');
    END IF;
END $$;

-- 2. Política de UPDATE: Solo usuarios autenticados (admins)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin update posts-media'
    ) THEN
        CREATE POLICY "Admin update posts-media" 
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (bucket_id = 'posts-media')
        WITH CHECK (bucket_id = 'posts-media');
    END IF;
END $$;

-- 3. Limitar tamaño de subida pública a 2 MB por archivo
-- (Supabase Dashboard > Storage > Policies > File size limit)
-- Actualizar la configuración del bucket para incluir el límite:
UPDATE storage.buckets
SET file_size_limit = 2097152,       -- 2 MB en bytes
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
WHERE id = 'posts-media';
