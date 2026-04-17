import React, { useState, useEffect } from 'react';

export function ApiKeyGuard({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    checkKey();
  }, []);

  const checkKey = async () => {
    // @ts-expect-error aistudio is injected environment variable
    if (typeof window !== 'undefined' && window.aistudio?.hasSelectedApiKey) {
      try {
        // @ts-expect-error aistudio is injected environment variable
        const isSelected = await window.aistudio.hasSelectedApiKey();
        setHasKey(isSelected);
      } catch (e) {
        setHasKey(false);
      }
    } else {
      // If we are not in the AI Studio environment, assume true and let standard environment vars take over
      setHasKey(true);
    }
  };

  const selectKey = async () => {
    try {
      // @ts-expect-error aistudio is injected environment variable
      if (window.aistudio?.openSelectKey) {
        // @ts-expect-error aistudio is injected environment variable
        await window.aistudio.openSelectKey();
        // Assume key selection was successful after triggering to avoid race condition
        setHasKey(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (hasKey === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-900 text-stone-400">
        Verificando credenciales...
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-white p-8 text-center space-y-6">
        <div className="max-w-lg space-y-6 bg-stone-800 p-8 rounded-2xl border border-stone-700">
          <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
            <span className="text-blue-400">✧</span> Configuración Requerida
          </h2>
          <p className="text-stone-300">
            Esta aplicación utiliza modelos avanzados de Google (<strong>Gemini 3 Pro Image Preview</strong> y <strong>Veo Video Generation</strong>) que requieren el uso de tu propia clave API con un proyecto de facturación de Google Cloud.
          </p>
          <p className="text-stone-400 text-sm bg-stone-900 p-4 rounded-xl">
            Para obtener más información sobre la configuración de facturación, consulta la{' '}
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">
              documentación oficial
            </a>.
          </p>
          <button
            onClick={selectKey}
            className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20"
          >
            Seleccionar API Key
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
