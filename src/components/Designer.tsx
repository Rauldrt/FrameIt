import React, { useState } from 'react';
import { ArrowLeft, Upload, Sparkles, Image as ImageIcon, X, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CanvasEditor } from './CanvasEditor';
import { GoogleGenAI } from '@google/genai';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export function Designer() {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [referenceImages, setReferenceImages] = useState<{data: string, mimeType: string, url: string}[]>([]);
  const [isUploadCardOpen, setIsUploadCardOpen] = useState(true);
  const [isGenerateCardOpen, setIsGenerateCardOpen] = useState(true);
  const navigate = useNavigate();
  const { user, signIn } = useAuth();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFrameSrc(event.target?.result as string);
        setIsUploadCardOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const mimeType = result.split(';')[0].split(':')[1];
        const data = result.split(',')[1];
        setReferenceImages(prev => [...prev, { data, mimeType, url: result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const generateFrame = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const parts: any[] = referenceImages.map(img => ({
        inlineData: { data: img.data, mimeType: img.mimeType }
      }));
      parts.push({ text: `A decorative frame for a trail running event called "Wanda Tupi Trail". The frame MUST have a transparent center area for a photo. Style: ${prompt}` });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize
          }
        }
      });
      
      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          setFrameSrc(`data:image/png;base64,${base64EncodeString}`);
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        setError("No se pudo generar la imagen. Intenta con otro prompt.");
      } else {
        setIsGenerateCardOpen(false);
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || String(err);
      if (err?.status === 429 || errorMessage.includes('429') || errorMessage.includes('credits are depleted') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setError("Error de límite de cuota (429): Tus créditos de prueba gratuitos se han agotado o necesitas recargar saldo en tu cuenta de Google Cloud / AI Studio.");
      } else if (err?.status === 403 || errorMessage.includes('permission') || errorMessage.includes('403')) {
        setError("Error de permisos (403): Asegúrate de haber habilitado las APIs necesarias (Ej. Imagen on Vertex AI) o revisa tu clave API.");
        // We can optionally trigger the dialog again
        // @ts-expect-error aistudio environment variable
        window.aistudio?.openSelectKey?.();
      } else {
        setError(`Error al generar el marco: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSample = () => {
    if (showSample) {
      setPhotoSrc(null);
      setShowSample(false);
    } else {
      setPhotoSrc('https://images.unsplash.com/photo-1533443942004-941196158ec8?q=80&w=2070&auto=format&fit=crop');
      setShowSample(true);
    }
  };

  const handleSendToApp = async () => {
    if (!frameSrc) return;
    
    if (!user) {
      setError("Debes iniciar sesión para publicar un marco.");
      await signIn();
      return;
    }

    setIsPublishing(true);
    setError(null);
    try {
      // Create a document in Firestore
      const docRef = await addDoc(collection(db, 'shared_frames'), {
        uid: user.uid,
        imageData: frameSrc,
        createdAt: serverTimestamp()
      });
      // Redirect to the end-user app using this frame ID
      navigate(`/app?frame=${docRef.id}`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'shared_frames');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-stone-800 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-2xl font-bold text-white">Diseñador de Marcos</h1>
          </div>
        </header>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6 flex flex-col order-2 lg:order-1">
            <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden">
              <button 
                onClick={() => setIsUploadCardOpen(!isUploadCardOpen)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-stone-700/50 transition-colors"
                type="button"
              >
                <h2 className="text-base md:text-lg font-medium text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" />
                  Subir Marco
                </h2>
                {isUploadCardOpen ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
              </button>
              
              {isUploadCardOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-stone-700/50 pt-4">
                  <p className="text-sm text-stone-400">
                    Sube un archivo PNG con transparencia en el centro.
                  </p>
                  <label className="flex items-center justify-center w-full h-32 px-4 transition bg-stone-900 border-2 border-stone-700 border-dashed rounded-xl appearance-none cursor-pointer hover:border-emerald-500/50 focus:outline-none">
                    <span className="flex items-center space-x-2">
                      <Upload className="w-6 h-6 text-stone-500" />
                      <span className="font-medium text-stone-500">
                        Seleccionar archivo
                      </span>
                    </span>
                    <input type="file" name="file_upload" className="hidden" accept="image/png" onChange={handleFileUpload} />
                  </label>
                  
                  <button 
                    onClick={toggleSample}
                    className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all font-medium text-sm ${showSample ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'bg-stone-900 border border-stone-700 text-stone-400 hover:text-stone-300'}`}
                  >
                    <ImageIcon className="w-4 h-4" /> {showSample ? 'Quitar Foto Prueba' : 'Ver con Foto Prueba'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-stone-800 rounded-2xl border border-stone-700 overflow-hidden">
              <button 
                onClick={() => setIsGenerateCardOpen(!isGenerateCardOpen)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-stone-700/50 transition-colors"
                type="button"
              >
                <h2 className="text-base md:text-lg font-medium text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  Workflow IA: Generar / Editar
                </h2>
                {isGenerateCardOpen ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
              </button>
              
              {isGenerateCardOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-stone-700/50 pt-4">
                  <p className="text-sm text-stone-400">
                    Describe el estilo del marco o sube fotos de referencia para combinarlas.
                  </p>
              
              {/* Reference Images */}
              <div className="space-y-2">
                <label className="flex items-center justify-center w-full h-16 px-4 transition bg-stone-900 border border-stone-700 border-dashed rounded-xl appearance-none cursor-pointer hover:border-blue-500/50 focus:outline-none">
                  <span className="flex items-center space-x-2 text-sm">
                    <ImageIcon className="w-4 h-4 text-stone-500" />
                    <span className="font-medium text-stone-500">Subir fotos de referencia</span>
                  </span>
                  <input type="file" multiple className="hidden" accept="image/*" onChange={handleReferenceUpload} />
                </label>
                
                {referenceImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-stone-700">
                        <img src={img.url} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => removeReferenceImage(idx)}
                          className="absolute top-1 right-1 p-0.5 bg-black/50 hover:bg-red-500 rounded-full text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resolution Selector */}
              <div className="flex gap-2">
                {(['1K', '2K', '4K'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setImageSize(size)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      imageSize === size 
                        ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                        : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-600'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Combina estas fotos en un marco estilo selva misionera..."
                className="w-full h-24 p-3 bg-stone-900 border border-stone-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button
                onClick={generateFrame}
                disabled={isGenerating || !prompt}
                className="w-full py-2.5 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
              >
                {isGenerating ? 'Generando...' : 'Generar Marco'}
              </button>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
            )}
          </div>
          </div>

          <div className="lg:col-span-2 order-1 lg:order-2 flex flex-col gap-4">
            <CanvasEditor frameSrc={frameSrc} photoSrc={photoSrc} />
            
            {frameSrc && (
              <div className="flex justify-end">
                <button
                  onClick={handleSendToApp}
                  disabled={isPublishing}
                  className="py-3 px-6 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-5 h-5" />
                  {isPublishing ? 'Publicando...' : 'Obtener link para compartir'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
