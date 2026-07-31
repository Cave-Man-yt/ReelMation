import React from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer 
      className="w-full bg-[var(--nm-bg)] text-[var(--nm-text-muted)] py-10 px-4 sm:px-6 lg:px-8 font-mono text-xs"
      style={{boxShadow: 'var(--nm-raised-sm)'}}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div 
            className="w-6 h-6 rounded-full bg-[var(--nm-bg)] flex items-center justify-center"
            style={{boxShadow: 'var(--nm-raised-sm)'}}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--nm-accent)]" />
          </div>
          <span className="font-bold text-[var(--nm-text-heading)] tracking-wider">REELMATION</span>
          <span className="text-[10px] text-[var(--nm-text-muted)]">• Educational Short-Form Generation</span>
        </div>

        <div className="flex items-center space-x-6 text-[11px] text-[var(--nm-text-muted)]">
          <span className="flex items-center gap-1 text-[var(--nm-accent)]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Powered by Gemini AI · ComfyUI · Edge-TTS · Remotion
          </span>
          <span>© 2026 Reelmation</span>
        </div>
      </div>
    </footer>
  );
};
