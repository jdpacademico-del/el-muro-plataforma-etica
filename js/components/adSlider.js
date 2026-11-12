/**
 * ==============================================================================
 * Módulo de Publicidad Patrocinada (adSlider.js - ES6 Module)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Gestiona la monetización ética y los clasificados patrocinados:
 * 1. Consulta la tabla `anuncios_patrocinados` filtrando:
 *    - activo = true
 *    - verificado_pago = true
 *    - fecha_inicio <= now() AND fecha_fin >= now()
 * 2. Componente visual para insertar slider/banner dinámico en panel lateral.
 * 3. Inserción de tarjeta publicitaria discreta cada 5 publicaciones en el feed.
 */

import { supabase, SUPABASE_CONFIG } from '../config/supabase.js';

// Fallback de anuncios patrocinados universitarios para modo offline o testing
export const ADS_FALLBACK = [
  {
    id: 'ad-001',
    titulo: 'La Hueca Gourmet — 15% de descuento para estudiantes presentando carnet.',
    imagen_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    telefono_contacto: '300 123 4567',
    ubicacion_referencia: 'Frente a la cafetería central, Bloque B',
    enlace_url: 'https://wa.me/573001234567',
    activo: true,
    verificado_pago: true,
    fecha_inicio: new Date(Date.now() - 7 * 86400000).toISOString(),
    fecha_fin: new Date(Date.now() + 23 * 86400000).toISOString()
  },
  {
    id: 'ad-002',
    titulo: 'Centro de Fotocopiado & Ploteo: Impresiones láser y encuadernación exprés para entregas finales.',
    imagen_url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80',
    telefono_contacto: '310 987 6543',
    ubicacion_referencia: 'Pasillo de ingenierías, local 104',
    enlace_url: 'https://wa.me/573109876543',
    activo: true,
    verificado_pago: true,
    fecha_inicio: new Date(Date.now() - 5 * 86400000).toISOString(),
    fecha_fin: new Date(Date.now() + 25 * 86400000).toISOString()
  },
  {
    id: 'ad-003',
    titulo: '¿Tienes un emprendimiento en el campus? Pauta con nosotros en El Muro.',
    imagen_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80',
    telefono_contacto: '320 555 0199',
    ubicacion_referencia: 'Oficina de Bienestar Estudiantil',
    enlace_url: 'https://wa.me/573205550199',
    activo: true,
    verificado_pago: true,
    fecha_inicio: new Date(Date.now() - 3 * 86400000).toISOString(),
    fecha_fin: new Date(Date.now() + 27 * 86400000).toISOString()
  }
];

let cachedAds = null;
let currentSliderIndex = 0;
let sliderInterval = null;

/**
 * Obtiene o construye la URL de destino del anuncio (priorizando enlace directo o WhatsApp)
 * @param {Object} ad 
 * @returns {string} URL de destino
 */
export function getAdTargetUrl(ad) {
  if (ad.enlace_url && ad.enlace_url.trim()) {
    return ad.enlace_url.trim();
  }
  if (ad.telefono_contacto && ad.telefono_contacto.trim()) {
    const clean = ad.telefono_contacto.replace(/\D/g, '').replace(/^57/, '');
    return `https://wa.me/57${clean}`;
  }
  return '#';
}

/**
 * Consulta la base de datos de Supabase para obtener anuncios activos y verificados
 * @returns {Promise<Array>} Lista de anuncios vigentes
 */
export async function fetchActiveAds() {
  if (!SUPABASE_CONFIG.isConfigured) {
    console.info('[AdSlider] Modo fallback activo: Supabase no configurado.');
    cachedAds = ADS_FALLBACK;
    return cachedAds;
  }

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('anuncios_patrocinados')
      .select('*')
      .eq('activo', true)
      .eq('verificado_pago', true)
      .lte('fecha_inicio', nowIso)
      .gte('fecha_fin', nowIso)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[AdSlider] Error al consultar anuncios_patrocinados en Supabase:', error.message);
      cachedAds = ADS_FALLBACK;
      return cachedAds;
    }

    if (!data || data.length === 0) {
      console.info('[AdSlider] No hay anuncios activos en base de datos. Utilizando anuncios de la comunidad.');
      cachedAds = ADS_FALLBACK;
      return cachedAds;
    }

    cachedAds = data;
    return cachedAds;
  } catch (err) {
    console.error('[AdSlider] Error de conexión consultando anuncios:', err);
    cachedAds = ADS_FALLBACK;
    return cachedAds;
  }
}

/**
 * Inicializa el Slider de Publicidad en el Sidebar de Escritorio
 * @param {string} containerId - ID del contenedor (ej. 'ad-slider-container')
 * @param {Array} [ads] - Lista opcional de anuncios precargados
 */
export async function initAdSlider(containerId = 'ad-slider-container', ads = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const adList = ads || (await fetchActiveAds());
  if (!adList || adList.length === 0) {
    container.innerHTML = `
      <div class="p-3 text-center text-xs text-slate-400 italic">
        Espacio para emprendimientos y comercios del campus.
      </div>
    `;
    return;
  }

  // Renderizar slider con dots
  renderSidebarSliderHtml(container, adList);

  // Iniciar temporizador si hay más de 1 anuncio
  if (sliderInterval) clearInterval(sliderInterval);
  if (adList.length > 1) {
    sliderInterval = setInterval(() => {
      currentSliderIndex = (currentSliderIndex + 1) % adList.length;
      updateSidebarSlide(container, adList, currentSliderIndex);
    }, 6000);
  }
}

/**
 * Genera el marcado interno de un slide para el slider lateral
 */
function getSidebarSlideContentHtml(current) {
  const enlace = getAdTargetUrl(current);
  const isWa = enlace.includes('wa.me') || Boolean(current.telefono_contacto);
  const telLimpio = current.telefono_contacto || (enlace.includes('wa.me') ? enlace.split('/').pop() : null);

  return `
    <a href="${enlace}" target="_blank" rel="noopener noreferrer" class="block group">
      <div class="h-28 rounded-2xl bg-slate-200 dark:bg-slate-700 overflow-hidden relative border border-orange-200/60 dark:border-slate-700 shadow-inner">
        <img src="${current.imagen_url || 'img/logo_el_muro.png'}" 
             alt="${current.titulo}" 
             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
        <span class="absolute bottom-2 left-2 ${isWa ? 'bg-emerald-600/90 text-white' : 'bg-slate-900/80 text-white'} backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm">
          ${isWa ? '💬 WhatsApp ↗' : '⭐ Patrocinado ↗'}
        </span>
      </div>
      <p class="font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors mt-2 leading-snug line-clamp-2">
        ${current.titulo}
      </p>
      ${current.ubicacion_referencia ? `
        <div class="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1 truncate">
          <span>📍</span> <span>${current.ubicacion_referencia}</span>
        </div>
      ` : ''}
      ${isWa && telLimpio ? `
        <div class="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
          <span>📱</span> <span>WhatsApp: ${telLimpio}</span>
        </div>
      ` : ''}
    </a>
  `;
}

/**
 * Pinta la estructura del slider en el contenedor lateral
 */
function renderSidebarSliderHtml(container, adList) {
  const current = adList[currentSliderIndex] || adList[0];

  container.innerHTML = `
    <div class="ad-slide text-xs space-y-2.5 transition-all duration-300" id="sidebar-slide-content">
      ${getSidebarSlideContentHtml(current)}
    </div>

    <!-- Indicadores de paginación (Dots) -->
    <div class="flex justify-center items-center gap-1.5 pt-2" id="sidebar-slider-dots">
      ${adList.map((_, i) => `
        <button type="button" 
                onclick="window.__cambiarSlideAd(${i})" 
                class="w-2 h-2 rounded-full transition-all ${i === currentSliderIndex ? 'bg-orange-500 w-4' : 'bg-slate-300 dark:bg-slate-700'}"
                aria-label="Ir al anuncio ${i + 1}"></button>
      `).join('')}
    </div>
  `;

  // Exponer al scope global para los clicks de dots
  window.__cambiarSlideAd = (index) => {
    currentSliderIndex = index;
    updateSidebarSlide(container, adList, currentSliderIndex);
  };
}

/**
 * Actualiza la diapositiva visible sin reconstruir todo el DOM
 */
function updateSidebarSlide(container, adList, index) {
  const current = adList[index];
  if (!current) return;

  const content = document.getElementById('sidebar-slide-content');
  if (content) {
    content.style.opacity = '0';
    setTimeout(() => {
      content.innerHTML = getSidebarSlideContentHtml(current);
      content.style.opacity = '1';
    }, 150);
  }

  // Actualizar dots
  const dotsContainer = document.getElementById('sidebar-slider-dots');
  if (dotsContainer) {
    const dots = dotsContainer.querySelectorAll('button');
    dots.forEach((dot, i) => {
      if (i === index) {
        dot.className = 'w-4 h-2 rounded-full bg-orange-500 transition-all';
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 transition-all';
      }
    });
  }
}

/**
 * Genera el HTML de una tarjeta de anuncio patrocinado para insertar dentro del Feed
 * Respetando el Neo-brutalismo suave e identidad iOS de las tarjetas de publicación.
 * @param {Object} ad - Objeto de anuncio patrocinado
 * @returns {string} HTML de la tarjeta
 */
export function renderFeedAdCard(ad) {
  const enlace = getAdTargetUrl(ad);
  const isWa = enlace.includes('wa.me') || Boolean(ad.telefono_contacto);
  const imgUrl = ad.imagen_url || '';

  return `
    <article class="feed-ad-card relative bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-rose-50/30 dark:from-slate-800 dark:via-slate-800/90 dark:to-orange-950/20 border-2 border-orange-200/80 dark:border-orange-800/60 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3.5 transition-all animate-fade-in">
      
      <!-- Encabezado de la Tarjeta Patrocinada -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500 text-white shadow-xs">
            ⭐ Patrocinado
          </span>
          <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
            ✓ Verificado
          </span>
        </div>
        <span class="text-[11px] font-extrabold text-slate-400">Espacio Comercial</span>
      </div>

      <!-- Título y Ubicación Promocional -->
      <div class="space-y-1.5">
        <h4 class="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug">
          ${ad.titulo}
        </h4>
        ${ad.ubicacion_referencia ? `
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-orange-50/60 dark:bg-slate-700/50 px-2.5 py-1 rounded-xl w-fit">
            <span>📍</span> <span>${ad.ubicacion_referencia}</span>
          </div>
        ` : ''}
      </div>

      <!-- Imagen Destacada del Anuncio -->
      ${imgUrl ? `
        <div class="rounded-2xl overflow-hidden max-h-64 sm:max-h-72 border border-orange-200/60 dark:border-slate-700 shadow-sm relative group">
          <img src="${imgUrl}" alt="${ad.titulo}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300">
        </div>
      ` : ''}

      <!-- Botón de Llamado a la Acción (CTA) -->
      <div class="pt-1 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] font-semibold text-slate-400">
          ${ad.ubicacion_referencia ? 'Visita este punto en el campus' : 'Apoya a los comercios del campus'}
        </span>
        <a href="${enlace}" target="_blank" rel="noopener noreferrer" 
           class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ${isWa ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-900 text-white hover:bg-orange-600 dark:bg-white dark:text-slate-900 dark:hover:bg-orange-400'} text-xs font-black shadow-sm transition-all">
          <span>${isWa ? '💬 Abrir WhatsApp' : 'Visitar Promoción'}</span>
          <span>↗</span>
        </a>
      </div>

    </article>
  `;
}

/**
 * Inserta un anuncio patrocinado cada 5 tarjetas de publicación dentro de una lista de HTMLs
 * @param {Array<string>} postCardsHtml - Arreglo de strings HTML de publicaciones
 * @param {Array<Object>} [ads] - Lista de anuncios disponibles
 * @param {number} [offsetIndex=0] - Desplazamiento del índice global de tarjetas para mantener la cadencia
 * @returns {Array<string>} Arreglo intercalado con tarjetas publicitarias
 */
export function injectAdsIntoFeed(postCardsHtml, ads = null, offsetIndex = 0) {
  const adList = ads && ads.length > 0 ? ads : (cachedAds && cachedAds.length > 0 ? cachedAds : ADS_FALLBACK);
  if (!postCardsHtml || postCardsHtml.length === 0 || !adList || adList.length === 0) {
    return postCardsHtml;
  }

  const result = [];
  let adIndex = Math.floor(offsetIndex / 5);

  postCardsHtml.forEach((cardHtml, index) => {
    result.push(cardHtml);

    // Cada 5 tarjetas (después del índice 4, 9, 14... en base global) se inserta un anuncio
    const globalCount = offsetIndex + index + 1;
    if (globalCount % 5 === 0) {
      const selectedAd = adList[adIndex % adList.length];
      result.push(renderFeedAdCard(selectedAd));
      adIndex++;
    }
  });

  return result;
}
