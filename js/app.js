/**
 * ==============================================================================
 * Controlador Principal de la Aplicación (El Muro - ES6 Module)
 * ==============================================================================
 * Conecta la interfaz de usuario con la capa de servicios de Supabase:
 * - Carga dinámica del feed con filtros en tiempo real (categoría, campus, búsqueda).
 * - Compresión de imágenes en cliente (WebP < 500KB) sin EXIF con vista previa.
 * - Publicación responsable con validación ética y código institucional.
 * - Reacciones interactivas con estados activos del visitante.
 * - Moderación comunitaria con reportes ciudadanos.
 */

import { SUPABASE_CONFIG } from './config/supabase.js';
import { getVisitorId, getVisitorIdHash } from './utils/visitorId.js';
import { compressImage } from './utils/imageCompressor.js';
import { uploadPostImage } from './services/storageService.js';
import {
  fetchFeed,
  createPost,
  toggleReaction,
  reportPost,
  fetchInstituciones,
  fetchVisitorReactions,
  CATEGORIAS_ENUM,
  TAG_A_CATEGORIA_MAP,
  TIPOS_REACCION,
  ETIQUETAS_OFICIALES
} from './services/postsService.js';
import { renderPostCard, getTagColorClass, getTagEmoji } from './components/postCard.js';
import { initAdSlider, injectAdsIntoFeed } from './components/adSlider.js';
import { initPresence } from './services/presenceService.js';

// ==============================================================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// ==============================================================================
const state = {
  currentCategory: 'Todo',
  currentCampusId: 'Todas',
  searchQuery: '',
  posts: [],
  visitorReactions: {},
  instituciones: [],
  selectedImageResult: null,
  isPublishing: false,
  connectedUsers: 18,
  activeReportPostId: null,
  selectedPostTags: ['Comunidad'], // Mínimo 1, máximo 3 etiquetas seleccionadas
  feedLimit: 10,
  feedOffset: 0,
  feedHasMore: true,
  isLoadingMore: false,
  totalActivePosts: 0
};

// Palabras reservadas y nombres propios para el filtro ético en tiempo real
const PALABRAS_RESERVADAS = [
  'carlos', 'maria', 'juan', 'andres', 'pedro', 'luis', 'ana', 'sofia', 'felipe', 'camila',
  'gonzalez', 'rodriguez', 'perez', 'martinez', 'lopez', 'gomez', 'estupido', 'perra', 'malparido',
  'hijueputa', 'gonorrea', 'marica', 'careverga', 'bastardo', 'imbecil'
];

/**
 * Valida si un texto infringe los términos éticos de El Muro
 * @param {string} texto 
 * @returns {{ valido: boolean, palabraInfractora: string|null }}
 */
function validarTextoEtico(texto) {
  if (!texto) return { valido: true, palabraInfractora: null };
  const lower = texto.toLowerCase();
  for (const palabra of PALABRAS_RESERVADAS) {
    const regex = new RegExp(`\\b${palabra}\\b`, 'i');
    if (regex.test(lower)) {
      return { valido: false, palabraInfractora: palabra };
    }
  }
  return { valido: true, palabraInfractora: null };
}

// ==============================================================================
// 2. INICIALIZACIÓN AL CARGAR EL DOM
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initSplashScreen();
  initTheme();
  initVisitorIdBadge();
  await loadInstituciones();
  renderDropdownEtiquetas();
  setupEventListeners();
  initPresence((count) => {
    state.connectedUsers = count;
    const counterEl = document.getElementById('conectados-count');
    if (counterEl) {
      counterEl.innerHTML = `${count} <span class="hidden xs:inline">activos</span>`;
    }
  });
  initAdSlider('ad-slider-container');
  await reloadFeed();
});

/**
 * Inicializa y controla el Splash Screen de bienvenida tipo app móvil.
 * Se muestra durante 1.5s (1500ms) y desvanece suavemente en 400ms.
 * Registra en sessionStorage para evitar fricción en recargas continuas del feed.
 */
function initSplashScreen() {
  const splashEl = document.getElementById('splash-screen');
  if (!splashEl) return;

  // Si ya se mostró previamente en esta pestaña, remover sin demora
  if (sessionStorage.getItem('muro_splash_shown')) {
    splashEl.remove();
    return;
  }

  // Evitar scroll de fondo durante la bienvenida
  document.body.classList.add('overflow-hidden');

  // Registrar en sessionStorage para la sesión actual
  sessionStorage.setItem('muro_splash_shown', 'true');

  // Transición de salida a los 1.5 segundos exactos
  setTimeout(() => {
    splashEl.classList.add('opacity-0', 'pointer-events-none');
    document.body.classList.remove('overflow-hidden');

    // Remover completamente del DOM tras la animación (400ms)
    setTimeout(() => {
      if (splashEl.parentNode) {
        splashEl.remove();
      }
    }, 400);
  }, 1500);
}

/**
 * Inicializa y restaura el tema claro / oscuro persistido
 */
function initTheme() {
  const savedTheme = localStorage.getItem('muro_tema') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeButton(savedTheme);
}

function toggleTema() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  if (next === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('muro_tema', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initVisitorIdBadge() {
  // Asegura que el visitante tenga su ID anónimo inicializado en localStorage
  const id = getVisitorId();
  console.info('[El Muro] Visitante anónimo inicializado:', id.substring(0, 8) + '...');
}

/**
 * Contador de usuarios activos en línea — ahora gestionado por presenceService.js
 * (Supabase Realtime Presence en producción, simulación en modo offline)
 * Ver: js/services/presenceService.js → initPresence()
 */

// ==============================================================================
// 3. CARGA DE DATOS & SERVICIOS
// ==============================================================================

/**
 * Carga las instituciones desde la base de datos y puebla los selectores
 */
async function loadInstituciones() {
  try {
    state.instituciones = await fetchInstituciones();
    populateInstitutionSelects(state.instituciones);
  } catch (error) {
    console.warn('[App] No se pudieron cargar las instituciones:', error);
  }
}

/**
 * Llena los selects de universidades con los IDs reales
 */
function populateInstitutionSelects(instituciones) {
  const selectFiltro = document.getElementById('filtro-universidad');
  const selectForm = document.getElementById('universidad');

  if (selectFiltro && instituciones.length > 0) {
    selectFiltro.innerHTML = `
      <option value="Todas">Todas las Instituciones</option>
      ${instituciones.map(i => `<option value="${i.id}">${i.nombre}</option>`).join('')}
    `;
  }

  if (selectForm && instituciones.length > 0) {
    selectForm.innerHTML = instituciones.map((i, idx) => `
      <option value="${i.id}" ${idx === 0 ? 'selected' : ''}>${i.nombre}</option>
    `).join('');

    // Prellenar código institucional de demostración si aplica
    updateAccessCodePlaceholder();
  }
}

/**
 * Sugiere el código institucional en el formulario para facilitar la prueba
 */
function updateAccessCodePlaceholder() {
  const selectForm = document.getElementById('universidad');
  const inputCodigo = document.getElementById('codigo-institucional');
  if (!selectForm || !inputCodigo) return;

  const currentId = selectForm.value;
  const inst = state.instituciones.find(i => i.id === currentId);
  if (inst && inst.codigo_acceso) {
    inputCodigo.placeholder = `Ej: ${inst.codigo_acceso}`;
    // Si está vacío, prellenarlo con el código por conveniencia de testing
    if (!inputCodigo.value) {
      inputCodigo.value = inst.codigo_acceso;
    }
  }
}

/**
 * Recarga el feed aplicando los filtros de categoría, institución y búsqueda (reinicia paginación a página 1)
 */
async function reloadFeed() {
  const feedContainer = document.getElementById('feed-container');
  if (!feedContainer) return;

  // Reiniciar estado de paginación al aplicar cualquier filtro
  state.feedOffset = 0;
  state.feedHasMore = true;
  state.isLoadingMore = false;

  // Estado de carga esqueleto estilo iOS
  feedContainer.innerHTML = `
    <div class="space-y-4">
      <div class="bg-white/80 dark:bg-slate-800/80 border border-orange-100/60 dark:border-slate-700 rounded-3xl p-6 animate-pulse space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded-full w-1/4"></div>
        <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded-xl w-3/4"></div>
        <div class="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-2xl w-full"></div>
      </div>
    </div>
  `;

  try {
    // 1. Consultar reacciones previas del visitante para pintar estados activos
    state.visitorReactions = await fetchVisitorReactions();

    // 2. Consultar primer bloque de feed con límite de 10
    const result = await fetchFeed(
      state.currentCategory,
      state.currentCampusId,
      state.searchQuery,
      { limit: state.feedLimit, offset: 0 }
    );

    state.posts = result.posts || [];
    state.totalActivePosts = result.totalCount || state.posts.length;
    state.feedHasMore = result.hasMore;

    renderFeed();
    renderTendencias();
  } catch (error) {
    console.error('[App] Error al recargar el feed:', error);
    feedContainer.innerHTML = `
      <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-3xl p-6 text-center space-y-2">
        <p class="text-rose-700 dark:text-rose-300 font-extrabold text-xs">⚠️ No se pudo cargar el feed de publicaciones.</p>
        <p class="text-rose-600 dark:text-rose-400 text-[11px]">${error.message || 'Verifica la conexión a Supabase.'}</p>
        <button onclick="window.reloadFeed()" class="mt-2 px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all">
          Reintentar
        </button>
      </div>
    `;
  }
}

/**
 * Renderiza el widget inferior de paginación (Botón "Cargar más", Spinner o Pill de Fin)
 */
function renderPaginationWidget() {
  if (state.isLoadingMore) {
    return `
      <div class="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-orange-200/80 dark:border-slate-700 shadow-sm text-xs font-bold text-slate-600 dark:text-slate-300 animate-pulse">
        <svg class="animate-spin h-4 w-4 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Cargando más publicaciones...</span>
      </div>
    `;
  }

  if (state.feedHasMore) {
    return `
      <button type="button" id="btn-cargar-mas" onclick="window.cargarMasPublicaciones()"
        class="group relative inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700/80 border-2 border-orange-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-black text-xs shadow-sm hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer">
        <span class="text-orange-500 font-black text-sm group-hover:translate-y-0.5 transition-transform">↓</span>
        <span>Cargar más publicaciones</span>
        <span class="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
          ${state.posts.length} de ${state.totalActivePosts}
        </span>
      </button>
    `;
  }

  return `
    <div class="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold shadow-xs animate-fade-in">
      <span>🏛️</span>
      <span>Has llegado al final de las publicaciones de las últimas 48h</span>
    </div>
  `;
}

/**
 * Renderiza la lista de publicaciones en el contenedor central
 */
function renderFeed() {
  const feedContainer = document.getElementById('feed-container');
  if (!feedContainer) return;

  if (!state.posts || state.posts.length === 0) {
    feedContainer.innerHTML = `
      <div class="bg-white dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-3xl p-10 text-center space-y-3 shadow-sm">
        <span class="text-3xl">🏛️</span>
        <h4 class="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider">No hay publicaciones aquí todavía</h4>
        <p class="text-slate-400 text-xs max-w-xs mx-auto">Sé la primera persona en compartir una inquietud, meme o vivencia universitaria responsablemente.</p>
        <button onclick="window.irAPublicar()" class="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold shadow-sm transition-all">
          <span>+</span> Crear Primera Publicación
        </button>
      </div>
    `;
    return;
  }

  const postCards = state.posts.map(post => {
    const userReaction = state.visitorReactions[post.id] || null;
    return renderPostCard(post, { userReaction });
  });

  const cardsWithAds = injectAdsIntoFeed(postCards, null, 0);

  feedContainer.innerHTML = `
    <div id="feed-cards-list" class="space-y-5">
      ${cardsWithAds.join('')}
    </div>
    <div id="feed-pagination-container" class="pt-6 pb-2 flex flex-col items-center justify-center">
      ${renderPaginationWidget()}
    </div>
  `;
}

/**
 * Carga el siguiente bloque de 10 publicaciones sin recargar la pantalla ni perder scroll
 */
async function cargarMasPublicaciones() {
  if (state.isLoadingMore || !state.feedHasMore) return;

  state.isLoadingMore = true;
  const paginationContainer = document.getElementById('feed-pagination-container');
  if (paginationContainer) {
    paginationContainer.innerHTML = renderPaginationWidget();
  }

  const nextOffset = state.feedOffset + state.feedLimit;

  try {
    const result = await fetchFeed(
      state.currentCategory,
      state.currentCampusId,
      state.searchQuery,
      { limit: state.feedLimit, offset: nextOffset }
    );

    const newPosts = result.posts || [];

    if (newPosts.length > 0) {
      try {
        const newReactions = await fetchVisitorReactions();
        Object.assign(state.visitorReactions, newReactions);
      } catch (e) {
        // Silencioso
      }

      const newPostCards = newPosts.map(post => {
        const userReaction = state.visitorReactions[post.id] || null;
        return renderPostCard(post, { userReaction });
      });

      // Inyectar anuncios patrocinados considerando la cuenta global previa de tarjetas
      const newCardsWithAds = injectAdsIntoFeed(newPostCards, null, state.posts.length);

      const cardsList = document.getElementById('feed-cards-list');
      if (cardsList) {
        cardsList.insertAdjacentHTML('beforeend', newCardsWithAds.join(''));
      }

      state.posts = [...state.posts, ...newPosts];
      state.feedOffset = nextOffset;
    }

    state.totalActivePosts = result.totalCount || state.posts.length;
    state.feedHasMore = result.hasMore;
  } catch (error) {
    console.error('[App] Error al cargar más publicaciones:', error);
  } finally {
    state.isLoadingMore = false;
    const pagContainerAfter = document.getElementById('feed-pagination-container');
    if (pagContainerAfter) {
      pagContainerAfter.innerHTML = renderPaginationWidget();
    }
  }
}

/**
 * Renderiza el widget lateral de tendencias de la semana
 */
function renderTendencias() {
  const container = document.getElementById('tendencias-container');
  if (!container) return;

  const top = [...state.posts]
    .sort((a, b) => (b.total_reacciones || 0) - (a.total_reacciones || 0))
    .slice(0, 3);

  if (top.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 italic">Sin tendencias registradas aún.</p>`;
    return;
  }

  container.innerHTML = top.map((t, idx) => `
    <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1">
      <div class="flex items-center justify-between text-[11px] font-extrabold">
        <span class="text-orange-600 dark:text-orange-400">#${idx + 1} Tendencia</span>
        <span class="text-slate-400">${t.total_reacciones || 0} reacciones</span>
      </div>
      <p class="font-bold text-slate-800 dark:text-slate-200 line-clamp-2">${t.titulo || t.descripcion || 'Publicación'}</p>
    </div>
  `).join('');
}

// ==============================================================================
// 4. CONFIGURACIÓN DE EVENT LISTENERS
// ==============================================================================
function setupEventListeners() {
  // 1. Toggle Tema
  const btnTheme = document.getElementById('btn-theme-toggle');
  btnTheme?.addEventListener('click', toggleTema);

  // 2. Buscador en tiempo real con Debounce
  const inputBuscar = document.getElementById('input-buscar');
  let debounceTimeout = null;
  inputBuscar?.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      reloadFeed();
    }, 280);
  });

  // 3. Botones de filtro de categorías
  document.querySelectorAll('.tag-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag') || btn.innerText.replace(/[✨📘💜🌿📙🌸🍯#\s]/g, '');
      filtrarCategoria(tag || 'Todo', btn);
    });
  });

  // 6. Validación ética y contador de caracteres en tiempo real
  const textarea = document.getElementById('contenido');
  const inputTitulo = document.getElementById('titulo-publicacion');
  const charCount = document.getElementById('char-count');
  const alertaEtica = document.getElementById('alerta-filtro-etico');

  function checkEthics() {
    const texto = (textarea?.value || '') + ' ' + (inputTitulo?.value || '');
    if (charCount && textarea) {
      charCount.textContent = `${textarea.value.length} / 280`;
    }

    const res = validarTextoEtico(texto);
    if (!res.valido && texto.trim().length > 3) {
      alertaEtica?.classList.remove('hidden');
      if (alertaEtica) {
        alertaEtica.innerHTML = `⚠️ <span>Atención: La palabra <strong>"${res.palabraInfractora}"</strong> infringe el Código Ético (sin nombres propios ni ofensas).</span>`;
      }
    } else {
      alertaEtica?.classList.add('hidden');
    }
  }

  textarea?.addEventListener('input', checkEthics);
  inputTitulo?.addEventListener('input', checkEthics);

  // 7. Procesamiento y compresión de imagen WebP al seleccionar archivo
  const inputImagen = document.getElementById('imagen');
  inputImagen?.addEventListener('change', handleImageSelection);

  // Botón para quitar imagen seleccionada
  const btnQuitarImagen = document.getElementById('btn-quitar-imagen');
  btnQuitarImagen?.addEventListener('click', resetImageSelection);

  // 8. Botón publicar en el formulario
  const btnPublicar = document.getElementById('btn-publicar-post');
  btnPublicar?.addEventListener('click', handleCreatePost);

  // 9. Menú desplegable de etiquetas oficiales
  const btnDropdown = document.getElementById('btn-dropdown-etiquetas');
  const menuDropdown = document.getElementById('menu-desplegable-etiquetas');
  const chevron = document.getElementById('dropdown-chevron');

  btnDropdown?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menuDropdown?.classList.contains('hidden');
    if (isHidden) {
      menuDropdown?.classList.remove('hidden');
      chevron?.classList.add('rotate-180');
    } else {
      menuDropdown?.classList.add('hidden');
      chevron?.classList.remove('rotate-180');
    }
  });

  // Cerrar el menú desplegable al hacer clic fuera
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('dropdown-etiquetas-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      menuDropdown?.classList.add('hidden');
      chevron?.classList.remove('rotate-180');
    }
  });

  // 10. Control de Formulario Desplegable en Móvil
  const btnDesplegarMovil = document.getElementById('btn-desplegar-publicar-movil');
  const btnCerrarMovil = document.getElementById('btn-cerrar-form-movil');
  btnDesplegarMovil?.addEventListener('click', abrirFormularioMovil);
  btnCerrarMovil?.addEventListener('click', cerrarFormularioMovil);

  // 11. Delegación de eventos en el feed (Reacciones, Compartir, Reportar)
  const feedContainer = document.getElementById('feed-container');
  feedContainer?.addEventListener('click', handleFeedActions);

  // 12. Modal de Reporte
  setupReportModal();
}

/**
 * Despliega el formulario de publicación en móvil
 */
function abrirFormularioMovil() {
  const form = document.getElementById('seccion-publicar');
  const btnDesplegar = document.getElementById('btn-desplegar-publicar-movil');
  if (form) {
    form.classList.remove('hidden');
    btnDesplegar?.classList.add('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      document.getElementById('titulo-publicacion')?.focus();
    }, 150);
  }
}

/**
 * Oculta el formulario de publicación en móvil tras publicar o cancelar
 */
function cerrarFormularioMovil() {
  if (window.innerWidth < 1024) {
    const form = document.getElementById('seccion-publicar');
    const btnDesplegar = document.getElementById('btn-desplegar-publicar-movil');
    form?.classList.add('hidden');
    btnDesplegar?.classList.remove('hidden');
  }
}

/**
 * Filtra el feed por categoría y actualiza el estilo activo de las píldoras
 */
function filtrarCategoria(categoria, clickedBtn = null) {
  state.currentCategory = categoria;

  // Actualizar clases activas en los botones de categoría
  document.querySelectorAll('.tag-filter-btn').forEach(b => {
    b.classList.remove('active', 'bg-slate-900', 'text-white', 'dark:bg-white', 'dark:text-slate-900');
  });

  if (clickedBtn) {
    clickedBtn.classList.add('active', 'bg-slate-900', 'text-white', 'dark:bg-white', 'dark:text-slate-900');
  }

  reloadFeed();
}

// ==============================================================================
// 4.1. GESTIÓN INTERACTIVA DEL MENÚ DESPLEGABLE DE ETIQUETAS
// ==============================================================================
function renderDropdownEtiquetas() {
  const triggerContainer = document.getElementById('dropdown-trigger-tags');
  const menuContainer = document.getElementById('menu-desplegable-etiquetas');
  if (!triggerContainer || !menuContainer) return;

  // 1. Renderizar la selección activa en el botón trigger
  if (state.selectedPostTags.length === 0) {
    triggerContainer.innerHTML = `<span class="text-slate-400 font-medium">Seleccionar etiquetas...</span>`;
  } else {
    triggerContainer.innerHTML = state.selectedPostTags.map(tag => {
      const emoji = getTagEmoji(tag);
      const colorClass = getTagColorClass(tag);
      return `<span class="px-2 py-0.5 rounded-lg text-xs font-black ${colorClass} flex items-center gap-1 shrink-0">
        <span>${emoji}</span><span>#${tag}</span>
      </span>`;
    }).join('');
  }

  // 2. Renderizar las opciones dentro del menú desplegable diferenciando seleccionadas vs no seleccionadas
  menuContainer.innerHTML = ETIQUETAS_OFICIALES.map(tag => {
    const isSelected = state.selectedPostTags.includes(tag);
    const emoji = getTagEmoji(tag);
    const colorClass = getTagColorClass(tag);

    // Diferenciación clara: Seleccionada tiene color vibrante, borde activo y check ✓
    const itemClasses = isSelected
      ? `${colorClass} font-black border-2 shadow-xs ring-1 ring-orange-400/40`
      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 font-semibold border border-transparent';

    const checkIndicator = isSelected
      ? `<span class="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[11px] font-black shadow-xs">✓</span>`
      : `<span class="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] text-slate-300 dark:text-slate-600"></span>`;

    return `
      <div 
        data-dropdown-tag="${tag}"
        class="cursor-pointer p-2.5 rounded-xl flex items-center justify-between text-xs transition-all select-none ${itemClasses}"
        title="${isSelected ? 'Etiqueta seleccionada (clic para quitar)' : 'Clic para seleccionar'}"
      >
        <div class="flex items-center gap-2">
          <span class="text-base">${emoji}</span>
          <span>#${tag}</span>
        </div>
        ${checkIndicator}
      </div>
    `;
  }).join('');

  // Event listeners para los items del menú desplegable
  menuContainer.querySelectorAll('[data-dropdown-tag]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = item.dataset.dropdownTag;
      toggleTagSelection(tag);
    });
  });
}

function toggleTagSelection(tag) {
  const index = state.selectedPostTags.indexOf(tag);

  if (index !== -1) {
    if (state.selectedPostTags.length <= 1) {
      showNotification('Debes mantener al menos 1 etiqueta oficial seleccionada.', 'warning');
      return;
    }
    state.selectedPostTags.splice(index, 1);
  } else {
    if (state.selectedPostTags.length >= 3) {
      showNotification('Puedes seleccionar máximo 3 etiquetas por publicación.', 'warning');
      return;
    }
    state.selectedPostTags.push(tag);
  }

  renderDropdownEtiquetas();
}

// ==============================================================================
// 5. MANEJO DE IMÁGENES (COMPRESIÓN WEBP + PREVISUALIZACIÓN)
// ==============================================================================

/**
 * Procesa la imagen seleccionada mediante compressImage (WebP, <500KB, sin EXIF)
 */
async function handleImageSelection(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const previewContainer = document.getElementById('preview-imagen-container');
  const previewThumb = document.getElementById('preview-imagen-thumb');
  const previewInfo = document.getElementById('preview-imagen-info');
  const previewRatio = document.getElementById('preview-imagen-ratio');

  try {
    // Feedback visual temporal
    if (previewContainer) {
      previewContainer.classList.remove('hidden');
      if (previewInfo) previewInfo.textContent = 'Comprimiendo a WebP y sanitizando metadatos EXIF...';
    }

    const compressed = await compressImage(file);
    state.selectedImageResult = compressed;

    const lblTexto = document.getElementById('lbl-imagen-texto');
    if (lblTexto) {
      lblTexto.textContent = `Imagen lista (${compressed.sizeKb} KB)`;
    }

    if (previewThumb) previewThumb.src = compressed.previewUrl;
    if (previewInfo) previewInfo.textContent = `WebP optimizado: ${compressed.sizeKb} KB (Original: ${compressed.originalSizeKb} KB)`;
    if (previewRatio) previewRatio.textContent = `🔒 ${compressed.compressionRatio} reducción • Sin metadatos EXIF • ${compressed.width}x${compressed.height}px`;

  } catch (error) {
    console.error('[App] Error al comprimir imagen:', error);
    showNotification(error.message || 'Error al procesar la imagen seleccionada.', 'error');
    resetImageSelection();
  }
}

function resetImageSelection() {
  state.selectedImageResult = null;
  const inputImagen = document.getElementById('imagen');
  if (inputImagen) inputImagen.value = '';

  const lblTexto = document.getElementById('lbl-imagen-texto');
  if (lblTexto) lblTexto.textContent = 'Seleccionar Imagen';

  const previewContainer = document.getElementById('preview-imagen-container');
  if (previewContainer) previewContainer.classList.add('hidden');
}

// ==============================================================================
// 6. CREACIÓN DE PUBLICACIÓN
// ==============================================================================
async function handleCreatePost() {
  if (state.isPublishing) return;

  const tituloEl = document.getElementById('titulo-publicacion');
  const contenidoEl = document.getElementById('contenido');
  const btnPublicar = document.getElementById('btn-publicar-post');

  const titulo = (tituloEl?.value || '').trim();
  const contenido = (contenidoEl?.value || '').trim();

  // Validación de 1 a 3 etiquetas oficiales seleccionadas
  if (!state.selectedPostTags || state.selectedPostTags.length < 1 || state.selectedPostTags.length > 3) {
    showNotification('Debes seleccionar entre 1 y 3 etiquetas oficiales.', 'warning');
    return;
  }

  const categoria = state.selectedPostTags[0];
  const etiquetas = [...state.selectedPostTags];

  // Sede e institución predeterminada oficial (Versión única institucional)
  const instPredeterminada = (state.instituciones && state.instituciones.length > 0)
    ? state.instituciones[0]
    : { id: '11111111-1111-1111-1111-111111111111', codigo_acceso: 'UNICORDOBA2026' };

  const institucionId = instPredeterminada.id;
  const codigoAcceso = instPredeterminada.codigo_acceso || 'UNICORDOBA2026';

  // 1. Validaciones requeridas
  if (!titulo && !contenido) {
    showNotification('Por favor redacta un título o mensaje para tu publicación.', 'warning');
    return;
  }

  // Si no hay título explícito, tomar la primera oración o los primeros 60 caracteres
  const finalTitulo = titulo || (contenido.length > 60 ? contenido.substring(0, 57) + '...' : contenido);

  // 2. Validación ética estricta
  const eticaTitulo = validarTextoEtico(finalTitulo);
  const eticaContenido = validarTextoEtico(contenido);
  if (!eticaTitulo.valido || !eticaContenido.valido) {
    const infraccion = eticaTitulo.palabraInfractora || eticaContenido.palabraInfractora;
    showNotification(`Publicación bloqueada por el Código Ético: No se permiten términos como "${infraccion}". Mantén un ambiente constructivo.`, 'error');
    return;
  }

  // 3. Proceder a publicar con estado de carga
  state.isPublishing = true;
  const originalBtnText = btnPublicar ? btnPublicar.innerHTML : 'Publicar';
  if (btnPublicar) {
    btnPublicar.disabled = true;
    btnPublicar.innerHTML = `<span>⏳</span> Publicando de forma segura...`;
  }

  try {
    let imagenUrl = null;

    // Subir imagen a Supabase Storage si se adjuntó una
    if (state.selectedImageResult && state.selectedImageResult.blob) {
      if (btnPublicar) btnPublicar.innerHTML = `<span>☁️</span> Subiendo imagen WebP...`;
      imagenUrl = await uploadPostImage(state.selectedImageResult.blob);
    }

    if (btnPublicar) btnPublicar.innerHTML = `<span>🛡️</span> Creando publicación...`;

    // Invocar RPC en Supabase con la categoría principal y el arreglo de 1 a 3 etiquetas
    await createPost({
      institucionId,
      codigoAcceso,
      categoria,
      titulo: finalTitulo,
      descripcion: contenido,
      imagenUrl,
      etiquetas
    });

    // 4. Limpieza exitosa del formulario
    if (tituloEl) tituloEl.value = '';
    if (contenidoEl) contenidoEl.value = '';
    const charCount = document.getElementById('char-count');
    if (charCount) charCount.textContent = '0 / 280';
    state.selectedPostTags = ['Comunidad'];
    renderDropdownEtiquetas();
    resetImageSelection();

    showNotification('¡Publicación creada exitosamente en El Muro! 🏛️');
    cerrarFormularioMovil();

    // Recargar feed para mostrar la nueva publicación
    await reloadFeed();

  } catch (error) {
    console.error('[App] Error al publicar:', error);
    showNotification(error.message || 'No se pudo crear la publicación. Verifica el código institucional.', 'error');
  } finally {
    state.isPublishing = false;
    if (btnPublicar) {
      btnPublicar.disabled = false;
      btnPublicar.innerHTML = originalBtnText;
    }
  }
}

// ==============================================================================
// 7. ACCIONES DEL FEED (REACCIONES, COMPARTIR, REPORTAR)
// ==============================================================================
async function handleFeedActions(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const postId = target.getAttribute('data-post-id');

  if (action === 'react') {
    const reactionType = target.getAttribute('data-reaction');
    await handleReactionClick(postId, reactionType, target);
  } else if (action === 'share') {
    const postTitle = target.getAttribute('data-post-title') || 'Publicación en El Muro';
    handleShareClick(postId, postTitle);
  } else if (action === 'report') {
    openReportModal(postId);
  }
}

/**
 * Gestiona el voto de una de las 6 reacciones con actualización optimista
 */
async function handleReactionClick(postId, reactionType, buttonEl) {
  const previousReaction = state.visitorReactions[postId];
  const isToggleOff = previousReaction === reactionType;

  // Actualización optimista en el estado local
  if (isToggleOff) {
    delete state.visitorReactions[postId];
  } else {
    state.visitorReactions[postId] = reactionType;
  }

  // Re-renderizar tarjeta individual para máxima fluidez
  const post = state.posts.find(p => p.id === postId);
  if (post) {
    post.reacciones_detalle = post.reacciones_detalle || {};

    if (isToggleOff) {
      post.reacciones_detalle[reactionType] = Math.max(0, (post.reacciones_detalle[reactionType] || 1) - 1);
      post.total_reacciones = Math.max(0, (post.total_reacciones || 1) - 1);
    } else {
      if (previousReaction) {
        post.reacciones_detalle[previousReaction] = Math.max(0, (post.reacciones_detalle[previousReaction] || 1) - 1);
      } else {
        post.total_reacciones = (post.total_reacciones || 0) + 1;
      }
      post.reacciones_detalle[reactionType] = (post.reacciones_detalle[reactionType] || 0) + 1;
    }

    const cardEl = document.getElementById(`post-${postId}`);
    if (cardEl) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = renderPostCard(post, { userReaction: state.visitorReactions[postId] });
      cardEl.replaceWith(tempDiv.firstElementChild);
    }
  }

  try {
    await toggleReaction(postId, reactionType);
  } catch (error) {
    console.error('[App] Error al registrar reacción en servidor:', error);
    // Revertir estado si falló
    if (isToggleOff) {
      state.visitorReactions[postId] = reactionType;
    } else if (previousReaction) {
      state.visitorReactions[postId] = previousReaction;
    } else {
      delete state.visitorReactions[postId];
    }
    reloadFeed();
  }
}

/**
 * Comparte una publicación o copia el enlace permalink
 */
function handleShareClick(postId, postTitle) {
  const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
  const shareData = {
    title: 'El Muro - Red Estudiantil',
    text: `🏛️ Mira esta publicación en El Muro: "${postTitle}"`,
    url: url
  };

  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData).catch(() => {});
  } else {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification('¡Enlace de la publicación copiado al portapapeles! 📋');
      }).catch(() => {
        prompt('Copia el enlace de esta publicación:', url);
      });
    } else {
      prompt('Copia el enlace de esta publicación:', url);
    }
  }
}

// ==============================================================================
// 8. MODAL DE REPORTE CIUDADANO (MODERACIÓN ÉTICA A 3 REPORTES)
// ==============================================================================
function setupReportModal() {
  const modal = document.getElementById('modal-reporte');
  const btnCancelar = document.getElementById('btn-cancelar-reporte');
  const formReporte = document.getElementById('form-reporte');

  btnCancelar?.addEventListener('click', closeReportModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeReportModal();
  });

  formReporte?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const postId = state.activeReportPostId;
    if (!postId) return;

    const motivoSelect = document.getElementById('motivo-reporte-select');
    const motivoExtra = document.getElementById('motivo-reporte-extra');
    const motivo = `${motivoSelect?.value || 'Incumplimiento ético'}: ${motivoExtra?.value || ''}`.trim();

    const submitBtn = formReporte.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await reportPost(postId, motivo);
      closeReportModal();
      showNotification(res.message || 'Reporte registrado exitosamente. Gracias por proteger el muro.');
      await reloadFeed();
    } catch (err) {
      showNotification(`Error al reportar: ${err.message}`, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openReportModal(postId) {
  state.activeReportPostId = postId;
  const modal = document.getElementById('modal-reporte');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeReportModal() {
  state.activeReportPostId = null;
  const modal = document.getElementById('modal-reporte');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// ==============================================================================
// 9. NOTIFICACIONES TOAST ESTILO IOS
// ==============================================================================
/**
 * Muestra una notificación toast estilizada sin romper la interfaz.
 * @param {string} message - Texto a mostrar
 * @param {'success'|'error'|'warning'|'info'} [type='success'] - Variante visual
 */
function showNotification(message, type = 'success') {
  const existing = document.getElementById('muro-toast');
  if (existing) existing.remove();

  const icons = { success: '✨', error: '⚠️', warning: '⚡', info: 'ℹ️' };
  const bgColors = {
    success: 'bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 border-slate-700/50',
    error: 'bg-rose-700/95 dark:bg-rose-600/95 text-white border-rose-500/50',
    warning: 'bg-amber-600/95 dark:bg-amber-500/95 text-white border-amber-400/50',
    info: 'bg-sky-700/95 dark:bg-sky-600/95 text-white border-sky-500/50'
  };

  const toast = document.createElement('div');
  toast.id = 'muro-toast';
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${bgColors[type] || bgColors.success} px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md text-xs font-black flex items-center gap-2 border animate-fade-in max-w-[90vw]`;
  toast.innerHTML = `<span>${icons[type] || icons.success}</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  const duration = type === 'error' ? 5000 : 3200;
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 12px)';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// Exponer funciones necesarias en el objeto global window para compatibilidad
window.filtrarEtiqueta = (tag) => filtrarCategoria(tag);
window.cargarMasPublicaciones = cargarMasPublicaciones;
window.irAPublicar = () => {
  if (window.innerWidth < 1024) {
    abrirFormularioMovil();
  } else {
    document.getElementById('seccion-publicar')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('titulo-publicacion')?.focus();
  }
};
window.toggleTema = toggleTema;
window.reloadFeed = reloadFeed;

export default {
  state,
  reloadFeed,
  handleCreatePost
};
