import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Image as ImageIcon, Sparkles, Video, Camera, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CanvasEditor } from './CanvasEditor';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export function UserApp() {
  const [searchParams] = useSearchParams();
  const { user, signIn } = useAuth();
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isPhotoCardOpen, setIsPhotoCardOpen] = useState(true);
  const [isFrameCardOpen, setIsFrameCardOpen] = useState(true);

  useEffect(() => {
    const frameId = searchParams.get('frame');
    if (frameId) {
      if (!user) {
        // Need user to be logged in before fetching
        return;
      }
      const fetchFrame = async () => {
        try {
          const docRef = doc(db, 'shared_frames', frameId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setFrameSrc(docSnap.data().imageData);
            setIsFrameCardOpen(false);
            setIsPhotoCardOpen(true);
          } else {
            console.warn("Shared frame not found");
          }
        } catch (err) {
          console.error(err);
          // If permission is denied because we required auth in the rules, we may need to tell them to login.
          handleFirestoreError(err, OperationType.GET, `shared_frames/${frameId}`);
        }
      };
      fetchFrame();
    } else {
      const sharedFrame = sessionStorage.getItem('wtt_shared_frame');
      if (sharedFrame) {
        setFrameSrc(sharedFrame);
        sessionStorage.removeItem('wtt_shared_frame');
      }
    }
  }, [searchParams, user]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoSrc(event.target?.result as string);
        setAnalysis(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFrameSrc(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzePhoto = async () => {
    if (!photoSrc) return;
    setIsAnalyzing(true);
    try {
      const base64Data = photoSrc.split(',')[1];
      const mimeType = photoSrc.split(';')[0].split(':')[1];

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyzePhoto',
          payload: { base64Data, mimeType }
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con la API');
      }

      setAnalysis(data.text);
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || String(err);
      if (errorMessage.includes('429') || errorMessage.includes('credits are depleted') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setAnalysis("Error 429: Tus créditos de prepago se han agotado. Revisa tu facturación en AI Studio o Google Cloud.");
      } else {
        setAnalysis(`Hubo un error al analizar la foto: ${errorMessage}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateVideo = async (src: string) => {
    setIsGeneratingVideo(true);
    setVideoUrl(null);
    try {
      const prompt = "A cinematic slow-motion video of a trail runner in the jungle, dynamic lighting, high quality";
      
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateVideo',
          payload: { prompt }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con la API');
      }

      setAnalysis("Generando video con Veo AI... Esto puede tardar unos minutos.");
      
      // Simulación de polling de video
      let currentOp = data.operation;
      while (!currentOp?.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        break; 
      }
      
      setAnalysis("Video generado (Simulado en esta demo por tiempo de espera).");
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || String(err);
      if (errorMessage.includes('429') || errorMessage.includes('credits are depleted') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setAnalysis("Error 429: Tus créditos de prepago se han agotado.");
      } else {
        setAnalysis(`Error al interactuar con el modelo: ${errorMessage}`);
      }
    } finally {
      setIsGeneratingVideo(false);
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
            <h1 className="text-2xl font-bold text-white">FrameIt</h1>
          </div>
          <div className="flex items-center gap-4">
            {!user && searchParams.get('frame') && (
              <button onClick={signIn} className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
                Inicia sesión para cargar el marco
              </button>
            )}
            <button 
              onClick={() => setShowHelp(true)}
              className="p-2 hover:bg-stone-800 rounded-full transition-colors text-blue-400"
            >
              <Info className="w-6 h-6" />
            </button>
          </div>
        </header>

        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
            <div className="bg-stone-800 p-6 rounded-2xl max-w-sm w-full border border-stone-700 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-white mb-2">¿Cómo usar la App?</h2>
              <ul className="text-stone-300 space-y-3 text-sm">
                <li><strong className="text-emerald-400">1. Sube tu foto</strong> o tómate una abriendo la cámara local.</li>
                <li><strong className="text-emerald-400">2. Carga un marco</strong> PNG transparente o diseña uno en el Bot de IA del menú principal.</li>
                <li><strong className="text-blue-400">3. Arrastra las capas</strong> (foto o marco) en la pantalla para posicionarlas.</li>
                <li><strong className="text-blue-400">4. Ajusta tamaño y textos</strong> desde las herramientas inferiores.</li>
              </ul>
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-4 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg transition-colors font-medium"
              >
                ¡Entendido!
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="w-full">
            <CanvasEditor 
              frameSrc={frameSrc} 
              photoSrc={photoSrc} 
              onGenerateVideo={generateVideo}
              isGeneratingVideo={isGeneratingVideo}
              showTextTools={true}
              photoAnalysis={analysis}
              onPhotoUpload={handlePhotoUpload}
              onAnalyzePhoto={analyzePhoto}
              isAnalyzing={isAnalyzing}
              mode="user"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
