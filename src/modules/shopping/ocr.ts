// Fase 10, rebanada 2: lee el texto de una foto de ticket en el propio dispositivo.
// La imagen se procesa en el navegador con Tesseract (WASM) y no se sube ni se
// guarda: entra como File, sale como texto y se descarta.

// Los tickets suelen fotografiarse sobre una mesa y con sombras o arrugas. Antes
// de leerlos aumentamos el contraste y limitamos la resolución: el worker local
// recibe texto más nítido sin aumentar innecesariamente el tiempo de lectura.
async function prepareTicketImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  // Las fotos de móvil suelen ser verticales; 2400 px reducía demasiado la
  // tipografía del ticket. Conservamos más detalle sin entregar originales
  // enormes al worker.
  const scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas no disponible')

  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.filter = 'grayscale(1) contrast(1.85) brightness(1.08)'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('No se pudo preparar la imagen')),
      'image/png',
    ),
  )
}

// Carga diferida: Tesseract solo se descarga cuando se usa una foto. El worker y
// el idioma pueden descargarse, pero la imagen no abandona nunca el dispositivo.
export async function readTicketImage(
  file: Blob,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const image = await prepareTicketImage(file).catch(() => file)
  const worker = await createWorker('spa', 1, {
    logger: onProgress
      ? (message) => {
          if (message.status === 'recognizing text')
            onProgress(message.progress)
        }
      : undefined,
  })

  try {
    // La columna y los importes se interpretan después con reglas específicas y
    // siempre pasan por revisión humana.
    await worker.setParameters({
      // Un ticket es una columna estrecha con muchas filas. SINGLE_COLUMN
      // separa mejor los productos y evita mezclar la columna de importes.
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    await worker.terminate()
  }
}
