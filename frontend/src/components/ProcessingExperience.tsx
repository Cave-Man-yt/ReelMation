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
  { id: 1, label: 'Script', icon: Brain, color: 'var(--nm-accent)' },
  { id: 2, label: 'Voice', icon: Zap, color: 'var(--nm-accent-blue)' },
  { id: 3, label: 'Images', icon: Layers, color: 'var(--nm-accent-light)' },
  { id: 4, label: 'Manifest', icon: Activity, color: 'var(--nm-accent-green)' },
  { id: 5, label: 'Render', icon: Video, color: 'var(--nm-accent)' },
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
    <div className="relative min-h-[calc(100vh-4rem)] bg-[var(--nm-bg)] text-[var(--nm-text)] overflow-hidden">
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
          <div 
            className="bg-[var(--nm-bg)] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{ boxShadow: 'var(--nm-raised)' }}
          >
            <div className="flex items-center space-x-3">
              <div 
                className="p-2.5 rounded-xl bg-[var(--nm-bg)]"
                style={{ boxShadow: 'var(--nm-pressed-sm)' }}
              >
                {isComplete ? (
                  <Sparkles className="w-5 h-5 text-[var(--nm-accent)]" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--nm-accent)]" />
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono text-[var(--nm-text-heading)] flex items-center gap-2">
                  {isComplete ? 'Generation Complete' : pipelineState.phaseName}
                  {!isComplete && (
                    <span 
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--nm-bg)] text-[var(--nm-accent)]"
                      style={{ boxShadow: 'var(--nm-pressed-sm)' }}
                    >
                      PHASE {pipelineState.currentPhase || '—'}/5
                    </span>
                  )}
                </h2>
                <p className="text-xs text-[var(--nm-text-muted)] font-mono mt-0.5 truncate max-w-sm">
                  Topic: <span className="text-[var(--nm-text-heading)]">"{input.subject}"</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div 
                className="flex items-center space-x-1.5 text-xs font-mono bg-[var(--nm-bg)] px-3 py-1.5 rounded-xl"
                style={{ boxShadow: 'var(--nm-pressed-sm)' }}
              >
                <Clock className="w-3.5 h-3.5 text-[var(--nm-accent)]" />
                <span className="text-[var(--nm-accent)] font-bold">{formatTime(elapsed)}</span>
              </div>
              <div 
                className="flex items-center space-x-1.5 text-xs font-mono bg-[var(--nm-bg)] px-3 py-1.5 rounded-xl"
                style={{ boxShadow: 'var(--nm-pressed-sm)' }}
              >
                <Cpu className="w-3.5 h-3.5 text-[var(--nm-accent)] animate-pulse" />
                <span className="text-[var(--nm-accent-green)]">
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
                animate={{ opacity: 0.08, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.6 }}
                className="text-center select-none"
              >
                <p className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-mono uppercase tracking-wider text-[var(--nm-text-heading)]">
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
          <div 
            className="bg-[var(--nm-bg)] rounded-2xl p-4"
            style={{ boxShadow: 'var(--nm-raised)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-[var(--nm-text-muted)] uppercase tracking-widest">
                Pipeline Progress
              </span>
              <span className="text-[10px] font-mono text-[var(--nm-accent)]">
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
                          ? ''
                          : isActive
                          ? 'bg-[var(--nm-accent)] opacity-50 animate-pulse'
                          : 'bg-[var(--nm-bg)]'
                      }`}
                      style={
                        isDone
                          ? { background: 'linear-gradient(135deg, var(--nm-accent), var(--nm-accent-blue))' }
                          : !isActive
                          ? { boxShadow: 'var(--nm-pressed)' }
                          : undefined
                      }
                    />
                    <div className={`flex items-center justify-center mt-2 space-x-1 text-[10px] font-mono ${
                      isDone || isActive ? 'text-[var(--nm-text)]' : 'text-[var(--nm-text-muted)]'
                    }`}>
                      <Icon className={`w-3 h-3 ${
                        isDone || isActive ? 'text-[var(--nm-accent)]' : 'text-[var(--nm-text-muted)]'
                      } ${isActive ? 'animate-pulse' : ''}`} />
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
            <div 
              className="lg:col-span-3 bg-[var(--nm-bg)] rounded-2xl p-4 max-h-[240px] overflow-hidden flex flex-col"
              style={{ boxShadow: 'var(--nm-raised)' }}
            >
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <Brain className="w-3.5 h-3.5 text-[var(--nm-accent)]" />
                  <span className="text-[10px] font-mono text-[var(--nm-text-muted)] uppercase tracking-widest">
                    AI Output
                  </span>
                </div>
                {pipelineState.storyTitle && (
                  <span className="text-[10px] font-mono text-[var(--nm-accent)] truncate max-w-[200px]">
                    "{pipelineState.storyTitle}"
                  </span>
                )}
              </div>

              <div 
                className="flex-1 space-y-1.5 overflow-y-auto pr-2 scrollbar-thin rounded-xl p-3"
                style={{ boxShadow: 'var(--nm-pressed-sm)' }}
              >
                {pipelineState.sentences.length > 0 ? (
                  pipelineState.sentences.map((sentence, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="text-[var(--nm-accent)] opacity-50 font-mono text-[10px] mt-0.5 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[var(--nm-text)] leading-relaxed">
                        {sentence.length > 90 ? sentence.slice(0, 90) + '...' : sentence}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex items-center space-x-2 text-[var(--nm-text-muted)] text-xs font-mono py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--nm-accent)]" />
                    <span>Waiting for AI script generation...</span>
                  </div>
                )}

                {/* Image progress */}
                {pipelineState.imageProgress.total > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--nm-bg-dark)]">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--nm-text-muted)] mb-1.5">
                      <span>Scene Images</span>
                      <span className="text-[var(--nm-accent)]">{pipelineState.imageProgress.done}/{pipelineState.imageProgress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-[var(--nm-bg)]" style={{ boxShadow: 'var(--nm-pressed)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(135deg, var(--nm-accent), var(--nm-accent-blue))' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${(pipelineState.imageProgress.done / pipelineState.imageProgress.total) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}

                {/* Score */}
                {pipelineState.scoreGrade && (
                  <div className="mt-3 pt-3 border-t border-[var(--nm-bg-dark)] flex items-center gap-3">
                    <span className="text-[10px] font-mono text-[var(--nm-text-muted)]">Quality Grade:</span>
                    <span className={`text-sm font-bold font-mono ${
                      pipelineState.scoreGrade?.startsWith('A') ? 'text-[var(--nm-accent-green)]' :
                      pipelineState.scoreGrade?.startsWith('B') ? 'text-[var(--nm-accent)]' :
                      'text-[var(--nm-accent-light)]'
                    }`}>
                      {pipelineState.scoreGrade}
                    </span>
                    {pipelineState.scoreTotal !== null && (
                      <span className="text-[10px] font-mono text-[var(--nm-text-muted)] opacity-70">{pipelineState.scoreTotal}/100</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Event Ticker (2 cols) */}
            <div 
              className="lg:col-span-2 bg-[var(--nm-bg)] rounded-2xl p-4 max-h-[240px] overflow-hidden flex flex-col"
              style={{ boxShadow: 'var(--nm-raised)' }}
            >
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-[var(--nm-accent)]" />
                  <span className="text-[10px] font-mono text-[var(--nm-text-muted)] uppercase tracking-widest">
                    Live Events
                  </span>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--nm-accent-green)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--nm-accent-green)] animate-ping" />
                  {logs.length} lines
                </span>
              </div>

              <div
                ref={eventsPanelRef}
                className="flex-1 space-y-1.5 overflow-y-auto pr-2 scrollbar-thin rounded-xl p-3"
                style={{ boxShadow: 'var(--nm-pressed-sm)' }}
              >
                {pipelineState.recentEvents.length > 0 ? (
                  pipelineState.recentEvents.map((event, idx) => (
                    <motion.div
                      key={`${idx}-${event.slice(0, 20)}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[11px] font-mono text-[var(--nm-text-muted)] leading-relaxed truncate"
                    >
                      {event}
                    </motion.div>
                  ))
                ) : (
                  <div className="flex items-center space-x-2 text-[var(--nm-text-muted)] text-xs font-mono py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--nm-accent)]" />
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
