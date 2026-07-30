import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GeneratedShort, AppView, AspectRatioFormat } from '../types';
import {
  Play,
  Pause,
  Download,
  Share2,
  RotateCcw,
  Home,
  Check,
  Maximize2,
  Volume2,
  VolumeX,
  Sparkles,
  Layers,
  FileText,
  Clock,
  TrendingUp,
  Sliders,
  Copy
} from 'lucide-react';

interface ResultExportPageProps {
  shortData: GeneratedShort;
  onNavigate: (view: AppView) => void;
}

// Animated Counter Helper for smooth stats count-up
const AnimatedCounter: React.FC<{ value: number; suffix?: string; decimals?: number }> = ({ value, suffix = '', decimals = 1 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1200; // ms
    const stepTime = 16; // ~60fps
    const steps = duration / stepTime;
    const increment = value / steps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{count.toFixed(decimals)}{suffix}</span>;
};

export const ResultExportPage: React.FC<ResultExportPageProps> = ({ shortData, onNavigate }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<AspectRatioFormat>(shortData.aspectRatio || '9:16');
  const [activeTab, setActiveTab] = useState<'script' | 'metadata' | 'export'>('script');
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = shortData.totalDuration || 42;

  // Playback timer & Canvas Animation
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  // Dynamic Scene Drawing on HTML5 Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#050B16';
    ctx.fillRect(0, 0, width, height);

    // Current Scene Calculation
    const currentScene = shortData.scenes.find(
      (s) => currentTime >= s.timeStart && currentTime <= s.timeEnd
    ) || shortData.scenes[0];

    // Background Grid
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw Visual Based on Scene Type
    const t = currentTime * 2;
    const centerX = width / 2;
    const centerY = height / 2 - 40;

    if (currentScene.visualType === 'schematic' || currentScene.visualType === 'atom') {
      // Spinning Bloch Sphere / Qubit Atom
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00F0FF';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 90, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#8B5CF6';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 90, 35, t * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(centerX + Math.cos(t) * 90, centerY + Math.sin(t) * 35, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentScene.visualType === 'network') {
      // 3D Neural Lattice
      const nodes = [
        { x: centerX - 80, y: centerY - 60 },
        { x: centerX + 70, y: centerY - 80 },
        { x: centerX + 90, y: centerY + 60 },
        { x: centerX - 60, y: centerY + 80 },
        { x: centerX, y: centerY }
      ];

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }

      nodes.forEach((n, idx) => {
        ctx.fillStyle = idx === 4 ? '#00F0FF' : '#8B5CF6';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 14 + Math.sin(t + idx) * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // Bar Chart / Exponential Curve
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(centerX - 100, centerY + 80);
      ctx.quadraticCurveTo(centerX, centerY + 60, centerX + 100, centerY - 80);
      ctx.stroke();
    }
  }, [currentTime, shortData]);

  // Current Scene & Active Spoken Word Caption Calculation
  const currentScene = shortData.scenes.find(
    (s) => currentTime >= s.timeStart && currentTime <= s.timeEnd
  ) || shortData.scenes[0];

  const currentCaptionWord = currentScene?.wordCaptions?.find(
    (w) => currentTime >= w.start && currentTime <= w.end
  )?.text || currentScene?.narration || '';

  const handleDownload = () => {
    if (shortData.videoUrl) {
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", shortData.videoUrl);
      downloadAnchor.setAttribute("download", `Reelmation-${shortData.title.replace(/\s+/g, '_')}.mp4`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      // Generate text/json export artifact file
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(shortData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Reelmation-${shortData.title.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-[calc(100vh-4rem)] bg-[#050B16] text-slate-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Export Header Bar */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl shadow-2xl"
        >
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Media Export Interface</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-white">
              {shortData.title}
            </h1>
          </div>

          {/* Format Switcher Pills */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-mono">
            {(['9:16', '1:1', '16:9'] as AspectRatioFormat[]).map((f) => (
              <motion.button
                key={f}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedFormat(f)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedFormat === f
                    ? 'bg-cyan-950 border border-cyan-600 text-cyan-300 font-bold shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Main Export Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left/Center: Video Player Viewport (Expands Into View) */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 bg-slate-950/90 border border-slate-800/90 rounded-2xl p-6 flex flex-col items-center justify-between space-y-4 shadow-2xl backdrop-blur-xl"
          >
            {/* Aspect Ratio Video Container */}
            <div
              className={`relative bg-black rounded-2xl border border-slate-800 overflow-hidden flex flex-col items-center justify-center transition-all duration-300 ${
                selectedFormat === '9:16'
                  ? 'w-[300px] h-[530px]'
                  : selectedFormat === '1:1'
                  ? 'w-[420px] h-[420px]'
                  : 'w-full max-w-[560px] h-[315px]'
              }`}
            >
              {/* Dynamic Scene Canvas or MP4 Video */}
              {shortData.videoUrl ? (
                <video src={shortData.videoUrl} autoPlay loop controls className="w-full h-full object-cover" />
              ) : (
                <>
                  <canvas
                    ref={canvasRef}
                    width={selectedFormat === '9:16' ? 300 : selectedFormat === '1:1' ? 420 : 560}
                    height={selectedFormat === '9:16' ? 530 : selectedFormat === '1:1' ? 420 : 315}
                    className="w-full h-full object-cover"
                  />

                  {/* TikTok / Shorts Kinetic Subtitle Overlay */}
                  <div className="absolute bottom-12 inset-x-4 text-center pointer-events-none">
                    <span className="inline-block px-4 py-2 rounded-xl bg-slate-950/80 backdrop-blur-md border border-cyan-500/80 font-mono font-extrabold text-base sm:text-lg text-cyan-300 shadow-2xl tracking-wide uppercase animate-pulse">
                      {currentCaptionWord}
                    </span>
                  </div>

                  {/* Brand Watermark Badge */}
                  <div className="absolute top-4 right-4 px-2.5 py-1 rounded bg-slate-950/70 border border-slate-800 text-[10px] font-mono text-cyan-400 backdrop-blur-sm">
                    REELMATION AI
                  </div>
                </>
              )}
            </div>

            {/* Video Playback Controls Bar */}
            {!shortData.videoUrl && (
            <div className="w-full bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-300 hover:bg-cyan-900 transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>

                {/* Timeline Scrubber */}
                <div className="flex-1 mx-4 flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400">{currentTime.toFixed(1)}s</span>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">{duration}s</span>
                </div>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}
          </motion.div>

          {/* Right Side Panel: Metadata, Script & Actions (Slides In From Right) */}
          <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 space-y-6"
          >
            {/* Metadata Metric Cards with Count-Up Animations */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-lg">
                <span className="text-[10px] text-slate-400 uppercase">Retention Score</span>
                <p className="text-lg font-bold text-emerald-400">
                  <AnimatedCounter value={shortData.retentionScore || 97.2} suffix="%" />
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-lg">
                <span className="text-[10px] text-slate-400 uppercase">Processing Time</span>
                <p className="text-lg font-bold text-cyan-400">
                  <AnimatedCounter value={shortData.processingTimeSeconds || 7.4} suffix="s" />
                </p>
              </div>
            </div>

            {/* Side Panel Tabs */}
            <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-4 backdrop-blur-xl shadow-2xl">
              <div className="flex border-b border-slate-800 pb-2 text-xs font-mono space-x-4">
                <button
                  onClick={() => setActiveTab('script')}
                  className={`pb-2 transition-all cursor-pointer ${
                    activeTab === 'script'
                      ? 'border-b-2 border-cyan-400 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Script Breakdown
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`pb-2 transition-all cursor-pointer ${
                    activeTab === 'metadata'
                      ? 'border-b-2 border-cyan-400 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Parameters
                </button>
              </div>

              {/* Tab Content 1: Script & Storyboard */}
              {activeTab === 'script' && (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {shortData.scenes.map((scene, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex justify-between items-center font-mono text-[10px] text-cyan-400">
                        <span>SCENE 0{scene.sceneIndex}</span>
                        <span>{scene.timeStart}s - {scene.timeEnd}s</span>
                      </div>
                      <p className="text-slate-200 font-sans">{scene.narration}</p>
                      <div className="text-[10px] font-mono text-slate-400">
                        Prompt: <span className="text-slate-300">{scene.visualPrompt}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Tab Content 2: Technical Parameters */}
              {activeTab === 'metadata' && (
                <div className="space-y-2 text-xs font-mono text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">Subject:</span>
                    <span className="truncate max-w-[180px]">{shortData.subject}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">Duration:</span>
                    <span>{shortData.totalDuration} Seconds</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">Resolution:</span>
                    <span>1080x1920 (60 FPS)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">Voice Tone:</span>
                    <span className="capitalize">{shortData.voiceStyle}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons with Sequential Spring Motion */}
              <div className="pt-4 space-y-3 font-mono text-xs">
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownload}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloadSuccess ? 'EXPORT PACKAGE READY!' : 'DOWNLOAD MP4 & ASSETS'}</span>
                </motion.button>

                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleShare}
                    className="py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{copiedLink ? 'LINK COPIED' : 'SHARE LINK'}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onNavigate('studio')}
                    className="py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-violet-400" />
                    <span>CREATE NEW</span>
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
