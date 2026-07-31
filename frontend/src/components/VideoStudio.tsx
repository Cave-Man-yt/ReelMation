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

  const [isSubjectFocused, setIsSubjectFocused] = useState(false);
  const [isKnowledgeFocused, setIsKnowledgeFocused] = useState(false);
  const [isGenPressed, setIsGenPressed] = useState(false);

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
      className="min-h-[calc(100vh-4rem)] bg-[var(--nm-bg)] text-[var(--nm-text)] py-10 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Workspace Title Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6"
          style={{ boxShadow: '0 4px 6px -4px #a3b1c6' }}
        >
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-[var(--nm-accent)] uppercase tracking-widest mb-1">
              <Cpu className="w-4 h-4" />
              <span>Studio Workspace v1.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono text-[var(--nm-text-heading)]">
              Video Generation Studio
            </h1>
            <p className="text-xs text-[var(--nm-text-muted)] mt-1">
              Configure topic & knowledge source to initialize the Python rendering pipeline.
            </p>
          </div>

          {/* Quick Preset Selector */}
          <div 
            className="flex items-center space-x-2 bg-[var(--nm-bg)] p-1.5 rounded-xl text-xs font-mono"
            style={{ boxShadow: 'var(--nm-raised-sm)' }}
          >
            <span className="text-[var(--nm-text-muted)] px-2 text-[10px]">PRESET:</span>
            {SAMPLE_PRESETS.map((p) => (
              <motion.button
                key={p.id}
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelectPreset(p.id)}
                className="px-2.5 py-1 rounded-lg text-[var(--nm-text-muted)] hover:text-[var(--nm-text)] transition-colors cursor-pointer text-[11px]"
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
              className="bg-[var(--nm-bg)] rounded-2xl p-6 space-y-4"
              style={{ boxShadow: 'var(--nm-raised)' }}
            >
              <div className="flex items-center justify-between">
                <motion.label
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs font-mono font-bold text-[var(--nm-accent)] uppercase tracking-wider flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4 text-[var(--nm-accent)]" />
                  <span>1. Subject Topic</span>
                </motion.label>
                <span className="text-[10px] font-mono text-[var(--nm-text-muted)]">REQUIRED</span>
              </div>

              <p className="text-xs text-[var(--nm-text-muted)]">
                "What topic should this video teach?"
              </p>

              <textarea
                ref={subjectInputRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setIsSubjectFocused(true)}
                onBlur={() => setIsSubjectFocused(false)}
                placeholder="e.g., Explain Photosynthesis and how plants convert light into energy..."
                rows={4}
                className="w-full bg-[var(--nm-bg)] rounded-xl p-3.5 text-sm font-sans text-[var(--nm-text)] placeholder-[var(--nm-text-muted)] focus:outline-none resize-none transition-all duration-300 nm-input"
                style={{
                  boxShadow: isSubjectFocused 
                    ? 'var(--nm-pressed-lg), 0 0 0 3px rgba(124, 92, 191, 0.15)' 
                    : 'var(--nm-pressed)'
                }}
                required
              />

              {/* Subject Suggestion Chips */}
              <div className="pt-2">
                <span className="text-[10px] font-mono text-[var(--nm-text-muted)] uppercase block mb-2">
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
                      className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[var(--nm-bg)] text-[var(--nm-text-muted)] hover:text-[var(--nm-accent)] transition-colors cursor-pointer"
                      style={{ boxShadow: 'var(--nm-raised-sm)' }}
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
              className="bg-[var(--nm-bg)] rounded-2xl p-6 space-y-4"
              style={{ boxShadow: 'var(--nm-raised)' }}
            >
              <div className="flex items-center justify-between">
                <motion.label
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xs font-mono font-bold text-[var(--nm-accent)] uppercase tracking-wider flex items-center space-x-2"
                >
                  <BookOpen className="w-4 h-4 text-[var(--nm-accent)]" />
                  <span>2. Knowledge Base & Notes</span>
                </motion.label>
                <span className="text-[10px] font-mono text-[var(--nm-text-muted)]">OPTIONAL</span>
              </div>

              <p className="text-xs text-[var(--nm-text-muted)]">
                Paste research notes, articles, paper excerpts, or educational curriculum.
              </p>

              <textarea
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                onFocus={() => setIsKnowledgeFocused(true)}
                onBlur={() => setIsKnowledgeFocused(false)}
                placeholder="Paste key facts, equations, consensus definitions, or textbook notes here..."
                rows={4}
                className="w-full bg-[var(--nm-bg)] rounded-xl p-3.5 text-sm font-sans text-[var(--nm-text)] placeholder-[var(--nm-text-muted)] focus:outline-none resize-none transition-all duration-300 nm-input"
                style={{
                  boxShadow: isKnowledgeFocused 
                    ? 'var(--nm-pressed-lg), 0 0 0 3px rgba(124, 92, 191, 0.15)' 
                    : 'var(--nm-pressed)'
                }}
              />


            </motion.div>
          </div>

          {/* Style & Format Configuration Panel */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-[var(--nm-bg)] rounded-2xl p-6 space-y-6"
            style={{ boxShadow: 'var(--nm-raised)' }}
          >
            <div 
              className="flex items-center space-x-2 text-xs font-mono font-bold text-[var(--nm-text-heading)] uppercase tracking-wider pb-3"
              style={{ boxShadow: '0 4px 6px -4px #a3b1c6' }}
            >
              <Sliders className="w-4 h-4 text-[var(--nm-accent)]" />
              <span>3. Platform & Algorithmic Parameters</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
              {/* Aspect Ratio */}
              <div className="space-y-2">
                <span className="text-[var(--nm-text-muted)] block text-[11px]">Format / Aspect Ratio</span>
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
                      className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer text-[11px] ${
                        format === f.id
                          ? 'text-[var(--nm-accent)] font-bold'
                          : 'bg-[var(--nm-bg)] text-[var(--nm-text-muted)]'
                      }`}
                      style={{
                        boxShadow: format === f.id ? 'var(--nm-pressed-sm)' : 'var(--nm-raised-sm)'
                      }}
                    >
                      {f.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Voice Style */}
              <div className="space-y-2">
                <span className="text-[var(--nm-text-muted)] block text-[11px]">Voice Narration Style</span>
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
                      className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer text-[11px] ${
                        voiceStyle === v.id
                          ? 'text-[var(--nm-accent)] font-bold'
                          : 'bg-[var(--nm-bg)] text-[var(--nm-text-muted)]'
                      }`}
                      style={{
                        boxShadow: voiceStyle === v.id ? 'var(--nm-pressed-sm)' : 'var(--nm-raised-sm)'
                      }}
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
              onMouseDown={() => setIsGenPressed(true)}
              onMouseUp={() => setIsGenPressed(false)}
              onMouseLeave={() => setIsGenPressed(false)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="w-full sm:w-2/3 md:w-1/2 py-5 rounded-2xl bg-[var(--nm-bg)] text-[var(--nm-accent)] font-mono font-bold text-base transition-all duration-300 cursor-pointer flex items-center justify-center space-x-3 group"
              style={{
                boxShadow: isGenPressed ? 'var(--nm-pressed)' : 'var(--nm-raised-lg)'
              }}
            >
              <Zap className="w-5 h-5 text-[var(--nm-accent)] fill-current group-hover:scale-125 transition-transform" />
              <span>GENERATE VIDEO WITH AI</span>
              <ChevronRight className="w-5 h-5 text-[var(--nm-accent)] group-hover:translate-x-1 transition-transform" />
            </motion.button>
            <p className="text-[var(--nm-text-muted)] text-xs font-mono">
              ⚡ Generation takes ~10 minutes. ComfyUI must be running.
            </p>
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
};

