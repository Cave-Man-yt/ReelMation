import React, { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoGenerationInput } from '../types';
import { NeuralNetworkLoading } from './3d/NeuralNetworkLoading';
import { createPipelineParser } from '../services/logParser';
import {
  Loader2,
  Clock,
  Cpu,
  Brain,
  Zap,
  Layers,
  Activity,
  Video,
  Sparkles,
} from 'lucide-react';

interface ProcessingExperienceProps {
  input: VideoGenerationInput;
  logs: string[];
  generatedData: any;
  onComplete: () => void;
}

const PHASE_CONFIG = [
  { id: 1, label: 'Script', icon: Brain, color: '#00F0FF' },
  { id: 2, label: 'Voice', icon: Zap, color: '#38BDF8' },
  { id: 3, label: 'Images', icon: Layers, color: '#3B82F6' },
  { id: 4, label: 'Manifest', icon: Activity, color: '#8B5CF6' },
  { id: 5, label: 'Render', icon: Video, color: '#D946EF' },
];

export const ProcessingExperience: React.FC<ProcessingExperienceProps> = ({
  input,
  logs,
  generatedData,
  onComplete,
}) => {
  const parser = useMemo(() => createPipelineParser(), []);
  const eventsPanelRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  // Parse all log lines
  const pipelineState = useMemo(() => {
    for (const line of logs) {
      parser.parseLine(line);
    }
    return { ...parser.state };
  }, [logs, parser]);

  const progress = useMemo(() => parser.getProgress(), [pipelineState]);
  const isComplete = !!generatedData;

  // Elapsed timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      elapsedRef.current = secs;
      setElapsed(secs);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-scroll events panel
  useEffect(() => {
    eventsPanelRef.current?.scrollTo({
      top: eventsPanelRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [pipelineState.recentEvents]);

  // Transition to result page after completion animation
  useEffect(() => {
    if (isComplete) {
      const timeout = setTimeout(() => {
        onComplete();
      }, 3500); // 3.5s for PATHWAY SELECTED animation
      return () => clearTimeout(timeout);
    }
  }, [isComplete, onComplete]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentPhaseConfig = PHASE_CONFIG.find(p => p.id === pipelineState.currentPhase) || PHASE_CONFIG[0];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#050B16] text-slate-100 overflow-hidden">
      {/* === Full-Screen Neural Network Canvas Background === */}
      <div className="absolute inset-0 z-0">
        <NeuralNetworkLoading
          currentPhase={pipelineState.currentPhase}
          isComplete={isComplete}
          progress={progress}
        />
      </div>

      {/* === Floating HUD Overlay === */}
      <div className="relative z-10 min-h-[calc(100vh-4rem)] flex flex-col justify-between p-4 sm:p-6 lg:p-8 pointer-events-none">

        {/* Top Control Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="pointer-events-auto"
        >
          <div className="bg-slate-950/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800/60">
                {isComplete ? (
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
                  {isComplete ? 'Generation Complete' : pipelineState.phaseName}
                  {!isComplete && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                      PHASE {pipelineState.currentPhase || '—'}/5
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-sm">
                  Topic: <span className="text-slate-200">"{input.subject}"</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5 text-xs font-mono text-slate-400 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-cyan-300 font-bold">{formatTime(elapsed)}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="text-emerald-400">
                  {isComplete ? 'DONE' : 'PROCESSING'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Center Phase Title (large, animated) */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {!isComplete && (
              <motion.div
                key={pipelineState.phaseName}
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 0.15, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.6 }}
                className="text-center select-none"
              >
                <p className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-mono uppercase tracking-wider text-white/10">
                  {pipelineState.phaseName}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Section: Phase Progress + Panels */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="space-y-4 pointer-events-auto"
        >
          {/* 5-Phase Progress Bar */}
          <div className="bg-slate-950/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Pipeline Progress
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                {Math.round(progress * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {PHASE_CONFIG.map((phase) => {
                const Icon = phase.icon;
                const isActive = pipelineState.currentPhase === phase.id;
                const isDone = pipelineState.currentPhase > phase.id || isComplete;

                return (
                  <div key={phase.id} className="relative">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ${
                        isDone
                          ? 'bg-gradient-to-r from-cyan-400 to-violet-500 shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                          : isActive
                          ? 'bg-gradient-to-r from-cyan-400/60 to-blue-500/40 animate-pulse'
                          : 'bg-slate-800'
                      }`}
                    />
                    <div className={`flex items-center justify-center mt-2 space-x-1 text-[10px] font-mono ${
                      isDone ? 'text-cyan-300' : isActive ? 'text-white' : 'text-slate-500'
                    }`}>
                      <Icon className={`w-3 h-3 ${isActive ? 'animate-pulse' : ''}`} />
                      <span className="hidden sm:inline">{phase.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Grid: Parsed Content + Event Log */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {/* Left: Parsed AI Output (3 cols) */}
            <div className="lg:col-span-3 bg-slate-950/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl max-h-[220px] overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Brain className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                    AI Output
                  </span>
                </div>
                {pipelineState.storyTitle && (
                  <span className="text-[10px] font-mono text-cyan-400 truncate max-w-[200px]">
                    "{pipelineState.storyTitle}"
                  </span>
                )}
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                {pipelineState.sentences.length > 0 ? (
                  pipelineState.sentences.map((sentence, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="text-cyan-400/60 font-mono text-[10px] mt-0.5 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-slate-300 leading-relaxed">
                        {sentence.length > 90 ? sentence.slice(0, 90) + '...' : sentence}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex items-center space-x-2 text-slate-500 text-xs font-mono py-4">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400/50" />
                    <span>Waiting for AI script generation...</span>
                  </div>
                )}

                {/* Image progress */}
                {pipelineState.imageProgress.total > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>Scene Images</span>
                      <span className="text-cyan-400">{pipelineState.imageProgress.done}/{pipelineState.imageProgress.total}</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${(pipelineState.imageProgress.done / pipelineState.imageProgress.total) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}

                {/* Score */}
                {pipelineState.scoreGrade && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-400">Quality Grade:</span>
                    <span className={`text-sm font-bold font-mono ${
                      pipelineState.scoreGrade?.startsWith('A') ? 'text-emerald-400' :
                      pipelineState.scoreGrade?.startsWith('B') ? 'text-cyan-400' :
                      'text-amber-400'
                    }`}>
                      {pipelineState.scoreGrade}
                    </span>
                    {pipelineState.scoreTotal !== null && (
                      <span className="text-[10px] font-mono text-slate-500">{pipelineState.scoreTotal}/100</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Event Ticker (2 cols) */}
            <div className="lg:col-span-2 bg-slate-950/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl max-h-[220px] overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                    Live Events
                  </span>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {logs.length} lines
                </span>
              </div>

              <div
                ref={eventsPanelRef}
                className="space-y-1 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin scrollbar-thumb-slate-800"
              >
                {pipelineState.recentEvents.length > 0 ? (
                  pipelineState.recentEvents.map((event, idx) => (
                    <motion.div
                      key={`${idx}-${event.slice(0, 20)}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[11px] font-mono text-slate-400 leading-relaxed truncate"
                    >
                      {event}
                    </motion.div>
                  ))
                ) : (
                  <div className="flex items-center space-x-2 text-slate-500 text-xs font-mono py-4">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400/50" />
                    <span>Waiting for pipeline events...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
