/**
 * ==============================================================================
 * Controlador del Panel de Administración & Moderación (admin.js)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Funcionalidades clave:
 * 1. Autenticación segura de moderadores con Supabase Auth (signInWithPassword / signOut).
 * 2. Tab de Moderación: Publicaciones con 3+ reportes o en revisión preventiva.
 *    - Acciones: Aprobar (restaura y limpia reportes), Ocultar o Rechazar definitivamente.
 * 3. Tab de Auditoría: Bitácora inmutable de decisiones tomadas (historial_moderacion).
 * 4. Tab de Códigos Institucionales: Generación, activación o pausa de códigos por campus.
 * 5. Tab de Publicidad: Lista de campañas patrocinadas, switch de pago y activación.
 * 6. Tab de Métricas: Estadísticas generales del ecosistema universitario en tiempo real.
 */

import { supabase, SUPABASE_CONFIG } from './config/supabase.js';
import { compressImage } from './utils/imageCompressor.js';
import { uploadPostImage } from './services/storageService.js';

// ==============================================================================
// 1. ESTADO GLOBAL DEL PANEL DE ADMINISTRACIÓN
// ==============================================================================
const adminState = {
  session: null,
  isDemoMode: false,
  currentTab: 'moderacion',
  moderationPosts: [],
  instituciones: [],
  anuncios: [],
  historial: [],
  actionPendingPostId: null,
  actionPendingType: null, // 'aprobar' | 'ocultar' | 'rechazar'
  pendingAdImage: null, // { blob, file, previewUrl } from compressImage
  moderationPage: 1,
  moderationPageSize: 10,
  historialPage: 1,
  historialPageSize: 10
};

// Datos simulados para modo demo o fallback de desarrollo
const DEMO_MODERATION_POSTS = [
  {
    id: 'rep-001',
    titulo: 'Venta de resúmenes y exámenes finales resueltos',
    descripcion: 'Tengo las respuestas del parcial de cálculo integral del semestre pasado. Escriban al interno.',
    categoria: 'Académico',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad de Córdoba (Unicórdoba)',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 44 * 3600000).toISOString(),
    motivos: [
      'Fraude académico sistemático',
      'Spam o comercio no autorizado en campus',
      'Vulneración a las normas institucionales'
    ]
  },
  {
    id: 'rep-002',
    titulo: 'El profesor de física es el peor de la facultad',
    descripcion: 'Nadie le entiende nada y califica como le da la gana, deberían botarlo.',
    categoria: 'Curiosidades',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 4,
    institucion_nombre: 'Universidad Pontificia Bolivariana (UPB)',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    created_at: new Date(Date.now() - 10 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 38 * 3600000).toISOString(),
    motivos: [
      'Mención o señalamiento personal a docente',
      'Lenguaje ofensivo o ciberacoso',
      'Incumplimiento del código ético'
    ]
  },
  {
    id: 'rep-003',
    titulo: 'Servicio no oficial de cambio de notas en el sistema',
    descripcion: 'Cobro por modificar calificaciones en la plataforma académica sin rastro.',
    categoria: 'Académico',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 5,
    institucion_nombre: 'Universidad Nacional (UNAL)',
    institucion_id: '55555555-5555-5555-5555-555555555555',
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 36 * 3600000).toISOString(),
    motivos: ['Intento de vulneración a sistemas informáticos', 'Fraude grave']
  },
  {
    id: 'rep-004',
    titulo: 'Se busca persona que haga la tesis completa por 200 mil',
    descripcion: 'Área de ciencias sociales, entrega en tres semanas.',
    categoria: 'Académico',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad de Antioquia (UdeA)',
    institucion_id: '44444444-4444-4444-4444-444444444444',
    created_at: new Date(Date.now() - 14 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 34 * 3600000).toISOString(),
    motivos: ['Suplantación y plagio académico']
  },
  {
    id: 'rep-005',
    titulo: 'Rumores sobre cierre indefinido de la cafetería central',
    descripcion: 'Dicen que despidieron al personal por huelga injustificada.',
    categoria: 'Comunidad',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad de Córdoba (Unicórdoba)',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 16 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 32 * 3600000).toISOString(),
    motivos: ['Desinformación sin sustento oficial']
  },
  {
    id: 'rep-006',
    titulo: 'Venta de cigarrillos electrónicos dentro del bloque 4',
    descripcion: 'Tengo diferentes sabores a buen precio en los pasillos.',
    categoria: 'Emprendimientos y clasificados',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 4,
    institucion_nombre: 'Universidad del Sinú (Unisinú)',
    institucion_id: '33333333-3333-3333-3333-333333333333',
    created_at: new Date(Date.now() - 18 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 30 * 3600000).toISOString(),
    motivos: ['Comercialización de sustancias restringidas en campus']
  },
  {
    id: 'rep-007',
    titulo: 'Exposición no autorizada de números de WhatsApp de estudiantes',
    descripcion: 'Lista de contactos de primer semestre para grupos de fiesta.',
    categoria: 'Comunidad',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 6,
    institucion_nombre: 'Universidad Pontificia Bolivariana (UPB)',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    created_at: new Date(Date.now() - 20 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 28 * 3600000).toISOString(),
    motivos: ['Violación flagrante de datos personales Ley 1581']
  },
  {
    id: 'rep-008',
    titulo: 'Venta de boletos falsos para la fiesta interuniversitaria',
    descripcion: 'Pases VIP a mitad de precio solo por hoy.',
    categoria: 'Eventos y actividades',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad Nacional (UNAL)',
    institucion_id: '55555555-5555-5555-5555-555555555555',
    created_at: new Date(Date.now() - 22 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 26 * 3600000).toISOString(),
    motivos: ['Estafa o fraude económico']
  },
  {
    id: 'rep-009',
    titulo: 'Burlas y apodos sobre el equipo de debate',
    descripcion: 'Post con mofas sobre los integrantes del grupo institucional.',
    categoria: 'Curiosidades',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad de Antioquia (UdeA)',
    institucion_id: '44444444-4444-4444-4444-444444444444',
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    motivos: ['Ciberacoso y hostigamiento']
  },
  {
    id: 'rep-010',
    titulo: 'Venta de medicamentos de control sin prescripción',
    descripcion: 'Pastillas para concentrarse durante los exámenes finales.',
    categoria: 'Comunidad',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 7,
    institucion_nombre: 'Universidad de Córdoba (Unicórdoba)',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 22 * 3600000).toISOString(),
    motivos: ['Riesgo a la salud pública y venta ilícita']
  },
  {
    id: 'rep-011',
    titulo: 'Difamación a monitor de laboratorio de física',
    descripcion: 'Comentarios falsos sobre su trato a estudiantes.',
    categoria: 'Académico',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 3,
    institucion_nombre: 'Universidad del Sinú (Unisinú)',
    institucion_id: '33333333-3333-3333-3333-333333333333',
    created_at: new Date(Date.now() - 28 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 20 * 3600000).toISOString(),
    motivos: ['Ataques a la honra y buen nombre']
  },
  {
    id: 'rep-012',
    titulo: 'Publicidad engañosa sobre becas de intercambio',
    descripcion: 'Pide depósitos previos en cuenta bancaria sospechosa.',
    categoria: 'Eventos y actividades',
    imagen_url: null,
    estado: 'en_revision',
    reportes_count: 4,
    institucion_nombre: 'Universidad Pontificia Bolivariana (UPB)',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    created_at: new Date(Date.now() - 30 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 18 * 3600000).toISOString(),
    motivos: ['Phishing o fraude financiero']
  }
];

const DEMO_INSTITUCIONES = [
  { id: '11111111-1111-1111-1111-111111111111', nombre: 'Universidad de Córdoba (Unicórdoba)', codigo_acceso: 'UNICORDOBA2026', activa: true, created_at: new Date().toISOString() },
  { id: '22222222-2222-2222-2222-222222222222', nombre: 'Universidad Pontificia Bolivariana (UPB)', codigo_acceso: 'UPB2026', activa: true, created_at: new Date().toISOString() },
  { id: '33333333-3333-3333-3333-333333333333', nombre: 'Universidad del Sinú (Unisinú)', codigo_acceso: 'UNISINU2026', activa: true, created_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444444', nombre: 'Universidad de Antioquia (UdeA)', codigo_acceso: 'UDEA2026', activa: false, created_at: new Date().toISOString() },
  { id: '55555555-5555-5555-5555-555555555555', nombre: 'Universidad Nacional (UNAL)', codigo_acceso: 'UNAL2026', activa: true, created_at: new Date().toISOString() }
];

const DEMO_HISTORIAL = [
  {
    id: 'aud-001',
    created_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    accion_realizada: 'ocultamiento_preventivo_automatico',
    publicacion_id: 'rep-001',
    publicacion_titulo: 'Venta de resúmenes y exámenes finales resueltos',
    moderador_email: 'Sistema Automático (Trigger DB)',
    justificacion: 'Publicación cambiada a "en_revision" preventivamente al acumular 3 reportes comunitarios.'
  },
  {
    id: 'aud-002',
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    accion_realizada: 'publicacion_rechazada',
    publicacion_id: 'old-99',
    publicacion_titulo: 'Comentario difamatorio con nombres propios',
    moderador_email: 'comite.etico@unicordoba.edu.co',
    justificacion: 'Se confirma señalamiento directo y vulneración de la intimidad según ley 1581 de 2012.'
  },
  {
    id: 'aud-003',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    accion_realizada: 'publicacion_aprobada',
    publicacion_id: 'post-501',
    publicacion_titulo: 'Debate respetuoso sobre calidad del almuerzo estudiantil',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Revisada la publicación: expresa una opinión estudiantil legítima sin vulnerar el código ético.'
  },
  {
    id: 'aud-004',
    created_at: new Date(Date.now() - 7 * 3600000).toISOString(),
    accion_realizada: 'publicacion_ocultada',
    publicacion_id: 'post-502',
    publicacion_titulo: 'Meme que roza la sátira personal a docente',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Ocultada preventivamente para revisión con el comité del campus.'
  },
  {
    id: 'aud-005',
    created_at: new Date(Date.now() - 9 * 3600000).toISOString(),
    accion_realizada: 'publicacion_rechazada',
    publicacion_id: 'post-503',
    publicacion_titulo: 'Publicidad de criptomonedas y esquemas piramidales',
    moderador_email: 'admin@elmuro-universitario.co',
    justificacion: 'Violación estricta de la política de comercio ético y clasificados permitidos.'
  },
  {
    id: 'aud-006',
    created_at: new Date(Date.now() - 11 * 3600000).toISOString(),
    accion_realizada: 'ocultamiento_preventivo_automatico',
    publicacion_id: 'rep-003',
    publicacion_titulo: 'Servicio no oficial de cambio de notas en el sistema',
    moderador_email: 'Sistema Automático (Trigger DB)',
    justificacion: 'Acumulación de 5 reportes de usuarios.'
  },
  {
    id: 'aud-007',
    created_at: new Date(Date.now() - 13 * 3600000).toISOString(),
    accion_realizada: 'publicacion_aprobada',
    publicacion_id: 'post-504',
    publicacion_titulo: 'Queja sobre iluminación en parqueadero de motos',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Petición constructiva enmarcada en sugerencias para la comunidad universitaria.'
  },
  {
    id: 'aud-008',
    created_at: new Date(Date.now() - 15 * 3600000).toISOString(),
    accion_realizada: 'publicacion_rechazada',
    publicacion_id: 'post-505',
    publicacion_titulo: 'Acoso a estudiante de primer semestre de medicina',
    moderador_email: 'comite.etico@upb.edu.co',
    justificacion: 'Tolerancia cero con el ciberacoso; retiro definitivo del registro.'
  },
  {
    id: 'aud-009',
    created_at: new Date(Date.now() - 17 * 3600000).toISOString(),
    accion_realizada: 'publicacion_aprobada',
    publicacion_id: 'post-506',
    publicacion_titulo: 'Denuncia por pérdida de billetera con documentos',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Publicación clasificada en objetos perdidos cumple con la veracidad requerida.'
  },
  {
    id: 'aud-010',
    created_at: new Date(Date.now() - 19 * 3600000).toISOString(),
    accion_realizada: 'publicacion_ocultada',
    publicacion_id: 'post-507',
    publicacion_titulo: 'Encuesta no autorizada sobre consumo en el campus',
    moderador_email: 'admin@elmuro-universitario.co',
    justificacion: 'Pendiente de verificación con la dirección académica del campus.'
  },
  {
    id: 'aud-011',
    created_at: new Date(Date.now() - 21 * 3600000).toISOString(),
    accion_realizada: 'publicacion_rechazada',
    publicacion_id: 'post-508',
    publicacion_titulo: 'Links acortados con malware simulado',
    moderador_email: 'seguridad@elmuro-universitario.co',
    justificacion: 'Intento malicioso de redirección a páginas externas no seguras.'
  },
  {
    id: 'aud-012',
    created_at: new Date(Date.now() - 23 * 3600000).toISOString(),
    accion_realizada: 'publicacion_aprobada',
    publicacion_id: 'post-509',
    publicacion_titulo: 'Campaña de adopción de perritos rescatados en el campus',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Iniciativa ética y de bienestar animal respaldada por la comunidad.'
  },
  {
    id: 'aud-013',
    created_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    accion_realizada: 'publicacion_rechazada',
    publicacion_id: 'post-510',
    publicacion_titulo: 'Suplantación de identidad de representante estudiantil',
    moderador_email: 'comite.etico@udea.edu.co',
    justificacion: 'Infracción grave de suplantación.'
  },
  {
    id: 'aud-014',
    created_at: new Date(Date.now() - 27 * 3600000).toISOString(),
    accion_realizada: 'publicacion_aprobada',
    publicacion_id: 'post-511',
    publicacion_titulo: 'Grupo de práctica deportiva y calistenia en zonas verdes',
    moderador_email: 'moderacion@elmuro-universitario.co',
    justificacion: 'Fomento al deporte y estilo de vida saludable en el campus.'
  }
];

const DEMO_ANUNCIOS = [
  {
    id: 'ad-01',
    titulo: 'La Hueca Gourmet — Descuento del 15% presentando carnet universitario',
    imagen_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    telefono_contacto: '3001234567',
    ubicacion_referencia: 'Frente a la entrada principal del Bloque A',
    enlace_url: 'https://wa.me/573001234567',
    activo: true,
    verificado_pago: true,
    fecha_inicio: new Date(Date.now() - 5 * 86400000).toISOString(),
    fecha_fin: new Date(Date.now() + 25 * 86400000).toISOString()
  },
  {
    id: 'ad-02',
    titulo: 'Centro de Fotocopiado & Ploteo: Impresiones láser y anillados',
    imagen_url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80',
    telefono_contacto: '3109876543',
    ubicacion_referencia: 'Al lado de la cafetería central, Bloque B',
    enlace_url: 'https://wa.me/573109876543',
    activo: true,
    verificado_pago: true,
    fecha_inicio: new Date(Date.now() - 2 * 86400000).toISOString(),
    fecha_fin: new Date(Date.now() + 28 * 86400000).toISOString()
  }
];

// ==============================================================================
// 2. INICIALIZACIÓN AL CARGAR EL DOM
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();
  await checkAuthSession();
});

/**
 * Gestión del Tema Claro / Oscuro
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

function updateThemeButton(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
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

// ==============================================================================
// 3. AUTENTICACIÓN SUPABASE AUTH
// ==============================================================================
async function checkAuthSession() {
  // Verificar si hay sesión activa en Supabase Auth
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data?.session) {
      adminState.session = data.session;
      renderAuthenticatedDashboard();
      return;
    }
  } catch (err) {
    console.info('[Admin] No se detectó sesión Supabase activa:', err);
  }

  // Verificar sesión de Demo deshabilitada para fase de validación profesional
  // El acceso requiere autenticación real vía Supabase Auth.

  renderLoginScreen();
}

/**
 * Iniciar sesión con email y contraseña en Supabase Auth
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const alertBox = document.getElementById('login-error-alert');
  const alertMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('btn-submit-login');

  alertBox?.classList.add('hidden');
  const email = emailInput?.value.trim();
  const password = passInput?.value;

  if (!email || !password) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>⏳ Verificando credenciales...</span>`;

  try {
    if (!SUPABASE_CONFIG.isConfigured) {
      throw new Error('Supabase no está configurado con credenciales válidas en js/config/supabase.js. Contacta al administrador del sistema.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data?.session) {
      adminState.session = data.session;
      showToast('¡Sesión iniciada con éxito! Bienvenido al centro de moderación.', 'success');
      renderAuthenticatedDashboard();
    }
  } catch (err) {
    console.error('[Admin Auth Error]:', err);
    if (alertBox && alertMsg) {
      alertMsg.textContent = err.message || 'Error al autenticar con Supabase.';
      alertBox.classList.remove('hidden');
    }
    showToast(err.message || 'Error de autenticación.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>🛡️</span><span>Iniciar Sesión de Administrador</span>`;
  }
}

/**
 * Cerrar sesión
 */
async function handleLogout() {
  if (adminState.isDemoMode) {
    sessionStorage.removeItem('el_muro_admin_demo');
    adminState.isDemoMode = false;
  } else {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Admin] Error al cerrar sesión en Supabase:', err);
    }
  }

  adminState.session = null;
  showToast('Has cerrado la sesión de moderador.', 'info');
  renderLoginScreen();
}

/**
 * Modo demo deshabilitado para fase de validación profesional.
 * Se requiere autenticación real vía Supabase Auth.
 */
function handleDemoMode() {
  showToast('El modo demostración ha sido deshabilitado. Inicia sesión con tus credenciales de administrador.', 'error');
}

// ==============================================================================
// 4. CAMBIO DE VISTAS Y NAVEGACIÓN
// ==============================================================================
function renderLoginScreen() {
  document.getElementById('view-login')?.classList.remove('hidden');
  document.getElementById('view-dashboard')?.classList.add('hidden');
  document.getElementById('admin-user-pill')?.classList.add('hidden');
  document.getElementById('btn-logout')?.classList.add('hidden');
}

function renderAuthenticatedDashboard(demoUser = null) {
  document.getElementById('view-login')?.classList.add('hidden');
  document.getElementById('view-dashboard')?.classList.remove('hidden');

  const email = demoUser ? demoUser.email : (adminState.session?.user?.email || 'admin@elmuro.com');
  const userPill = document.getElementById('admin-user-pill');
  const userEmail = document.getElementById('admin-user-email');
  const logoutBtn = document.getElementById('btn-logout');

  if (userPill && userEmail) {
    userEmail.textContent = email;
    userPill.classList.remove('hidden');
    userPill.classList.add('flex');
  }

  if (logoutBtn) {
    logoutBtn.classList.remove('hidden');
    logoutBtn.classList.add('flex');
  }

  // Cargar datos del dashboard activo
  switchTab(adminState.currentTab);
}

function switchTab(tabKey) {
  // Pestañas permitidas en el panel
  const allowedTabs = ['moderacion', 'auditoria', 'publicidad', 'metricas'];
  if (!allowedTabs.includes(tabKey)) {
    tabKey = 'moderacion';
  }
  adminState.currentTab = tabKey;

  // Actualizar botones de navegación
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  navBtns.forEach(btn => {
    if (btn.dataset.tab === tabKey) {
      btn.className = 'nav-tab-btn active px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm whitespace-nowrap';
    } else {
      btn.className = 'nav-tab-btn px-4 py-2.5 rounded-2xl text-xs font-extrabold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 flex items-center gap-2 transition-all whitespace-nowrap';
    }
  });

  // Ocultar todos los panes
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));

  // Mostrar el panel seleccionado y cargar sus datos
  const activePane = document.getElementById(`tab-content-${tabKey}`);
  activePane?.classList.remove('hidden');

  if (tabKey === 'moderacion') loadModerationPosts();
  if (tabKey === 'auditoria') loadAuditoriaHistorial();
  if (tabKey === 'publicidad') loadPublicidadAdmin();
  if (tabKey === 'metricas') loadMetricasAdmin();
}

// ==============================================================================
// 5. TAB 1: MODERACIÓN DE CONTENIDOS
// ==============================================================================
async function loadModerationPosts() {
  const container = document.getElementById('moderacion-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 text-center animate-pulse text-xs text-slate-400">
      ⏳ Cargando cola de moderación comunitaria...
    </div>
  `;

  if (adminState.isDemoMode || !SUPABASE_CONFIG.isConfigured) {
    adminState.moderationPosts = [...DEMO_MODERATION_POSTS];
    renderModerationList();
    updateModerationBadge(adminState.moderationPosts.length);
    return;
  }

  try {
    // Consultar publicaciones con 3+ reportes o en revisión u ocultas
    const { data: posts, error } = await supabase
      .from('publicaciones')
      .select('*, instituciones(nombre)')
      .or('reportes_count.gte.3,estado.eq.en_revision,estado.eq.oculta')
      .order('reportes_count', { ascending: false });

    if (error) throw error;

    // Obtener los motivos de reportes asociados
    const postIds = (posts || []).map(p => p.id);
    let motivosMap = {};

    if (postIds.length > 0) {
      const { data: reportesData } = await supabase
        .from('reportes')
        .select('publicacion_id, motivo, created_at')
        .in('publicacion_id', postIds)
        .order('created_at', { ascending: false });

      if (reportesData) {
        reportesData.forEach(r => {
          if (!motivosMap[r.publicacion_id]) motivosMap[r.publicacion_id] = [];
          motivosMap[r.publicacion_id].push(r.motivo);
        });
      }
    }

    adminState.moderationPosts = (posts || []).map(p => ({
      ...p,
      institucion_nombre: p.instituciones?.nombre || 'Campus Universitario',
      motivos: motivosMap[p.id] || []
    }));

    renderModerationList();
    updateModerationBadge(adminState.moderationPosts.length);
  } catch (err) {
    console.warn('[Admin] Error cargando moderación en Supabase, usando respaldo demo:', err.message);
    adminState.moderationPosts = [...DEMO_MODERATION_POSTS];
    renderModerationList();
    updateModerationBadge(adminState.moderationPosts.length);
  }
}

function updateModerationBadge(count) {
  const badge = document.getElementById('tab-badge-moderacion');
  if (badge) {
    badge.textContent = count;
    badge.className = count > 0 
      ? 'px-2 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-black' 
      : 'px-2 py-0.5 rounded-full text-[10px] bg-slate-400 text-white font-black';
  }
}

/**
 * Componente reutilizable de paginación numérica estilo iOS / Neo-brutalismo
 * [ ← Anterior ] [ 1 ] [ 2 ] [ 3 ] ... [ Siguiente → ]
 */
function renderPaginationControls({
  containerId,
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  targetScrollId = null
}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (totalItems <= pageSize) {
    container.innerHTML = `
      <div class="w-full flex items-center justify-between text-xs text-slate-400 py-1">
        <span>Mostrando todos los <strong>${totalItems}</strong> registros</span>
      </div>
    `;
    return;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Calcular rango de botones numéricos visibles
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  let pagesHtml = '';
  for (let p = startPage; p <= endPage; p++) {
    const isActive = p === currentPage;
    pagesHtml += `
      <button type="button" data-page="${p}"
        class="pagination-page-btn w-8 h-8 rounded-xl text-xs font-black transition-all ${
          isActive 
            ? 'bg-orange-500 text-white shadow-sm scale-105' 
            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
        }">
        ${p}
      </button>
    `;
  }

  container.innerHTML = `
    <div class="w-full flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
      <div class="text-xs text-slate-400 font-medium">
        Mostrando <strong class="text-slate-700 dark:text-slate-200">${startItem}</strong> - <strong class="text-slate-700 dark:text-slate-200">${endItem}</strong> de <strong class="text-slate-700 dark:text-slate-200">${totalItems}</strong>
      </div>

      <div class="flex items-center gap-1.5">
        <button type="button" data-action="prev" ${currentPage <= 1 ? 'disabled' : ''}
          class="pagination-nav-btn px-3 h-8 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
            currentPage <= 1 
              ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400' 
              : 'bg-white hover:bg-orange-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-orange-600 shadow-xs active:scale-95'
          }">
          ← Anterior
        </button>

        ${startPage > 1 ? `<span class="px-1 text-slate-400 text-xs">...</span>` : ''}

        ${pagesHtml}

        ${endPage < totalPages ? `<span class="px-1 text-slate-400 text-xs">...</span>` : ''}

        <button type="button" data-action="next" ${currentPage >= totalPages ? 'disabled' : ''}
          class="pagination-nav-btn px-3 h-8 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
            currentPage >= totalPages 
              ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400' 
              : 'bg-white hover:bg-orange-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-orange-600 shadow-xs active:scale-95'
          }">
          Siguiente →
        </button>
      </div>
    </div>
  `;

  // Asignar listeners
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.getAttribute('data-page'), 10);
      if (p !== currentPage) {
        onPageChange(p);
        if (targetScrollId) {
          const el = document.getElementById(targetScrollId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  const prevBtn = container.querySelector('button[data-action="prev"]');
  if (prevBtn && currentPage > 1) {
    prevBtn.addEventListener('click', () => {
      onPageChange(currentPage - 1);
      if (targetScrollId) {
        const el = document.getElementById(targetScrollId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const nextBtn = container.querySelector('button[data-action="next"]');
  if (nextBtn && currentPage < totalPages) {
    nextBtn.addEventListener('click', () => {
      onPageChange(currentPage + 1);
      if (targetScrollId) {
        const el = document.getElementById(targetScrollId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

function renderModerationList() {
  const container = document.getElementById('moderacion-list-container');
  if (!container) return;

  const filtro = document.getElementById('filtro-estado-moderacion')?.value || 'todos_pendientes';
  let filtrados = adminState.moderationPosts;

  if (filtro === 'en_revision') filtrados = filtrados.filter(p => p.estado === 'en_revision');
  if (filtro === 'oculta') filtrados = filtrados.filter(p => p.estado === 'oculta');
  if (filtro === 'publicada') filtrados = filtrados.filter(p => p.estado === 'publicada');

  const pagContainer = document.getElementById('moderacion-pagination-container');

  if (filtrados.length === 0) {
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-3xl p-10 text-center space-y-3 shadow-sm">
        <span class="text-4xl">🎉</span>
        <h4 class="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-wider">Bandeja de Moderación Limpia</h4>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">No hay publicaciones con denuncias comunitarias ni pendientes de revisión en este momento.</p>
      </div>
    `;
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  const totalItems = filtrados.length;
  const pageSize = adminState.moderationPageSize || 10;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  if (adminState.moderationPage > totalPages) {
    adminState.moderationPage = totalPages;
  }
  const startIndex = (adminState.moderationPage - 1) * pageSize;
  const pagedItems = filtrados.slice(startIndex, startIndex + pageSize);

  container.innerHTML = pagedItems.map(post => {
    const estadoClass = post.estado === 'en_revision' 
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
      : (post.estado === 'oculta' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' : 'bg-emerald-100 text-emerald-800');

    return `
      <article class="bg-white dark:bg-slate-800 border-2 border-orange-100/90 dark:border-slate-700 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 transition-all">
        
        <!-- Header de la Tarjeta de Denuncia -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${estadoClass}">
              Estado: ${post.estado.toUpperCase()}
            </span>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
              🚨 ${post.reportes_count || 0} Reportes Comunitarios
            </span>
          </div>

          <div class="text-[11px] font-bold text-slate-400">
            <span>${post.institucion_nombre || 'Campus'}</span>
          </div>
        </div>

        <!-- Contenido de la Publicación -->
        <div class="space-y-2">
          <h4 class="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug">
            ${post.titulo}
          </h4>
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            ${post.descripcion || 'Sin descripción adicional.'}
          </p>
          ${post.imagen_url ? `
            <div class="pt-2">
              <img src="${post.imagen_url}" alt="Adjunto" class="max-h-48 rounded-2xl object-cover border border-slate-200 dark:border-slate-700">
            </div>
          ` : ''}
        </div>

        <!-- Motivos de Reportes Emitidos por la Comunidad -->
        <div class="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/60 space-y-2">
          <p class="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
            Motivos Reportados por Estudiantes:
          </p>
          <ul class="list-disc list-inside space-y-1 text-xs text-rose-900 dark:text-rose-200 font-medium">
            ${post.motivos && post.motivos.length > 0 
              ? post.motivos.map(m => `<li>${m}</li>`).join('') 
              : '<li>Infracción a las normas éticas universitarias.</li>'}
          </ul>
        </div>

        <!-- Barra de Acciones del Moderador -->
        <div class="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          
          <button type="button" onclick="window.__abrirModalDictamen('${post.id}', 'aprobar')" 
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 transition-all">
            <span>✅</span> Aprobar & Restaurar
          </button>

          <button type="button" onclick="window.__abrirModalDictamen('${post.id}', 'ocultar')" 
            class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 transition-all">
            <span>👁️</span> Ocultar
          </button>

          <button type="button" onclick="window.__abrirModalDictamen('${post.id}', 'rechazar')" 
            class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 transition-all">
            <span>❌</span> Rechazar Definitivamente
          </button>

        </div>

      </article>
    `;
  }).join('');

  renderPaginationControls({
    containerId: 'moderacion-pagination-container',
    currentPage: adminState.moderationPage,
    totalItems,
    pageSize,
    targetScrollId: 'tab-content-moderacion',
    onPageChange: (newPage) => {
      adminState.moderationPage = newPage;
      renderModerationList();
    }
  });
}

// Modal Dictamen de Moderación
window.__abrirModalDictamen = (postId, tipoAccion) => {
  adminState.actionPendingPostId = postId;
  adminState.actionPendingType = tipoAccion;

  const modal = document.getElementById('modal-justificacion-moderacion');
  const title = document.getElementById('modal-mod-title');
  const desc = document.getElementById('modal-mod-desc');
  const textarea = document.getElementById('modal-mod-justificacion');

  const titles = {
    aprobar: 'Aprobar Publicación (Restaurar al Feed Público)',
    ocultar: 'Ocultar Publicación Preventivamente',
    rechazar: 'Rechazar y Retirar Definitivamente'
  };

  const defaults = {
    aprobar: 'Los reportes carecen de fundamento o no se identificó infracción al código ético. Se restablece al feed.',
    ocultar: 'Se oculta temporalmente por generar tensión en el campus o rozar las directrices de convivencia.',
    rechazar: 'Se confirma señalamiento directo, ciberacoso o incumplimiento grave de las normas comunitarias.'
  };

  if (title) title.textContent = titles[tipoAccion] || 'Dictamen';
  if (desc) desc.textContent = `Esta resolución quedará guardada en historial_moderacion junto con tu firma de moderador.`;
  if (textarea) textarea.value = defaults[tipoAccion] || '';

  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
};

async function ejecutarDictamenModeracion(justificacion) {
  const postId = adminState.actionPendingPostId;
  const accion = adminState.actionPendingType;
  if (!postId || !accion) return;

  const nuevoEstado = accion === 'aprobar' ? 'publicada' : (accion === 'ocultar' ? 'oculta' : 'rechazada');
  const accionSql = `publicacion_${accion === 'aprobar' ? 'aprobada' : (accion === 'ocultar' ? 'ocultada' : 'rechazada')}`;

  try {
    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      // 1. Actualizar estado de la publicación y reiniciar reportes_count si se aprueba
      const updatePayload = { estado: nuevoEstado };
      if (accion === 'aprobar') {
        updatePayload.reportes_count = 0;
      }

      const { error: errUpdate } = await supabase
        .from('publicaciones')
        .update(updatePayload)
        .eq('id', postId);

      if (errUpdate) throw errUpdate;

      // 2. Si se aprueba, limpiar reportes de la tabla reportes para dejarla limpia
      if (accion === 'aprobar') {
        await supabase.from('reportes').delete().eq('publicacion_id', postId);
      }

      // 3. Registrar en historial_moderacion
      const moderadorId = adminState.session?.user?.id || null;
      await supabase.from('historial_moderacion').insert({
        publicacion_id: postId,
        moderador_id: moderadorId,
        accion_realizada: accionSql,
        justificacion: justificacion.trim()
      });
    }

    // Actualizar estado en memoria
    const target = adminState.moderationPosts.find(p => p.id === postId);
    if (target) {
      target.estado = nuevoEstado;
      if (accion === 'aprobar') target.reportes_count = 0;
    }

    // Agregar al historial de auditoría
    adminState.historial.unshift({
      id: `aud-${Date.now()}`,
      created_at: new Date().toISOString(),
      accion_realizada: accionSql,
      publicacion_id: postId,
      publicacion_titulo: target?.titulo || 'Publicación',
      moderador_email: adminState.session?.user?.email || 'admin@elmuro.com',
      justificacion: justificacion.trim()
    });

    showToast(`Acción completada: Publicación ${accion}da con éxito.`, 'success');
    renderModerationList();
    updateModerationBadge(adminState.moderationPosts.filter(p => p.estado === 'en_revision' || p.reportes_count >= 3).length);
  } catch (err) {
    console.error('[Admin] Error ejecutando dictamen:', err);
    showToast(err.message || 'Error al ejecutar la acción de moderación.', 'error');
  }
}

// ==============================================================================
// 6. TAB 2: AUDITORÍA & HISTORIAL
// ==============================================================================
async function loadAuditoriaHistorial() {
  const tbody = document.getElementById('auditoria-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="py-8 text-center text-slate-400">
        ⏳ Cargando bitácora de auditoría inmutable...
      </td>
    </tr>
  `;

  if (adminState.isDemoMode || !SUPABASE_CONFIG.isConfigured) {
    adminState.historial = [...DEMO_HISTORIAL];
    renderAuditoriaTable();
    return;
  }

  try {
    const { data, error } = await supabase
      .from('historial_moderacion')
      .select('*, publicaciones(titulo)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    adminState.historial = (data || []).map(h => ({
      ...h,
      publicacion_titulo: h.publicaciones?.titulo || 'Publicación eliminada o expirada',
      moderador_email: h.moderador_id ? `Mod: ${h.moderador_id.substring(0, 8)}...` : 'Sistema Automático (Trigger DB)'
    }));

    renderAuditoriaTable();
  } catch (err) {
    console.warn('[Admin] Error consultando auditoría:', err.message);
    adminState.historial = [...DEMO_HISTORIAL];
    renderAuditoriaTable();
  }
}

function renderAuditoriaTable() {
  const tbody = document.getElementById('auditoria-table-body');
  if (!tbody) return;

  const pagContainer = document.getElementById('auditoria-pagination-container');

  if (adminState.historial.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-400 italic">
          Sin registros en el historial de moderación todavía.
        </td>
      </tr>
    `;
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  const totalItems = adminState.historial.length;
  const pageSize = adminState.historialPageSize || 10;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  if (adminState.historialPage > totalPages) {
    adminState.historialPage = totalPages;
  }
  const startIndex = (adminState.historialPage - 1) * pageSize;
  const pagedItems = adminState.historial.slice(startIndex, startIndex + pageSize);

  tbody.innerHTML = pagedItems.map(h => {
    const accionColor = h.accion_realizada.includes('aprobada')
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
      : (h.accion_realizada.includes('rechazada') 
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300');

    const fechaFormat = new Date(h.created_at).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
          ${fechaFormat}
        </td>
        <td class="py-3.5 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${accionColor}">
            ${h.accion_realizada.replace(/_/g, ' ')}
          </span>
        </td>
        <td class="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100 max-w-xs truncate">
          ${h.publicacion_titulo || 'Publicación'}
        </td>
        <td class="py-3.5 px-4 text-slate-500 text-[11px]">
          ${h.moderador_email || 'Moderador'}
        </td>
        <td class="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-xs italic">
          "${h.justificacion || 'Sin justificación registrada.'}"
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationControls({
    containerId: 'auditoria-pagination-container',
    currentPage: adminState.historialPage,
    totalItems,
    pageSize,
    targetScrollId: 'tab-content-auditoria',
    onPageChange: (newPage) => {
      adminState.historialPage = newPage;
      renderAuditoriaTable();
    }
  });
}

// ==============================================================================
// 7. TAB 3: PUBLICIDAD PAGADA & MONETIZACIÓN
// ==============================================================================
async function loadPublicidadAdmin() {
  const container = document.getElementById('publicidad-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 text-center animate-pulse text-xs text-slate-400">
      ⏳ Cargando campañas publicitarias...
    </div>
  `;

  if (adminState.isDemoMode || !SUPABASE_CONFIG.isConfigured) {
    adminState.anuncios = [...DEMO_ANUNCIOS];
    renderPublicidadList();
    return;
  }

  try {
    const { data, error } = await supabase
      .from('anuncios_patrocinados')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    adminState.anuncios = data || [];
    renderPublicidadList();
  } catch (err) {
    console.warn('[Admin] Error consultando publicidad:', err.message);
    adminState.anuncios = [...DEMO_ANUNCIOS];
    renderPublicidadList();
  }
}

function renderPublicidadList() {
  const container = document.getElementById('publicidad-list-container');
  if (!container) return;

  if (adminState.anuncios.length === 0) {
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-3xl p-10 text-center space-y-3 shadow-sm">
        <span class="text-4xl">⭐</span>
        <h4 class="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-wider">Sin Campañas Publicitarias</h4>
        <p class="text-xs text-slate-400">Crea una nueva campaña patrocinada con el botón superior.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = adminState.anuncios.map(ad => {
    const telefonoDisplay = ad.telefono_contacto || (ad.enlace_url?.includes('wa.me') ? ad.enlace_url.split('/').pop() : null);
    const ubicacionDisplay = ad.ubicacion_referencia || null;
    const waLink = ad.enlace_url || (ad.telefono_contacto ? `https://wa.me/57${ad.telefono_contacto.replace(/\D/g, '').replace(/^57/, '')}` : null);

    return `
    <div class="bg-white dark:bg-slate-800 border-2 border-orange-100/90 dark:border-slate-700 rounded-3xl p-5 shadow-sm space-y-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        <div class="flex items-center gap-3">
          ${ad.imagen_url ? `
            <img src="${ad.imagen_url}" alt="Banner" class="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm">
          ` : `
            <div class="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-slate-700 flex items-center justify-center text-xl">
              ⭐
            </div>
          `}
          <div class="space-y-1.5">
            <h4 class="font-black text-sm text-slate-900 dark:text-white leading-tight">
              ${ad.titulo}
            </h4>
            <div class="flex flex-wrap items-center gap-2.5 text-[11px]">
              ${waLink ? `
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
                  <span>📱 WhatsApp:</span> <span>${telefonoDisplay || 'Abrir Chat'}</span> ↗
                </a>
              ` : `
                <span class="text-slate-400 font-medium">Sin contacto directo</span>
              `}
              ${ubicacionDisplay ? `
                <span class="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg">
                  <span>📍</span> <span>${ubicacionDisplay}</span>
                </span>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Switch Verificación de Pago -->
          <button type="button" onclick="window.__togglePagoAnuncio('${ad.id}', ${!ad.verificado_pago})" 
            class="px-3 py-1.5 rounded-xl text-xs font-black transition-all ${ad.verificado_pago ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'}">
            ${ad.verificado_pago ? '✓ Pago Verificado' : '⏳ Pago Pendiente'}
          </button>

          <!-- Switch Campaña Activa -->
          <button type="button" onclick="window.__toggleActivoAnuncio('${ad.id}', ${!ad.activo})" 
            class="px-3 py-1.5 rounded-xl text-xs font-black transition-all ${ad.activo ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}">
            ${ad.activo ? 'Campaña Activa' : 'Pausada'}
          </button>

          <!-- Eliminar -->
          <button type="button" onclick="window.__eliminarAnuncio('${ad.id}')" class="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-700 transition-colors" title="Eliminar anuncio">
            🗑️
          </button>
        </div>

      </div>

      <div class="text-[11px] font-medium text-slate-400 flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/60">
        <span>Vigencia: ${new Date(ad.fecha_inicio).toLocaleDateString()} al ${new Date(ad.fecha_fin).toLocaleDateString()}</span>
      </div>
    </div>
  `;
  }).join('');
}

window.__togglePagoAnuncio = async (id, nuevoValor) => {
  try {
    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      const { error } = await supabase
        .from('anuncios_patrocinados')
        .update({ verificado_pago: nuevoValor })
        .eq('id', id);
      if (error) throw error;
    }

    const ad = adminState.anuncios.find(a => a.id === id);
    if (ad) ad.verificado_pago = nuevoValor;

    renderPublicidadList();
    showToast(`Estado de pago actualizado: ${nuevoValor ? 'Verificado' : 'Pendiente'}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar pago.', 'error');
  }
};

window.__toggleActivoAnuncio = async (id, nuevoValor) => {
  try {
    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      const { error } = await supabase
        .from('anuncios_patrocinados')
        .update({ activo: nuevoValor })
        .eq('id', id);
      if (error) throw error;
    }

    const ad = adminState.anuncios.find(a => a.id === id);
    if (ad) ad.activo = nuevoValor;

    renderPublicidadList();
    showToast(`Campaña ${nuevoValor ? 'activada' : 'pausada'}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Error al cambiar estado de anuncio.', 'error');
  }
};

window.__eliminarAnuncio = async (id) => {
  if (!confirm('¿Seguro que deseas eliminar esta campaña publicitaria?')) return;

  try {
    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      const { error } = await supabase.from('anuncios_patrocinados').delete().eq('id', id);
      if (error) throw error;
    }

    adminState.anuncios = adminState.anuncios.filter(a => a.id !== id);
    renderPublicidadList();
    showToast('Campaña eliminada correctamente.', 'info');
  } catch (err) {
    showToast(err.message || 'Error al eliminar campaña.', 'error');
  }
};

async function crearNuevoAnuncio({ titulo, imagen_blob, telefono_contacto, ubicacion_referencia, dias, verificado_pago }) {
  try {
    const fechaInicio = new Date().toISOString();
    const fechaFin = new Date(Date.now() + dias * 86400000).toISOString();

    // 1. Subida directa de imagen optimizada a Supabase Storage
    let imagen_url = null;
    if (imagen_blob) {
      showToast('Subiendo y asegurando imagen en Storage...', 'info');
      imagen_url = await uploadPostImage(imagen_blob);
    }

    // 2. Construir enlace directo a WhatsApp si se proporcionó número
    const telefonoLimpio = (telefono_contacto || '').replace(/\D/g, '');
    const enlace_url = telefonoLimpio
      ? `https://wa.me/57${telefonoLimpio.replace(/^57/, '')}`
      : null;

    const payload = {
      titulo: titulo.trim(),
      imagen_url,
      enlace_url,
      telefono_contacto: telefono_contacto?.trim() || null,
      ubicacion_referencia: ubicacion_referencia?.trim() || null,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      activo: true,
      verificado_pago: Boolean(verificado_pago)
    };

    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      // Intentar inserción completa
      let { data, error } = await supabase
        .from('anuncios_patrocinados')
        .insert(payload)
        .select()
        .single();

      // Si las columnas nuevas no existieran aún en la BD remota, reintentar con payload base
      if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
        console.warn('[Admin] Columnas extendidas no encontradas, guardando con esquema base:', error.message);
        const fallbackPayload = {
          titulo: payload.titulo,
          imagen_url: payload.imagen_url,
          enlace_url: payload.enlace_url,
          fecha_inicio: payload.fecha_inicio,
          fecha_fin: payload.fecha_fin,
          activo: payload.activo,
          verificado_pago: payload.verificado_pago
        };
        const fallbackResult = await supabase
          .from('anuncios_patrocinados')
          .insert(fallbackPayload)
          .select()
          .single();
        if (fallbackResult.error) throw fallbackResult.error;
        data = { ...fallbackResult.data, telefono_contacto: payload.telefono_contacto, ubicacion_referencia: payload.ubicacion_referencia };
      } else if (error) {
        throw error;
      }

      adminState.anuncios.unshift(data);
    } else {
      adminState.anuncios.unshift({
        id: `ad-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString()
      });
    }

    renderPublicidadList();
    showToast('Campaña publicitaria creada y publicada con éxito.', 'success');
  } catch (err) {
    console.error('[Admin] Error al crear anuncio:', err);
    showToast(err.message || 'Error al crear anuncio.', 'error');
  }
}

// ==============================================================================
// 9. TAB 5: MÉTRICAS GENERALES
// ==============================================================================
async function loadMetricasAdmin() {
  let activos = 0;
  let expirados = 0;
  let resueltos = 0;
  let anunciosActivos = 0;
  let categoriasDist = {};
  let totalPostsCat = 0;

  try {
    if (!adminState.isDemoMode && SUPABASE_CONFIG.isConfigured) {
      const nowIso = new Date().toISOString();

      // 1. Posts activos (vigentes en ciclo 48h)
      const { count: countActivos } = await supabase
        .from('publicaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'publicada')
        .gt('expires_at', nowIso);
      activos = countActivos || 0;

      // 2. Posts expirados (completaron 48h)
      const { count: countExpirados } = await supabase
        .from('publicaciones')
        .select('*', { count: 'exact', head: true })
        .lte('expires_at', nowIso);
      expirados = countExpirados || 0;

      // 3. Reportes resueltos (historial inmutable de moderación)
      const { count: countHistorial } = await supabase
        .from('historial_moderacion')
        .select('*', { count: 'exact', head: true });
      resueltos = countHistorial ?? adminState.historial.length;

      // 4. Anuncios activos (campañas comerciales vigentes)
      const { count: countAnuncios } = await supabase
        .from('anuncios_patrocinados')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);
      anunciosActivos = countAnuncios ?? adminState.anuncios.filter(a => a.activo).length;

      // 5. Consulta dinámica de distribución por categoría desde Supabase
      const { data: postsCat, error: errCat } = await supabase
        .from('publicaciones')
        .select('categoria');

      if (!errCat && postsCat) {
        totalPostsCat = postsCat.length;
        postsCat.forEach(p => {
          if (p.categoria) {
            categoriasDist[p.categoria] = (categoriasDist[p.categoria] || 0) + 1;
          }
        });
      }
    } else {
      activos = 0;
      expirados = 0;
      resueltos = adminState.historial.length;
      anunciosActivos = adminState.anuncios.filter(a => a.activo).length;
      totalPostsCat = 0;
    }
  } catch (err) {
    console.warn('[Admin] Error calculando métricas:', err);
  }

  // Actualizar tarjetas KPI
  const elActivos = document.getElementById('kpi-posts-activos');
  const elExpirados = document.getElementById('kpi-posts-expirados');
  const elResueltos = document.getElementById('kpi-reportes-resueltos');
  const elAnuncios = document.getElementById('kpi-anuncios-activos');

  if (elActivos) elActivos.textContent = activos;
  if (elExpirados) elExpirados.textContent = expirados;
  if (elResueltos) elResueltos.textContent = resueltos;
  if (elAnuncios) elAnuncios.textContent = anunciosActivos;

  // Renderizado dinámico de la distribución por categorías
  const catContainer = document.getElementById('metricas-categorias-container');
  if (catContainer) {
    if (totalPostsCat === 0 || Object.keys(categoriasDist).length === 0) {
      catContainer.innerHTML = `
        <div class="py-6 text-center text-slate-400 space-y-1.5">
          <span class="text-2xl block">📊</span>
          <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Sin publicaciones para analizar</p>
          <p class="text-[11px] text-slate-400 font-normal">Aún no se registran publicaciones en ninguna categoría del muro.</p>
        </div>
      `;
    } else {
      const CATEGORY_COLORS = {
        'Académico': 'bg-emerald-500',
        'Comunidad': 'bg-blue-500',
        'Curiosidades': 'bg-amber-500',
        'Eventos y actividades': 'bg-pink-500',
        'Objetos perdidos': 'bg-rose-500',
        'Sugerencias e ideas': 'bg-indigo-500',
        'Emprendimientos y clasificados': 'bg-violet-500'
      };

      const sortedEntries = Object.entries(categoriasDist).sort((a, b) => b[1] - a[1]);

      catContainer.innerHTML = sortedEntries.map(([categoria, count]) => {
        const pct = Math.round((count / totalPostsCat) * 100);
        const color = CATEGORY_COLORS[categoria] || 'bg-orange-500';

        return `
          <div class="space-y-1">
            <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
              <span class="font-bold">${categoria}</span>
              <span class="text-slate-400 text-[11px] font-mono font-bold">${count} (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div class="${color} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// ==============================================================================
// 10. SETUP DE EVENT LISTENERS & MODALES
// ==============================================================================
function setupEventListeners() {
  // Theme toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  // Form login
  document.getElementById('form-login')?.addEventListener('submit', handleLoginSubmit);

  // Botón Logout
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

  // Botón Modo Demo
  document.getElementById('btn-demo-mode')?.addEventListener('click', handleDemoMode);

  // Tabs navigation
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Filtro estado moderación
  document.getElementById('filtro-estado-moderacion')?.addEventListener('change', () => {
    adminState.moderationPage = 1;
    renderModerationList();
  });
  document.getElementById('btn-refresh-moderacion')?.addEventListener('click', () => {
    adminState.moderationPage = 1;
    loadModerationPosts();
  });
  document.getElementById('btn-refresh-auditoria')?.addEventListener('click', () => {
    adminState.historialPage = 1;
    loadAuditoriaHistorial();
  });

  // Modal Dictamen de Moderación
  const modalMod = document.getElementById('modal-justificacion-moderacion');
  document.getElementById('btn-cerrar-modal-mod')?.addEventListener('click', () => modalMod?.classList.add('hidden'));
  document.getElementById('btn-cancelar-modal-mod')?.addEventListener('click', () => modalMod?.classList.add('hidden'));
  
  document.getElementById('form-dictamen-moderacion')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const justificacion = document.getElementById('modal-mod-justificacion')?.value;
    if (!justificacion) return;
    modalMod?.classList.add('hidden');
    await ejecutarDictamenModeracion(justificacion);
  });

  // Modal Nuevo Anuncio Patrocinado
  const modalAd = document.getElementById('modal-nuevo-anuncio');
  document.getElementById('btn-modal-nuevo-anuncio')?.addEventListener('click', () => {
    modalAd?.classList.remove('hidden');
    modalAd?.classList.add('flex');
  });
  document.getElementById('btn-cerrar-modal-anuncio')?.addEventListener('click', () => modalAd?.classList.add('hidden'));
  document.getElementById('btn-cancelar-modal-anuncio')?.addEventListener('click', () => modalAd?.classList.add('hidden'));

  // Manejador de subida y compresión WebP para Banner de Anuncio
  const adFileInput = document.getElementById('input-anuncio-file');
  adFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const placeholder = document.getElementById('anuncio-img-placeholder');
    const previewWrap = document.getElementById('anuncio-img-preview-wrap');
    const previewImg = document.getElementById('anuncio-img-preview');
    const infoText = document.getElementById('anuncio-img-info');

    try {
      if (placeholder) placeholder.innerHTML = '<span class="text-xs text-orange-500 font-bold animate-pulse">⏳ Optimizando y comprimiendo a WebP...</span>';

      const result = await compressImage(file);
      adminState.pendingAdImage = result;

      if (previewImg) previewImg.src = result.previewUrl;
      if (infoText) infoText.textContent = `✓ WebP optimizado: ${result.sizeKb} KB (Ahorro: ${result.compressionRatio})`;
      if (placeholder) placeholder.classList.add('hidden');
      if (previewWrap) previewWrap.classList.remove('hidden');
    } catch (err) {
      console.error('[Admin] Error comprimiendo imagen:', err);
      showToast(err.message || 'Error al procesar la imagen.', 'error');
      resetAnuncioImagePreview();
    }
  });

  document.getElementById('btn-anuncio-remove-img')?.addEventListener('click', (e) => {
    e.stopPropagation();
    adminState.pendingAdImage = null;
    const input = document.getElementById('input-anuncio-file');
    if (input) input.value = '';
    resetAnuncioImagePreview();
  });

  document.getElementById('form-crear-anuncio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('input-anuncio-titulo')?.value;
    const telefono_contacto = document.getElementById('input-anuncio-telefono')?.value;
    const ubicacion_referencia = document.getElementById('input-anuncio-ubicacion')?.value;
    const dias = parseInt(document.getElementById('input-anuncio-dias')?.value || '30', 10);
    const verificado_pago = document.getElementById('input-anuncio-pago')?.checked;

    if (!titulo) return;

    const submitBtn = document.getElementById('btn-submit-anuncio');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span><span>Procesando...</span>';
    }

    const imagen_blob = adminState.pendingAdImage?.blob || null;

    modalAd?.classList.add('hidden');
    await crearNuevoAnuncio({ titulo, imagen_blob, telefono_contacto, ubicacion_referencia, dias, verificado_pago });

    // Resetear formulario e imagen
    adminState.pendingAdImage = null;
    e.target.reset();
    resetAnuncioImagePreview();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Crear Campaña</span>';
    }
  });
}

/**
 * Restablece la vista previa de imagen en el modal de anuncio
 */
function resetAnuncioImagePreview() {
  const placeholder = document.getElementById('anuncio-img-placeholder');
  const previewWrap = document.getElementById('anuncio-img-preview-wrap');
  const previewImg = document.getElementById('anuncio-img-preview');

  if (placeholder) {
    placeholder.innerHTML = `
      <span class="text-2xl block">📸</span>
      <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300">Arrastra o haz clic para seleccionar imagen</p>
      <p class="text-[10px] text-slate-400">JPG, PNG o WebP • Se optimiza y comprime a WebP automáticamente</p>
    `;
    placeholder.classList.remove('hidden');
  }
  if (previewWrap) previewWrap.classList.add('hidden');
  if (previewImg) previewImg.src = '';
}

/**
 * Muestra alertas estilo Toast flotantes
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600 text-white' : (type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900');
  
  toast.className = `p-3.5 rounded-2xl text-xs font-black shadow-xl flex items-center gap-2 animate-fade-in pointer-events-auto ${bg}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ️')}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
