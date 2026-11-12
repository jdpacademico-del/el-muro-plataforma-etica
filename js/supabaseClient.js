/**
 * ==============================================================================
 * Cliente Unificado de Supabase (js/supabaseClient.js)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Expone la instancia oficial de Supabase, la URL y la Anon Key garantizando
 * compatibilidad tanto para importaciones de módulos ES6 como para acceso global
 * en 'window.supabaseClient'. Centraliza la configuración mediante 'js/config/supabase.js'.
 */

import { supabase, SUPABASE_CONFIG, getSupabaseCredentials, saveSupabaseCredentials } from './config/supabase.js';

export const SUPABASE_URL = SUPABASE_CONFIG.url;
export const SUPABASE_ANON_KEY = SUPABASE_CONFIG.anonKey;
export const supabaseClient = supabase;

// Exponer en el objeto global 'window' si nos encontramos en el navegador
if (typeof window !== 'undefined') {
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.supabaseClient = supabaseClient;
  window.supabase = window.supabase || supabaseClient;
}

export { supabase, SUPABASE_CONFIG, getSupabaseCredentials, saveSupabaseCredentials };
export default supabase;
