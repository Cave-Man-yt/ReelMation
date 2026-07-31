import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
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

// Real-Time Streaming Generation Endpoint (Server-Sent Events)
app.post('/api/generate-short-stream', async (req, res) => {
  const { subject, format = '9:16', voiceStyle = 'energetic', visualStyle = '3d_schematic', knowledgeBase } = req.body;

  if (!subject) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, payload: any) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  const rootDir = path.join(process.cwd(), '..');
  console.log(`\n============================================================`);
  console.log(`🎬 REELMATION API: Starting Python Pipeline for "${subject}"`);
  if (knowledgeBase) {
    console.log(`🧠 Including Knowledge Base: ${knowledgeBase.substring(0, 50)}...`);
  }
  console.log(`============================================================\n`);

  const startTime = Date.now();
  let stdoutAcc = '';

  const pythonArgs = ['main.py', subject, '--no-cache'];
  if (knowledgeBase) {
    pythonArgs.push('--knowledge', knowledgeBase);
  }

  // Spawn python process unbuffered
  const pythonProc = spawn('./venv/bin/python', pythonArgs, {
    cwd: rootDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  pythonProc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutAcc += text;
    // 1. Output live to server terminal
    process.stdout.write(text);
    
    // 2. Stream line-by-line to web app
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        sendEvent('log', line);
      }
    }
  });

  pythonProc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        sendEvent('log', `[INFO] ${line}`);
      }
    }
  });

  pythonProc.on('error', (err) => {
    console.error('\n❌ Failed to start Python process:', err);
    sendEvent('error', `Failed to start Python process: ${err.message}`);
    res.end();
  });

  pythonProc.on('close', async (code) => {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (code !== 0) {
      console.error(`\n❌ Python process exited with code ${code}`);
      sendEvent('error', `Pipeline execution failed (exit code ${code})`);
      res.end();
      return;
    }

    try {
      console.log(`\n✅ Python pipeline completed in ${elapsedSeconds}s. Parsing output manifest...`);
      
      const match = stdoutAcc.match(/output\/([^\/]+\/reel\.mp4)/);
      if (!match) {
        throw new Error("Could not find output mp4 path in python stdout");
      }
      
      const relativeMp4Path = match[1];
      const runDirName = relativeMp4Path.split('/')[0];
      const manifestPath = path.join(rootDir, 'output', runDirName, 'reel_manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifestData = JSON.parse(manifestContent);

      const sentences = manifestData.sentences || [];
      const totalFrames = manifestData.total_frames || 0;
      const metadataScore = manifestData.metadata_score || { total: 0, grade: 'N/A' };
      const hookAnalysis = manifestData.hook_analysis || {};

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

      const resultPayload = {
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
      };

      sendEvent('complete', resultPayload);
      res.end();
    } catch (err: any) {
      console.error('\n❌ Error parsing manifest output:', err);
      sendEvent('error', `Failed to parse generated video manifest: ${err.message}`);
      res.end();
    }
  });
});

// Vite Dev Middleware or Static File Serving for Production
async function startServer() {
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
