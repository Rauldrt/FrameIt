import { Link } from 'react-router-dom';
import { Image, PenTool, Mountain } from 'lucide-react';

export function Home() {
  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full text-center space-y-8">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-emerald-500/20 rounded-full">
            <Mountain className="w-16 h-16 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white">
          Wanda Tupi Trail <span className="text-emerald-400">FrameIt Pro</span>
        </h1>
        <p className="text-xl text-stone-400 max-w-2xl mx-auto">
          Plataforma oficial para la creación y aplicación de marcos temáticos del evento Wanda Tupi Trail.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mt-12">
          <Link
            to="/designer"
            className="group relative p-8 bg-stone-800 rounded-2xl border border-stone-700 hover:border-emerald-500/50 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-stone-900 rounded-xl">
                <PenTool className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white">Diseñador de Marcos</h2>
              <p className="text-stone-400">
                Crea marcos personalizados usando Inteligencia Artificial o sube tus propios diseños PNG.
              </p>
            </div>
          </Link>

          <Link
            to="/app"
            className="group relative p-8 bg-stone-800 rounded-2xl border border-stone-700 hover:border-blue-500/50 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-stone-900 rounded-xl">
                <Image className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white">Usuario Final</h2>
              <p className="text-stone-400">
                Aplica los marcos a tus fotos, ajusta la composición y descarga para compartir en redes.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
