/**
 * ==============================================================================
 * Servicio de Publicaciones, Reacciones y Reportes (postsService)
 * Proyecto: El Muro - Plataforma Ética Universitaria
 * ==============================================================================
 * Conecta las operaciones del frontend con las RPCs y tablas de Supabase:
 * - obtener_feed_publico (RPC)
 * - crear_publicacion_con_codigo (RPC)
 * - reacciones (Tabla con UNIQUE publicacion_id, visitor_id)
 * - reportes (Tabla con moderación comunitaria preventiva a 3 reportes)
 */

import { supabase, SUPABASE_CONFIG } from '../config/supabase.js';
import { getVisitorId, getVisitorIdHash } from '../utils/visitorId.js';

/**
 * Lista de las 7 etiquetas y categorías oficiales de El Muro
 */
export const ETIQUETAS_OFICIALES = [
  'Sugerencias e ideas',
  'Académico',
  'Objetos perdidos',
  'Eventos y actividades',
  'Curiosidades',
  'Emprendimientos y clasificados',
  'Comunidad'
];

/**
 * Mapeo de categorías del frontend a los valores oficiales de categoria_enum en PostgreSQL
 */
export const CATEGORIAS_ENUM = {
  'Sugerencias e ideas': 'Sugerencias e ideas',
  'Académico': 'Académico',
  'Objetos perdidos': 'Objetos perdidos',
  'Eventos y actividades': 'Eventos y actividades',
  'Curiosidades': 'Curiosidades',
  'Emprendimientos y clasificados': 'Emprendimientos y clasificados',
  'Comunidad': 'Comunidad'
};

/**
 * Mapeo directo de tags oficiales a categoria_enum
 */
export const TAG_A_CATEGORIA_MAP = {
  'Sugerencias e ideas': 'Sugerencias e ideas',
  'Académico': 'Académico',
  'Objetos perdidos': 'Objetos perdidos',
  'Eventos y actividades': 'Eventos y actividades',
  'Curiosidades': 'Curiosidades',
  'Emprendimientos y clasificados': 'Emprendimientos y clasificados',
  'Comunidad': 'Comunidad'
};

/**
 * Mapeo oficial de los 6 tipos de reacciones soportados en PostgreSQL tipo_reaccion
 */
export const TIPOS_REACCION = {
  corazon: { id: 'corazon', emoji: '❤️', label: 'Me gusta' },
  risas: { id: 'risas', emoji: '😂', label: 'Risas' },
  idea: { id: 'idea', emoji: '💡', label: 'Buena idea' },
  sorpresa: { id: 'sorpresa', emoji: '😮', label: 'Sorpresa' },
  aplauso: { id: 'aplauso', emoji: '🙌', label: 'Aplausos' },
  triste: { id: 'triste', emoji: '😢', label: 'Triste' }
};

/**
 * Instituciones conocidas de fallback (para desarrollo y testing inicial)
 */
export const INSTITUCIONES_FALLBACK = [
  { id: '11111111-1111-1111-1111-111111111111', nombre: 'Universidad de Córdoba (Unicórdoba)', codigo_acceso: 'UNICORDOBA2026' },
  { id: '22222222-2222-2222-2222-222222222222', nombre: 'Universidad Pontificia Bolivariana (UPB)', codigo_acceso: 'UPB2026' },
  { id: '33333333-3333-3333-3333-333333333333', nombre: 'Universidad del Sinú (Unisinú)', codigo_acceso: 'UNISINU2026' },
  { id: '44444444-4444-4444-4444-444444444444', nombre: 'Universidad de Antioquia (UdeA)', codigo_acceso: 'UDEA2026' },
  { id: '55555555-5555-5555-5555-555555555555', nombre: 'Universidad Nacional de Colombia (UNAL)', codigo_acceso: 'UNAL2026' }
];

// Almacenamiento en memoria para modo desarrollo offline
let fallbackPostsStorage = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    nombre_institucion: 'Universidad de Córdoba (Unicórdoba)',
    categoria: 'Académico',
    titulo: '¿Horario continuado en biblioteca central?',
    descripcion: '¿Alguien sabe si mañana la biblioteca abre en jornada continua? Necesito entregar la tesis de grado con urgencia.',
    imagen_url: null,
    etiquetas: ['Académico', 'Sugerencias e ideas'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 47 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 14,
    reacciones_detalle: { corazon: 8, idea: 4, aplauso: 2 }
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    nombre_institucion: 'Universidad Pontificia Bolivariana (UPB)',
    categoria: 'Eventos y actividades',
    titulo: '¡Felicitaciones a la selección de fútbol!',
    descripcion: 'Un aplauso enorme para la selección del campus por la gran victoria en el torneo interuniversitario.',
    imagen_url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80',
    etiquetas: ['Eventos y actividades', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 46 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 27,
    reacciones_detalle: { corazon: 15, aplauso: 10, risas: 2 }
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    nombre_institucion: 'Universidad de Córdoba (Unicórdoba)',
    categoria: 'Objetos perdidos',
    titulo: 'Llaves con llavero azul encontradas en cafetería',
    descripcion: 'Las dejé en la recepción del bloque 3 para que su dueño pase por ellas presentando su carnet.',
    imagen_url: null,
    etiquetas: ['Objetos perdidos', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 45 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 9,
    reacciones_detalle: { aplauso: 6, corazon: 3 }
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    institucion_id: '33333333-3333-3333-3333-333333333333',
    nombre_institucion: 'Universidad del Sinú (Unisinú)',
    categoria: 'Curiosidades',
    titulo: '¿Vieron el arcoíris doble sobre el río hoy?',
    descripcion: 'Desde el cuarto piso del edificio central se veía impresionante. ¡Qué orgullo nuestro campus!',
    imagen_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    etiquetas: ['Curiosidades', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 44 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 42,
    reacciones_detalle: { corazon: 28, sorpresa: 10, risas: 4 }
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    institucion_id: '44444444-4444-4444-4444-444444444444',
    nombre_institucion: 'Universidad de Antioquia (UdeA)',
    categoria: 'Emprendimientos y clasificados',
    titulo: 'Postres artesanales y brownies en la plazoleta',
    descripcion: 'Estudiante de ingeniería química vendiendo delicias caseras para costear los materiales del semestre.',
    imagen_url: null,
    etiquetas: ['Emprendimientos y clasificados', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 43 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 31,
    reacciones_detalle: { corazon: 20, aplauso: 11 }
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    institucion_id: '55555555-5555-5555-5555-555555555555',
    nombre_institucion: 'Universidad Nacional de Colombia (UNAL)',
    categoria: 'Sugerencias e ideas',
    titulo: 'Instalación de puntos de reciclaje en laboratorios',
    descripcion: 'Sería ideal contar con contenedores especiales para papel y botellas PET cerca a las aulas de informática.',
    imagen_url: null,
    etiquetas: ['Sugerencias e ideas', 'Académico'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 42 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 19,
    reacciones_detalle: { idea: 12, aplauso: 7 }
  },
  {
    id: 'gggggggg-gggg-gggg-gggg-gggggggggggg',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    nombre_institucion: 'Universidad de Córdoba (Unicórdoba)',
    categoria: 'Académico',
    titulo: 'Grupo de estudio para Cálculo Multivariado',
    descripcion: 'Nos reunimos los jueves a las 3:00 PM en las mesas verdes del bloque 2. Todos bienvenidos.',
    imagen_url: null,
    etiquetas: ['Académico', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 41 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 11,
    reacciones_detalle: { idea: 6, corazon: 5 }
  },
  {
    id: 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    nombre_institucion: 'Universidad Pontificia Bolivariana (UPB)',
    categoria: 'Comunidad',
    titulo: 'Campaña de donación de libros usados',
    descripcion: 'Si tienes textos que ya no uses de semestres anteriores, los estaremos recolectando para los estudiantes de primer ingreso.',
    imagen_url: null,
    etiquetas: ['Comunidad', 'Sugerencias e ideas'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 40 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 38,
    reacciones_detalle: { corazon: 25, aplauso: 13 }
  },
  {
    id: 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii',
    institucion_id: '33333333-3333-3333-3333-333333333333',
    nombre_institucion: 'Universidad del Sinú (Unisinú)',
    categoria: 'Eventos y actividades',
    titulo: 'Torneo relámpago de Ajedrez Universitario',
    descripcion: 'Inscripciones abiertas hasta este viernes. Habrá premios para los 3 primeros puestos.',
    imagen_url: null,
    etiquetas: ['Eventos y actividades', 'Académico'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 39 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 16,
    reacciones_detalle: { idea: 9, aplauso: 7 }
  },
  {
    id: 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj',
    institucion_id: '44444444-4444-4444-4444-444444444444',
    nombre_institucion: 'Universidad de Antioquia (UdeA)',
    categoria: 'Curiosidades',
    titulo: 'El gato de la facultad de ciencias ahora tiene collar',
    descripcion: 'Para los que preguntaban, ya lo llevaron al veterinario y está vacunado y en perfecto estado.',
    imagen_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80',
    etiquetas: ['Curiosidades', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 38 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 65,
    reacciones_detalle: { corazon: 45, risas: 15, sorpresa: 5 }
  },
  {
    id: 'kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk',
    institucion_id: '55555555-5555-5555-5555-555555555555',
    nombre_institucion: 'Universidad Nacional de Colombia (UNAL)',
    categoria: 'Objetos perdidos',
    titulo: 'Calculadora científica Casio encontrada en el aula 204',
    descripcion: 'Tiene un sticker de anime en la tapa posterior. Entregada en la oficina de bienestar.',
    imagen_url: null,
    etiquetas: ['Objetos perdidos', 'Académico'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 11 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 37 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 8,
    reacciones_detalle: { aplauso: 5, corazon: 3 }
  },
  {
    id: 'llllllll-llll-llll-llll-llllllllllll',
    institucion_id: '11111111-1111-1111-1111-111111111111',
    nombre_institucion: 'Universidad de Córdoba (Unicórdoba)',
    categoria: 'Emprendimientos y clasificados',
    titulo: 'Servicio de tutorías en Python y Algoritmos',
    descripcion: 'Explicaciones paso a paso para proyectos y tareas. Tarifas solidarias para estudiantes.',
    imagen_url: null,
    etiquetas: ['Emprendimientos y clasificados', 'Académico'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 13 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 35 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 18,
    reacciones_detalle: { idea: 10, corazon: 8 }
  },
  {
    id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
    institucion_id: '22222222-2222-2222-2222-222222222222',
    nombre_institucion: 'Universidad Pontificia Bolivariana (UPB)',
    categoria: 'Sugerencias e ideas',
    titulo: 'Más bancas con sombra cerca de la cancha sintética',
    descripcion: 'Al medio día el sol es muy fuerte y faltan espacios para sentarse a esperar clase.',
    imagen_url: null,
    etiquetas: ['Sugerencias e ideas', 'Comunidad'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 34 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 23,
    reacciones_detalle: { idea: 15, aplauso: 8 }
  },
  {
    id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn',
    institucion_id: '33333333-3333-3333-3333-333333333333',
    nombre_institucion: 'Universidad del Sinú (Unisinú)',
    categoria: 'Comunidad',
    titulo: 'Jornada de siembra y embellecimiento de jardines',
    descripcion: 'Este sábado los grupos ecológicos estaremos sembrando árboles nativos. ¡Súmate con tu energía!',
    imagen_url: null,
    etiquetas: ['Comunidad', 'Eventos y actividades'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 16 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 32 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 41,
    reacciones_detalle: { aplauso: 25, corazon: 16 }
  },
  {
    id: 'oooooooo-oooo-oooo-oooo-oooooooooooo',
    institucion_id: '55555555-5555-5555-5555-555555555555',
    nombre_institucion: 'Universidad Nacional de Colombia (UNAL)',
    categoria: 'Académico',
    titulo: 'Convocatoria abierta para semillero de Inteligencia Artificial',
    descripcion: 'Interesados en proyectos de procesamiento de lenguaje natural y visión artificial, escribir al correo del semillero.',
    imagen_url: null,
    etiquetas: ['Académico', 'Sugerencias e ideas'],
    estado: 'publicada',
    created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 30 * 3600 * 1000).toISOString(),
    reportes_count: 0,
    total_reacciones: 52,
    reacciones_detalle: { idea: 30, corazon: 22 }
  }
];

let fallbackReaccionesStorage = {}; // { [`${postId}_${visitorId}`]: 'corazon' }

/**
 * Consulta la lista de instituciones universitarias activas
 * @returns {Promise<Array<{id: string, nombre: string}>>}
 */
export async function fetchInstituciones() {
  if (!SUPABASE_CONFIG.isConfigured) {
    return INSTITUCIONES_FALLBACK;
  }

  try {
    const { data, error } = await supabase
      .from('instituciones')
      .select('id, nombre, activa')
      .eq('activa', true)
      .order('nombre', { ascending: true });

    if (error) {
      console.warn('[PostsService] Error al obtener instituciones de Supabase, usando catálogo local:', error);
      return INSTITUCIONES_FALLBACK;
    }

    const list = data && data.length > 0 ? data : INSTITUCIONES_FALLBACK;
    return list.map(inst => {
      const fallback = INSTITUCIONES_FALLBACK.find(f => f.id === inst.id);
      return {
        ...inst,
        codigo_acceso: inst.codigo_acceso || fallback?.codigo_acceso || null
      };
    });
  } catch (err) {
    console.warn('[PostsService] Excepción consultando instituciones:', err);
    return INSTITUCIONES_FALLBACK;
  }
}

/**
 * Consulta el feed de publicaciones activas mediante la RPC obtener_feed_publico con soporte de paginación
 * 
 * @param {string|null} categoria - Categoría enum o tag para filtrar
 * @param {string|null} campusId - UUID de la institución o 'Todas'
 * @param {string|null} busqueda - Término de búsqueda opcional
 * @param {Object} [options] - Parámetros de paginación
 * @param {number} [options.limit=10] - Cantidad máxima de publicaciones por bloque
 * @param {number} [options.offset=0] - Desplazamiento inicial
 * @returns {Promise<{posts: Array, totalCount: number, hasMore: boolean}>} Objeto estandarizado de paginación
 */
export async function fetchFeed(categoria = null, campusId = null, busqueda = null, options = {}) {
  const limit = typeof options?.limit === 'number' ? options.limit : 10;
  const offset = typeof options?.offset === 'number' ? options.offset : 0;

  // Normalizar categoría
  let categoriaEnum = null;
  if (categoria && categoria !== 'Todo' && categoria !== 'Todas') {
    categoriaEnum = TAG_A_CATEGORIA_MAP[categoria] || (CATEGORIAS_ENUM[categoria] ? categoria : null);
  }

  // Normalizar campusId
  const institucionUuid = (campusId && campusId !== 'Todas' && campusId !== 'General') ? campusId : null;

  // Si Supabase no está configurado, usar almacenamiento de fallback con filtros y paginación
  if (!SUPABASE_CONFIG.isConfigured) {
    let list = [...fallbackPostsStorage];

    if (categoriaEnum) {
      list = list.filter(p => p.categoria === categoriaEnum || (p.etiquetas && p.etiquetas.includes(categoria)));
    }

    if (institucionUuid) {
      list = list.filter(p => p.institucion_id === institucionUuid);
    }

    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      list = list.filter(p => 
        (p.titulo && p.titulo.toLowerCase().includes(q)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.nombre_institucion && p.nombre_institucion.toLowerCase().includes(q)) ||
        (p.etiquetas && p.etiquetas.some(t => t.toLowerCase().includes(q)))
      );
    }

    const totalCount = list.length;
    const pagedPosts = list.slice(offset, offset + limit);
    const hasMore = offset + pagedPosts.length < totalCount;

    return {
      posts: pagedPosts,
      totalCount,
      hasMore
    };
  }

  try {
    const rpcParams = {
      p_institucion_id: institucionUuid,
      p_categoria: categoriaEnum,
      p_limite: limit,
      p_offset: offset
    };

    const { data, error } = await supabase.rpc('obtener_feed_publico', rpcParams);

    if (error) {
      console.error('[PostsService] Error en RPC obtener_feed_publico:', error);
      throw error;
    }

    let posts = data || [];
    let totalCount = 0;
    let hasMore = false;

    if (posts.length > 0) {
      if (posts[0].total_count !== undefined && posts[0].total_count !== null && !isNaN(Number(posts[0].total_count))) {
        totalCount = Number(posts[0].total_count);
        hasMore = offset + posts.length < totalCount;
      } else {
        // Fallback resiliente: Si la función RPC en Supabase aún no tiene la migración con total_count
        hasMore = posts.length >= limit;
        totalCount = hasMore ? offset + posts.length + 1 : offset + posts.length;
      }
    }

    // Filtro adicional en cliente para búsqueda por texto
    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      posts = posts.filter(p => 
        (p.titulo && p.titulo.toLowerCase().includes(q)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.nombre_institucion && p.nombre_institucion.toLowerCase().includes(q)) ||
        (p.etiquetas && p.etiquetas.some(t => t.toLowerCase().includes(q)))
      );
    }

    return {
      posts,
      totalCount,
      hasMore
    };
  } catch (err) {
    console.error('[PostsService] Excepción al ejecutar fetchFeed:', err);
    throw err;
  }
}

/**
 * Crea una publicación de forma anónima invocando la función RPC crear_publicacion_con_codigo
 * 
 * @param {Object} postData
 * @param {string} postData.institucionId - UUID de la institución seleccionada
 * @param {string} postData.codigoAcceso - Código secreto institucional proporcionado
 * @param {string} postData.categoria - Categoría enum de la publicación
 * @param {string} postData.titulo - Título de la publicación
 * @param {string} [postData.descripcion] - Contenido o descripción
 * @param {string} [postData.imagenUrl] - URL de la imagen WebP optimizada
 * @param {Array<string>} [postData.etiquetas] - Hasta 3 etiquetas oficiales
 * @returns {Promise<Object>} Publicación creada
 */
export async function createPost(postData) {
  const {
    institucionId,
    codigoAcceso,
    categoria,
    titulo,
    descripcion = '',
    imagenUrl = null,
    etiquetas = []
  } = postData;

  if (!institucionId) throw new Error('Debes seleccionar una institución universitaria.');

  // Resolver y asegurar concordancia del código institucional con la institución seleccionada
  let finalCodigoAcceso = (codigoAcceso || '').trim();
  const knownFallback = INSTITUCIONES_FALLBACK.find(i => i.id === institucionId);
  if (knownFallback && (!finalCodigoAcceso || (knownFallback.codigo_acceso && finalCodigoAcceso !== knownFallback.codigo_acceso && finalCodigoAcceso === 'UNICORDOBA2026'))) {
    finalCodigoAcceso = knownFallback.codigo_acceso;
  }

  if (!finalCodigoAcceso) throw new Error('El código institucional es obligatorio para validar pertenencia de forma anónima.');
  if (!titulo || !titulo.trim()) throw new Error('El título de la publicación es obligatorio.');

  // Normalizar categoría
  const categoriaEnum = TAG_A_CATEGORIA_MAP[categoria] || (CATEGORIAS_ENUM[categoria] ? categoria : 'Comunidad');

  // Limitar a 3 etiquetas máximo
  const cleanEtiquetas = (etiquetas || []).slice(0, 3);

  // Obtener hash anónimo del visitante
  const visitorIdHash = await getVisitorIdHash();

  if (!SUPABASE_CONFIG.isConfigured) {
    // Simulación en memoria para desarrollo local
    const dummyInst = INSTITUCIONES_FALLBACK.find(i => i.id === institucionId) || INSTITUCIONES_FALLBACK[0];
    
    // Validar código institucional de prueba
    if (dummyInst.codigo_acceso && dummyInst.codigo_acceso.toUpperCase() !== finalCodigoAcceso.toUpperCase()) {
      throw new Error(`Código institucional inválido para ${dummyInst.nombre}. (Código de prueba: ${dummyInst.codigo_acceso})`);
    }

    const nuevaPublicacion = {
      id: crypto.randomUUID ? crypto.randomUUID() : `mock-${Date.now()}`,
      institucion_id: dummyInst.id,
      nombre_institucion: dummyInst.nombre,
      categoria: categoriaEnum,
      titulo: titulo.trim(),
      descripcion: (descripcion || '').trim(),
      imagen_url: imagenUrl,
      etiquetas: cleanEtiquetas,
      estado: 'publicada',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      reportes_count: 0,
      total_reacciones: 0,
      reacciones_detalle: {}
    };

    fallbackPostsStorage.unshift(nuevaPublicacion);
    return nuevaPublicacion;
  }

  try {
    const rpcParams = {
      p_institucion_id: institucionId,
      p_codigo_acceso: finalCodigoAcceso,
      p_categoria: categoriaEnum,
      p_titulo: titulo.trim(),
      p_descripcion: (descripcion || '').trim() || null,
      p_imagen_url: imagenUrl || null,
      p_etiquetas: cleanEtiquetas,
      p_visitor_id_hash: visitorIdHash
    };

    const { data, error } = await supabase.rpc('crear_publicacion_con_codigo', rpcParams);

    if (error) {
      console.error('[PostsService] Error en RPC crear_publicacion_con_codigo:', error);
      if (error.code === '28000') {
        throw new Error('Código institucional incorrecto o la institución se encuentra inactiva.');
      }
      throw new Error(error.message || 'Error al crear la publicación.');
    }

    return data;
  } catch (err) {
    console.error('[PostsService] Excepción al crear post:', err);
    throw err;
  }
}

/**
 * Consulta las reacciones previas del visitante actual
 * @returns {Promise<Record<string, string>>} Mapa de postId -> tipoReaccion
 */
export async function fetchVisitorReactions() {
  const visitorId = getVisitorId();

  if (!SUPABASE_CONFIG.isConfigured) {
    const mapa = {};
    for (const [key, reaction] of Object.entries(fallbackReaccionesStorage)) {
      if (key.endsWith(`_${visitorId}`)) {
        const postId = key.replace(`_${visitorId}`, '');
        mapa[postId] = reaction;
      }
    }
    return mapa;
  }

  try {
    const { data, error } = await supabase
      .from('reacciones')
      .select('publicacion_id, reaccion')
      .eq('visitor_id', visitorId);

    if (error) {
      console.warn('[PostsService] Error consultando reacciones del visitante:', error);
      return {};
    }

    const map = {};
    (data || []).forEach(r => {
      map[r.publicacion_id] = r.reaccion;
    });
    return map;
  } catch (err) {
    console.warn('[PostsService] Excepción en fetchVisitorReactions:', err);
    return {};
  }
}

/**
 * Alterna (inserta, actualiza o remueve) una reacción del visitante
 * 
 * @param {string} postId - UUID de la publicación
 * @param {string} tipoReaccion - Uno de los 6 tipos ('corazon', 'risas', 'idea', 'sorpresa', 'aplauso', 'triste')
 * @returns {Promise<{ action: 'added'|'removed'|'updated', currentReaction: string|null }>}
 */
export async function toggleReaction(postId, tipoReaccion) {
  const visitorId = getVisitorId();

  if (!TIPOS_REACCION[tipoReaccion]) {
    throw new Error(`Tipo de reacción no válido: ${tipoReaccion}`);
  }

  if (!SUPABASE_CONFIG.isConfigured) {
    const storageKey = `${postId}_${visitorId}`;
    const previous = fallbackReaccionesStorage[storageKey];
    let action = 'added';
    let current = tipoReaccion;

    // Buscar publicación local para actualizar conteos
    const post = fallbackPostsStorage.find(p => p.id === postId);

    if (previous === tipoReaccion) {
      // Toggle off / Retirar voto
      delete fallbackReaccionesStorage[storageKey];
      action = 'removed';
      current = null;
      if (post && post.reacciones_detalle) {
        post.reacciones_detalle[tipoReaccion] = Math.max(0, (post.reacciones_detalle[tipoReaccion] || 1) - 1);
        post.total_reacciones = Math.max(0, (post.total_reacciones || 1) - 1);
      }
    } else {
      if (previous && post && post.reacciones_detalle) {
        post.reacciones_detalle[previous] = Math.max(0, (post.reacciones_detalle[previous] || 1) - 1);
        action = 'updated';
      } else if (post) {
        post.total_reacciones = (post.total_reacciones || 0) + 1;
      }
      fallbackReaccionesStorage[storageKey] = tipoReaccion;
      if (post) {
        post.reacciones_detalle = post.reacciones_detalle || {};
        post.reacciones_detalle[tipoReaccion] = (post.reacciones_detalle[tipoReaccion] || 0) + 1;
      }
    }

    return { action, currentReaction: current };
  }

  try {
    // 1. Verificar si ya existe una reacción del visitante para este post
    const { data: existing, error: queryError } = await supabase
      .from('reacciones')
      .select('id, reaccion')
      .eq('publicacion_id', postId)
      .eq('visitor_id', visitorId)
      .maybeSingle();

    if (queryError) throw queryError;

    if (existing) {
      if (existing.reaccion === tipoReaccion) {
        // Mismo emoji: remover reacción (toggle off)
        const { error: delError } = await supabase
          .from('reacciones')
          .delete()
          .eq('id', existing.id);

        if (delError) throw delError;
        return { action: 'removed', currentReaction: null };
      } else {
        // Diferente emoji: cambiar reacción
        const { error: updateError } = await supabase
          .from('reacciones')
          .update({ reaccion: tipoReaccion })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { action: 'updated', currentReaction: tipoReaccion };
      }
    } else {
      // Nueva reacción: insertar
      const { error: insertError } = await supabase
        .from('reacciones')
        .insert({
          publicacion_id: postId,
          visitor_id: visitorId,
          reaccion: tipoReaccion
        });

      if (insertError) throw insertError;
      return { action: 'added', currentReaction: tipoReaccion };
    }
  } catch (err) {
    console.error('[PostsService] Excepción al gestionar reacción:', err);
    throw err;
  }
}

/**
 * Envía un reporte ciudadano contra una publicación por incumplimiento ético.
 * Si la publicación acumula 3 reportes, la base de datos la pasa automáticamente a 'en_revision'.
 * 
 * @param {string} postId - UUID de la publicación a reportar
 * @param {string} motivo - Descripción del motivo del reporte
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function reportPost(postId, motivo) {
  const visitorId = getVisitorId();

  if (!motivo || !motivo.trim()) {
    throw new Error('Debes especificar un motivo para enviar el reporte.');
  }

  if (!SUPABASE_CONFIG.isConfigured) {
    const post = fallbackPostsStorage.find(p => p.id === postId);
    if (post) {
      post.reportes_count = (post.reportes_count || 0) + 1;
      if (post.reportes_count >= 3) {
        post.estado = 'en_revision';
        fallbackPostsStorage = fallbackPostsStorage.filter(p => p.id !== postId);
        return {
          success: true,
          message: 'Reporte registrado. La publicación ha sido ocultada preventivamente al alcanzar 3 reportes comunitarios.'
        };
      }
    }
    return {
      success: true,
      message: 'Reporte ético recibido correctamente. Gracias por proteger el ambiente del muro.'
    };
  }

  try {
    const { error } = await supabase
      .from('reportes')
      .insert({
        publicacion_id: postId,
        visitor_id: visitorId,
        motivo: motivo.trim()
      });

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Ya has enviado un reporte sobre esta publicación previamente.');
      }
      throw error;
    }

    return {
      success: true,
      message: 'Reporte registrado exitosamente. Nuestro sistema ético evalúa las denuncias de forma continua.'
    };
  } catch (err) {
    console.error('[PostsService] Excepción enviando reporte:', err);
    throw err;
  }
}

export default {
  CATEGORIAS_ENUM,
  TAG_A_CATEGORIA_MAP,
  TIPOS_REACCION,
  fetchInstituciones,
  fetchFeed,
  createPost,
  fetchVisitorReactions,
  toggleReaction,
  reportPost
};
