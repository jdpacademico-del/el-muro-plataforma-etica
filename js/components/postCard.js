/**
 * ==============================================================================
 * Componente: Tarjeta de Publicación (PostCard - iOS Design System)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Renderiza el HTML de cada publicación respetando al 100% el diseño visual estilo iOS:
 * - Esquinas hiper-redondeadas (rounded-3xl), bordes sutiles y blur translúcido.
 * - Contador de expiración regresivo de ciclo 48 horas.
 * - Barra interactiva de los 6 emojis de reacciones con estados activos.
 * - Botones de compartir URL y reporte comunitario.
 */

import { TIPOS_REACCION } from '../services/postsService.js';

/**
 * Mapeo de estilos CSS de colores suaves para las 7 etiquetas oficiales
 */
export function getTagColorClass(tag) {
  const map = {
    'Sugerencias e ideas': 'tag-indigo',
    'Académico': 'tag-emerald',
    'Objetos perdidos': 'tag-red',
    'Eventos y actividades': 'tag-pink',
    'Curiosidades': 'tag-violet',
    'Emprendimientos y clasificados': 'tag-orange',
    'Comunidad': 'tag-blue'
  };
  return map[tag] || 'tag-blue';
}

/**
 * Mapeo de emojis representativos para las 7 etiquetas oficiales
 */
export function getTagEmoji(tag) {
  const map = {
    'Sugerencias e ideas': '💡',
    'Académico': '📚',
    'Objetos perdidos': '🔍',
    'Eventos y actividades': '🎉',
    'Curiosidades': '🔮',
    'Emprendimientos y clasificados': '💼',
    'Comunidad': '🤝'
  };
  return map[tag] || '🏷️';
}

/**
 * Calcula el tiempo restante antes de que la publicación expire (48 horas)
 * @param {string} expiresAtIso 
 * @param {string} createdAtIso 
 * @returns {string} Texto formateado de tiempo restante
 */
export function formatExpirationCountdown(expiresAtIso, createdAtIso) {
  let targetTime;

  if (expiresAtIso) {
    targetTime = new Date(expiresAtIso).getTime();
  } else if (createdAtIso) {
    targetTime = new Date(createdAtIso).getTime() + (48 * 3600 * 1000);
  } else {
    return '⏳ 48h restantes';
  }

  const now = Date.now();
  const diffMs = targetTime - now;

  if (diffMs <= 0) {
    return '⏳ Expira pronto';
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `⏳ ${days}d ${remHours}h restantes`;
  }

  if (hours > 0) {
    return `⏳ ${hours}h ${minutes}m restantes`;
  }

  return `⏳ ${minutes}m restantes`;
}

/**
 * Escapa cadenas para prevenir inyecciones XSS en el HTML
 * @param {string} str 
 * @returns {string} Cadena sanitizada
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renderiza la barra interactiva con los 6 emojis de reacciones
 * @param {Object} post - Datos de la publicación
 * @param {string|null} userReaction - Reacción actual del visitante ('corazon', 'risas', etc.)
 * @returns {string} Fragmento HTML
 */
function renderReactionsBar(post, userReaction) {
  const detalle = post.reacciones_detalle || {};

  const reactionKeys = ['corazon', 'risas', 'idea', 'sorpresa', 'aplauso', 'triste'];

  const buttonsHtml = reactionKeys.map((key) => {
    const info = TIPOS_REACCION[key];
    const count = parseInt(detalle[key] || 0, 10);
    const isActive = userReaction === key;

    // Clases estilo iOS: botones cápsula con feedback háptico visual
    const activeClasses = isActive
      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300 ring-2 ring-orange-500/40 font-black scale-105 shadow-sm'
      : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold border border-slate-200/70 dark:border-slate-700/80';

    return `
      <button 
        type="button"
        data-action="react"
        data-post-id="${post.id}"
        data-reaction="${key}"
        title="${info.label}"
        class="reaction-btn px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 transition-all transform active:scale-95 select-none ${activeClasses}"
      >
        <span class="text-sm">${info.emoji}</span>
        ${count > 0 ? `<span class="text-[11px] font-extrabold">${count}</span>` : ''}
      </button>
    `;
  }).join('');

  return `
    <div class="flex items-center gap-1.5 flex-wrap pt-1">
      ${buttonsHtml}
    </div>
  `;
}

/**
 * Genera el marcado HTML para una tarjeta de publicación individual
 * 
 * @param {Object} post - Publicación con datos completos de Supabase
 * @param {Object} [options] - Opciones de renderizado
 * @param {string|null} [options.userReaction] - Reacción activa del visitante
 * @returns {string} Marcado HTML de la tarjeta
 */
export function renderPostCard(post, options = {}) {
  const userReaction = options.userReaction || null;
  const countdownText = formatExpirationCountdown(post.expires_at, post.created_at);

  // Renderizar las etiquetas oficiales seleccionadas (1 a 3)
  const tagsList = (post.etiquetas && post.etiquetas.length > 0)
    ? post.etiquetas.slice(0, 3)
    : [post.categoria || 'Comunidad'];

  const tagsBadgesHtml = tagsList.map(tag => {
    const tClass = getTagColorClass(tag);
    const emoji = getTagEmoji(tag);
    return `<span class="text-xs font-extrabold px-3 py-1 rounded-full ${tClass} flex items-center gap-1"><span>${emoji}</span><span>#${escapeHtml(tag)}</span></span>`;
  }).join(' ');

  return `
    <article 
      id="post-${post.id}" 
      data-post-id="${post.id}"
      class="post-card bg-white dark:bg-slate-800 border border-orange-100/70 dark:border-slate-700 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all space-y-3.5 animate-fade-in relative overflow-hidden"
    >
      <!-- Cabecera de la Tarjeta estilo iOS -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          ${tagsBadgesHtml}
        </div>
        <span class="text-[11px] font-bold text-slate-400 whitespace-nowrap" title="Expira automáticamente en 48h">
          ${countdownText}
        </span>
      </div>

      <!-- Imagen Optimizada WebP (si existe) -->
      ${post.imagen_url ? `
        <div class="rounded-2xl overflow-hidden max-h-80 border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          <img 
            src="${escapeHtml(post.imagen_url)}" 
            alt="${escapeHtml(post.titulo || 'Publicación en El Muro')}" 
            loading="lazy"
            class="w-full h-full object-cover max-h-80 hover:scale-[1.01] transition-transform duration-300"
            onerror="this.parentElement.style.display='none'"
          />
        </div>
      ` : ''}

      <!-- Título de la Publicación -->
      ${post.titulo ? `
        <h3 class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
          ${escapeHtml(post.titulo)}
        </h3>
      ` : ''}

      <!-- Contenido / Descripción Sanitizada -->
      ${post.descripcion ? `
        <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-normal whitespace-pre-line">
          ${escapeHtml(post.descripcion)}
        </p>
      ` : ''}

      <!-- Barra de los 6 Emojis de Reacciones -->
      ${renderReactionsBar(post, userReaction)}

      <!-- Barra de Acciones iOS Inferior (Compartir & Reportar) -->
      <div class="flex items-center justify-between text-xs font-extrabold text-slate-500 border-t border-slate-100 dark:border-slate-700/60 pt-3">
        <div class="flex items-center gap-1 text-[11px] text-slate-400">
          <span>✨</span>
          <span>${post.total_reacciones || 0} reacciones</span>
        </div>

        <div class="flex items-center gap-3">
          <button 
            type="button"
            data-action="share"
            data-post-id="${post.id}"
            data-post-title="${escapeHtml(post.titulo || 'Publicación de El Muro')}"
            class="flex items-center gap-1.5 hover:text-orange-500 text-slate-500 dark:text-slate-400 font-bold transition-colors"
            title="Copiar enlace o compartir publicación"
          >
            <span>↪️</span> <span>Compartir</span>
          </button>

          <button 
            type="button"
            data-action="report"
            data-post-id="${post.id}"
            class="flex items-center gap-1 hover:text-rose-600 text-slate-400 dark:text-slate-500 text-[11px] font-bold transition-colors"
            title="Reportar publicación por incumplimiento ético"
          >
            <span>🚨</span> <span>Reportar</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

export default {
  getTagColorClass,
  formatExpirationCountdown,
  renderPostCard
};
