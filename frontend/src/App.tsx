import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppView, VideoGenerationInput, GeneratedShort } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { LandingPage } from './components/LandingPage';
import { VideoStudio } from './components/VideoStudio';
import { ProcessingExperience } from './components/ProcessingExperience';
import { ResultExportPage } from './components/ResultExportPage';
import { AmbientLivingBackground } from './components/AmbientLivingBackground';
import { generateVideoShortStream } from './services/aiService';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [currentInput, setCurrentInput] = useState<VideoGenerationInput>({
    subject: 'Explain Photosynthesis',
    knowledgeBase: '',
    format: '9:16',
    pace: 'explosive',
    voiceStyle: 'energetic',
    visualStyle: '3d_schematic',
  });
  const [generatedResult, setGeneratedResult] = useState<GeneratedShort | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const handleStartGeneration = async (input: VideoGenerationInput) => {
    setCurrentInput(input);
    setGeneratedResult(null);
    setLogs([]);
    setCurrentView('processing');

    generateVideoShortStream(
      input,
      (logLine) => {
        setLogs((prev) => [...prev, logLine]);
      },
      (data) => {
        setGeneratedResult(data);
        setCurrentView('result');
      },
      (errMessage) => {
        console.error('Generation error:', errMessage);
        alert(`Pipeline Execution Error: ${errMessage}`);
        setCurrentView('studio');
      }
    );
  };

  const handleNavigateWithSubject = (view: AppView, subject?: string) => {
    if (subject) {
      setCurrentInput((prev) => ({ ...prev, subject }));
    }
    setCurrentView(view);
  };

  return (
    <div className="relative min-h-screen bg-[#050B16] text-slate-100 font-sans flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden">
      {/* Global Ambient Depth Living Background */}
      <AmbientLivingBackground />

      <Header currentView={currentView} onNavigate={(view) => setCurrentView(view)} />

      <main className="relative z-10 flex-1">
        <AnimatePresence mode="wait">
          {currentView === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
            >
              <LandingPage onNavigate={handleNavigateWithSubject} />
            </motion.div>
          )}

          {currentView === 'studio' && (
            <motion.div
              key="studio"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <VideoStudio
                initialSubject={currentInput.subject}
                onGenerate={handleStartGeneration}
              />
            </motion.div>
          )}

          {currentView === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4 }}
            >
              <ProcessingExperience
                input={currentInput}
                logs={logs}
                generatedData={generatedResult}
                onComplete={() => setCurrentView('result')}
              />
            </motion.div>
          )}

          {currentView === 'result' && generatedResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <ResultExportPage
                shortData={generatedResult}
                onNavigate={(view) => setCurrentView(view)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
