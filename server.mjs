import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let currentPort = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.mjs': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.xml': 'application/xml; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const REWRITES = {
  '/': '/index.html',
  '/quienes-somos': '/quienes-somos.html',
  '/politicas-privacidad': '/politicas-privacidad.html',
  '/terminos-condiciones': '/terminos-condiciones.html',
  '/admin': '/admin.html'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);

  // Aplicar rewrites
  if (REWRITES[reqPath]) {
    reqPath = REWRITES[reqPath];
  } else if (!path.extname(reqPath) && fs.existsSync(path.join(__dirname, reqPath + '.html'))) {
    reqPath = reqPath + '.html';
  }

  const filePath = path.join(__dirname, reqPath);

  // Prevenir Directory Traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Prohibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>404 No Encontrado</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-[#FBF8F3] min-h-screen flex items-center justify-center p-4 text-center">
          <div class="bg-white p-8 rounded-3xl shadow-xl max-w-sm space-y-3">
            <span class="text-4xl">🏛️</span>
            <h1 class="text-xl font-black text-slate-800">Página no encontrada</h1>
            <p class="text-xs text-slate-500">La ruta solicitada no existe en El Muro.</p>
            <a href="/" class="inline-block px-4 py-2 bg-orange-500 text-white font-bold text-xs rounded-xl shadow-md">Volver al Inicio</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[El Muro Server] Puerto ${currentPort} en uso, probando puerto ${currentPort + 1}...`);
    currentPort++;
    server.listen(currentPort);
  } else {
    console.error('[El Muro Server] Error:', err);
  }
});

server.listen(currentPort, () => {
  console.log(`[El Muro Server] Servidor local activo en: http://localhost:${currentPort}`);
  console.log(`[El Muro Server] Rutas disponibles:`);
  console.log(` - Feed Principal:          http://localhost:${currentPort}/`);
  console.log(` - ¿Quiénes Somos?:         http://localhost:${currentPort}/quienes-somos`);
  console.log(` - Políticas de Privacidad: http://localhost:${currentPort}/politicas-privacidad`);
  console.log(` - Términos y Condiciones:  http://localhost:${currentPort}/terminos-condiciones`);
  console.log(` - Panel de Administración: http://localhost:${currentPort}/admin`);
});
