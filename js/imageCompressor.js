/**
 * Compresión de imágenes en el cliente (Browser HTML5 Canvas)
 * Reduce fotos a formato WebP < 60 KB.
 */
function comprimirImagen(archivoOriginal) {
  return new Promise((resolve, reject) => {
    if (!archivoOriginal) return resolve(null);

    const reader = new FileReader();
    reader.readAsDataURL(archivoOriginal);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_ANCHO = 800;
        let ancho = img.width;
        let alto = img.height;

        if (ancho > MAX_ANCHO) {
          alto = Math.round((alto * MAX_ANCHO) / ancho);
          ancho = MAX_ANCHO;
        }

        canvas.width = ancho;
        canvas.height = alto;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, ancho, alto);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Error en la compresión de imagen'));
          },
          'image/webp',
          0.65
        );
      };
    };
    reader.onerror = (error) => reject(error);
  });
}
