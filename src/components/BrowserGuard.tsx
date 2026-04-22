import React, { useState, useEffect } from 'react';
import { Smartphone, ExternalLink, Chrome, Compass } from 'lucide-react';

export function BrowserGuard({ children }: { children: React.ReactNode }) {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isInstagram = ua.indexOf('Instagram') > -1;
    const isFacebook = ua.indexOf('FBAN') > -1 || ua.indexOf('FBAV') > -1;
    const isWhatsApp = ua.indexOf('WhatsApp') > -1;
    
    if (isInstagram || isFacebook || isWhatsApp) {
      setIsInAppBrowser(true);
    }
  }, []);

  const handleOpenBrowser = () => {
    const url = window.location.href;
    if (/Android/i.test(navigator.userAgent)) {
      // Intent trick for Android
      const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
      window.location.href = intentUrl;
    } else {
      // Instruction for iOS
      alert('Para una mejor experiencia, pulsa los tres puntos (...) y elige "Abrir en Safari" o "Abrir en el navegador".');
    }
  };

  if (!isInAppBrowser || isDismissed) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-950 p-6 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-md bg-stone-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center text-center gap-8 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="relative">
          <div className="w-24 h-24 bg-gradient-to-tr from-emerald-500 to-blue-500 rounded-3xl flex items-center justify-center shadow-2xl animate-bounce-slow">
            <Smartphone className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center border-4 border-stone-950">
            <span className="text-white text-xs font-black">!</span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
            Navegador <span className="text-emerald-400">Limitado</span> Detectado
          </h2>
          <p className="text-stone-400 text-base leading-relaxed">
            Estás usando el navegador interno de <span className="text-white font-bold">Instagram/Facebook</span>. Para poder guardar y compartir tus fotos correctamente, necesitamos abrir la app en tu navegador principal.
          </p>
        </div>

        <div className="w-full flex flex-col gap-4">
          <button 
            onClick={handleOpenBrowser}
            className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-lg shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95"
          >
            <Chrome className="w-6 h-6" /> ABRIR EN CHROME / SAFARI
          </button>
          
          <button 
            onClick={() => setIsDismissed(true)}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-stone-400 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            Continuar de todos modos <ExternalLink className="w-4 h-4 opacity-50" />
          </button>
        </div>

        <div className="flex items-center gap-6 pt-4 opacity-40">
           <Chrome className="w-6 h-6 text-white" />
           <Compass className="w-6 h-6 text-white" />
           <div className="w-px h-6 bg-white/20" />
           <p className="text-[10px] font-bold tracking-widest text-white uppercase">Mejor experiencia</p>
        </div>
      </div>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(-10%) rotate(0deg); }
          50% { transform: translateY(0) rotate(2deg); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
