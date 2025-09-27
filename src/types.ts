export interface Template { file: File; dataUrl: string; type: 'image' | 'pdf'; width: number; height: number; }
export interface Placeholder { id: string; name: string; x: number; y: number; width: number; height: number; fontSize: number; color: string; }
export interface DataRow { id: string; [key: string]: string; }
export interface OcrProgress { percent: number; status: string; }```
