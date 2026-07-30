import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoGenerationInput } from '../types';
import {
  Terminal,
  CheckCircle2,
  Loader2,
  Cpu,
} from 'lucide-react';

interface ProcessingExperienceProps {
  input: VideoGenerationInput;
  generatedData: any; // Using any here to bypass types issue as we don't have full types context, we only display progress
  onComplete: () => void;
}

const DEFAULT_WORKFLOW_STEPS: { title: string; category: string; detail: string }[] = [
  { title: 'Generating script via Gemini AI...', category: 'SCRIPT', detail: 'Writing narration, hooks, and extracting scene descriptions' },
  { title: 'Optimizing hook for maximum retention...', category: 'HOOK', detail: 'Evaluating script for 3-second retention metrics' },
  { title: 'Creating character & environment bibles...', category: 'WORLD', detail: 'Establishing visual consistency for the scenes' },
  { title: 'Generating image prompts for each scene...', category: 'PROMPT', detail: 'Formatting prompts for Stable Diffusion execution' },
  { title: 'Synthesizing voiceover with Edge-TTS...', category: 'AUDIO', detail: 'Generating high-quality speech audio file' },
  { title: 'Extracting word-level timestamps...', category: 'SYNC', detail: 'Aligning captions to audio for kinetic typography' },
  { title: 'Generating scene images via ComfyUI...', category: 'VISUALS', detail: 'Processing visual prompts through local ComfyUI instance' },
  { title: 'Building frame-level manifest...', category: 'MANIFEST', detail: 'Compiling reel_manifest.json with all timings and assets' },
  { title: 'Scoring reel metadata...', category: 'SCORE', detail: 'Evaluating Hook, Pacing, and Density' },
  { title: 'Rendering video with Remotion...', category: 'RENDER', detail: 'Outputting final 1080x1920 MP4 at 30fps' }
];

export const ProcessingExperience: React.FC<ProcessingExperienceProps> = ({
  input,
  generatedData,
  onComplete,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Sequentially advance operations
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStepIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex < DEFAULT_WORKFLOW_STEPS.length) {
          return nextIndex;
        } else {
          if (!generatedData) {
            return prevIndex; // Wait for data!
          }
          clearInterval(interval);
          setTimeout(() => {
            onComplete();
          }, 1200);
          return prevIndex;
        }
      });
    }, 2500); // Increased interval to 2500ms

    return () => clearInterval(interval);
  }, [onComplete, generatedData]);

  const progressPercent = Math.min(100, Math.round(((currentStepIndex + 1) / DEFAULT_WORKFLOW_STEPS.length) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[calc(100vh-4rem)] bg-[#050B16] text-slate-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Processing Top Control Bar */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold font-mono text-white">
                  Python Generation Pipeline Active
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  PID #88492-REELM
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                Subject: <span className="text-slate-200">"{input.subject}"</span>
              </p>
            </div>
          </div>

          {/* Global Progress Gauge */}
          <div className="w-full sm:w-72 space-y-2 font-mono">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">COMPILING SHORT</span>
              <span className="text-cyan-400 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <motion.div
                className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 h-full rounded-full"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>

        {/* Full Width AI Operations Console */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between font-mono text-xs overflow-hidden backdrop-blur-xl shadow-2xl min-h-[500px]">
          {/* Terminal Top Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                AI Operations Console
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                LOGS STREAMING
              </span>
              <span>GPU ACCELERATED</span>
            </div>
          </div>

          {/* Live Terminal Operation Stream with Motion Items */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            <AnimatePresence>
              {DEFAULT_WORKFLOW_STEPS.slice(0, currentStepIndex + 1).map((step, idx) => {
                const isCurrent = idx === currentStepIndex;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={`p-3 rounded-xl border transition-all duration-300 ${
                      isCurrent
                        ? 'bg-cyan-950/40 border-cyan-500/70 text-cyan-100 shadow-md shadow-cyan-950/50'
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        {isCurrent ? (
                          <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span className="font-bold text-[11px] uppercase tracking-wide">
                          [{step.category}] {step.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {isCurrent ? 'Running...' : 'Done'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1 font-sans pl-6">
                      {step.detail}
                    </p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Bottom Status Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Python Pipeline Processing</span>
            </div>
            <span className="text-cyan-400">Reelmation v1.0</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
