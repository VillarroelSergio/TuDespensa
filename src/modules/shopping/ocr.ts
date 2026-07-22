// Fase 10, rebanada 2: lee el texto de una foto de ticket en el propio dispositivo.
// La imagen (File) se procesa en el navegador con Tesseract (WASM) y no se sube a
// ningún servidor ni se guarda: entra como File, sale como texto y se descarta.
// El texto resultante alimenta el mismo parser/revisión de la rebanada 1.

// ponytail: carga diferida de tesseract.js — pesa; solo se descarga si la persona
// usa la foto. El worker/idioma vienen del CDN de la librería; la imagen NO sale.
export async function readTicketImage(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js')
  const { data } = await Tesseract.recognize(file, 'spa', {
    logger: onProgress
      ? (message) => {
          if (message.status === 'recognizing text')
            onProgress(message.progress)
        }
      : undefined,
  })
  return data.text
}
