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
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Current Scene Calculation
    const currentScene = shortData.scenes.find(
      (s) => currentTime >= s.timeStart && currentTime <= s.timeEnd
    ) || shortData.scenes[0];

    // Background Grid
    ctx.strokeStyle = '#2a2a4a';
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
      ctx.strokeStyle = '#7c5cbf';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 90, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#6e8efb';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 90, 35, t * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#a78bfa';
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

      ctx.strokeStyle = '#a78bfa';
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
        ctx.fillStyle = idx === 4 ? '#7c5cbf' : '#6e8efb';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 14 + Math.sin(t + idx) * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // Bar Chart / Exponential Curve
      ctx.strokeStyle = '#7c5cbf';
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
      className="min-h-[calc(100vh-4rem)] bg-[var(--nm-bg)] text-[var(--nm-text)] p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Export Header Bar */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[var(--nm-bg)] rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ boxShadow: 'var(--nm-raised)' }}
        >
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-[var(--nm-accent)] uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Media Export Interface</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-[var(--nm-text-heading)]">
              {shortData.title}
            </h1>
          </div>

          {/* Format Switcher Pills */}
          <div 
            className="flex items-center space-x-2 bg-[var(--nm-bg)] p-1 rounded-xl text-xs font-mono"
            style={{ boxShadow: 'var(--nm-pressed-sm)' }}
          >
            {(['9:16', '1:1', '16:9'] as AspectRatioFormat[]).map((f) => (
              <motion.button
                key={f}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedFormat(f)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedFormat === f
                    ? 'text-[var(--nm-accent)] font-bold'
                    : 'text-[var(--nm-text-muted)] hover:text-[var(--nm-text-heading)]'
                }`}
                style={selectedFormat === f ? { boxShadow: 'var(--nm-pressed-sm)' } : undefined}
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
            className="lg:col-span-7 bg-[var(--nm-bg)] rounded-2xl p-6 flex flex-col items-center justify-between space-y-4"
            style={{ boxShadow: 'var(--nm-raised)' }}
          >
            {/* Aspect Ratio Video Container */}
            <div
              className={`relative bg-[#1a1a2e] rounded-2xl overflow-hidden flex flex-col items-center justify-center transition-all duration-300 ${
                selectedFormat === '9:16'
                  ? 'w-[300px] h-[530px]'
                  : selectedFormat === '1:1'
                  ? 'w-[420px] h-[420px]'
                  : 'w-full max-w-[560px] h-[315px]'
              }`}
              style={{ boxShadow: 'var(--nm-pressed)' }}
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
                    <span 
                      className="inline-block px-4 py-2 rounded-xl bg-[var(--nm-bg)] font-mono font-extrabold text-base sm:text-lg text-[var(--nm-accent)] tracking-wide uppercase nm-animate-pulse"
                      style={{ boxShadow: 'var(--nm-raised-sm)' }}
                    >
                      {currentCaptionWord}
                    </span>
                  </div>

                  {/* Brand Watermark Badge */}
                  <div 
                    className="absolute top-4 right-4 px-2.5 py-1 rounded-lg bg-[var(--nm-bg)] text-[10px] font-mono text-[var(--nm-accent)]"
                    style={{ boxShadow: 'var(--nm-pressed-sm)' }}
                  >
                    REELMATION AI
                  </div>
                </>
              )}
            </div>

            {/* Video Playback Controls Bar */}
            {!shortData.videoUrl && (
            <div 
              className="w-full bg-[var(--nm-bg)] rounded-xl p-3 space-y-2 font-mono text-xs"
              style={{ boxShadow: 'var(--nm-raised-sm)' }}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-lg bg-[var(--nm-accent)] text-white transition-colors cursor-pointer nm-btn"
                  style={{ boxShadow: isPlaying ? 'var(--nm-pressed-sm)' : 'var(--nm-raised-sm)' }}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>

                {/* Timeline Scrubber */}
                <div className="flex-1 mx-4 flex items-center space-x-2">
                  <span className="text-[10px] text-[var(--nm-text-muted)]">{currentTime.toFixed(1)}s</span>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(Number(e.target.value))}
                    className="nm-range w-full cursor-pointer"
                  />
                  <span className="text-[10px] text-[var(--nm-text-muted)]">{duration}s</span>
                </div>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg bg-[var(--nm-bg)] text-[var(--nm-text-muted)] hover:text-[var(--nm-text)] cursor-pointer nm-btn"
                  style={{ boxShadow: isMuted ? 'var(--nm-pressed-sm)' : 'var(--nm-raised-sm)' }}
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
              <div 
                className="p-3.5 rounded-xl bg-[var(--nm-bg)]"
                style={{ boxShadow: 'var(--nm-raised-sm)' }}
              >
                <span className="text-[10px] text-[var(--nm-text-muted)] uppercase">Retention Score</span>
                <p className="text-lg font-bold text-[var(--nm-accent)]">
                  <AnimatedCounter value={shortData.retentionScore || 97.2} suffix="%" />
                </p>
              </div>
              <div 
                className="p-3.5 rounded-xl bg-[var(--nm-bg)]"
                style={{ boxShadow: 'var(--nm-raised-sm)' }}
              >
                <span className="text-[10px] text-[var(--nm-text-muted)] uppercase">Processing Time</span>
                <p className="text-lg font-bold text-[var(--nm-accent)]">
                  <AnimatedCounter value={shortData.processingTimeSeconds || 7.4} suffix="s" />
                </p>
              </div>
            </div>

            {/* Side Panel Tabs */}
            <div 
              className="bg-[var(--nm-bg)] rounded-2xl p-5 space-y-4"
              style={{ boxShadow: 'var(--nm-raised)' }}
            >
              <div className="flex pb-2 text-xs font-mono space-x-2">
                <button
                  onClick={() => setActiveTab('script')}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'script'
                      ? 'text-[var(--nm-accent)] font-bold nm-tab active'
                      : 'text-[var(--nm-text-muted)] hover:text-[var(--nm-text)] nm-tab'
                  }`}
                  style={activeTab === 'script' ? { boxShadow: 'var(--nm-pressed-sm)' } : {}}
                >
                  Script Breakdown
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'metadata'
                      ? 'text-[var(--nm-accent)] font-bold nm-tab active'
                      : 'text-[var(--nm-text-muted)] hover:text-[var(--nm-text)] nm-tab'
                  }`}
                  style={activeTab === 'metadata' ? { boxShadow: 'var(--nm-pressed-sm)' } : {}}
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
                      className="p-3 rounded-xl bg-[var(--nm-bg)] text-xs space-y-1.5"
                      style={{ boxShadow: 'var(--nm-raised-sm)' }}
                    >
                      <div className="flex justify-between items-center font-mono text-[10px] text-[var(--nm-accent)]">
                        <span>SCENE 0{scene.sceneIndex}</span>
                        <span>{scene.timeStart}s - {scene.timeEnd}s</span>
                      </div>
                      <p className="text-[var(--nm-text)] font-sans">{scene.narration}</p>
                      <div className="text-[10px] font-mono text-[var(--nm-text-muted)]">
                        Prompt: <span className="text-[var(--nm-text)]">{scene.visualPrompt}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Tab Content 2: Technical Parameters */}
              {activeTab === 'metadata' && (
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-2 border-b border-[var(--nm-bg-dark)]">
                    <span className="text-[var(--nm-text-muted)]">Subject:</span>
                    <span className="text-[var(--nm-text)] truncate max-w-[180px]">{shortData.subject}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--nm-bg-dark)]">
                    <span className="text-[var(--nm-text-muted)]">Duration:</span>
                    <span className="text-[var(--nm-text)]">{shortData.totalDuration} Seconds</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--nm-bg-dark)]">
                    <span className="text-[var(--nm-text-muted)]">Resolution:</span>
                    <span className="text-[var(--nm-text)]">1080x1920 (60 FPS)</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--nm-bg-dark)]">
                    <span className="text-[var(--nm-text-muted)]">Voice Tone:</span>
                    <span className="text-[var(--nm-text)] capitalize">{shortData.voiceStyle}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons with Sequential Spring Motion */}
              <div className="pt-4 space-y-3 font-mono text-xs">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownload}
                  className="w-full py-3.5 rounded-xl text-white font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 nm-btn"
                  style={{ background: 'linear-gradient(135deg, #6c3baa, #4a6cf7)', boxShadow: '4px 4px 12px rgba(108,59,170,0.35), -3px -3px 8px rgba(255,255,255,0.5)' }}
                >
                  <Download className="w-4 h-4" />
                  <span>{downloadSuccess ? 'EXPORT PACKAGE READY!' : 'DOWNLOAD MP4 & ASSETS'}</span>
                </motion.button>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleShare}
                    className="py-2.5 rounded-lg bg-[var(--nm-bg-alt)] text-[var(--nm-text-muted)] hover:text-[var(--nm-accent)] transition-colors cursor-pointer flex items-center justify-center space-x-1.5 nm-btn"
                    style={{ boxShadow: 'var(--nm-raised-sm)' }}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{copiedLink ? 'LINK COPIED' : 'SHARE LINK'}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onNavigate('studio')}
                    className="py-2.5 rounded-lg bg-[var(--nm-bg-alt)] text-[var(--nm-text-muted)] hover:text-[var(--nm-accent)] transition-colors cursor-pointer flex items-center justify-center space-x-1.5 nm-btn"
                    style={{ boxShadow: 'var(--nm-raised-sm)' }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
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
