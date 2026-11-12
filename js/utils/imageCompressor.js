/**
 * ==============================================================================
 * Módulo de Optimización y Compresión de Imágenes en Cliente
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * - Valida el tipo MIME real mediante Magic Numbers (Firmas de Bytes).
 * - Redimensiona a dimensiones máximas de 1200px preservando aspect ratio.
 * - Convierte a WebP mediante HTML5 Canvas (Elimina metadatos EXIF / GPS por privacidad).
 * - Aplica compresión progresiva con rango objetivo de 200 KB a 500 KB (Techo estricto: 1.5 MB).
 */

const MAX_DIMENSION = 1200; // Ancho o alto máximo en píxeles
const TARGET_MIN_BYTES = 200 * 1024; // 200 KB
const TARGET_MAX_BYTES = 500 * 1024; // 500 KB
const HARD_CEILING_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * Lee los primeros bytes de un archivo para determinar su Magic Number.
 * @param {Blob|File} file 
 * @param {number} numBytes 
 * @returns {Promise<Uint8Array>}
 */
async function readHeaderBytes(file, numBytes = 16) {
  const slice = file.slice(0, numBytes);
  const arrayBuffer = await slice.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Valida la firma de bytes real (Magic Numbers) del archivo para asegurar
 * que es una imagen auténtica y prevenir inyecciones de ejecutables o scripts.
 * @param {File} file 
 * @returns {Promise<{ valid: boolean, detectedType: string|null }>}
 */
export async function validateImageMagicBytes(file) {
  if (!file || file.size === 0) {
    return { valid: false, detectedType: null };
  }

  const bytes = await readHeaderBytes(file, 16);
  const toHex = arr => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const hex = toHex(bytes);

  // 1. JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { valid: true, detectedType: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) {
    return { valid: true, detectedType: 'image/png' };
  }

  // 3. GIF: GIF87a o GIF89a (47 49 46 38)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { valid: true, detectedType: 'image/gif' };
  }

  // 4. WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  // RIFF = 52 49 46 46, WEBP = 57 45 42 50
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { valid: true, detectedType: 'image/webp' };
  }

  // 5. HEIC / AVIF / ISO-BMFF: ftyp marker en offset 4 (66 74 79 70)
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { valid: true, detectedType: 'image/heic-avif' };
  }

  console.warn('[ImageCompressor] Firma de Magic Bytes no reconocida:', hex);
  return { valid: false, detectedType: null };
}

/**
 * Carga un File o Blob en un objeto Image de HTML.
 * @param {File|Blob} file 
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo decodificar la imagen seleccionada.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Convierte un Canvas a Blob en formato WebP con un factor de calidad específico.
 * @param {HTMLCanvasElement} canvas 
 * @param {number} quality (0.0 a 1.0)
 * @returns {Promise<Blob>}
 */
function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Error al serializar el canvas a WebP'));
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Procesa, sanitiza (eliminación de EXIF/GPS) y comprime progresivamente una imagen
 * para ajustarla al estándar de carga segura de El Muro.
 * 
 * @param {File} file - Archivo seleccionado en el <input type="file">
 * @returns {Promise<{
 *   blob: Blob,
 *   file: File,
 *   previewUrl: string,
 *   width: number,
 *   height: number,
 *   size: number,
 *   sizeKb: number,
 *   originalSizeKb: number,
 *   compressionRatio: string
 * }>}
 */
export async function compressImage(file) {
  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo para procesar.');
  }

  // 1. Verificación de seguridad mediante Magic Bytes
  const magicValidation = await validateImageMagicBytes(file);
  if (!magicValidation.valid) {
    throw new Error('El archivo seleccionado no es una imagen válida o está dañado. Solo se admiten imágenes JPG, PNG o WebP auténticas.');
  }

  // 2. Cargar imagen en memoria
  const img = await loadImageElement(file);

  // 3. Calcular redimensionamiento a máx 1200px
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width <= 0 || height <= 0) {
    throw new Error('Las dimensiones de la imagen no son válidas.');
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  // 4. Dibujar en Canvas HTML5 (Remueve metadatos EXIF automáticamente)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D de Canvas.');
  }

  // Suavizado de imagen de alta fidelidad
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // 5. Compresión progresiva WebP
  // Rango de calidades para aproximarse a 200 KB - 500 KB
  const qualitySteps = [0.85, 0.78, 0.68, 0.58, 0.48, 0.38];
  let finalBlob = null;
  let selectedQuality = 0.85;

  for (const q of qualitySteps) {
    selectedQuality = q;
    const blobCandidate = await canvasToWebpBlob(canvas, q);

    if (blobCandidate.size <= TARGET_MAX_BYTES) {
      finalBlob = blobCandidate;
      break;
    }
    finalBlob = blobCandidate;
  }

  // 6. Si aún excede el límite infranqueable de 1.5 MB, aplicar reducción de escala
  if (finalBlob && finalBlob.size > HARD_CEILING_BYTES) {
    let scale = 0.75;
    while (finalBlob.size > HARD_CEILING_BYTES && scale >= 0.3) {
      const reducedCanvas = document.createElement('canvas');
      const rWidth = Math.round(width * scale);
      const rHeight = Math.round(height * scale);
      reducedCanvas.width = rWidth;
      reducedCanvas.height = rHeight;

      const rCtx = reducedCanvas.getContext('2d');
      rCtx.imageSmoothingEnabled = true;
      rCtx.imageSmoothingQuality = 'high';
      rCtx.drawImage(canvas, 0, 0, rWidth, rHeight);

      finalBlob = await canvasToWebpBlob(reducedCanvas, 0.60);
      width = rWidth;
      height = rHeight;
      scale -= 0.15;
    }
  }

  if (finalBlob.size > HARD_CEILING_BYTES) {
    throw new Error(`La imagen supera el límite infranqueable de ${(HARD_CEILING_BYTES / (1024 * 1024)).toFixed(1)} MB incluso tras la compresión.`);
  }

  const originalSizeKb = Math.round(file.size / 1024);
  const sizeKb = Math.round(finalBlob.size / 1024);
  const ratio = ((1 - (finalBlob.size / file.size)) * 100).toFixed(1);

  // Empaquetar como archivo File oficial
  const processedFile = new File([finalBlob], `${Date.now()}_optimized.webp`, {
    type: 'image/webp',
    lastModified: Date.now()
  });

  const previewUrl = URL.createObjectURL(finalBlob);

  return {
    blob: finalBlob,
    file: processedFile,
    previewUrl,
    width,
    height,
    size: finalBlob.size,
    sizeKb,
    originalSizeKb,
    compressionRatio: `${ratio}%`
  };
}

export default compressImage;
