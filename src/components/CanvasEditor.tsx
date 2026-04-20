import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Download, Share2, Move, ZoomIn, RotateCw, FlipHorizontal, Layers, 
  Type, Palette, Plus, X, Eraser, Wand2, ChevronDown, ChevronUp, 
  Undo2, Redo2, Sliders, Smartphone, Square, Sticker as StickerIcon,
  Sun, Contrast, Droplets, Image as ImageIcon, Trash2, RotateCcw,
  Sparkles, Upload, Camera
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
  onFrameModified?: (dataUrl: string) => void;
  onPhotoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAnalyzePhoto?: () => void;
  isAnalyzing?: boolean;
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
  photoAnalysis = null,
  onFrameModified,
  onPhotoUpload,
  onAnalyzePhoto,
  isAnalyzing = false
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

  // Save to local storage on change and notify parent of frame modifications
  useEffect(() => {
    localStorage.setItem('frameit_editor_state', JSON.stringify(editorState));
    if (onFrameModified && editorState.frameCanvasData) {
      onFrameModified(editorState.frameCanvasData);
    }
  }, [editorState, onFrameModified]);

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
  const [initialPinch, setInitialPinch] = useState<{dist: number, angle: number, zoom: number, rotation: number} | null>(null);
  const [activeTab, setActiveTab] = useState<'none' | 'layers' | 'stickers' | 'filters' | 'adjust'>('none');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

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

  const isPointInLayer = (px: number, py: number, state: any, width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    let lx = px - (canvas.width / 2 + state.x);
    let ly = py - (canvas.height / 2 + state.y);
    const angle = -(state.rotation * Math.PI) / 180;
    const rx = lx * Math.cos(angle) - ly * Math.sin(angle);
    const ry = lx * Math.sin(angle) + ly * Math.cos(angle);
    const sx = rx / (state.flip * state.zoom);
    const sy = ry / state.zoom;
    return sx >= -width / 2 && sx <= width / 2 && sy >= -height / 2 && sy <= height / 2;
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const point = getEventPoint(e);
    if (eraseMode !== 'none') {
      setIsDragging(true);
      handleEraseAction(point);
      return;
    }

    // Hit test to select elements (Texts & Stickers)
    if (!('touches' in e) || e.touches.length === 1) {
      let selectedLayer: string | null = null;
      for (let i = editorState.textLayers.length - 1; i >= 0; i--) {
        if (isPointInLayer(point.x, point.y, editorState.textLayers[i], 400, 80)) {
          selectedLayer = editorState.textLayers[i].id;
          break;
        }
      }
      if (!selectedLayer) {
        for (let i = editorState.stickerLayers.length - 1; i >= 0; i--) {
          if (isPointInLayer(point.x, point.y, editorState.stickerLayers[i], 100, 100)) {
            selectedLayer = editorState.stickerLayers[i].id;
            break;
          }
        }
      }
      if (selectedLayer) {
        if (selectedLayer !== activeLayer) {
          setActiveLayer(selectedLayer);
        }
      } else {
        if (photoSrc && activeLayer !== 'photo') {
          setActiveLayer('photo');
        } else if (!photoSrc && activeLayer !== 'frame') {
          setActiveLayer('frame');
        }
      }
    }

    setIsDragging(true);

    if ('touches' in e && e.touches.length === 2 && eraseMode === 'none') {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const currentState = activeLayer === 'photo' ? editorState.photoState :
                           activeLayer === 'frame' ? editorState.frameState :
                           activeLayer.startsWith('text-') ? editorState.textLayers.find(t => t.id === activeLayer)! :
                           activeLayer.startsWith('sticker-') ? editorState.stickerLayers.find(s => s.id === activeLayer)! :
                           INITIAL_LAYER_STATE;

      setInitialPinch({ dist, angle, zoom: currentState.zoom, rotation: currentState.rotation });
      return;
    }

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
    if ('touches' in e && e.touches.length === 2 && initialPinch) {
      const dxDist = e.touches[1].clientX - e.touches[0].clientX;
      const dyDist = e.touches[1].clientY - e.touches[0].clientY;
      const currentDist = Math.hypot(dxDist, dyDist);
      const currentAngle = Math.atan2(dyDist, dxDist) * (180 / Math.PI);

      const zoomRatio = currentDist / initialPinch.dist;
      let angleDelta = currentAngle - initialPinch.angle;

      setEditorState(prev => {
        let next = { ...prev };
        const updateTransform = (state: any) => ({
          ...state,
          zoom: initialPinch.zoom * zoomRatio,
          rotation: initialPinch.rotation + angleDelta
        });

        if (activeLayer === 'photo') next.photoState = updateTransform(prev.photoState);
        else if (activeLayer === 'frame') next.frameState = updateTransform(prev.frameState);
        else if (activeLayer.startsWith('text-')) next.textLayers = prev.textLayers.map(t => t.id === activeLayer ? updateTransform(t) : t);
        else if (activeLayer.startsWith('sticker-')) next.stickerLayers = prev.stickerLayers.map(s => s.id === activeLayer ? updateTransform(s) : s);
        return next;
      });
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
    setInitialPinch(null);
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
      const shareData = { title: 'FrameIt', text: '¡Mira mi creación con FrameIt!', files: [file] };

      // Navigator.canShare es undefined en viejas versiones, no dependemos estrictamente de él.
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        alert('Tu navegador/dispositivo no soporta compartir imágenes de forma nativa. La imagen se descargará automáticamente para que puedas compartirla donde quieras.');
        handleDownload(); // Fallback a descarga
      }
    } catch (err: any) { 
      console.error('Error al compartir:', err); 
      if (err.name !== 'AbortError') {
        alert('Hubo un error al intentar compartir la imagen. Procedemos a descargarla.');
        handleDownload();
      }
    }
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

  const getQuickActionStyle = (): React.CSSProperties | undefined => {
    if (!activeLayer || activeLayer === 'frame') return undefined; // allow 'photo' and others
    const state = activeLayer === 'photo' ? editorState.photoState : (editorState.textLayers.find(t => t.id === activeLayer) || editorState.stickerLayers.find(s => s.id === activeLayer));
    if (!state || !canvasRef.current || !containerRef.current) return undefined;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const cWidth = canvasWidth;
    const cHeight = canvasHeight;
    const scale = Math.min(containerRect.width / cWidth, containerRect.height / cHeight);
    
    const offsetX = (containerRect.width - (cWidth * scale)) / 2;
    const offsetY = (containerRect.height - (cHeight * scale)) / 2;
    
    const centerX = offsetX + (cWidth / 2 + state.x) * scale;
    const height = activeLayer === 'photo' ? 400 * state.zoom : activeLayer.startsWith('text-') ? 80 * state.zoom : 100 * state.zoom;
    const topY = offsetY + (cHeight / 2 + state.y) * scale - (height / 2 * scale) - 60;
    
    return {
      top: `${Math.max(20, topY)}px`, 
      left: `${centerX}px`,
      transform: 'translateX(-50%)' // Center horizontally on the coordinate
    };
  };

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
            "relative w-full max-w-[500px] bg-stone-900 rounded-[2rem] overflow-hidden shadow-2xl border border-stone-800 cursor-move touch-none",
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
          {/* Quick Actions Hover Toolbar */}
          {!isDragging && activeTab === 'none' && (activeLayer === 'photo' || activeLayer.startsWith('text-') || activeLayer.startsWith('sticker-')) && (
            <div 
              style={getQuickActionStyle()} 
              className="absolute z-40 flex items-center gap-1 bg-stone-800/95 backdrop-blur-xl border border-stone-600/50 p-1.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-200 pointer-events-auto"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onTouchStart={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); }}
            >
               <button 
                 onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab('adjust'); }} 
                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab('adjust'); }}
                 className="p-2.5 text-emerald-400 hover:text-emerald-300 hover:bg-stone-700/80 rounded-full transition-all active:scale-90 font-medium text-xs flex items-center gap-2" title="Editar">
                 <Type className="w-4 h-4" /> Editar
               </button>
               {activeLayer.startsWith('sticker-') && (
                 <button 
                   onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveLayerState(prev => ({ ...prev, flip: prev.flip * -1 })); }}
                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveLayerState(prev => ({ ...prev, flip: prev.flip * -1 })); }}
                   className="p-2.5 text-stone-300 hover:text-white hover:bg-stone-700/80 rounded-full transition-all active:scale-90" title="Reflejar">
                   <FlipHorizontal className="w-4 h-4" />
                 </button>
               )}
               <div className="w-px h-5 bg-stone-700"></div>
               <button 
                 onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); removeLayer(activeLayer, { stopPropagation: () => {} } as any); setActiveLayer('frame'); }}
                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeLayer(activeLayer, { stopPropagation: () => {} } as any); setActiveLayer('frame'); }}
                 className="p-2.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all active:scale-90" title="Eliminar">
                 <Trash2 className="w-4 h-4" />
               </button>
            </div>
          )}

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

      {/* Floating UI Editor Tools (Material Design 3 Style) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-[95vw] md:w-auto pointer-events-none">
        
        {activeTab !== 'none' && (
          <div className="w-full md:w-[380px] bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-[0_0_40px_rgba(52,211,153,0.15)] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto">
            <div className="flex justify-between items-center mb-4 border-b border-stone-800 pb-3">
              <h3 className="text-white font-medium capitalize flex items-center gap-2">
                {activeTab === 'layers' && <><Layers className="w-5 h-5 text-emerald-400" /> Capas</>}
                {activeTab === 'stickers' && <><StickerIcon className="w-5 h-5 text-amber-400" /> Stickers</>}
                {activeTab === 'filters' && <><Sliders className="w-5 h-5 text-blue-400" /> Filtros</>}
                {activeTab === 'adjust' && <><Move className="w-5 h-5 text-purple-400" /> Ajustes</>}
              </h3>
              <button onClick={() => setActiveTab('none')} className="text-stone-400 hover:text-white transition-colors bg-stone-800 p-1.5 rounded-full"><X className="w-4 h-4"/></button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {activeTab === 'layers' && (
                <div className="flex flex-col gap-2">
                  {editorState.textLayers.map((t, index) => (
                    <div key={t.id} className="flex bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                      <button onClick={() => setActiveLayer(t.id)} className={cn("flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-between", activeLayer === t.id ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:text-stone-200")}>
                        <span className="truncate max-w-[150px]"><Type className="w-4 h-4 inline-block mr-2 opacity-50" /> {t.text || `Texto ${index + 1}`}</span>
                        <X className="w-4 h-4 hover:text-red-400" onClick={(e) => removeLayer(t.id, e)} />
                      </button>
                    </div>
                  ))}
                  {editorState.stickerLayers.map((s) => (
                    <div key={s.id} className="flex bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                      <button onClick={() => setActiveLayer(s.id)} className={cn("flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-between", activeLayer === s.id ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:text-stone-200")}>
                        <span><StickerIcon className="w-4 h-4 inline-block mr-2 opacity-50" /> Sticker {s.emoji}</span>
                        <X className="w-4 h-4 hover:text-red-400" onClick={(e) => removeLayer(s.id, e)} />
                      </button>
                    </div>
                  ))}
                  <div className="flex bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                    <button onClick={() => setActiveLayer('frame')} className={cn("flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center", activeLayer === 'frame' ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:text-stone-200")}>
                      <Square className="w-4 h-4 mr-2 opacity-50" /> Capa Marco
                    </button>
                  </div>
                  <div className="flex bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                    <button onClick={() => setActiveLayer('photo')} className={cn("flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center", activeLayer === 'photo' ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:text-stone-200")}>
                      <ImageIcon className="w-4 h-4 mr-2 opacity-50" /> Capa Foto Base
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'stickers' && (
                <div className="space-y-6">
                  {photoAnalysis && (
                    <div className="space-y-3">
                      <span className="text-stone-400 text-xs uppercase tracking-wider font-bold flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-amber-400" /> Sugeridos por IA
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const suggestions: string[] = [];
                          const text = photoAnalysis.toLowerCase();
                          if (text.includes('corriendo') || text.includes('runner')) suggestions.push('🏃', '👟', '🏁');
                          if (text.includes('montaña') || text.includes('mountain')) suggestions.push('⛰️', '🧗');
                          if (text.includes('bosque') || text.includes('selva')) suggestions.push('🌲', '🐆', '🐒');
                          if (text.includes('barro') || text.includes('sucio')) suggestions.push('💩', '💦');
                          if (text.includes('feliz') || text.includes('sonrisa')) suggestions.push('😊', '✨', '🙌');
                          if (text.includes('calor') || text.includes('sol')) suggestions.push('☀️', '🔥', '💧');
                          return suggestions.length > 0 ? (
                            suggestions.map(emoji => (
                              <button key={`ai-${emoji}`} onClick={() => addStickerLayer(emoji)} className="w-12 h-12 bg-blue-500/10 border border-blue-500/30 rounded-xl text-2xl flex items-center justify-center hover:bg-blue-500/20 transition-transform hover:scale-110">
                                {emoji}
                              </button>
                            ))
                          ) : <span className="text-stone-500 text-xs">Analiza tu foto para sugerencias</span>;
                        })()}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <span className="text-stone-400 text-xs uppercase tracking-wider font-bold">Biblioteca</span>
                    <div className="grid grid-cols-5 gap-3">
                      {STICKER_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={() => addStickerLayer(emoji)} className="aspect-square bg-stone-800 rounded-xl text-3xl flex items-center justify-center hover:bg-stone-700 transition-transform shadow-sm hover:scale-110">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'filters' && (activeLayer === 'photo' || activeLayer === 'frame') && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <span className="text-stone-400 text-xs uppercase tracking-wider font-bold">Presets Rápidos</span>
                    <div className="grid grid-cols-3 gap-2">
                      {FILTER_PRESETS.map(preset => (
                        <button key={preset.name} onClick={() => setActiveLayerState(prev => ({ ...prev, ...preset }))} className="py-2 px-2 bg-stone-800 hover:bg-stone-700 border border-stone-700/50 rounded-xl text-xs text-stone-300 transition-all font-medium text-center">
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-5 pt-4 border-t border-stone-800">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium"><span className="text-emerald-400 flex items-center gap-2"><Sun className="w-4 h-4"/> Brillo</span><span className="text-stone-300">{activeState.brightness}%</span></div>
                      <input type="range" min="0" max="200" value={activeState.brightness} onChange={(e) => setActiveLayerState(prev => ({ ...prev, brightness: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-2 bg-stone-800 rounded-lg appearance-none" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium"><span className="text-emerald-400 flex items-center gap-2"><Contrast className="w-4 h-4"/> Contraste</span><span className="text-stone-300">{activeState.contrast}%</span></div>
                      <input type="range" min="0" max="200" value={activeState.contrast} onChange={(e) => setActiveLayerState(prev => ({ ...prev, contrast: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-2 bg-stone-800 rounded-lg appearance-none" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium"><span className="text-emerald-400 flex items-center gap-2"><Droplets className="w-4 h-4"/> Saturación</span><span className="text-stone-300">{activeState.saturation}%</span></div>
                      <input type="range" min="0" max="200" value={activeState.saturation} onChange={(e) => setActiveLayerState(prev => ({ ...prev, saturation: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-2 bg-stone-800 rounded-lg appearance-none" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'adjust' && (
                <div className="space-y-6">
                  {activeLayer.startsWith('text-') && (
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider block">Contenido</span>
                        <input type="text" value={activeState.text} onChange={(e) => setActiveLayerState(prev => ({ ...prev, text: e.target.value }))} className="w-full bg-stone-800 border-2 border-stone-700/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" />
                      </div>
                      
                      <div className="space-y-3">
                        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider block">Tipografía</span>
                        <div className="grid grid-cols-2 gap-2">
                          {FONT_OPTIONS.map(font => (
                            <button key={font.name} onClick={() => setActiveLayerState(prev => ({ ...prev, fontFamily: font.family }))} className={cn("py-2.5 px-3 rounded-xl border-2 text-xs transition-all", activeState.fontFamily === font.family ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-800 border-transparent text-stone-300 hover:border-stone-600")} style={{ fontFamily: font.family }}>
                              {font.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider block">Aparencia</span>
                        <div className="flex flex-wrap gap-3 p-3 bg-stone-800 rounded-xl">
                          {COLOR_OPTIONS.map(color => (
                            <button key={color} onClick={() => setActiveLayerState(prev => ({ ...prev, color }))} className={cn("w-8 h-8 rounded-full transition-transform transform shadow-sm", activeState.color === color ? "scale-125 ring-2 ring-emerald-500 ring-offset-2 ring-offset-stone-900" : "hover:scale-110")} style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {(['none', 'shadow', 'outline'] as const).map(effect => (
                          <button key={effect} onClick={() => setActiveLayerState(prev => ({ ...prev, effect }))} className={cn("flex-1 py-2 px-2 rounded-xl text-xs font-medium capitalize transition-all", activeState.effect === effect ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : "bg-stone-800 text-stone-400 hover:text-stone-200")}>
                            {effect === 'none' ? 'Plano' : effect === 'shadow' ? 'Sombra' : 'Borde'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-stone-500 text-center font-medium bg-stone-800/50 p-3 rounded-xl">
                    💡 Usa dos dedos sobre la imagen para hacer zoom y rotar.
                  </p>
                  <div className="flex gap-2 pt-2 border-t border-stone-800">
                    <button onClick={() => setActiveLayerState(prev => ({ ...prev, flip: prev.flip * -1 }))} className="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                      <FlipHorizontal className="w-4 h-4 text-blue-400" /> Reflejar
                    </button>
                    <button onClick={() => removeLayer(activeLayer, { stopPropagation: () => {} } as any)} className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                      <Trash2 className="w-4 h-4" /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Intermediary Actions: Save & Share */}
        {activeTab === 'none' && (
          <div className="flex gap-4 mb-4 pointer-events-auto animate-in fade-in slide-in-from-bottom-2">
             <button onClick={handleDownload} className="bg-stone-800/80 backdrop-blur-xl border border-stone-700 text-white font-medium px-6 py-3 rounded-full flex items-center gap-2 shadow-lg hover:bg-stone-700 transition-colors">
               <Download className="w-5 h-5"/> Guardar
             </button>
             <button onClick={handleShare} className="bg-emerald-500/90 backdrop-blur-xl border border-emerald-400/50 text-white font-bold px-6 py-3 rounded-full flex items-center gap-2 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:bg-emerald-400 transition-colors">
               <Share2 className="w-5 h-5"/> Compartir
             </button>
          </div>
        )}

        <div className="bg-stone-900/95 backdrop-blur-xl border border-stone-700/50 p-2.5 rounded-full flex gap-3 shadow-[0_0_25px_rgba(52,211,153,0.3)] pointer-events-auto items-center">
           <button onClick={() => setActiveTab(activeTab === 'layers' ? 'none' : 'layers')} className={cn("p-3 rounded-full transition-all", activeTab === 'layers' ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:bg-stone-800 hover:text-stone-200")}>
             <Layers className="w-5 h-5"/>
           </button>
           <button onClick={() => setActiveTab(activeTab === 'filters' ? 'none' : 'filters')} className={cn("p-3 rounded-full transition-all", activeTab === 'filters' ? "bg-stone-800 text-blue-400" : "text-stone-400 hover:bg-stone-800 hover:text-stone-200")}>
             <Sliders className="w-5 h-5"/>
           </button>
           <button onClick={() => setActiveTab(activeTab === 'adjust' ? 'none' : 'adjust')} className={cn("p-3 rounded-full transition-all", activeTab === 'adjust' ? "bg-stone-800 text-pink-400" : "text-stone-400 hover:bg-stone-800 hover:text-stone-200")}>
             <Move className="w-5 h-5"/>
           </button>
           
           {onAnalyzePhoto && photoSrc && (
             <div className="w-px h-8 bg-stone-700 mx-1 rounded-full"></div>
           )}
           {onAnalyzePhoto && photoSrc && (
              <button 
                onClick={onAnalyzePhoto} 
                disabled={isAnalyzing}
                className="p-3 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-full transition-all disabled:opacity-50"
                title="Analizar Foto con IA"
              >
                <Sparkles className={cn("w-5 h-5", isAnalyzing && "animate-spin")} />
              </button>
           )}
        </div>
      </div>

      {/* Floating Action Button (FAB) for Add Elements */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-auto">
        {isAddMenuOpen && (
          <div className="flex flex-col gap-3">
            {onPhotoUpload && (
               <>
                 <label className="fab-item-1 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer" title="Subir Foto">
                    <Upload className="w-5 h-5" />
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => { onPhotoUpload(e); setIsAddMenuOpen(false); }} />
                 </label>
                 <label className="fab-item-2 w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer" title="Tomar Foto">
                    <Camera className="w-5 h-5" />
                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => { onPhotoUpload(e); setIsAddMenuOpen(false); }} />
                 </label>
               </>
            )}
            <button onClick={() => { addTextLayer(); setIsAddMenuOpen(false); }} className="fab-item-3 w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white shadow-lg" title="Añadir Texto">
              <Type className="w-5 h-5"/>
            </button>
            <button onClick={() => { setActiveTab('stickers'); setIsAddMenuOpen(false); }} className="fab-item-4 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg" title="Añadir Sticker">
              <StickerIcon className="w-5 h-5"/>
            </button>
          </div>
        )}
        <button onClick={() => setIsAddMenuOpen(!isAddMenuOpen)} className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:scale-105 transition-all">
          <Plus className={cn("w-6 h-6 transition-transform duration-300", isAddMenuOpen && "rotate-45")} />
        </button>
      </div>
      <style>{`
        @keyframes popIn {
          0% { transform: translateY(30px) scale(0) rotate(-45deg); opacity: 0; }
          60% { transform: translateY(-10px) scale(1.1) rotate(5deg); opacity: 1; }
          100% { transform: translateY(0) scale(1) rotate(0); opacity: 1; }
        }
        @keyframes floatingOrganic {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(2px, -4px) rotate(1deg); }
          50% { transform: translate(-1px, -6px) rotate(-1deg); }
          75% { transform: translate(-2px, -3px) rotate(0.5deg); }
        }
        .fab-item-1 { animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.20s both, floatingOrganic 4s ease-in-out infinite 0.6s; }
        .fab-item-2 { animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.14s both, floatingOrganic 4.5s ease-in-out infinite 0.5s; }
        .fab-item-3 { animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s both, floatingOrganic 3.5s ease-in-out infinite 0.4s; }
        .fab-item-4 { animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0s both, floatingOrganic 5s ease-in-out infinite 0.3s; }
        
        .fab-item-1:hover, .fab-item-2:hover, .fab-item-3:hover, .fab-item-4:hover { 
          filter: brightness(1.2) drop-shadow(0 0 8px currentColor);
          transform: scale(1.15) !important; 
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 10;
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>
    </div>
  );
}
