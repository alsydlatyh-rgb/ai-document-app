import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { OcrProgress } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const extractTextFromPdfs = async (
  sourcePdfs: File[],
  onProgress: (progress: OcrProgress) => void
): Promise<string> => {
  let combinedText = '';
  onProgress({ percent: 0, status: 'Initializing OCR worker...' });
  const worker = await createWorker('eng');
  
  try {
    let totalPages = 0;
    for (const file of sourcePdfs) {
      const pdf = await pdfjsLib.getDocument(new Uint8Array(await file.arrayBuffer())).promise;
      totalPages += pdf.numPages;
    }
    
    let pagesProcessed = 0;
    for (const file of sourcePdfs) {
      const pdf = await pdfjsLib.getDocument(new Uint8Array(await file.arrayBuffer())).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        pagesProcessed++;
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error("Canvas context not available");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        
        onProgress({ percent: Math.round((pagesProcessed / totalPages) * 100), status: `Processing page ${pagesProcessed} of ${totalPages}...` });
        const { data: { text } } = await worker.recognize(canvas);
        combinedText += text + '\n\n';
      }
    }
    onProgress({ percent: 100, status: 'OCR complete.' });
  } catch (error) {
    onProgress({ percent: 100, status: `An error occurred: ${(error as Error).message}` });
  } finally {
    await worker.terminate();
  }
  return combinedText;
};
