export async function isPdfBlob(blob: Blob, fileName?: string): Promise<boolean> {
  if (blob.type === 'application/pdf') return true;
  if (fileName && fileName.toLowerCase().endsWith('.pdf')) return true;
  if (blob.size >= 5) {
    try {
      const header = await blob.slice(0, 5).text();
      if (header === '%PDF-') return true;
    } catch {
      return false;
    }
  }
  return false;
}

interface TextItemLike {
  str?: string;
  transform?: number[];
}

export async function convertPdfToImagesAndText(
  blob: Blob,
  maxPages = 6
): Promise<{ pageFiles: File[]; extractedText: string }> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const buffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    const totalPages = Math.min(pdf.numPages, maxPages);
    const pageFiles: File[] = [];
    const textPages: string[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // 1. Extraer texto agrupado por filas (coordenada Y)
      try {
        const textContent = await page.getTextContent();
        const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];

        for (const rawItem of textContent.items as TextItemLike[]) {
          const str = (rawItem.str ?? '').trim();
          if (!str || !Array.isArray(rawItem.transform) || rawItem.transform.length < 6) {
            continue;
          }
          const x = rawItem.transform[4];
          const y = rawItem.transform[5];
          const existingRow = rows.find((r) => Math.abs(r.y - y) <= 4);
          if (existingRow) {
            existingRow.items.push({ x, str });
          } else {
            rows.push({ y, items: [{ x, str }] });
          }
        }

        rows.sort((a, b) => b.y - a.y);
        const lines = rows.map((r) => {
          r.items.sort((a, b) => a.x - b.x);
          return r.items.map((it) => it.str).join(' ');
        });

        const pageText = lines.join('\n').trim();
        if (pageText) {
          textPages.push(`--- Página ${pageNum} ---\n${pageText}`);
        }
      } catch {
        // Si falla la extracción de texto en una página, seguimos con la imagen
      }

      // 2. Renderizar la página como imagen JPEG nítida
      const baseViewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(2.0, 2600 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        const imgBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
        );
        if (imgBlob) {
          pageFiles.push(new File([imgBlob], `pagina-${pageNum}.jpg`, { type: 'image/jpeg' }));
        }
      }
    }

    return {
      pageFiles,
      extractedText: textPages.join('\n\n'),
    };
  } catch {
    return {
      pageFiles: [],
      extractedText: '',
    };
  }
}
