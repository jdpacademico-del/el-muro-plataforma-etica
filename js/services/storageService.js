/**
 * ==============================================================================
 * Servicio de Almacenamiento Supabase Storage (posts-media)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Gestiona la subida de imágenes comprimidas y la obtención de URLs públicas seguras.
 * Incluye diagnóstico de errores amigable al usuario (límites de almacenamiento,
 * fallas de red, buckets no configurados y permisos RLS).
 */

import { supabase, SUPABASE_CONFIG } from '../config/supabase.js';

const STORAGE_BUCKET = 'posts-media';

/**
 * Traduce errores técnicos de Supabase Storage a mensajes claros y amigables.
 * @param {Error|{message?: string, statusCode?: string|number}} error
 * @returns {string} Mensaje entendible para el estudiante/usuario
 */
function formatStorageErrorMessage(error) {
  if (!error) return 'Ocurrió un error inesperado al procesar la imagen.';

  const msg = (error.message || '').toLowerCase();
  const status = String(error.statusCode || error.status || '');

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Sin conexión a internet. Por favor verifica tu señal antes de subir la imagen.';
  }

  if (msg.includes('failed to fetch') || msg.includes('networkerror') || status === '0') {
    return 'No se pudo conectar con el servidor de imágenes. Comprueba tu conexión a la red.';
  }

  if (status === '413' || msg.includes('payload too large') || msg.includes('exceeded') || msg.includes('size limit')) {
    return 'La imagen excede el límite máximo permitido por el servidor. Intenta recortarla o comprimirla un poco más.';
  }

  if (status === '404' || msg.includes('bucket not found') || msg.includes('not found')) {
    return `El depósito de imágenes ("${STORAGE_BUCKET}") no se encuentra activo en Supabase. Contacta al administrador.`;
  }

  if (status === '403' || msg.includes('row-level security') || msg.includes('unauthorized') || msg.includes('permission denied')) {
    return 'Políticas de seguridad: No se tienen permisos de subida pública en el depósito de imágenes de Supabase.';
  }

  return error.message || 'No se pudo subir la imagen al servidor. Inténtalo nuevamente.';
}

/**
 * Genera un nombre de archivo único con extensión .webp
 * @returns {string} Nombre de archivo en formato uuidv4.webp
 */
function generateWebpFilename() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID()}.webp`;
  }
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}_${random}.webp`;
}

/**
 * Sube una imagen procesada (Blob WebP) al bucket 'posts-media' en Supabase Storage.
 * 
 * @param {Blob|File} fileBlob - Imagen comprimida en formato WebP
 * @returns {Promise<string>} URL pública limpia del archivo almacenado
 */
export async function uploadPostImage(fileBlob) {
  if (!fileBlob) {
    throw new Error('No se proporcionó ningún archivo para subir a Storage.');
  }

  // Generar nombre de archivo único criptográficamente
  const fileName = generateWebpFilename();
  const filePath = `public/${fileName}`;

  // Si Supabase no está configurado en entorno de desarrollo local, retornar un dataURL para testing
  if (!SUPABASE_CONFIG.isConfigured) {
    console.warn('[StorageService] Supabase no tiene credenciales válidas configuradas. Generando URL en memoria local (Blob URL) para modo desarrollo offline.');
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(fileBlob);
    });
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, fileBlob, {
        contentType: 'image/webp',
        cacheControl: '31536000', // 1 año de caché en CDN
        upsert: false
      });

    if (error) {
      console.error('[StorageService] Error al subir imagen a Supabase Storage:', error);
      throw new Error(formatStorageErrorMessage(error));
    }

    // Obtener la URL pública limpia
    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    if (!publicData || !publicData.publicUrl) {
      throw new Error('No se pudo generar la URL pública de la imagen.');
    }

    return publicData.publicUrl;
  } catch (err) {
    console.error('[StorageService] Excepción al procesar uploadPostImage:', err);
    throw (err instanceof Error ? err : new Error(formatStorageErrorMessage(err)));
  }
}

/**
 * Elimina una imagen previamente subida del bucket
 * @param {string} publicUrl 
 */
export async function deletePostImage(publicUrl) {
  if (!publicUrl || !SUPABASE_CONFIG.isConfigured) return;

  try {
    const parts = publicUrl.split(`/${STORAGE_BUCKET}/`);
    if (parts.length < 2) return;
    const filePath = parts[1];

    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);
  } catch (error) {
    console.warn('[StorageService] No se pudo eliminar la imagen del bucket:', error);
  }
}

export default {
  uploadPostImage,
  deletePostImage
};
