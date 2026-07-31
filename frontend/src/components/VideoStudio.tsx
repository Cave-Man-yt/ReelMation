import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { VideoGenerationInput, AspectRatioFormat, VoiceStyle } from '../types';
import { SAMPLE_PRESETS } from '../data/presets';
import {
  Sparkles,
  BookOpen,
  Sliders,
  Cpu,
  Zap,
  ChevronRight
} from 'lucide-react';

interface VideoStudioProps {
  initialSubject?: string;
  onGenerate: (input: VideoGenerationInput) => void;
}

export const VideoStudio: React.FC<VideoStudioProps> = ({ initialSubject = '', onGenerate }) => {
  const [subject, setSubject] = useState(initialSubject || SAMPLE_PRESETS[0].subject);
  const [knowledgeBase, setKnowledgeBase] = useState(SAMPLE_PRESETS[0].knowledge);
  const [format, setFormat] = useState<AspectRatioFormat>('9:16');
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('energetic');


  const subjectInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      subjectInputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectPreset = (presetId: string) => {
    const found = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSubject(found.subject);
      setKnowledgeBase(found.knowledge);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    onGenerate({
      subject,
      knowledgeBase,
      format,
      pace: 'explosive', // default to satisfy type if needed
      voiceStyle,
      visualStyle: '3d_schematic', // default to satisfy type if needed
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[calc(100vh-4rem)] bg-[#050B16] text-slate-100 py-10 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Workspace Title Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6"
        >
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
              <Cpu className="w-4 h-4" />
              <span>Studio Workspace v1.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white">
              Video Generation Studio
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure topic & knowledge source to initialize the Python rendering pipeline.
            </p>
          </div>

          {/* Quick Preset Selector */}
          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 p-1.5 rounded-xl text-xs font-mono">
            <span className="text-slate-400 px-2 text-[10px]">PRESET:</span>
            {SAMPLE_PRESETS.map((p) => (
              <motion.button
                key={p.id}
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelectPreset(p.id)}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px]"
              >
                {p.title.split(' ')[0]}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Studio Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Main Input Grid (Subject + Knowledge Base) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input 1: Subject */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-6 space-y-4 shadow-xl backdrop-blur-xl hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <motion.label
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>1. Subject Topic</span>
                </motion.label>
                <span className="text-[10px] font-mono text-slate-500">REQUIRED</span>
              </div>

              <p className="text-xs text-slate-400">
                "What topic should this video teach?"
              </p>

              <textarea
                ref={subjectInputRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Explain Photosynthesis and how plants convert light into energy..."
                rows={4}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 text-sm font-sans text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 focus:shadow-[0_0_20px_rgba(0,240,255,0.2)] resize-none transition-all duration-300"
                required
              />

              {/* Subject Suggestion Chips */}
              <div className="pt-2">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">
                  Suggested Educational Topics:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Explain Photosynthesis',
                    'How DNA Replicates',
                    'What is a Black Hole',
                    'How Neural Networks Learn',
                    'Explain Quantum Computing'
                  ].map((chip) => (
                    <motion.button
                      key={chip}
                      type="button"
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setSubject(chip)}
                      className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-700 hover:text-cyan-300 text-slate-400 transition-colors cursor-pointer"
                    >
                      + {chip}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Input 2: Knowledge Base */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-6 space-y-4 shadow-xl backdrop-blur-xl hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <motion.label
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xs font-mono font-bold text-violet-300 uppercase tracking-wider flex items-center space-x-2"
                >
                  <BookOpen className="w-4 h-4 text-violet-400" />
                  <span>2. Knowledge Base & Notes</span>
                </motion.label>
                <span className="text-[10px] font-mono text-slate-500">OPTIONAL</span>
              </div>

              <p className="text-xs text-slate-400">
                Paste research notes, articles, paper excerpts, or educational curriculum.
              </p>

              <textarea
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                placeholder="Paste key facts, equations, consensus definitions, or textbook notes here..."
                rows={4}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 text-sm font-sans text-white placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/50 focus:shadow-[0_0_20px_rgba(139,92,246,0.2)] resize-none transition-all duration-300"
              />


            </motion.div>
          </div>

          {/* Style & Format Configuration Panel */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-6 space-y-6 shadow-xl"
          >
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-3">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>3. Platform & Algorithmic Parameters</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
              {/* Aspect Ratio */}
              <div className="space-y-2">
                <span className="text-slate-400 block text-[11px]">Format / Aspect Ratio</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '9:16', label: '9:16 Shorts' },
                    { id: '1:1', label: '1:1 Square' },
                    { id: '16:9', label: '16:9 Video' }
                  ].map((f) => (
                    <motion.button
                      key={f.id}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFormat(f.id as AspectRatioFormat)}
                      className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer text-[11px] ${
                        format === f.id
                          ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 font-bold shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {f.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Voice Style */}
              <div className="space-y-2">
                <span className="text-slate-400 block text-[11px]">Voice Narration Style</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'energetic', label: 'Energetic' },
                    { id: 'academic', label: 'Academic' },
                    { id: 'calm', label: 'Calm' }
                  ].map((v) => (
                    <motion.button
                      key={v.id}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setVoiceStyle(v.id as VoiceStyle)}
                      className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer text-[11px] ${
                        voiceStyle === v.id
                          ? 'bg-violet-950/80 border-violet-500 text-violet-200 font-bold shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {v.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Prominent Single "Generate Video" Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="pt-4 flex flex-col items-center gap-3"
          >
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="w-full sm:w-2/3 md:w-1/2 py-5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white font-mono font-bold text-base shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all duration-300 cursor-pointer flex items-center justify-center space-x-3 group"
            >
              <Zap className="w-5 h-5 text-cyan-200 fill-current group-hover:scale-125 transition-transform" />
              <span>GENERATE VIDEO WITH AI</span>
              <ChevronRight className="w-5 h-5 text-cyan-200 group-hover:translate-x-1 transition-transform" />
            </motion.button>
            <p className="text-slate-500 text-xs font-mono">
              ⚡ Generation takes ~10 minutes. ComfyUI must be running.
            </p>
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
};
