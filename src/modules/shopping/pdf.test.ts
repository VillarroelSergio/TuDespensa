import { afterEach, describe, expect, it, vi } from 'vitest'

type TextItem = { str?: string; transform?: number[] }

const getPage = vi.fn()
const destroy = vi.fn(async () => undefined)
const getDocument = vi.fn()
const readTicketImage = vi.fn()

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...args),
}))

vi.mock('./ocr', () => ({
  readTicketImage: (...args: unknown[]) => readTicketImage(...args),
}))

const { readTicketPdf } = await import('./pdf')

function fakeFile(): File {
  return {
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as File
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('readTicketPdf', () => {
  it('usa el texto embebido cuando el PDF tiene suficiente contenido legible', async () => {
    const items: TextItem[] = [
      { str: 'Tomate', transform: [1, 0, 0, 1, 0, 100] },
      { str: '500 g', transform: [1, 0, 0, 1, 40, 100] },
      { str: 'Leche', transform: [1, 0, 0, 1, 0, 80] },
    ]
    getPage.mockResolvedValue({ getTextContent: async () => ({ items }) })
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage, destroy }),
    })

    const result = await readTicketPdf(fakeFile())

    expect(result).toBe('Tomate 500 g\nLeche')
    expect(destroy).toHaveBeenCalledOnce()
    expect(readTicketImage).not.toHaveBeenCalled()
  })

  it('recurre a OCR por imagen cuando el PDF es un ticket escaneado sin texto útil', async () => {
    getPage.mockResolvedValue({
      getTextContent: async () => ({
        items: [{ str: '.', transform: [1, 0, 0, 1, 0, 0] }],
      }),
      getViewport: () => ({ width: 100, height: 200 }),
      render: () => ({ promise: Promise.resolve() }),
    })
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage, destroy }),
    })
    readTicketImage
      .mockResolvedValueOnce('página 1')
      .mockResolvedValueOnce('página 2')

    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return realCreateElement(tag)
      return {
        width: 0,
        height: 0,
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(['png'])),
      } as unknown as HTMLCanvasElement
    })

    const result = await readTicketPdf(fakeFile())

    expect(result).toBe('página 1\npágina 2')
    expect(readTicketImage).toHaveBeenCalledTimes(2)
    // se abre el documento dos veces: una para intentar extraer texto y otra para renderizar páginas como imágenes
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
