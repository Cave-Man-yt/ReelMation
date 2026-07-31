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

// High-Sensitivity 3D Tilt Card Helper Component
const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotateX(-y / 6);
    setRotateY(x / 6);
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
      style={{ perspective: 1000, boxShadow: isHovered ? 'var(--nm-raised-lg)' : 'var(--nm-raised)' }}
      className={`relative overflow-hidden rounded-2xl bg-[var(--nm-bg)] ${className}`}
    >
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
    <div className="relative min-h-screen overflow-x-hidden font-sans">
      {/* Top Fixed Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-[var(--nm-accent)] origin-left z-50"
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

        <motion.div
          style={{ y: heroContentY }}
          className="relative z-10 max-w-5xl mx-auto text-center space-y-7"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full font-mono text-xs bg-[var(--nm-bg)]"
            style={{ boxShadow: 'var(--nm-pressed-sm)' }}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--nm-accent)] nm-animate-pulse" />
            <span className="text-[var(--nm-accent)]">AI-Powered Educational Reel Generator</span>
          </motion.div>

          {/* Main Kinetic Title */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight font-mono text-[var(--nm-text-heading)] leading-none">
            {"Generate Viral Educational Shorts with AI".split(" ").map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 25, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className={word === "Viral" || word === "AI" ? "text-[var(--nm-accent)] pr-2.5 inline-block" : "pr-2.5 inline-block"}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          {/* Subheading */}
          <p className="text-[var(--nm-text-muted)] text-sm sm:text-base max-w-2xl mx-auto font-sans leading-relaxed">
            Reelmation uses Gemini AI for scripting, ComfyUI for image generation, Edge-TTS for voiceover, and Remotion for final video rendering — all automated.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onNavigate('studio')}
              className="nm-btn px-8 py-3.5 rounded-2xl font-mono text-sm font-semibold flex items-center space-x-2.5 text-white"
              style={{background: 'linear-gradient(135deg, #6c3baa, #4a6cf7)', boxShadow: '4px 4px 12px rgba(108,59,170,0.35), -3px -3px 8px rgba(255,255,255,0.5)'}}
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </motion.button>
          </div>

          {/* Real-Time Telemetry Chips */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto font-mono text-xs">
            <div className="p-3 rounded-xl nm-card text-left">
              <p className="text-[var(--nm-text-muted)] text-[10px]">RESOLUTION</p>
              <p className="text-[var(--nm-text-heading)] font-bold text-sm">1080x1920</p>
            </div>
            <div className="p-3 rounded-xl nm-card text-left">
              <p className="text-[var(--nm-text-muted)] text-[10px]">FPS</p>
              <p className="text-[var(--nm-text-heading)] font-bold text-sm">30</p>
            </div>
            <div className="p-3 rounded-xl nm-card text-left">
              <p className="text-[var(--nm-text-muted)] text-[10px]">ENGINE</p>
              <p className="text-[var(--nm-text-heading)] font-bold text-sm">Gemini + ComfyUI</p>
            </div>
            <div className="p-3 rounded-xl nm-card text-left">
              <p className="text-[var(--nm-text-muted)] text-[10px]">RENDER</p>
              <p className="text-[var(--nm-text-heading)] font-bold text-sm">Remotion</p>
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
            <span className="text-[10px] font-mono text-[var(--nm-accent)] uppercase tracking-widest flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5 text-[var(--nm-accent)] nm-animate-pulse" />
              SCROLL DOWN TO EXPLORE PIPELINE
            </span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="p-2.5 rounded-full text-[var(--nm-accent)] bg-[var(--nm-bg)] transition-all"
              style={{ boxShadow: 'var(--nm-raised)' }}
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
        className="py-24 px-4 sm:px-8 lg:px-16 max-w-7xl mx-auto relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="space-y-10"
        >
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="text-xs font-mono text-[var(--nm-text-muted)] uppercase tracking-widest">
              Autonomous Pipeline Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-mono text-[var(--nm-text-heading)]">
              The 5-Step Process
            </h2>
            <p className="text-[var(--nm-text-muted)] text-sm">
              Reelmation orchestrates a complex AI pipeline to generate fully-produced videos.
            </p>
          </div>

          {/* Self-Drawing Connecting Flow Line */}
          <div className="hidden lg:block relative w-full h-1 my-2">
            <svg className="w-full h-4 overflow-visible" viewBox="0 0 1000 10">
              <motion.path
                d="M 10 5 L 990 5"
                fill="none"
                stroke="var(--nm-shadow-dark, rgba(0,0,0,0.25))"
                strokeOpacity="0.4"
                strokeWidth="2.5"
                strokeDasharray="1000"
                initial={{ strokeDashoffset: 1000 }}
                whileInView={{ strokeDashoffset: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1.8, ease: 'easeInOut' }}
              />
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
                  className={`p-3.5 rounded-xl text-left transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 relative overflow-hidden bg-[var(--nm-bg)] ${
                    isActive
                      ? 'scale-105 z-10'
                      : ''
                  }`}
                  style={{
                    boxShadow: isActive ? 'var(--nm-pressed)' : 'var(--nm-raised-sm)'
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono text-[var(--nm-text-muted)]">0{idx + 1}</span>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--nm-accent)] animate-bounce' : 'text-[var(--nm-text-muted)]'}`} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-mono font-bold leading-tight ${isActive ? 'text-[var(--nm-text-heading)]' : 'text-[var(--nm-text)]'}`}>
                      {step.title}
                    </h4>
                    <div className="w-full nm-progress-track h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 nm-progress-fill ${isActive || isCompleted ? 'bg-[var(--nm-accent)]' : 'bg-transparent'}`}
                        style={{ width: isActive || isCompleted ? '100%' : '25%' }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pipeline Inspector Glass Card */}
          <TiltCard className="p-6 sm:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2 space-y-3">
                <div 
                  className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono text-[var(--nm-accent)]"
                  style={{ boxShadow: 'var(--nm-pressed-sm)' }}
                >
                  <span>PHASE 0{activePipelineStep + 1}</span>
                  <span>•</span>
                  <span>{PIPELINE_STEPS[activePipelineStep].title}</span>
                </div>

                <h3 className="text-2xl font-bold font-mono text-[var(--nm-text-heading)]">
                  {PIPELINE_STEPS[activePipelineStep].title}
                </h3>

                <p className="text-[var(--nm-text-muted)] text-sm leading-relaxed font-sans">
                  {PIPELINE_STEPS[activePipelineStep].desc}
                </p>

                <div className="pt-2 font-mono text-xs text-[var(--nm-text-muted)] space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--nm-accent-green)]" />
                    <span>Automated by Python Backend</span>
                  </div>
                </div>
              </div>

              <div 
                className="p-5 rounded-xl font-mono text-xs space-y-3 bg-[var(--nm-bg)]"
                style={{ boxShadow: 'var(--nm-pressed)' }}
              >
                <div className="flex justify-between items-center text-[var(--nm-text)] border-b border-[var(--nm-shadow-light)] pb-2">
                  <span>PIPELINE TELEMETRY</span>
                  <span className="text-[var(--nm-accent-green)] flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-[var(--nm-accent-green)] animate-ping" />
                    READY
                  </span>
                </div>
                <div className="space-y-1 text-[var(--nm-text-muted)] text-[11px]">
                  <p><span className="text-[var(--nm-text)]">LLM:</span> Gemini</p>
                  <p><span className="text-[var(--nm-text)]">Audio:</span> Edge-TTS</p>
                  <p><span className="text-[var(--nm-text)]">Image:</span> ComfyUI / SD</p>
                  <p><span className="text-[var(--nm-text)]">Render:</span> Remotion</p>
                </div>
                <button
                  onClick={() => onNavigate('studio')}
                  className="nm-btn w-full mt-2 py-2.5 rounded-lg text-white font-semibold transition-colors cursor-pointer text-center block"
                  style={{background: 'linear-gradient(135deg, #6c3baa, #4a6cf7)', boxShadow: '4px 4px 12px rgba(108,59,170,0.35), -3px -3px 8px rgba(255,255,255,0.5)'}}
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
        className="py-24 px-4 sm:px-8 lg:px-16 max-w-7xl mx-auto relative z-10"
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
              <span className="text-xs font-mono text-[var(--nm-text-muted)] uppercase tracking-widest">
                Preset Topics
              </span>
              <h2 className="text-3xl font-bold font-mono text-[var(--nm-text-heading)] mt-1">
                Sample Educational Presets
              </h2>
            </div>
            <button
              onClick={() => onNavigate('studio')}
              className="mt-4 md:mt-0 text-xs font-mono text-[var(--nm-accent)] flex items-center space-x-1 cursor-pointer"
            >
              <span>Create Custom</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SAMPLE_PRESETS.map((preset) => (
              <TiltCard
                key={preset.id}
                className="h-full p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span 
                      className="px-2 py-0.5 rounded-full text-[var(--nm-accent)] text-[10px]"
                      style={{ boxShadow: 'var(--nm-pressed-sm)' }}
                    >
                      {preset.category}
                    </span>
                  </div>

                  <h3 className="text-base font-bold font-mono text-[var(--nm-text-heading)]">
                    {preset.title}
                  </h3>

                  <p className="text-xs text-[var(--nm-text-muted)] line-clamp-3 font-sans">
                    {preset.subject}
                  </p>
                </div>

                <div className="pt-6 mt-4 flex items-center justify-between">
                  <button
                    onClick={() => onNavigate('studio', preset.subject)}
                    className="nm-btn w-full py-2.5 rounded-xl bg-[var(--nm-bg-alt)] hover:bg-[rgba(108,59,170,0.08)] text-[var(--nm-accent)] transition-colors cursor-pointer text-xs font-mono flex items-center justify-center gap-2"
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
