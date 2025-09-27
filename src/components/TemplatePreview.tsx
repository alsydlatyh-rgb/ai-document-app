import React, { useState, useRef, MouseEvent } from 'react';
import { Template, Placeholder } from '../types';

interface TemplatePreviewProps {
  template: Template;
  placeholders: Placeholder[];
  selectedPlaceholderId: string | null;
  onAddPlaceholder: (p: Omit<Placeholder, 'id' | 'name' | 'fontSize' | 'color'>) => void;
  onSelectPlaceholder: (id: string | null) => void;
}

export function TemplatePreview({ template, placeholders, selectedPlaceholderId, onAddPlaceholder, onSelectPlaceholder }: TemplatePreviewProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentRect({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    setCurrentRect({ x: Math.min(startPoint.x, currentX), y: Math.min(startPoint.y, currentY), width: Math.abs(startPoint.x - currentX), height: Math.abs(startPoint.y - currentY) });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect || !containerRef.current || (currentRect.width < 5 && currentRect.height < 5)) {
      setIsDrawing(false);
      setCurrentRect(null);
      return;
    }
    const scaleX = template.width / containerRef.current.clientWidth;
    const scaleY = template.height / containerRef.current.clientHeight;
    onAddPlaceholder({ x: currentRect.x * scaleX, y: currentRect.y * scaleY, width: currentRect.width * scaleX, height: currentRect.height * scaleY });
    setIsDrawing(false);
    setCurrentRect(null);
  };

  const getDisplayStyles = (p: Placeholder) => {
    if (!containerRef.current) return {};
    const scaleX = containerRef.current.clientWidth / template.width;
    const scaleY = containerRef.current.clientHeight / template.height;
    return { left: `${p.x * scaleX}px`, top: `${p.y * scaleY}px`, width: `${p.width * scaleX}px`, height: `${p.height * scaleY}px` };
  };

  return (
    <div ref={containerRef} className="relative w-full h-full select-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => isDrawing && handleMouseUp()}>
      <img src={template.dataUrl} alt="Template Preview" className="w-full h-full object-contain pointer-events-none" />
      {placeholders.map(p => (<div key={p.id} className={`absolute border-2 cursor-pointer hover:bg-blue-500/30 ${selectedPlaceholderId === p.id ? 'border-blue-600 bg-blue-500/20' : 'border-blue-400'}`} style={getDisplayStyles(p)} onClick={(e) => { e.stopPropagation(); onSelectPlaceholder(p.id); }} />))}
      {isDrawing && currentRect && (<div className="absolute border-2 border-dashed border-green-500 bg-green-500/25" style={{ left: currentRect.x, top: currentRect.y, width: currentRect.width, height: currentRect.height }} />)}
    </div>
  );
}
