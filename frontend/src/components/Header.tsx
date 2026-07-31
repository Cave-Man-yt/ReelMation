import React from 'react';
import { AppView } from '../types';
import { Sparkles, Layers, Video, ArrowRight } from 'lucide-react';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate }) => {
  return (
    <header 
      className="sticky top-0 z-50 w-full bg-[var(--nm-bg)] transition-all duration-300"
      style={{boxShadow: '0 4px 14px rgba(0,0,0,0.12)'}}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Tag */}
        <div
          onClick={() => onNavigate('landing')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div 
            className="w-9 h-9 rounded-xl bg-[var(--nm-bg)] flex items-center justify-center transition-all duration-300 group-hover:scale-105"
            style={{boxShadow: 'var(--nm-raised-sm)'}}
          >
            <Sparkles className="w-4 h-4 text-[var(--nm-accent)] group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-[var(--nm-text-heading)] font-mono">
                REELMATION
              </span>
              <span 
                className="text-[10px] font-mono px-2 py-0.5 rounded-full text-[var(--nm-accent)] bg-[var(--nm-bg)]"
                style={{boxShadow: 'var(--nm-pressed-sm)'}}
              >
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-[var(--nm-text-muted)] font-sans hidden sm:block">
              Educational Short-Form AI Engine
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav 
          className="hidden md:flex items-center space-x-1 bg-[var(--nm-bg)] p-1 rounded-xl font-mono text-xs"
          style={{boxShadow: 'var(--nm-raised-sm)'}}
        >
          <button
            onClick={() => onNavigate('landing')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center space-x-2 transition-all duration-200 cursor-pointer ${
              currentView === 'landing'
                ? 'text-[var(--nm-accent)]'
                : 'text-[var(--nm-text-muted)] hover:text-[var(--nm-text)]'
            }`}
            style={currentView === 'landing' ? { boxShadow: 'var(--nm-pressed-sm)' } : undefined}
          >
            <Layers className={`w-3.5 h-3.5 ${currentView === 'landing' ? 'text-[var(--nm-accent)]' : 'text-[var(--nm-text-muted)]'}`} />
            <span>Overview</span>
          </button>

          <button
            onClick={() => onNavigate('studio')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center space-x-2 transition-all duration-200 cursor-pointer ${
              currentView === 'studio'
                ? 'text-[var(--nm-accent)]'
                : 'text-[var(--nm-text-muted)] hover:text-[var(--nm-text)]'
            }`}
            style={currentView === 'studio' ? { boxShadow: 'var(--nm-pressed-sm)' } : undefined}
          >
            <Video className={`w-3.5 h-3.5 ${currentView === 'studio' ? 'text-[var(--nm-accent)]' : 'text-[var(--nm-text-muted)]'}`} />
            <span>Studio Workspace</span>
          </button>
        </nav>

        {/* Action Button */}
        <div className="flex items-center space-x-3">
          <div 
            className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-[var(--nm-bg)] font-mono text-[11px] text-[var(--nm-text)]"
            style={{boxShadow: 'var(--nm-pressed-sm)'}}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--nm-accent-green)] nm-animate-pulse" />
            <span>PIPELINE READY</span>
          </div>

          <button
            onClick={() => onNavigate('studio')}
            className="group px-4 py-2 rounded-xl text-white text-xs font-semibold font-mono hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex items-center space-x-2"
            style={{background: 'linear-gradient(135deg, #6c3baa, #4a6cf7)', boxShadow: '4px 4px 12px rgba(108,59,170,0.35), -3px -3px 8px rgba(255,255,255,0.5)'}}
          >
            <span>NEW VIDEO</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </button>
        </div>
      </div>
    </header>
  );
};
