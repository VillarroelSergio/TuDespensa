import { readTicketImage } from './ocr'

type TextItem = {
  str?: string
  transform?: number[]
}

function textByLines(items: TextItem[]): string {
  const rows = new Map<number, TextItem[]>()

  for (const item of items) {
    if (!item.str?.trim()) continue
    const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2
    rows.set(y, [...(rows.get(y) ?? []), item])
  }

  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, row]) =>
      row
        .sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0))
        .map((item) => item.str?.trim())
        .filter(Boolean)
        .join(' '),
    )
    .join('\n')
}

async function pdfPagesAsImages(file: File): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise

  try {
    const images: Blob[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('No se pudo convertir el PDF')),
          'image/png',
        ),
      )
      images.push(image)
    }
    return images
  } finally {
    await document.destroy()
  }
}

// Prioriza el texto embebido de un ticket electrónico; si el PDF es escaneado,
// convierte localmente sus páginas y reutiliza el OCR de fotografías.
export async function readTicketPdf(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise

  try {
    const text: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      text.push(textByLines(content.items as TextItem[]))
    }
    const extracted = text.join('\n').trim()
    if (extracted.replace(/[^a-záéíóúüñ]/gi, '').length >= 12) return extracted
  } finally {
    await document.destroy()
  }

  const images = await pdfPagesAsImages(file)
  const text: string[] = []
  for (const [index, image] of images.entries()) {
    text.push(
      await readTicketImage(image, (ratio) =>
        onProgress?.((index + ratio) / images.length),
      ),
    )
  }
  return text.join('\n')
}
