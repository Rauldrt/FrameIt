import React from 'react';

export function ApiKeyGuard({ children }: { children: React.ReactNode }) {
  // Ahora la clave de la API se maneja desde el backend de Vercel (api/gemini.ts),
  // por lo que el frontend ya no debe requerir que el usuario ponga una clave en el entorno local
  // o en AI Studio. Permitimos que siempre renderice la app.
  return <>{children}</>;
}
