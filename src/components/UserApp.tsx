import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Image as ImageIcon, Sparkles, Video, Camera, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { CanvasEditor } from './CanvasEditor';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export function UserApp() {
  const [searchParams] = useSearchParams();
  const { user, signIn, loginWithEmail } = useAuth();
  
  // Estados de la Aplicación
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true); // Se muestra automáticamente al cargar
  
  // Estados de Admin Login
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(false);
  
  // UI Controles
  const [isPhotoCardOpen, setIsPhotoCardOpen] = useState(true);
  const [isFrameCardOpen, setIsFrameCardOpen] = useState(true);
  const navigate = useNavigate();

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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowAdminLogin(true)} 
              className="p-2 hover:bg-stone-800 rounded-full transition-colors"
              title="Panel de Administrador"
            >
              <ArrowLeft className="w-6 h-6 text-stone-400" />
            </button>
            <h1 className="text-xl font-bold text-white tracking-tight ml-2">FrameIt</h1>
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

        {/* Admin Login Modal */}
        {showAdminLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-stone-900 border border-stone-800 p-8 rounded-[2.5rem] max-w-sm w-full shadow-[0_0_50px_rgba(52,211,153,0.15)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-2">
                  <ArrowLeft className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Acceso Restringido</h2>
                <p className="text-stone-400 text-sm">Ingresa la contraseña de administrador para salir del modo de edición.</p>
                
                <div className="w-full space-y-3 mt-4">
                  <input 
                    type="email" 
                    placeholder="Correo Administrador" 
                    value={adminEmail}
                    onChange={(e) => { setAdminEmail(e.target.value); setLoginError(false); }}
                    className={cn(
                      "w-full bg-stone-800 border-2 rounded-2xl px-5 py-4 text-white outline-none transition-all",
                      loginError ? "border-red-500 animate-shake" : "border-stone-700 focus:border-emerald-500"
                    )}
                  />
                  <input 
                    type="password" 
                    placeholder="Contraseña" 
                    value={adminPass}
                    onChange={(e) => { setAdminPass(e.target.value); setLoginError(false); }}
                    className={cn(
                      "w-full bg-stone-800 border-2 rounded-2xl px-5 py-4 text-white outline-none transition-all",
                      loginError ? "border-red-500 animate-shake" : "border-stone-700 focus:border-emerald-500"
                    )}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        try {
                          setIsLoggingIn(true);
                          await loginWithEmail(adminEmail, adminPass);
                          navigate('/');
                        } catch (err) {
                          setLoginError(true);
                        } finally {
                          setIsLoggingIn(false);
                        }
                      }
                    }}
                  />
                  {loginError && <p className="text-red-400 text-xs font-medium">Credenciales incorrectas. Inténtalo de nuevo.</p>}
                </div>

                <div className="flex gap-3 w-full mt-2">
                  <button 
                    onClick={() => { setShowAdminLogin(false); setAdminEmail(''); setAdminPass(''); setLoginError(false); }}
                    className="flex-1 py-4 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-2xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    disabled={isLoggingIn}
                    onClick={async () => {
                      try {
                        setIsLoggingIn(true);
                        await loginWithEmail(adminEmail, adminPass);
                        navigate('/');
                      } catch (err) {
                        setLoginError(true);
                      } finally {
                        setIsLoggingIn(false);
                      }
                    }}
                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    {isLoggingIn ? 'Entrando...' : 'Entrar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
            <div className="bg-stone-800 p-6 rounded-2xl max-w-sm w-full border border-stone-700 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-white mb-2">¿Cómo usar la App?</h2>
              <ul className="text-stone-300 space-y-3 text-sm">
                <li><strong className="text-emerald-400">1. Sube tu foto</strong> o presiona el botón de cámara para tomarte una ahora mismo.</li>
                <li><strong className="text-emerald-400">2. El marco ya está listo</strong>. Tu foto aparecerá automáticamente integrada en el diseño compartido.</li>
                <li><strong className="text-blue-400">3. Ajusta tu imagen</strong> arrastrándola o usando dos dedos para cambiar su tamaño y posición.</li>
                <li><strong className="text-blue-400">4. ¡Dale tu estilo!</strong> Añade stickers sugeridos por IA o textos personalizados.</li>
                <li><strong className="text-emerald-400">5. ¡Comparte el éxito!</strong> Pulsa el botón "Compartir" para descargar tu foto o subirla directo a tus historias y redes.</li>
              </ul>
              
              <div className="pt-4 border-t border-stone-700/50">
                <p className="text-xs text-stone-400 italic">
                  * Puedes volver a ver esta guía en cualquier momento tocando el botón 
                  <span className="inline-flex items-center justify-center w-5 h-5 ml-1 bg-stone-700 rounded-full text-[10px] not-italic text-blue-400 font-bold">i</span> 
                  arriba a la derecha.
                </p>
              </div>

              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-colors font-bold shadow-lg shadow-emerald-500/20"
              >
                ¡Empezar a Crear!
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
