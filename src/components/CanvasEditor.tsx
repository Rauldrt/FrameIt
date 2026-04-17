import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Download, Share2, Move, ZoomIn, RotateCw, FlipHorizontal, Layers, 
  Type, Palette, Plus, X, Eraser, Wand2, ChevronDown, ChevronUp, 
  Undo2, Redo2, Sliders, Smartphone, Square, Sticker as StickerIcon,
  Sun, Contrast, Droplets, Image as ImageIcon, Trash2, RotateCcw,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface TextLayerState {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flip: number;
  fontFamily: string;
  color: string;
  effect: 'none' | 'shadow' | 'outline';
}

export interface StickerLayerState {
  id: string;
  type: 'sticker';
  emoji: string;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flip: number;
}

interface CommonLayerState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flip: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

type AspectRatio = '1:1' | '9:16';

interface EditorState {
  photoState: CommonLayerState;
  frameState: CommonLayerState;
  textLayers: TextLayerState[];
  stickerLayers: StickerLayerState[];
  aspectRatio: AspectRatio;
  frameCanvasData?: string; // Cache the erased frame state
}

interface CanvasEditorProps {
  frameSrc: string | null;
  photoSrc: string | null;
  onGenerateVideo?: (photoSrc: string) => void;
  isGeneratingVideo?: boolean;
  showTextTools?: boolean;
  photoAnalysis?: string | null;
}

const INITIAL_LAYER_STATE: CommonLayerState = { 
  x: 0, y: 0, zoom: 1, rotation: 0, flip: 1,
  brightness: 100, contrast: 100, saturation: 100
};

const STICKER_OPTIONS = ['🏃', '⛰️', '🌲', '🔥', '🏆', '🏁', '👟', '🧭', '🐆', '🧉', '📍', '🗺️', '🧗', '🚵', '🏊'];

const FONT_OPTIONS = [
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Impact', family: 'Impact, sans-serif' },
  { name: 'Roboto', family: 'Roboto, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif' },
];

const COLOR_OPTIONS = [
  '#ffffff', '#000000', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6'
];

const FILTER_PRESETS = [
  { name: 'Original', brightness: 100, contrast: 100, saturation: 100 },
  { name: 'Brillante', brightness: 120, contrast: 110, saturation: 110 },
  { name: 'Dramático', brightness: 90, contrast: 140, saturation: 80 },
  { name: 'Vibrante', brightness: 105, contrast: 105, saturation: 150 },
  { name: 'B&N', brightness: 100, contrast: 120, saturation: 0 },
  { name: 'Cálido', brightness: 100, contrast: 100, saturation: 120 },
];

export function CanvasEditor({ 
  frameSrc, 
  photoSrc, 
  onGenerateVideo, 
  isGeneratingVideo, 
  showTextTools = false,
  photoAnalysis = null
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [activeLayer, setActiveLayer] = useState<string>('photo');
  const [expandedSections, setExpandedSections] = useState({ 
    layers: true, text: true, adjust: true, filters: false, presets: false, stickers: false 
  });
  
  const [editorState, setEditorState] = useState<EditorState>({
    photoState: { ...INITIAL_LAYER_STATE },
    frameState: { ...INITIAL_LAYER_STATE },
    textLayers: [],
    stickerLayers: [],
    aspectRatio: '1:1'
  });

  // History for Undo/Redo
  const [history, setHistory] = useState<EditorState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInternalChange = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('../lib/magicEraserWorker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      const { imageData } = e.data;
      if (frameCanvasRef.current) {
        const ctx = frameCanvasRef.current.getContext('2d');
        ctx?.putImageData(imageData, 0, 0);
        
        const newState = { ...editorState, frameCanvasData: frameCanvasRef.current.toDataURL() };
        setEditorState(newState);
        saveToHistory(newState);
        drawCanvas();
      }
      setEraseMode('none');
      setIsProcessingErase(false);
    };

    // Load from local storage
    const saved = localStorage.getItem('frameit_editor_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setEditorState(parsed);
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('frameit_editor_state', JSON.stringify(editorState));
  }, [editorState]);

  const saveToHistory = useCallback((state: EditorState) => {
    if (isInternalChange.current) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      // Limit history to 20 steps
      if (newHistory.length > 20) newHistory.shift();
      return [...newHistory, JSON.parse(JSON.stringify(state))];
    });
    setHistoryIndex(prev => Math.min(prev + 1, 19));
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      isInternalChange.current = true;
      const prevState = history[historyIndex - 1];
      setEditorState(prevState);
      setHistoryIndex(historyIndex - 1);
      if (prevState.frameCanvasData) {
        restoreFrameCanvas(prevState.frameCanvasData);
      }
      setTimeout(() => { isInternalChange.current = false; }, 0);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isInternalChange.current = true;
      const nextState = history[historyIndex + 1];
      setEditorState(nextState);
      setHistoryIndex(historyIndex + 1);
      if (nextState.frameCanvasData) {
        restoreFrameCanvas(nextState.frameCanvasData);
      }
      setTimeout(() => { isInternalChange.current = false; }, 0);
    }
  };

  const [eraseMode, setEraseMode] = useState<'none' | 'manual' | 'magic'>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const [isProcessingErase, setIsProcessingErase] = useState(false);
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const restoreFrameCanvas = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      if (frameCanvasRef.current) {
        const ctx = frameCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, frameCanvasRef.current.width, frameCanvasRef.current.height);
        ctx?.drawImage(img, 0, 0);
        drawCanvas();
      }
    };
    img.src = dataUrl;
  };

  // Initial History
  useEffect(() => {
    if (history.length === 0) {
      saveToHistory(editorState);
    }
  }, []);

  // Debounced history save for sliders
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleHistorySave = (state: EditorState) => {
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    historyTimeoutRef.current = setTimeout(() => {
      saveToHistory(state);
    }, 500);
  };

  // Load images
  useEffect(() => {
    if (photoSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        photoImgRef.current = img;
        drawCanvas();
      };
      img.src = photoSrc;
    } else {
      photoImgRef.current = null;
      drawCanvas();
    }
  }, [photoSrc]);

  useEffect(() => {
    if (frameSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        frameImgRef.current = img;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = img.width;
        offCanvas.height = img.height;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          offCtx.drawImage(img, 0, 0);
          frameCanvasRef.current = offCanvas;
        }
        drawCanvas();
      };
      img.src = frameSrc;
    } else {
      frameImgRef.current = null;
      frameCanvasRef.current = null;
      drawCanvas();
    }
  }, [frameSrc]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawLayer = (img: HTMLImageElement | HTMLCanvasElement | null, state: CommonLayerState, isFrame: boolean) => {
      if (!img) return;
      ctx.save();
      
      // Apply filters
      ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
      
      ctx.translate(canvas.width / 2 + state.x, canvas.height / 2 + state.y);
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.scale(state.flip * state.zoom, state.zoom);

      let drawWidth = img.width;
      let drawHeight = img.height;
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      drawWidth = img.width * scale;
      drawHeight = img.height * scale;

      ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    };

    drawLayer(photoImgRef.current, editorState.photoState, false);
    drawLayer(frameCanvasRef.current, editorState.frameState, true);

    // Draw stickers
    editorState.stickerLayers.forEach(s => {
      ctx.save();
      ctx.translate(canvas.width / 2 + s.x, canvas.height / 2 + s.y);
      ctx.rotate((s.rotation * Math.PI) / 180);
      ctx.scale(s.flip * s.zoom, s.zoom);
      ctx.font = '80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, 0, 0);
      ctx.restore();
    });

    // Draw text layers
    editorState.textLayers.forEach(t => {
      ctx.save();
      ctx.translate(canvas.width / 2 + t.x, canvas.height / 2 + t.y);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.scale(t.flip * t.zoom, t.zoom);
      ctx.font = `bold 60px ${t.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (t.effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
      } else if (t.effect === 'outline') {
        ctx.strokeStyle = t.color === '#000000' ? '#ffffff' : '#000000';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeText(t.text, 0, 0);
      }

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    });

    // Draw selection indicator (bounding box)
    const drawSelection = () => {
      let state: any = null;
      let width = 0;
      let height = 0;

      if (activeLayer === 'photo' && photoImgRef.current) {
        state = editorState.photoState;
        const scale = Math.max(canvas.width / photoImgRef.current.width, canvas.height / photoImgRef.current.height);
        width = photoImgRef.current.width * scale;
        height = photoImgRef.current.height * scale;
      } else if (activeLayer === 'frame' && frameCanvasRef.current) {
        state = editorState.frameState;
        const scale = Math.max(canvas.width / frameCanvasRef.current.width, canvas.height / frameCanvasRef.current.height);
        width = frameCanvasRef.current.width * scale;
        height = frameCanvasRef.current.height * scale;
      } else if (activeLayer.startsWith('text-')) {
        state = editorState.textLayers.find(t => t.id === activeLayer);
        width = 400; // Approximated
        height = 80;
      } else if (activeLayer.startsWith('sticker-')) {
        state = editorState.stickerLayers.find(s => s.id === activeLayer);
        width = 100;
        height = 100;
      }

      if (state) {
        ctx.save();
        ctx.translate(canvas.width / 2 + state.x, canvas.height / 2 + state.y);
        ctx.rotate((state.rotation * Math.PI) / 180);
        ctx.scale(state.flip * state.zoom, state.zoom);
        
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 4 / state.zoom;
        ctx.setLineDash([10 / state.zoom, 5 / state.zoom]);
        ctx.strokeRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20);
        
        // Corner handles
        ctx.fillStyle = '#10b981';
        const hSize = 10 / state.zoom;
        ctx.fillRect(-width / 2 - 10 - hSize/2, -height / 2 - 10 - hSize/2, hSize, hSize);
        ctx.fillRect(width / 2 + 10 - hSize/2, -height / 2 - 10 - hSize/2, hSize, hSize);
        ctx.fillRect(-width / 2 - 10 - hSize/2, height / 2 + 10 - hSize/2, hSize, hSize);
        ctx.fillRect(width / 2 + 10 - hSize/2, height / 2 + 10 - hSize/2, hSize, hSize);
        
        ctx.restore();
      }
    };

    if (!eraseMode || eraseMode === 'none') {
      drawSelection();
    }

  }, [editorState, activeLayer, eraseMode]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getEventPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const getLayerLocalPoint = (point: { x: number, y: number }, state: CommonLayerState, imgWidth: number, imgHeight: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    let lx = point.x - (cx + state.x);
    let ly = point.y - (cy + state.y);
    const angle = -(state.rotation * Math.PI) / 180;
    const rx = lx * Math.cos(angle) - ly * Math.sin(angle);
    const ry = lx * Math.sin(angle) + ly * Math.cos(angle);
    const sx = rx / (state.flip * state.zoom);
    const sy = ry / state.zoom;
    const scale = Math.max(canvas.width / imgWidth, canvas.height / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    return {
      x: (sx + drawWidth / 2) / scale,
      y: (sy + drawHeight / 2) / scale
    };
  };

  const floodFill = (startX: number, startY: number, tolerance = 30) => {
    if (!frameCanvasRef.current || !workerRef.current) return;
    setIsProcessingErase(true);
    const ctx = frameCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, frameCanvasRef.current.width, frameCanvasRef.current.height);
    
    workerRef.current.postMessage({
      imageData,
      startX,
      startY,
      width: frameCanvasRef.current.width,
      height: frameCanvasRef.current.height,
      tolerance
    });
  };

  const handleEraseAction = (point: {x: number, y: number}) => {
    if (!frameCanvasRef.current || eraseMode === 'none') return;
    const offCanvas = frameCanvasRef.current;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;
    const localPoint = getLayerLocalPoint(point, editorState.frameState, offCanvas.width, offCanvas.height);
    if (localPoint.x < 0 || localPoint.x > offCanvas.width || localPoint.y < 0 || localPoint.y > offCanvas.height) return;

    if (eraseMode === 'magic') {
      floodFill(localPoint.x, localPoint.y, 40);
      // Wait for worker message to clear erase mode
    } else if (eraseMode === 'manual') {
      offCtx.globalCompositeOperation = 'destination-out';
      offCtx.beginPath();
      offCtx.arc(localPoint.x, localPoint.y, 30, 0, Math.PI * 2);
      offCtx.fill();
      offCtx.globalCompositeOperation = 'source-over';
    }
    
    const newState = { ...editorState, frameCanvasData: offCanvas.toDataURL() };
    setEditorState(newState);
    saveToHistory(newState);
    drawCanvas();
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const point = getEventPoint(e);
    if (eraseMode !== 'none') {
      setIsDragging(true);
      handleEraseAction(point);
      return;
    }
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX, y: clientY });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const point = getEventPoint(e);
    if (eraseMode === 'manual') {
      handleEraseAction(point);
      return;
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragStart.x, dy = clientY - dragStart.y, sensitivity = 2;

    const updateState = (updater: (prev: EditorState) => EditorState) => {
      setEditorState(prev => {
        const next = updater(prev);
        return next;
      });
    };

    if (activeLayer === 'photo') {
      updateState(prev => ({ ...prev, photoState: { ...prev.photoState, x: prev.photoState.x + dx * sensitivity, y: prev.photoState.y + dy * sensitivity } }));
    } else if (activeLayer === 'frame') {
      updateState(prev => ({ ...prev, frameState: { ...prev.frameState, x: prev.frameState.x + dx * sensitivity, y: prev.frameState.y + dy * sensitivity } }));
    } else if (activeLayer.startsWith('text-')) {
      updateState(prev => ({ ...prev, textLayers: prev.textLayers.map(t => t.id === activeLayer ? { ...t, x: t.x + dx * sensitivity, y: t.y + dy * sensitivity } : t) }));
    } else if (activeLayer.startsWith('sticker-')) {
      updateState(prev => ({ ...prev, stickerLayers: prev.stickerLayers.map(s => s.id === activeLayer ? { ...s, x: s.x + dx * sensitivity, y: s.y + dy * sensitivity } : s) }));
    }
    
    setDragStart({ x: clientX, y: clientY });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      saveToHistory(editorState);
    }
    setIsDragging(false);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `frameit-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'frameit.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'FrameIt', text: '¡Mira mi creación!', files: [file] });
      } else {
        alert('Copia el link o descarga la imagen.');
      }
    } catch (err) { console.error(err); }
  };

  const addTextLayer = () => {
    const newId = `text-${Date.now()}`;
    const newState = {
      ...editorState,
      textLayers: [...editorState.textLayers, { id: newId, type: 'text', text: 'Nuevo Texto', x: 0, y: 0, zoom: 1, rotation: 0, flip: 1, fontFamily: 'Inter', color: '#ffffff', effect: 'shadow' as const }]
    };
    setEditorState(newState);
    setActiveLayer(newId);
    saveToHistory(newState);
    setExpandedSections(prev => ({ ...prev, adjust: true }));
  };

  const addStickerLayer = (emoji: string) => {
    const newId = `sticker-${Date.now()}`;
    const newState = {
      ...editorState,
      stickerLayers: [...editorState.stickerLayers, { id: newId, type: 'sticker', emoji, x: 0, y: 0, zoom: 1, rotation: 0, flip: 1 }]
    };
    setEditorState(newState);
    setActiveLayer(newId);
    saveToHistory(newState);
  };

  const removeLayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditorState(prev => {
      const next = {
        ...prev,
        textLayers: prev.textLayers.filter(t => t.id !== id),
        stickerLayers: prev.stickerLayers.filter(s => s.id !== id)
      };
      saveToHistory(next);
      return next;
    });
    if (activeLayer === id) setActiveLayer('photo');
  };

  const clearAll = () => {
    if (confirm('¿Estás seguro de que deseas borrar todo?')) {
      const newState: EditorState = {
        photoState: { ...INITIAL_LAYER_STATE },
        frameState: { ...INITIAL_LAYER_STATE },
        textLayers: [],
        stickerLayers: [],
        aspectRatio: '1:1'
      };
      setEditorState(newState);
      saveToHistory(newState);
      localStorage.removeItem('frameit_editor_state');
    }
  };

  const getActiveLayerState = () => {
    if (activeLayer === 'photo') return editorState.photoState;
    if (activeLayer === 'frame') return editorState.frameState;
    return editorState.textLayers.find(t => t.id === activeLayer) || editorState.stickerLayers.find(s => s.id === activeLayer) || INITIAL_LAYER_STATE;
  };

  const setActiveLayerState = (updater: (prev: any) => any) => {
    setEditorState(prev => {
      let next = { ...prev };
      if (activeLayer === 'photo') next.photoState = updater(prev.photoState);
      else if (activeLayer === 'frame') next.frameState = updater(prev.frameState);
      else if (activeLayer.startsWith('text-')) next.textLayers = prev.textLayers.map(t => t.id === activeLayer ? updater(t) : t);
      else if (activeLayer.startsWith('sticker-')) next.stickerLayers = prev.stickerLayers.map(s => s.id === activeLayer ? updater(s) : s);
      scheduleHistorySave(next);
      return next;
    });
  };

  const activeState = getActiveLayerState() as any;
  const canvasWidth = editorState.aspectRatio === '1:1' ? 1080 : 1080;
  const canvasHeight = editorState.aspectRatio === '1:1' ? 1080 : 1920;

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mx-auto">
      <div className="flex-1 flex flex-col items-center">
        {/* Undo/Redo & Presets Toolbar */}
        <div className="w-full max-w-[500px] mb-4 flex justify-between items-center px-1">
          <div className="flex gap-2">
            <button 
              onClick={undo} 
              disabled={historyIndex <= 0}
              className="p-2 bg-stone-800 rounded-lg text-stone-300 disabled:opacity-30 hover:bg-stone-700 transition-colors"
              title="Deshacer"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button 
              onClick={redo} 
              disabled={historyIndex >= history.length - 1}
              className="p-2 bg-stone-800 rounded-lg text-stone-300 disabled:opacity-30 hover:bg-stone-700 transition-colors"
              title="Rehacer"
            >
              <Redo2 className="w-5 h-5" />
            </button>
            <button 
              onClick={clearAll} 
              className="p-2 bg-stone-800 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
              title="Limpiar Todo"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex bg-stone-800 rounded-lg p-1 gap-1">
            <button 
              onClick={() => setEditorState(prev => { const n = { ...prev, aspectRatio: '1:1' as const }; saveToHistory(n); return n; })}
              className={cn("p-1.5 rounded-md transition-all", editorState.aspectRatio === '1:1' ? "bg-stone-700 text-emerald-400 shadow-sm" : "text-stone-500 hover:text-stone-300")}
              title="Cuadrado (Post)"
            >
              <Square className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setEditorState(prev => { const n = { ...prev, aspectRatio: '9:16' as const }; saveToHistory(n); return n; })}
              className={cn("p-1.5 rounded-md transition-all", editorState.aspectRatio === '9:16' ? "bg-stone-700 text-emerald-400 shadow-sm" : "text-stone-500 hover:text-stone-300")}
              title="Vertical (Story)"
            >
              <Smartphone className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div 
          ref={containerRef}
          className={cn(
            "relative w-full max-w-[500px] bg-stone-900 rounded-xl overflow-hidden shadow-2xl border border-stone-800 cursor-move touch-none",
            editorState.aspectRatio === '1:1' ? "aspect-square" : "aspect-[9/16]"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="w-full h-full object-contain pointer-events-none"
          />
          {isProcessingErase && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center flex-col gap-3">
              <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
              <span className="text-white text-sm font-medium">Borrando con IA...</span>
            </div>
          )}
          {!photoSrc && !frameSrc && <div className="absolute inset-0 flex items-center justify-center text-stone-500 pointer-events-none">Sube una foto para comenzar</div>}
        </div>

        {activeLayer === 'frame' && frameSrc && (
          <div className="mt-4 flex gap-2 justify-center w-full max-w-[500px]">
            <button
              onClick={() => setEraseMode(eraseMode === 'manual' ? 'none' : 'manual')}
              className={cn("flex-1 py-2 px-3 flex items-center justify-center gap-2 rounded-lg transition-colors text-sm font-medium border", eraseMode === 'manual' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500" : "bg-stone-800 text-stone-300 border-stone-700")}
            >
              <Eraser className="w-4 h-4" /> Borrador Manual
            </button>
            <button
              onClick={() => setEraseMode(eraseMode === 'magic' ? 'none' : 'magic')}
              className={cn("flex-1 py-2 px-3 flex items-center justify-center gap-2 rounded-lg transition-colors text-sm font-medium border", eraseMode === 'magic' ? "bg-blue-500/20 text-blue-400 border-blue-500" : "bg-stone-800 text-stone-300 border-stone-700")}
            >
              <Wand2 className="w-4 h-4" /> Borrador Mágico
            </button>
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 flex flex-col gap-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* Layers Section */}
        <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden text-left shadow-lg">
          <button onClick={() => toggleSection('layers')} className="w-full p-4 flex items-center justify-between hover:bg-stone-700/50 transition-colors">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" /> Capas
            </h3>
            {expandedSections.layers ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
          </button>
          {expandedSections.layers && (
            <div className="px-4 pb-5 flex flex-col gap-2 border-t border-stone-700/50 pt-4">
              {editorState.textLayers.map((t, index) => (
                <div key={t.id} className="flex bg-stone-900 rounded-lg p-1">
                  <button onClick={() => setActiveLayer(t.id)} className={cn("flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors flex items-center justify-between", activeLayer === t.id ? "bg-stone-700 text-white ring-1 ring-emerald-500/30" : "text-stone-400 hover:text-stone-200")}>
                    <span className="truncate max-w-[150px]"><Type className="w-4 h-4 inline-block mr-2 opacity-50" /> {t.text || `Texto ${index + 1}`}</span>
                    <X className="w-4 h-4 opacity-50 hover:text-red-400" onClick={(e) => removeLayer(t.id, e)} />
                  </button>
                </div>
              ))}
              {editorState.stickerLayers.map((s) => (
                <div key={s.id} className="flex bg-stone-900 rounded-lg p-1">
                  <button onClick={() => setActiveLayer(s.id)} className={cn("flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors flex items-center justify-between", activeLayer === s.id ? "bg-stone-700 text-white ring-1 ring-emerald-500/30" : "text-stone-400 hover:text-stone-200")}>
                    <span><StickerIcon className="w-4 h-4 inline-block mr-2 opacity-50" /> Sticker {s.emoji}</span>
                    <X className="w-4 h-4 opacity-50 hover:text-red-400" onClick={(e) => removeLayer(s.id, e)} />
                  </button>
                </div>
              ))}
              <div className="flex bg-stone-900 rounded-lg p-1">
                <button onClick={() => setActiveLayer('frame')} className={cn("flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors flex items-center", activeLayer === 'frame' ? "bg-stone-700 text-white ring-1 ring-emerald-500/30" : "text-stone-400 hover:text-stone-200")}>
                  <Square className="w-4 h-4 mr-2 opacity-50" /> Capa Marco
                </button>
              </div>
              <div className="flex bg-stone-900 rounded-lg p-1">
                <button onClick={() => setActiveLayer('photo')} className={cn("flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors flex items-center", activeLayer === 'photo' ? "bg-stone-700 text-white ring-1 ring-emerald-500/30" : "text-stone-400 hover:text-stone-200")}>
                  <ImageIcon className="w-4 h-4 mr-2 opacity-50" /> Capa Foto Base
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stickers Section */}
        <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden text-left shadow-lg">
          <button onClick={() => toggleSection('stickers')} className="w-full p-4 flex items-center justify-between hover:bg-stone-700/50 transition-colors">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              <StickerIcon className="w-5 h-5 text-amber-400" /> Stickers
            </h3>
            {expandedSections.stickers ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
          </button>
          {expandedSections.stickers && (
            <div className="px-4 pb-5 space-y-4 border-t border-stone-700/50 pt-4">
              {photoAnalysis && (
                <div className="space-y-2">
                  <span className="text-stone-400 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Sugeridos por IA
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const suggestions: string[] = [];
                      const text = photoAnalysis.toLowerCase();
                      if (text.includes('corriendo') || text.includes('runner') || text.includes('corredor')) suggestions.push('🏃', '👟', '🏁');
                      if (text.includes('montaña') || text.includes('mountain') || text.includes('cerro')) suggestions.push('⛰️', '🧗');
                      if (text.includes('bosque') || text.includes('selva') || text.includes('árbol')) suggestions.push('🌲', '🐆', '🐒');
                      if (text.includes('barro') || text.includes('sucio')) suggestions.push('💩', '💦');
                      if (text.includes('feliz') || text.includes('sonrisa') || text.includes('emoción')) suggestions.push('😊', '✨', '🙌');
                      if (text.includes('calor') || text.includes('sol')) suggestions.push('☀️', '🔥', '💧');
                      
                      return suggestions.length > 0 ? (
                        suggestions.map(emoji => (
                          <button key={`ai-${emoji}`} onClick={() => addStickerLayer(emoji)} className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xl flex items-center justify-center hover:bg-blue-500/20 transition-colors">
                            {emoji}
                          </button>
                        ))
                      ) : <span className="text-stone-500 text-[10px]">Analiza tu foto para ver sugerencias</span>;
                    })()}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-stone-400 text-[10px] uppercase tracking-wider font-bold">Biblioteca</span>
                <div className="grid grid-cols-5 gap-2">
                  {STICKER_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => addStickerLayer(emoji)} className="aspect-square bg-stone-900 rounded-lg text-2xl flex items-center justify-center hover:bg-stone-700 transition-colors shadow-sm">
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={addTextLayer}
                className="w-full mt-2 py-3 flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-700 border border-stone-700 border-dashed text-white rounded-lg transition-all text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" /> Añadir Texto
              </button>
            </div>
          )}
        </div>

        {/* Filters Section */}
        {(activeLayer === 'photo' || activeLayer === 'frame') && (
          <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden text-left shadow-lg">
            <button onClick={() => toggleSection('filters')} className="w-full p-4 flex items-center justify-between hover:bg-stone-700/50 transition-colors">
              <h3 className="text-base font-medium text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" /> Filtros e IA
              </h3>
              {expandedSections.filters ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
            </button>
            {expandedSections.filters && (
              <div className="px-4 pb-5 space-y-4 border-t border-stone-700/50 pt-4">
                <div className="space-y-2">
                  <span className="text-stone-400 text-[10px] uppercase tracking-wider font-bold">Presets</span>
                  <div className="grid grid-cols-3 gap-2">
                    {FILTER_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setActiveLayerState(prev => ({ ...prev, ...preset }))}
                        className="py-1.5 px-2 bg-stone-900 hover:bg-stone-700 border border-stone-700 rounded-lg text-[10px] text-stone-300 transition-all font-medium"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-stone-700/30">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-stone-400 flex items-center gap-1"><Sun className="w-3.5 h-3.5"/> Brillo</span><span className="text-stone-300">{activeState.brightness}%</span></div>
                    <input type="range" min="0" max="200" value={activeState.brightness} onChange={(e) => setActiveLayerState(prev => ({ ...prev, brightness: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-1.5" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-stone-400 flex items-center gap-1"><Contrast className="w-3.5 h-3.5"/> Contraste</span><span className="text-stone-300">{activeState.contrast}%</span></div>
                    <input type="range" min="0" max="200" value={activeState.contrast} onChange={(e) => setActiveLayerState(prev => ({ ...prev, contrast: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-1.5" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-stone-400 flex items-center gap-1"><Droplets className="w-3.5 h-3.5"/> Saturación</span><span className="text-stone-300">{activeState.saturation}%</span></div>
                    <input type="range" min="0" max="200" value={activeState.saturation} onChange={(e) => setActiveLayerState(prev => ({ ...prev, saturation: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-1.5" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Adjustments Section */}
        <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden text-left shadow-lg">
          <button onClick={() => toggleSection('adjust')} className="w-full p-4 flex items-center justify-between hover:bg-stone-700/50 transition-colors">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              <Move className="w-5 h-5 text-emerald-400" /> Ajustes Capa
            </h3>
            {expandedSections.adjust ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
          </button>
          {expandedSections.adjust && (
            <div className="px-4 pb-5 space-y-4 border-t border-stone-700/50 pt-4">
              {activeLayer.startsWith('text-') && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-stone-400 text-xs text-left block font-medium">Contenido</span>
                    <input type="text" value={activeState.text} onChange={(e) => setActiveLayerState(prev => ({ ...prev, text: e.target.value }))} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-stone-400 text-xs text-left block font-medium">Tipografía</span>
                    <div className="grid grid-cols-2 gap-2">
                      {FONT_OPTIONS.map(font => (
                        <button 
                          key={font.name}
                          onClick={() => setActiveLayerState(prev => ({ ...prev, fontFamily: font.family }))}
                          className={cn(
                            "py-1.5 px-2 rounded-md border text-[10px] transition-all",
                            activeState.fontFamily === font.family ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500"
                          )}
                          style={{ fontFamily: font.family }}
                        >
                          {font.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-stone-400 text-xs text-left block font-medium">Color</span>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(color => (
                        <button 
                          key={color}
                          onClick={() => setActiveLayerState(prev => ({ ...prev, color }))}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all transform hover:scale-110",
                            activeState.color === color ? "border-emerald-500 scale-110" : "border-stone-700"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-stone-400 text-xs text-left block font-medium">Efecto</span>
                    <div className="flex gap-2">
                      {(['none', 'shadow', 'outline'] as const).map(effect => (
                        <button 
                          key={effect}
                          onClick={() => setActiveLayerState(prev => ({ ...prev, effect }))}
                          className={cn(
                            "flex-1 py-1 px-2 rounded-md border text-[10px] capitalize transition-all",
                            activeState.effect === effect ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500"
                          )}
                        >
                          {effect === 'none' ? 'Sin efecto' : effect === 'shadow' ? 'Sombra' : 'Borde'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium"><span className="text-stone-400 flex items-center gap-1"><ZoomIn className="w-3.5 h-3.5"/> Zoom</span><span className="text-stone-300">{activeState.zoom?.toFixed(2)}x</span></div>
                <input type="range" min="0.1" max="5" step="0.01" value={activeState.zoom} onChange={(e) => setActiveLayerState(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))} className="w-full accent-emerald-500 h-1" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium"><span className="text-stone-400 flex items-center gap-1"><RotateCw className="w-3.5 h-3.5"/> Rotación</span><span className="text-stone-300">{activeState.rotation}°</span></div>
                <input type="range" min="-180" max="180" value={activeState.rotation} onChange={(e) => setActiveLayerState(prev => ({ ...prev, rotation: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setActiveLayerState(prev => ({ ...prev, flip: prev.flip * -1 }))} className="flex-1 py-2.5 bg-stone-700 hover:bg-stone-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2">
                  <FlipHorizontal className="w-3.5 h-3.5" /> Reflejar
                </button>
                <button onClick={() => removeLayer(activeLayer, { stopPropagation: () => {} } as any)} className="py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors border border-red-500/20">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-auto">
          <button onClick={handleDownload} disabled={!photoSrc && !frameSrc} className="flex-1 py-3 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium text-sm shadow-xl shadow-emerald-500/10">
            <Download className="w-4 h-4" /> Guardar
          </button>
          <button onClick={handleShare} disabled={!photoSrc && !frameSrc} className="flex-1 py-3 flex items-center justify-center gap-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium border border-stone-600 text-sm">
            <Share2 className="w-4 h-4" /> Compartir
          </button>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>
    </div>
  );
}
