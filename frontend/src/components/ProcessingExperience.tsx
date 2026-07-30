import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { VideoGenerationInput } from '../types';
import {
  Terminal,
  Loader2,
  Cpu,
} from 'lucide-react';

interface ProcessingExperienceProps {
  input: VideoGenerationInput;
  logs: string[];
  generatedData: any;
  onComplete: () => void;
}

export const ProcessingExperience: React.FC<ProcessingExperienceProps> = ({
  input,
  logs,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal to latest log line
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[calc(100vh-4rem)] bg-[#050B16] text-slate-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Processing Top Control Bar */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold font-mono text-white">
                  Python Pipeline Running Live
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  PID #MAIN-REELM
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                Topic: <span className="text-slate-200">"{input.subject}"</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>REAL-TIME STDOUT STREAM</span>
          </div>
        </div>

        {/* Full Width Real-Time AI Operations Console */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between font-mono text-xs overflow-hidden backdrop-blur-xl shadow-2xl min-h-[550px]">
          {/* Terminal Top Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                Python stdout / stderr Live Stream
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE LOGS ({logs.length} lines)
              </span>
            </div>
          </div>

          {/* Live Terminal Stream Box */}
          <div className="flex-1 bg-black/80 border border-slate-800 rounded-xl p-4 overflow-y-auto max-h-[480px] font-mono text-xs space-y-1 text-slate-300 scrollbar-thin scrollbar-thumb-slate-800">
            {logs.length === 0 ? (
              <div className="flex items-center space-x-2 text-slate-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Initializing main.py execution environment...</span>
              </div>
            ) : (
              logs.map((logLine, idx) => {
                let colorClass = "text-slate-300";
                if (logLine.includes("STEP") || logLine.includes("REELMATION")) {
                  colorClass = "text-cyan-400 font-bold text-sm py-1";
                } else if (logLine.includes("✅") || logLine.includes("complete")) {
                  colorClass = "text-emerald-400 font-bold";
                } else if (logLine.includes("⚠️") || logLine.includes("WARNING")) {
                  colorClass = "text-amber-400";
                } else if (logLine.includes("❌") || logLine.includes("[stderr]")) {
                  colorClass = "text-rose-400 font-bold";
                } else if (logLine.includes("ScriptAgent") || logLine.includes("Scene")) {
                  colorClass = "text-violet-300";
                }

                return (
                  <div key={idx} className={`leading-relaxed whitespace-pre-wrap ${colorClass}`}>
                    {logLine}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Bottom Status Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Streaming from python main.py process</span>
            </div>
            <span className="text-cyan-400 font-mono">Reelmation Pipeline v1.0</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
