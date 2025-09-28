import React, { useState, useEffect, ChangeEvent } from 'react';
import { TemplatePreview } from './components/TemplatePreview';
import { generateAndDownloadZip } from './services/generationService';
import { extractTextFromPdfs } from './services/ocrService';
import { generateDataWithAI, detectPlaceholdersWithAI } from './services/aiService';
import { Template, Placeholder, DataRow, OcrProgress } from './types';
import * as pdfjsLib from 'pdfjs-dist';

// This line is important for the service to work
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function App() {
    // --- STATE MANAGEMENT ---
    const [currentStep, setCurrentStep] = useState(1);
    const [template, setTemplate] = useState<Template | null>(null);
    const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
    const [dataRows, setDataRows] = useState<DataRow[]>([]);
    const [selectedPlaceholderId, setSelectedPlaceholderId] = useState<string | null>(null);
    const [dataInputMethod, setDataInputMethod] = useState<'manual' | 'ai'>('manual');
    const [sourcePdfs, setSourcePdfs] = useState<File[]>([]);
    const [extractedText, setExtractedText] = useState('');
    
    // UPDATED: Load API key from localStorage or default to empty string
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('googleApiKey') || '');

    const [aiPrompt, setAiPrompt] = useState('');
    const [ocrProgress, setOcrProgress] = useState<OcrProgress>({ percent: 0, status: '' });
    const [isLoading, setIsLoading] = useState({ ocr: false, aiData: false, generating: false, detecting: false, processingTemplate: false });
    const [generationProgress, setGenerationProgress] = useState(0);

    // --- EFFECTS ---
    // UPDATED: Save API key to localStorage whenever it changes
    useEffect(() => {
        if (apiKey) {
            localStorage.setItem('googleApiKey', apiKey);
        } else {
            localStorage.removeItem('googleApiKey');
        }
    }, [apiKey]);

    useEffect(() => { if (placeholders.length > 0 && dataRows.length === 0) { handleAddDataRow(); } }, [placeholders.length]);

    // --- HANDLER FUNCTIONS ---
    const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const handleTemplateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        setIsLoading(p => ({ ...p, processingTemplate: true }));
        const type = file.type.startsWith('image/') ? 'image' : (file.type === 'application/pdf' ? 'pdf' : null); if (!type) { alert("Unsupported file type."); setIsLoading(p => ({ ...p, processingTemplate: false })); return; }
        let data;
        try {
            if (type === 'pdf') {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(await file.arrayBuffer())).promise; const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 1.5 }); const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); if (!context) throw new Error("Could not get canvas context"); canvas.height = viewport.height; canvas.width = viewport.width; await page.render({ canvasContext: context, viewport }).promise; const originalViewport = page.getViewport({ scale: 1.0 });
                data = { dataUrl: canvas.toDataURL('image/png'), width: originalViewport.width, height: originalViewport.height };
            } else {
                data = await new Promise<{ dataUrl: string, width: number, height: number }>(resolve => { const reader = new FileReader(); reader.onload = e => { const img = new Image(); img.onload = () => resolve({ dataUrl: e.target!.result as string, width: img.width, height: img.height }); img.src = e.target!.result as string; }; reader.readAsDataURL(file); });
            }
            setTemplate({ file, type, ...data }); setPlaceholders([]); setDataRows([]); setCurrentStep(2);
        } catch (e) { alert("Could not process the template file."); }
        finally { setIsLoading(p => ({ ...p, processingTemplate: false })); }
    };

    const handleAddPlaceholder = (p: Omit<Placeholder, 'id' | 'name' | 'fontSize' | 'color'>) => { const name = prompt("Enter placeholder name:", `{{field_${placeholders.length + 1}}}`); if (name) { setPlaceholders([...placeholders, { ...p, id: generateId(), name, fontSize: 12, color: '#000000' }]); } };
    const handleUpdatePlaceholder = (id: string, updates: Partial<Placeholder>) => { setPlaceholders(p => p.map(item => item.id === id ? {...item, ...updates} : item)); };
    const handleDeletePlaceholder = (id: string) => { setPlaceholders(p => p.filter(i => i.id !== id)); if (selectedPlaceholderId === id) setSelectedPlaceholderId(null); };
    const handleAddDataRow = () => { const newRow = placeholders.reduce((acc, p) => ({ ...acc, [p.name.replace(/{{|}}/g, '')]: '' }), { id: generateId() }); setDataRows(prev => [...prev, newRow]); };
    const handleRemoveDataRow = (id: string) => { setDataRows(rows => rows.filter(r => r.id !== id)); };
    const handleDataChange = (rowId: string, pName: string, value: string) => { setDataRows(rows => rows.map(r => r.id === rowId ? { ...r, [pName]: value } : r)); };
    const handleStartOcr = async () => { if (!sourcePdfs.length) return; setIsLoading(p => ({ ...p, ocr: true })); setExtractedText(''); try { setExtractedText(await extractTextFromPdfs(sourcePdfs, setOcrProgress)); } finally { setIsLoading(p => ({ ...p, ocr: false })); } };
    const handleAiGeneration = async () => { if (!apiKey || !aiPrompt) return alert('API Key and Instructions are required.'); setIsLoading(p => ({ ...p, aiData: true })); try { const pKeys = placeholders.map(p => p.name.replace(/{{|}}/g, '')); const generatedRows = await generateDataWithAI(apiKey, extractedText, aiPrompt, pKeys); setDataRows(generatedRows); alert(`${generatedRows.length} data rows generated!`); setDataInputMethod('manual'); } catch (e) { alert(`AI Error: ${(e as Error).message}`); } finally { setIsLoading(p => ({ ...p, aiData: false })); } };
    const handleGenerate = async () => { if (!template) return; setIsLoading(p => ({ ...p, generating: true })); setGenerationProgress(0); await generateAndDownloadZip(template, placeholders, dataRows, setGenerationProgress); setIsLoading(p => ({ ...p, generating: false })); };
    const handleAutoDetectPlaceholders = async () => { if (!apiKey) { alert("Please enter your Google AI API Key first."); return; } if (!template) return; setIsLoading(p => ({ ...p, detecting: true })); try { const detected = await detectPlaceholdersWithAI(apiKey, template.file); const newPlaceholders = detected.map(p => ({ id: generateId(), name: `{{${p.name}}}`, x: p.x * template.width, y: p.y * template.height, width: p.width * template.width, height: p.height * template.height, fontSize: 12, color: '#000000' })); setPlaceholders(current => [...current, ...newPlaceholders]); alert(`${newPlaceholders.length} placeholders detected!`); } catch (e) { alert(`Detection failed: ${(e as Error).message}`); } finally { setIsLoading(p => ({ ...p, detecting: false })); } };
    const canProceed = (step: number) => { if (step === 1) return !!template; if (step === 2) return placeholders.length > 0; if (step === 3) return dataRows.length > 0; return false; };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <header className="bg-white shadow-md p-4"><h1 className="text-2xl font-bold text-gray-800 text-center">AI Document Generator</h1></header>
            <main className="flex-grow flex flex-col lg:flex-row p-4 lg:p-8 space-y-8 lg:space-y-0 lg:space-x-8 overflow-hidden">
                <div className="w-full lg:w-1/3 bg-white p-6 rounded-lg shadow-lg flex flex-col"><div className="flex-grow overflow-y-auto pr-2 -mr-2">
                    {currentStep === 1 && (<div><h3 className="font-bold text-lg mb-2">Step 1: Upload Template</h3><p className="text-sm text-gray-600 mb-4">Upload a PDF, PNG, or JPG file.</p><input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={handleTemplateUpload} disabled={isLoading.processingTemplate} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"/><div className="h-8">{isLoading.processingTemplate && (<div className="flex items-center justify-center mt-4 text-gray-600"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Processing Template...</span></div>)}</div></div>)}
                    {currentStep === 2 && (<div><h3 className="font-bold text-lg mb-2">Step 2: Define Placeholders</h3><p className="text-sm text-gray-600 mb-4">Draw boxes on the preview, or let AI detect them.</p><div className="p-3 border rounded-lg bg-gray-50 mb-4"><label className="block text-xs font-medium text-gray-600 mb-1">Google AI API Key (Saved in browser)</label><input type="password" placeholder="Enter API Key for AI features" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="block w-full px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-sm"/></div><button onClick={handleAutoDetectPlaceholders} disabled={isLoading.detecting || !apiKey} className="w-full mb-4 py-2 px-4 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed">{isLoading.detecting ? 'Analyzing...' : '✨ Auto-Detect Placeholders'}</button><div className="space-y-3">{placeholders.map(p => (<div key={p.id} className={`p-3 rounded-md border ${selectedPlaceholderId === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`} onClick={() => setSelectedPlaceholderId(p.id)}><div className="flex justify-between items-center"><span className="font-semibold text-sm">{p.name}</span><button onClick={(e) => { e.stopPropagation(); handleDeletePlaceholder(p.id); }} className="text-red-500 hover:text-red-700 font-bold text-xl leading-none">&times;</button></div><div className="mt-2 flex items-center space-x-4"><label className="text-xs">Font:</label><input type="number" value={p.fontSize} onChange={e => handleUpdatePlaceholder(p.id, { fontSize: parseInt(e.target.value) })} className="w-16 p-1 border rounded-md"/><label className="text-xs">Color:</label><input type="color" value={p.color} onChange={e => handleUpdatePlaceholder(p.id, { color: e.target.value })} className="w-8 h-8 p-0 border-none rounded"/></div></div>))}</div></div>)}
                    {currentStep === 3 && (<div><h3 className="font-bold text-lg mb-2">Step 3: Provide Data</h3><div className="text-sm font-medium text-center text-gray-500 border-b border-gray-200 mb-4"><ul className="flex flex-wrap -mb-px"><li className="mr-2"><a href="#" onClick={(e) => {e.preventDefault(); setDataInputMethod('manual')}} className={`inline-block p-4 rounded-t-lg border-b-2 ${dataInputMethod === 'manual' ? 'text-blue-600 border-blue-600' : 'border-transparent hover:text-gray-600 hover:border-gray-300'}`}>Manual</a></li><li><a href="#" onClick={(e) => {e.preventDefault(); setDataInputMethod('ai')}} className={`inline-block p-4 rounded-t-lg border-b-2 ${dataInputMethod === 'ai' ? 'text-blue-600 border-blue-600' : 'border-transparent hover:text-gray-600 hover:border-gray-300'}`}>AI</a></li></ul></div>{dataInputMethod === 'manual' && (<div className="space-y-4">{dataRows.map((row, idx) => (<div key={row.id} className="p-3 border rounded-lg relative"><button onClick={() => handleRemoveDataRow(row.id)} className="absolute top-2 right-2 text-red-500 font-bold">&times;</button><h4 className="font-semibold mb-2">Document {idx + 1}</h4>{placeholders.map(p => { const key = p.name.replace(/{{|}}/g, ''); return <div key={p.id} className="mb-2"><label className="block text-sm font-medium text-gray-700">{key}</label><input type="text" value={row[key] || ''} onChange={(e) => handleDataChange(row.id, key, e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border rounded-md shadow-sm sm:text-sm" /></div>; })}</div>))}<button onClick={handleAddDataRow} className="w-full mt-2 py-2 px-4 bg-green-500 text-white rounded-md hover:bg-green-600">Add Row</button></div>)}{dataInputMethod === 'ai' && (<div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">1. Knowledge Source (PDFs)</label><input type="file" accept=".pdf" multiple onChange={(e) => setSourcePdfs(Array.from(e.target.files || []))} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/></div><button onClick={handleStartOcr} disabled={isLoading.ocr || sourcePdfs.length === 0} className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400">{isLoading.ocr ? 'Processing...' : 'Extract Text with OCR'}</button>{isLoading.ocr && (<div><div className="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${ocrProgress.percent}%` }}></div></div><p className="text-center text-sm text-gray-600 mt-2">{ocrProgress.status}</p></div>)}{extractedText && (<div className="mt-4 border-t pt-4 space-y-4"><div><label className="block text-sm font-medium text-gray-700">2. Google AI API Key (Saved in browser)</label><input type="password" placeholder="Enter your API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border rounded-md shadow-sm sm:text-sm"/></div><div><label className="block text-sm font-medium text-gray-700">3. Instructions for AI</label><textarea placeholder="e.g., 'Extract the full name, address, and total amount...'" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className="mt-1 block w-full h-24 px-3 py-2 bg-white border rounded-md shadow-sm sm:text-sm"/></div><button onClick={handleAiGeneration} disabled={isLoading.aiData || !apiKey} className="w-full py-2 px-4 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-400">Generate Data with AI</button></div>)}</div>)}</div>)}
                    {currentStep === 4 && (<div><h3 className="font-bold text-lg mb-2">Step 4: Generate & Download</h3><p className="text-gray-600 mb-4">You will generate <strong>{dataRows.length}</strong> document(s).</p><button onClick={handleGenerate} disabled={isLoading.generating || dataRows.length === 0} className="w-full py-3 px-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">{isLoading.generating ? `Generating... ${generationProgress}%` : 'Generate Documents'}</button>{isLoading.generating && (<div className="w-full bg-gray-200 rounded-full h-2.5 mt-4"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${generationProgress}%` }}></div></div>)}</div>)}
                </div></div>
                <div className="w-full lg:w-2/3 bg-gray-200 p-2 rounded-lg shadow-lg flex items-center justify-center overflow-hidden">{template ? (<TemplatePreview template={template} placeholders={placeholders} selectedPlaceholderId={selectedPlaceholderId} onAddPlaceholder={handleAddPlaceholder} onSelectPlaceholder={setSelectedPlaceholderId}/>) : (<div className="text-center p-8 border-2 border-dashed border-gray-400 rounded-lg text-gray-500"><p className="font-semibold">Template Preview</p><p className="text-sm">Upload a document to begin.</p></div>)}</div>
            </main>
            <footer className="bg-white shadow-inner p-4 flex justify-between items-center mt-auto">
                <button onClick={() => setCurrentStep(s => Math.max(1, s - 1))} disabled={currentStep === 1} className="py-2 px-4 border rounded-md text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">Back</button>
                <div className="text-sm text-gray-600">Step {currentStep} of 4</div>
                <button onClick={() => setCurrentStep(s => Math.min(4, s + 1))} disabled={!canProceed(currentStep) || currentStep === 4} className="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400">Next</button>
            </footer>
        </div>
    );
}

export default App;
