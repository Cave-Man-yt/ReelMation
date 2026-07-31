/**
 * logParser.ts — Parses raw SSE log lines from the Python pipeline
 * into structured state for the loading screen UI.
 * 
 * Zero backend changes — all parsing is done client-side from existing
 * SSE `type: 'log'` events streamed by server.ts.
 */

export interface ParsedPipelineState {
  currentPhase: number;          // 1-5
  phaseName: string;             // Human-readable phase name
  storyTitle: string | null;
  sentences: string[];           // Extracted script sentences
  characters: string[];          // Character names
  imageProgress: { done: number; total: number };
  hookText: string | null;
  scoreGrade: string | null;
  scoreTotal: number | null;
  isRendering: boolean;
  isComplete: boolean;
  recentEvents: string[];        // Last N meaningful log lines (cleaned up)
}

const INITIAL_STATE: ParsedPipelineState = {
  currentPhase: 0,
  phaseName: 'Initializing Pipeline',
  storyTitle: null,
  sentences: [],
  characters: [],
  imageProgress: { done: 0, total: 0 },
  hookText: null,
  scoreGrade: null,
  scoreTotal: null,
  isRendering: false,
  isComplete: false,
  recentEvents: [],
};

const MAX_RECENT_EVENTS = 12;

// Phase detection patterns
const PHASE_PATTERNS: Array<{ regex: RegExp; phase: number; name: string }> = [
  { regex: /STEP\s*1.*Script|Generating Script/i, phase: 1, name: 'Generating Script via AI' },
  { regex: /STEP\s*2.*Voice|Voiceover|Timestamps/i, phase: 2, name: 'Synthesizing Voiceover' },
  { regex: /STEP\s*3.*Image|Scene Images/i, phase: 3, name: 'Generating Scene Images' },
  { regex: /STEP\s*4(?!\.5).*Manifest|Building.*Manifest/i, phase: 4, name: 'Building Reel Manifest' },
  { regex: /STEP\s*4\.5.*Scor|Metadata.*Scor/i, phase: 4, name: 'Scoring Metadata' },
  { regex: /STEP\s*5.*Render|Rendering.*Video/i, phase: 5, name: 'Rendering Final Video' },
];

// Lines to skip (noise / formatting)
const SKIP_PATTERNS = [
  /^[+=\-─]{4,}$/,       // Pure separator lines
  /^\s*$/,                // Empty lines
  /^\|\s*$/,              // Table borders only
  /^[+|]\s*[=\-]+/,      // Box drawing lines
];

/**
 * Creates a new pipeline state parser.
 * Call `parseLine(line)` for each incoming SSE log line.
 * Read `.state` to get the current parsed state.
 */
export function createPipelineParser() {
  const state: ParsedPipelineState = { ...INITIAL_STATE };

  function parseLine(rawLine: string): ParsedPipelineState {
    const line = rawLine.trim();
    if (!line) return state;

    // Skip pure formatting lines
    if (SKIP_PATTERNS.some(p => p.test(line))) return state;

    // Strip [INFO] prefix from stderr lines
    const cleanLine = line.replace(/^\[INFO\]\s*/, '');

    // 1. Phase detection
    for (const { regex, phase, name } of PHASE_PATTERNS) {
      if (regex.test(cleanLine)) {
        state.currentPhase = phase;
        state.phaseName = name;
        addEvent(`🔄 ${name}`);
        return state;
      }
    }

    // 2. Story title extraction
    const titleMatch = cleanLine.match(/Script:\s*'([^']+)'/);
    if (titleMatch) {
      state.storyTitle = titleMatch[1];
      addEvent(`📝 Title: "${titleMatch[1]}"`);
      return state;
    }

    // 3. Script sentence extraction (numbered lines like "  1. Sentence text...")
    const sentenceMatch = cleanLine.match(/^\s*(\d{1,2})\.\s*(?:\[.*?\])?\s*(.{15,})/);
    if (sentenceMatch && state.currentPhase <= 1) {
      const sentenceText = sentenceMatch[2].trim();
      // Avoid duplicates
      if (!state.sentences.includes(sentenceText)) {
        state.sentences.push(sentenceText);
        addEvent(`📖 Scene ${state.sentences.length}: "${sentenceText.slice(0, 60)}${sentenceText.length > 60 ? '...' : ''}"`);
      }
      return state;
    }

    // 4. Character extraction
    const charMatch = cleanLine.match(/👤\s*(.+?)\s*\(/);
    if (charMatch) {
      state.characters.push(charMatch[1].trim());
      addEvent(`👤 Character: ${charMatch[1].trim()}`);
      return state;
    }

    // 5. Image generation progress
    const imageMatch = cleanLine.match(/(?:✅|⚠️|⏭️)\s*Scene\s*(\d+)\s*\/\s*(\d+)/i);
    if (imageMatch) {
      state.imageProgress.done = parseInt(imageMatch[1]);
      state.imageProgress.total = parseInt(imageMatch[2]);
      addEvent(`🖼️ Image ${imageMatch[1]}/${imageMatch[2]} generated`);
      return state;
    }

    // ComfyUI progress
    const comfyMatch = cleanLine.match(/Progress:\s*(\d+)%/);
    if (comfyMatch) {
      addEvent(`⚙️ ComfyUI rendering: ${comfyMatch[1]}%`);
      return state;
    }

    // 6. Hook text extraction
    const hookMatch = cleanLine.match(/Hook.*?:\s*"(.+?)"/i) || cleanLine.match(/best.*?text.*?:\s*"(.+?)"/i);
    if (hookMatch) {
      state.hookText = hookMatch[1];
      addEvent(`🪝 Hook: "${hookMatch[1].slice(0, 50)}..."`);
      return state;
    }

    // 7. Score/Grade extraction
    const gradeMatch = cleanLine.match(/Grade:\s*([A-F][+\-]?)/i);
    if (gradeMatch) {
      state.scoreGrade = gradeMatch[1];
      addEvent(`📊 Grade: ${gradeMatch[1]}`);
      return state;
    }

    const totalMatch = cleanLine.match(/TOTAL\s*\|\s*(\d+)/);
    if (totalMatch) {
      state.scoreTotal = parseInt(totalMatch[1]);
      return state;
    }

    // 8. Rendering detection
    if (/Rendering\s+\d+\s+frames/i.test(cleanLine)) {
      state.isRendering = true;
      addEvent('🎬 Rendering video frames...');
      return state;
    }

    // 9. Render complete
    if (/Render complete/i.test(cleanLine)) {
      state.isComplete = true;
      addEvent('✅ Render complete!');
      return state;
    }

    // 10. Manifest info
    const manifestMatch = cleanLine.match(/Manifest:\s*(\d+)\s*sentences,\s*(\d+)\s*frames/);
    if (manifestMatch) {
      addEvent(`🧩 Manifest: ${manifestMatch[1]} sentences, ${manifestMatch[2]} frames`);
      return state;
    }

    // 11. Cached script
    if (/cached script|Using cached/i.test(cleanLine)) {
      addEvent('💾 Using cached script');
      return state;
    }

    // 12. Audio duration warnings
    if (/Audio is very short|Audio is very long/i.test(cleanLine)) {
      addEvent(`⚠️ ${cleanLine.replace(/^\s*/, '')}`);
      return state;
    }

    // 13. Generic meaningful lines (with emojis or known keywords)
    if (/[📂💾📁📄⚡📹📐⏱️💾🤖🎤🖼️🧩🎬📊✅❌⚠️♻️]/.test(cleanLine) || 
        /Script saved|Copied|Props saved|saved/i.test(cleanLine)) {
      addEvent(cleanLine.replace(/^\s+/, '').slice(0, 80));
    }

    return state;
  }

  function addEvent(text: string) {
    state.recentEvents.push(text);
    if (state.recentEvents.length > MAX_RECENT_EVENTS) {
      state.recentEvents.shift();
    }
  }

  /**
   * Calculate overall progress (0-1) from the current phase and sub-progress.
   */
  function getProgress(): number {
    const phaseWeight = state.currentPhase / 5;
    
    // Sub-progress within phase
    let subProgress = 0;
    if (state.currentPhase === 3 && state.imageProgress.total > 0) {
      subProgress = state.imageProgress.done / state.imageProgress.total;
    } else if (state.currentPhase === 1 && state.sentences.length > 0) {
      subProgress = Math.min(state.sentences.length / 12, 1);
    } else if (state.isRendering) {
      subProgress = 0.5;
    } else if (state.isComplete) {
      subProgress = 1;
    }

    return Math.min(phaseWeight + subProgress * 0.2, 1);
  }

  return {
    get state() { return state; },
    parseLine,
    getProgress,
  };
}
