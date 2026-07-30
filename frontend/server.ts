import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { exec } from 'child_process';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: 'Reelmation Pipeline v1.0',
    stack: 'Gemini + ComfyUI + Edge-TTS + Remotion',
    timestamp: new Date().toISOString(),
  });
});

// Primary Video Generation API Endpoint
// Executes the Python pipeline (main.py) and returns the generated manifest + video URL
app.post('/api/generate-short', async (req, res) => {
  const { subject, format = '9:16', voiceStyle = 'energetic', visualStyle = '3d_schematic' } = req.body;

  if (!subject) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  try {
    console.log(`\n[Reelmation] Starting Python pipeline for: "${subject}"`);
    const startTime = Date.now();
    
    // Execute the python pipeline
    const cmd = `./venv/bin/python main.py "${subject}" --no-cache`;
    
    const execPromise = new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
      exec(cmd, { cwd: path.join(process.cwd(), '..'), maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
           console.error("[Reelmation] Pipeline error:", error.message);
           console.error("[Reelmation] Stderr:", stderr);
           reject(error);
        }
        else resolve({ stdout, stderr });
      });
    });
    
    const { stdout } = await execPromise;
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Reelmation] Pipeline completed in ${elapsedSeconds}s`);

    // Parse the output path from stdout
    const match = stdout.match(/output\/([^\/]+\/reel\.mp4)/);
    if (!match) {
      throw new Error("Could not find output mp4 path in python stdout");
    }
    
    const relativeMp4Path = match[1];
    const runDirName = relativeMp4Path.split('/')[0];
    
    // Read the generated manifest
    const manifestPath = path.join(process.cwd(), '..', 'output', runDirName, 'reel_manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifestData = JSON.parse(manifestContent);

    // Extract real data from manifest
    const sentences = manifestData.sentences || [];
    const totalFrames = manifestData.total_frames || 0;
    const metadataScore = manifestData.metadata_score || { total: 0, grade: 'N/A' };
    const hookAnalysis = manifestData.hook_analysis || {};

    // Map manifest sentences to frontend scene format
    const scenes = sentences.map((item: any, idx: number) => ({
      sceneIndex: idx + 1,
      timeStart: item.start_frame / 30,
      timeEnd: item.end_frame / 30,
      narration: item.text,
      visualPrompt: item.image_prompt || "",
      keywords: [],
      visualType: "schematic",
      wordCaptions: item.words ? item.words.map((w: any) => ({
        text: w.text,
        start: w.start_frame / 30,
        end: w.end_frame / 30
      })) : []
    }));
    
    return res.json({
      success: true,
      data: {
        id: `reel-${Date.now()}`,
        subject,
        title: manifestData.title || subject,
        hookText: hookAnalysis.best?.text || (scenes.length > 0 ? scenes[0].narration : ""),
        knowledgeSummary: `Educational reel on ${subject}`,
        aspectRatio: format,
        voiceStyle,
        visualStyle,
        createdAt: new Date().toISOString(),
        processingTimeSeconds: parseFloat(elapsedSeconds),
        hookScore: hookAnalysis.best?.score?.total || 0,
        retentionScore: metadataScore.total || 0,
        algorithmicScore: metadataScore.total || 0,
        totalDuration: totalFrames / 30,
        scenes,
        videoUrl: `/reels/${relativeMp4Path}`
      }
    });

  } catch (err: any) {
    console.error('[Reelmation] Pipeline error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Python pipeline failed',
    });
  }
});

// Vite Dev Middleware or Static File Serving for Production
async function startServer() {
  // Serve generated output files (mp4, images, etc.)
  app.use('/reels', express.static(path.join(process.cwd(), '../output')));
  
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎬 Reelmation Server active on http://0.0.0.0:${PORT}`);
    console.log(`   Stack: Gemini AI + ComfyUI + Edge-TTS + Remotion`);
    console.log(`   Output: ../output/ served at /reels/\n`);
  });
}

startServer();
