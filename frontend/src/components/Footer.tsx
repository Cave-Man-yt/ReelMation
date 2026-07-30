import React from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[#030712] border-t border-slate-900 text-slate-400 py-10 px-4 sm:px-6 lg:px-8 font-mono text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <span className="font-bold text-white tracking-wider">REELMATION</span>
          <span className="text-[10px] text-slate-500">• Educational Short-Form Generation</span>
        </div>

        <div className="flex items-center space-x-6 text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Powered by Gemini AI · ComfyUI · Edge-TTS · Remotion
          </span>
          <span>© 2026 Reelmation</span>
        </div>
      </div>
    </footer>
  );
};
