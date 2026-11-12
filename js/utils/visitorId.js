/**
 * ==============================================================================
 * Utilidad de Identificación Anónima de Visitantes (Visitor ID)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Genera y persiste un identificador anónimo de sesión sin recopilar datos personales,
 * permitiendo el voto único de reacciones y reportes sin requerir registro de cuenta.
 */

const STORAGE_KEY = 'el_muro_visitor_id';

/**
 * Genera un UUID v4 seguro mediante Web Crypto API o generador alternativo.
 * @returns {string} UUID v4 en formato canónico
 */
function generateUUIDv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback seguro usando crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Fallback determinista en entornos sin Web Crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Obtiene o inicializa de forma transparente el identificador único del visitante
 * almacenado en el almacenamiento local del navegador (localStorage).
 * @returns {string} Identificador único anónimo del visitante
 */
export function getVisitorId() {
  try {
    let visitorId = localStorage.getItem(STORAGE_KEY);
    if (!visitorId || visitorId.length < 16) {
      visitorId = generateUUIDv4();
      localStorage.setItem(STORAGE_KEY, visitorId);
    }
    return visitorId;
  } catch (error) {
    console.warn('[VisitorId] LocalStorage no disponible, generando ID temporal en memoria:', error);
    return generateUUIDv4();
  }
}

/**
 * Genera un hash criptográfico SHA-256 unidireccional del visitor_id
 * para anonimizar aún más la trazabilidad en base de datos.
 * @param {string} [id] - Visitor ID opcional a hashear (toma getVisitorId() por defecto)
 * @returns {Promise<string>} Hash hexadecimal de 64 caracteres
 */
export async function getVisitorIdHash(id = null) {
  const visitorId = id || getVisitorId();

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const msgUint8 = new TextEncoder().encode(`muro_salt_${visitorId}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[VisitorId] Error calculando hash SHA-256 con SubtleCrypto:', e);
    }
  }

  // Fallback rápido si SubtleCrypto no está en contexto seguro (HTTP sin TLS en desarrollo local)
  let hash = 0;
  const str = `muro_salt_${visitorId}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${visitorId.slice(0, 8)}`;
}

/**
 * Genera una huella digital básica del dispositivo (User Agent, resolución, idioma, zona horaria)
 * para auditoría anti-ataques DDoS / Sybil.
 * @returns {string} Hash básico de fingerprint
 */
export function getBrowserFingerprint() {
  if (typeof window === 'undefined') return 'unknown-device';
  const nav = window.navigator || {};
  const screen = window.screen || {};
  const components = [
    nav.userAgent || '',
    nav.language || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth || '',
    new Date().getTimezoneOffset()
  ].join('###');

  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const code = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + code;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}
