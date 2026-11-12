-- ==============================================================================
-- MIGRACIÓN: Columnas de Contacto WhatsApp y Ubicación Física para Anuncios
-- Proyecto: El Muro - Plataforma Ética Universitaria
-- Fecha: 2026-11-10
-- ==============================================================================

-- Añadir columnas para WhatsApp y Ubicación local en campus
ALTER TABLE anuncios_patrocinados 
ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(50);

ALTER TABLE anuncios_patrocinados 
ADD COLUMN IF NOT EXISTS ubicacion_referencia VARCHAR(200);

COMMENT ON COLUMN anuncios_patrocinados.telefono_contacto IS 'Número celular o WhatsApp del anunciante para contacto directo con estudiantes.';
COMMENT ON COLUMN anuncios_patrocinados.ubicacion_referencia IS 'Ubicación física dentro del campus o referencia cercana (ej. Frente al Bloque B).';

-- Notificación de éxito
SELECT 'Migración 20261110000003: Columnas de contacto y ubicación añadidas a anuncios_patrocinados.' AS status;
