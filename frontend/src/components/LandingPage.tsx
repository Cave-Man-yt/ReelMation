import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { HeroParticleField } from './3d/HeroParticleField';
import { AppView } from '../types';
import { SAMPLE_PRESETS } from '../data/presets';
import {
  Sparkles,
  ArrowRight,
  Cpu,
  Brain,
  Video,
  CheckCircle2,
  Zap,
  TrendingUp,
  Layers,
  Activity,
  MousePointer,
  ChevronDown
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: AppView, presetSubject?: string) => void;
  onPreviewShort: (presetKey: string) => void;
}

const PIPELINE_STEPS = [
  { id: 'script', title: 'Script Generation', icon: Brain, desc: 'Generates narration sentences, optimizes hook, creates character/environment bibles, and image prompts via Gemini AI.' },
  { id: 'voice', title: 'Voiceover & Timestamps', icon: Zap, desc: 'Uses Edge-TTS to synthesize speech with exact per-word timing alignment.' },
  { id: 'scene', title: 'Scene Image Generation', icon: Layers, desc: 'Uses ComfyUI (local Stable Diffusion) to generate stunning visual scenes from prompts.' },
  { id: 'manifest', title: 'Manifest & Scoring', icon: Activity, desc: 'Builds frame-level manifest and scores reel (Hook, Pacing, Density) from A+ to F.' },
  { id: 'render', title: 'Video Rendering', icon: Video, desc: 'Renders final 1080x1920 30fps MP4 with animated captions via Remotion.' }
];

const SECTIONS = [
  { id: 'hero', label: 'Overview' },
  { id: 'pipeline', label: 'Architecture' },
  { id: 'shorts', label: 'Sample Shorts' }
];

// High-Sensitivity 3D Tilt Card Helper Component with Cursor Tracking Spotlight
const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotateX(-y / 6);
    setRotateY(x / 6);

    const spotlightX = ((e.clientX - rect.left) / rect.width) * 100;
    const spotlightY = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlightPos({ x: spotlightX, y: spotlightY });
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setRotateX(0);
        setRotateY(0);
        setIsHovered(false);
      }}
      animate={{ rotateX, rotateY, scale: isHovered ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      style={{ perspective: 1000 }}
      className={`relative overflow-hidden ${className}`}
    >
      {isHovered && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-10 rounded-2xl"
          style={{
            background: `radial-gradient(350px circle at ${spotlightPos.x}% ${spotlightPos.y}%, rgba(0, 240, 255, 0.18), transparent 80%)`,
          }}
        />
      )}
      {children}
    </motion.div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [activePipelineStep, setActivePipelineStep] = useState(2);
  const [activeSectionId, setActiveSectionId] = useState('hero');

  // Section Refs
  const heroRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const shortsRef = useRef<HTMLDivElement>(null);

  // Global Vertical Scroll Progress
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 30 });

  // Scroll Parallax and 3D Camera Depth Transforms
  const heroBgScale = useTransform(scrollYProgress, [0, 0.3], [1, 1.25]);
  const heroBgOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0.3]);
  const heroContentY = useTransform(scrollYProgress, [0, 0.25], [0, 60]);

  useEffect(() => {
    const handleScroll = () => {
      // Determine active section based on scroll offset
      const refs = [
        { id: 'hero', ref: heroRef },
        { id: 'pipeline', ref: pipelineRef },
        { id: 'shorts', ref: shortsRef },
      ];

      const scrollPos = window.scrollY + window.innerHeight / 3;
      for (let i = refs.length - 1; i >= 0; i--) {
        const el = refs[i].ref.current;
        if (el && el.offsetTop <= scrollPos) {
          setActiveSectionId(refs[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const map: Record<string, React.RefObject<HTMLDivElement>> = {
      hero: heroRef,
      pipeline: pipelineRef,
      shorts: shortsRef,
    };
    map[id]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-[#050B16] text-slate-100 overflow-x-hidden font-sans">
      {/* Top Fixed Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 origin-left z-50 shadow-[0_0_12px_rgba(0,240,255,0.8)]"
        style={{ scaleX }}
      />

      {/* SECTION 1: HERO */}
      <section
        ref={heroRef}
        id="hero"
        className="relative min-h-screen flex flex-col justify-center items-center px-4 sm:px-8 lg:px-16 pt-20 pb-16 overflow-hidden select-none"
      >
        {/* 3D Background Particle Field with Parallax Zoom */}
        <motion.div
          style={{ scale: heroBgScale, opacity: heroBgOpacity }}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          <HeroParticleField />
        </motion.div>

        {/* Ambient Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-gradient-to-r from-cyan-500/15 via-blue-600/10 to-violet-600/15 blur-[130px] pointer-events-none rounded-full" />

        <motion.div
          style={{ y: heroContentY }}
          className="relative z-10 max-w-5xl mx-auto text-center space-y-7"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/40 text-cyan-300 font-mono text-xs shadow-lg shadow-cyan-500/10 backdrop-blur-md"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>AI-Powered Educational Reel Generator</span>
          </motion.div>

          {/* Main Kinetic Title */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight font-mono text-white leading-none">
            {"Generate Viral Educational Shorts with AI".split(" ").map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 25, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className={word === "Viral" || word === "AI" ? "text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 pr-2.5 inline-block" : "pr-2.5 inline-block"}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          {/* Subheading */}
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto font-sans leading-relaxed">
            Reelmation uses Gemini AI for scripting, ComfyUI for image generation, Edge-TTS for voiceover, and Remotion for final video rendering — all automated.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onNavigate('studio')}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white font-mono text-sm font-semibold shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 cursor-pointer flex items-center space-x-2.5"
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Real-Time Telemetry Chips */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-left">
              <p className="text-slate-500 text-[10px]">RESOLUTION</p>
              <p className="text-slate-200 font-bold text-sm">1080x1920</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-left">
              <p className="text-slate-500 text-[10px]">FPS</p>
              <p className="text-cyan-400 font-bold text-sm">30</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-left">
              <p className="text-slate-500 text-[10px]">ENGINE</p>
              <p className="text-violet-400 font-bold text-sm">Gemini + ComfyUI</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-left">
              <p className="text-slate-500 text-[10px]">RENDER</p>
              <p className="text-emerald-400 font-bold text-sm">Remotion</p>
            </div>
          </div>

          {/* Scroll Down Prompt Indicator */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1 }}
            onClick={() => scrollToSection('pipeline')}
            className="pt-6 flex flex-col items-center space-y-2 cursor-pointer group"
          >
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest group-hover:text-cyan-300 flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              SCROLL DOWN TO EXPLORE PIPELINE
            </span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="p-2.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-cyan-400 group-hover:border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)] transition-all"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* SECTION 2: AUTONOMOUS PIPELINE ARCHITECTURE */}
      <section
        ref={pipelineRef}
        id="pipeline"
        className="py-24 px-4 sm:px-8 lg:px-16 max-w-7xl mx-auto border-t border-slate-800/60 relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="space-y-10"
        >
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
              Autonomous Pipeline Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-mono text-white">
              The 5-Step Process
            </h2>
            <p className="text-slate-400 text-sm">
              Reelmation orchestrates a complex AI pipeline to generate fully-produced videos.
            </p>
          </div>

          {/* Self-Drawing Connecting Flow Line */}
          <div className="hidden lg:block relative w-full h-1 my-2">
            <svg className="w-full h-4 overflow-visible" viewBox="0 0 1000 10">
              <motion.path
                d="M 10 5 L 990 5"
                fill="none"
                stroke="url(#pipelineGradient)"
                strokeWidth="2.5"
                strokeDasharray="1000"
                initial={{ strokeDashoffset: 1000 }}
                whileInView={{ strokeDashoffset: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1.8, ease: 'easeInOut' }}
              />
              <defs>
                <linearGradient id="pipelineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00f0ff" />
                  <stop offset="30%" stopColor="#3b82f6" />
                  <stop offset="60%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 5-Step Interactive Pipeline Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activePipelineStep === idx;
              const isCompleted = idx < activePipelineStep;

              return (
                <button
                  key={step.id}
                  onClick={() => setActivePipelineStep(idx)}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 relative overflow-hidden ${
                    isActive
                      ? 'bg-cyan-950/80 border-cyan-400 shadow-lg shadow-cyan-500/25 text-white scale-105 z-10'
                      : isCompleted
                      ? 'bg-slate-900/80 border-cyan-800/60 text-slate-200'
                      : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono text-slate-400">0{idx + 1}</span>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400 animate-bounce' : isCompleted ? 'text-cyan-300' : 'text-slate-500'}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-mono font-bold leading-tight text-white">
                      {step.title}
                    </h4>
                    <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${isActive || isCompleted ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-slate-700'}`}
                        style={{ width: isActive || isCompleted ? '100%' : '25%' }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pipeline Inspector Glass Card */}
          <TiltCard className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2 space-y-3">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
                  <span>PHASE 0{activePipelineStep + 1}</span>
                  <span>•</span>
                  <span>{PIPELINE_STEPS[activePipelineStep].title}</span>
                </div>

                <h3 className="text-2xl font-bold font-mono text-white">
                  {PIPELINE_STEPS[activePipelineStep].title}
                </h3>

                <p className="text-slate-300 text-sm leading-relaxed font-sans">
                  {PIPELINE_STEPS[activePipelineStep].desc}
                </p>

                <div className="pt-2 font-mono text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    <span>Automated by Python Backend</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 font-mono text-xs space-y-3">
                <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-2">
                  <span>PIPELINE TELEMETRY</span>
                  <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    READY
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  <p><span className="text-slate-500">LLM:</span> Gemini</p>
                  <p><span className="text-slate-500">Audio:</span> Edge-TTS</p>
                  <p><span className="text-slate-500">Image:</span> ComfyUI / SD</p>
                  <p><span className="text-slate-500">Render:</span> Remotion</p>
                </div>
                <button
                  onClick={() => onNavigate('studio')}
                  className="w-full mt-2 py-2.5 rounded-lg bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 hover:bg-cyan-900 font-semibold transition-colors cursor-pointer text-center block"
                >
                  Launch Studio →
                </button>
              </div>
            </div>
          </TiltCard>
        </motion.div>
      </section>

      {/* SECTION 4: SHOWCASE SHORTS GALLERY */}
      <section
        ref={shortsRef}
        id="shorts"
        className="py-24 px-4 sm:px-8 lg:px-16 max-w-7xl mx-auto border-t border-slate-800/60 relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between">
            <div>
              <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                Preset Topics
              </span>
              <h2 className="text-3xl font-bold font-mono text-white mt-1">
                Sample Educational Presets
              </h2>
            </div>
            <button
              onClick={() => onNavigate('studio')}
              className="mt-4 md:mt-0 text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
            >
              <span>Create Custom</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SAMPLE_PRESETS.map((preset) => (
              <TiltCard
                key={preset.id}
                className="h-full bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/50 rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px]">
                      {preset.category}
                    </span>
                  </div>

                  <h3 className="text-base font-bold font-mono text-white">
                    {preset.title}
                  </h3>

                  <p className="text-xs text-slate-300 line-clamp-3 font-sans">
                    {preset.subject}
                  </p>
                </div>

                <div className="pt-6 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    onClick={() => onNavigate('studio', preset.subject)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-cyan-950 hover:border-cyan-600 border border-slate-700 text-cyan-300 transition-colors cursor-pointer text-xs font-mono flex items-center justify-center gap-2"
                  >
                    <span>Create in Studio</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </TiltCard>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
};
