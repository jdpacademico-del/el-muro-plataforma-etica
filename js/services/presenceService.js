/**
 * ==============================================================================
 * Servicio de Presencia en Tiempo Real (Supabase Realtime Presence)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Conecta el badge de "activos en línea" a un canal de presencia de Supabase,
 * rastreando visitantes anónimos en tiempo real sin datos personales.
 *
 * Características de robustez:
 * - Prevención de bucles y fugas de memoria (memory leaks).
 * - Limpieza idempotente garantizada al desmontar la vista o cambiar de pestaña.
 * - Soporte para eventos de ciclo de vida modernos (beforeunload, pagehide, visibilitychange).
 * - Fallback resiliente a simulación visual cuando Supabase no está configurado o falla la red.
 */

import { supabase, SUPABASE_CONFIG } from '../config/supabase.js';
import { getVisitorId } from '../utils/visitorId.js';

// ==============================================================================
// CONFIGURACIÓN DEL CANAL DE PRESENCIA
// ==============================================================================
const CHANNEL_NAME = 'muro_online_users';
const HEARTBEAT_INTERVAL_MS = 30000; // Reenviar track cada 30s para mantener presencia activa
const SIMULATION_INTERVAL_MS = 5000; // Intervalo de la simulación offline (5s)
const SIMULATION_MIN_USERS = 12;     // Mínimo de usuarios simulados

/** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
let presenceChannel = null;

/** @type {number | null} */
let heartbeatTimer = null;

/** @type {number | null} */
let simulationTimer = null;

/** Flag para evitar llamadas concurrentes a initPresence */
let isConnecting = false;

// ==============================================================================
// MODO REAL: SUPABASE REALTIME PRESENCE
// ==============================================================================

/**
 * Inicializa el canal de presencia real con Supabase Realtime.
 * Suscribe al visitante anónimo y escucha cambios de presencia para
 * actualizar el contador en tiempo real.
 *
 * @param {(count: number) => void} onCountChange - Callback ejecutado cada vez
 *        que cambia el número de usuarios en línea.
 */
function initRealtimePresence(onCountChange) {
  const visitorId = getVisitorId();

  try {
    // Crear canal de presencia
    presenceChannel = supabase.channel(CHANNEL_NAME, {
      config: {
        presence: {
          key: visitorId  // Cada visitante tiene su propia clave única de presencia
        }
      }
    });

    // Escuchar sincronizaciones de presencia (join, leave, sync)
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (!presenceChannel) return;
        try {
          const presenceState = presenceChannel.presenceState();
          const onlineCount = Object.keys(presenceState).length;
          console.info(`[Presence] Sync — ${onlineCount} usuarios en línea`);
          // Asegurar al menos 1 usuario (el visitante actual conectado)
          onCountChange(Math.max(1, onlineCount));
        } catch (err) {
          console.warn('[Presence] Error leyendo presenceState:', err);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.debug(`[Presence] Join — ${key}`, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.debug(`[Presence] Leave — ${key}`, leftPresences);
      })
      .subscribe(async (status) => {
        isConnecting = false;
        if (status === 'SUBSCRIBED') {
          console.info('[Presence] Canal suscrito correctamente. Registrando presencia...');
          await trackPresence(visitorId);
          startHeartbeat(visitorId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[Presence] Estado del canal: ${status}. Activando simulación de respaldo resiliente...`);
          cleanupRealtimePresence();
          initSimulationFallback(onCountChange);
        }
      });
  } catch (err) {
    console.error('[Presence] Error inicializando canal de presencia:', err);
    cleanupRealtimePresence();
    initSimulationFallback(onCountChange);
  }
}

/**
 * Envía la señal de presencia (track) al canal con metadatos mínimos anónimos.
 * @param {string} visitorId - ID anónimo del visitante
 */
async function trackPresence(visitorId) {
  if (!presenceChannel) return;

  try {
    await presenceChannel.track({
      visitor_id: visitorId,
      online_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[Presence] Error al enviar track de presencia:', error);
  }
}

/**
 * Inicia un heartbeat periódico para mantener la presencia activa.
 * Supabase Realtime desconecta presencias inactivas tras ~60s sin track.
 * @param {string} visitorId - ID anónimo del visitante
 */
function startHeartbeat(visitorId) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    // Solo enviar heartbeat si el documento está visible para ahorrar recursos
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    trackPresence(visitorId);
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Limpia el canal de presencia de forma segura y detiene el heartbeat sin memory leaks.
 */
function cleanupRealtimePresence() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (presenceChannel) {
    try {
      supabase.removeChannel(presenceChannel);
    } catch (e) {
      console.warn('[Presence] Advertencia al remover canal Supabase:', e);
    }
    presenceChannel = null;
  }
}

// ==============================================================================
// MODO OFFLINE: SIMULACIÓN DE RESPALDO
// ==============================================================================

/**
 * Simulación visual de usuarios activos para modo offline / desarrollo local.
 * Genera variaciones aleatorias suaves alrededor de un valor base.
 *
 * @param {(count: number) => void} onCountChange - Callback con el conteo simulado
 * @param {number} [initialCount=18] - Valor inicial de usuarios simulados
 */
function initSimulationFallback(onCountChange, initialCount = 18) {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  let simulatedCount = initialCount;
  onCountChange(simulatedCount);

  simulationTimer = setInterval(() => {
    const delta = Math.floor(Math.random() * 5) - 2; // -2 a +2
    simulatedCount = Math.max(SIMULATION_MIN_USERS, simulatedCount + delta);
    onCountChange(simulatedCount);
  }, SIMULATION_INTERVAL_MS);

  console.info('[Presence] Modo simulación offline activo.');
}

// ==============================================================================
// API PÚBLICA
// ==============================================================================

/**
 * Punto de entrada principal del servicio de presencia.
 * Detecta automáticamente si Supabase está configurado:
 * - SÍ → Conecta Realtime Presence con canal `muro_online_users`
 * - NO → Activa simulación visual de respaldo
 *
 * Limpia proactivamente cualquier suscripción o temporizador previo para evitar fugas.
 *
 * @param {(count: number) => void} onCountChange - Callback que recibe el número
 *        actualizado de usuarios en línea cada vez que cambia.
 */
export function initPresence(onCountChange) {
  if (!onCountChange || typeof onCountChange !== 'function') {
    console.error('[Presence] Se requiere un callback onCountChange.');
    return;
  }

  // Desconectar instancias previas para evitar suscripciones duplicadas y fugas
  destroyPresence();

  if (SUPABASE_CONFIG.isConfigured) {
    console.info('[Presence] Supabase configurado. Iniciando Realtime Presence...');
    isConnecting = true;
    initRealtimePresence(onCountChange);
  } else {
    console.info('[Presence] Supabase NO configurado. Modo simulación activo.');
    initSimulationFallback(onCountChange);
  }
}

/**
 * Desconecta el servicio de presencia de forma completa y limpia.
 * Detiene tanto la conexión Realtime como cualquier temporizador de simulación o heartbeat.
 */
export function destroyPresence() {
  cleanupRealtimePresence();

  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  isConnecting = false;
  console.info('[Presence] Servicio de presencia desconectado limpiamente.');
}

// ==============================================================================
// GESTIÓN DE CICLO DE VIDA (UNMOUNT Y VISIBILIDAD)
// ==============================================================================
if (typeof window !== 'undefined') {
  // Limpieza al descargar la página o navegar fuera
  window.addEventListener('beforeunload', destroyPresence);
  window.addEventListener('pagehide', destroyPresence);

  // Re-sincronizar presencia cuando la pestaña vuelve al primer plano
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && presenceChannel && SUPABASE_CONFIG.isConfigured) {
        trackPresence(getVisitorId());
      }
    });
  }
}
