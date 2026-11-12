/**
 * ==============================================================================
 * Módulo de Configuración de Supabase
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Inicializa el cliente oficial de Supabase mediante ES6 Modules (@supabase/supabase-js)
 * gestionando credenciales centralizadas con capacidad de sobreescritura dinámica.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configuración predeterminada / Variables de entorno
const DEFAULT_SUPABASE_URL = 'https://ayhhjqrescyayvzlmshd.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_tdSiIDBoFJaJMcQskMVq0w_Z8bhc7GJ';

/**
 * Obtiene la configuración activa buscando en variables de entorno globales,
 * almacenamiento local (localStorage para testing/desarrollo) o defaults.
 */
export function getSupabaseCredentials() {
  const envUrl = typeof window !== 'undefined' && window.__ENV__?.SUPABASE_URL;
  const envKey = typeof window !== 'undefined' && window.__ENV__?.SUPABASE_ANON_KEY;

  const storageUrl = typeof localStorage !== 'undefined' && localStorage.getItem('EL_MURO_SUPABASE_URL');
  const storageKey = typeof localStorage !== 'undefined' && localStorage.getItem('EL_MURO_SUPABASE_ANON_KEY');

  const url = (storageUrl || envUrl || DEFAULT_SUPABASE_URL).trim();
  const anonKey = (storageKey || envKey || DEFAULT_SUPABASE_ANON_KEY).trim();

  const isConfigured = 
    url.length > 0 && 
    anonKey.length > 0 && 
    !url.includes('TU-PROYECTO') && 
    !anonKey.includes('TU-ANON-KEY');

  return { url, anonKey, isConfigured };
}

export const SUPABASE_CONFIG = getSupabaseCredentials();

/**
 * Instancia oficial del cliente de Supabase con opciones óptimas para cliente web
 */
export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true, // Permite persistir sesión para administradores autenticados
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-application-name': 'el-muro-web-client'
    }
  }
});

/**
 * Permite actualizar credenciales en caliente (útil para pruebas en entornos locales)
 * @param {string} url - URL del proyecto Supabase
 * @param {string} anonKey - Anon public key de Supabase
 */
export function saveSupabaseCredentials(url, anonKey) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('EL_MURO_SUPABASE_URL', url.trim());
    localStorage.setItem('EL_MURO_SUPABASE_ANON_KEY', anonKey.trim());
    window.location.reload();
  }
}

export default supabase;
