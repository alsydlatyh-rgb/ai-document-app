import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { Template, Placeholder, DataRow } from '../types';

export const generateAndDownloadZip = async (
  template: Template,
  placeholders: Placeholder[],
  dataRows: DataRow[],
  onProgress: (progress: number) => void
) => {
  try {
    const zip = new JSZip();
    for (let i = 0; i < dataRows.length; i++) {
      const dataRow = dataRows[i];
      const templateBytes = await template.file.arrayBuffer();
      let pdfDoc;

      if (template.type === 'pdf') {
        pdfDoc = await PDFDocument.load(templateBytes);
      } else {
        pdfDoc = await PDFDocument.create();
        const image = await (template.file.type === 'image/png'
          ? pdfDoc.embedPng(templateBytes)
          : pdfDoc.embedJpg(templateBytes));
        const page = pdfDoc.addPage([template.width, template.height]);
        page.drawImage(image, { x: 0, y: 0, width: template.width, height: template.height });
      }

      const page = pdfDoc.getPages()[0];
      const { height: pageHeight } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const placeholder of placeholders) {
        const key = placeholder.name.replace(/{{|}}/g, '');
        const text = dataRow[key] || '';
        const colorHex = placeholder.color.substring(1);
        const r = parseInt(colorHex.substring(0, 2), 16) / 255;
        const g = parseInt(colorHex.substring(2, 4), 16) / 255;
        const b = parseInt(colorHex.substring(4, 6), 16) / 255;
        const y = pageHeight - placeholder.y - placeholder.fontSize;
        page.drawText(text, { x: placeholder.x, y, font, size: placeholder.fontSize, color: rgb(r, g, b) });
      }

      const pdfBytes = await pdfDoc.save();
      zip.file(`document_${i + 1}.pdf`, pdfBytes);
      onProgress(Math.round(((i + 1) / dataRows.length) * 100));
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = 'generated_documents.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    alert(`Generation Error: ${(error as Error).message}`);
    onProgress(0);
  }
};
