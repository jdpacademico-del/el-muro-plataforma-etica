/**
 * Gestor de Estado Global Reactivo (Patrón Pub/Sub) para El Muro
 */
class StateManager {
  constructor() {
    this.listeners = [];
    
    // Lista de Palabras Reservadas y Nombres Propios para Moderación Ética
    this.palabrasReservadas = [
      'carlos', 'maria', 'juan', 'andres', 'pedro', 'luis', 'ana', 'sofia', 'felipe', 'camila',
      'gonzalez', 'rodriguez', 'perez', 'martinez', 'lopez', 'gomez', 'estupido', 'perra', 'malparido',
      'hijueputa', 'gonorrea', 'marica', 'careverga', 'bastardo', 'imbecil'
    ];

    // Cargar estado inicial
    this.state = {
      posts: this.obtenerPostsIniciales(),
      tema: localStorage.getItem('muro_tema') || 'light',
      conectados: 18,
      likes: JSON.parse(localStorage.getItem('muro_likes') || '[]'),
      reportados: JSON.parse(localStorage.getItem('muro_reportados') || '[]'),
      votosEncuestas: JSON.parse(localStorage.getItem('muro_votos') || '{}'),
      etiquetaFiltro: 'Todo',
      universidadFiltro: 'Todas'
    };

    // Simulación dinámica de conectados
    setInterval(() => {
      const variacion = Math.floor(Math.random() * 5) - 2;
      const nuevoTotal = Math.max(10, this.state.conectados + variacion);
      this.setState({ conectados: nuevoTotal });
    }, 4000);
  }

  obtenerPostsIniciales() {
    const guardados = localStorage.getItem('muro_posts');
    if (guardados) return JSON.parse(guardados);

    return [
      {
        id: 101,
        contenido: "Alguien sabe si mañana la biblioteca abre en jornada continua? Necesito entregar la tesis de grado 😭",
        etiqueta: "AyudaAcadémica",
        universidad: "Unicórdoba",
        imagen_url: null,
        me_gusta: 42,
        reportes: 0,
        stickers: { '❤️': 12, '🔥': 8 },
        created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString()
      },
      {
        id: 102,
        contenido: "Un aplauso enorme para la selección de fútbol del campus por la victoria de hoy! ⚽🔥",
        etiqueta: "ClubsYDeportes",
        universidad: "UPB",
        imagen_url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80",
        me_gusta: 128,
        reportes: 0,
        stickers: { '👏': 25, '🔥': 30 },
        encuesta: {
          pregunta: "¿Asistirás a la final el próximo viernes?",
          opciones: [
            { texto: "¡Obvio, allá estaré!", votos: 45 },
            { texto: "Tengo parcial, no puedo 😭", votos: 12 }
          ]
        },
        created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      }
    ];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(listener => listener(this.state));
    localStorage.setItem('muro_posts', JSON.stringify(this.state.posts));
  }

  getState() {
    return this.state;
  }

  // Sanitización Ética de Texto
  validarTextoEtico(texto) {
    if (!texto || !texto.trim()) return { valido: false, mensaje: "El mensaje no puede estar vacío." };
    
    const textoMinuscula = texto.toLowerCase();
    const contieneProhibida = this.palabrasReservadas.some(palabra => {
      const regex = new RegExp(`\\b${palabra}\\b`, 'i');
      return regex.test(textoMinuscula);
    });

    if (contieneProhibida) {
      return { 
        valido: false, 
        mensaje: "⚠️ Filtro ético activado: No se permiten nombres propios de personas ni lenguaje ofensivo." 
      };
    }

    return { valido: true };
  }

  // Acciones del Estado Global
  agregarPost(nuevoPost) {
    const validacion = this.validarTextoEtico(nuevoPost.contenido);
    if (!validacion.valido) return validacion;

    const posts = [nuevoPost, ...this.state.posts];
    this.setState({ posts });
    return { valido: true };
  }

  toggleLike(postId) {
    const likes = [...this.state.likes];
    const index = likes.indexOf(postId);
    const posts = this.state.posts.map(post => {
      if (post.id === postId) {
        const delta = index === -1 ? 1 : -1;
        return { ...post, me_gusta: post.me_gusta + delta };
      }
      return post;
    });

    if (index === -1) likes.push(postId);
    else likes.splice(index, 1);

    localStorage.setItem('muro_likes', JSON.stringify(likes));
    this.setState({ posts, likes });
  }

  reportarPost(postId) {
    const reportados = [...this.state.reportados];
    if (reportados.includes(postId)) return;

    reportados.push(postId);
    localStorage.setItem('muro_reportados', JSON.stringify(reportados));

    // Borrado automático comunitario si acumula 3 reportes
    const posts = this.state.posts.map(post => {
      if (post.id === postId) {
        return { ...post, reportes: post.reportes + 1 };
      }
      return post;
    }).filter(post => post.reportes < 3);

    this.setState({ posts, reportados });
  }

  votarEncuesta(postId, opcionIndex) {
    const claveVoto = `post_${postId}`;
    if (this.state.votosEncuestas[claveVoto] !== undefined) return;

    const votosEncuestas = { ...this.state.votosEncuestas, [claveVoto]: opcionIndex };
    localStorage.setItem('muro_votos', JSON.stringify(votosEncuestas));

    const posts = this.state.posts.map(post => {
      if (post.id === postId && post.encuesta) {
        const nuevasOpciones = post.encuesta.opciones.map((op, idx) => {
          if (idx === opcionIndex) return { ...op, votos: op.votos + 1 };
          return op;
        });
        return { ...post, encuesta: { ...post.encuesta, opciones: nuevasOpciones } };
      }
      return post;
    });

    this.setState({ posts, votosEncuestas });
  }

  agregarSticker(postId, emoji) {
    const posts = this.state.posts.map(post => {
      if (post.id === postId) {
        const stickers = { ...post.stickers };
        stickers[emoji] = (stickers[emoji] || 0) + 1;
        return { ...post, stickers };
      }
      return post;
    });
    this.setState({ posts });
  }
}

const store = new StateManager();
