import React from "react";
import { spring, interpolate, useVideoConfig, useCurrentFrame } from "remotion";

export interface SubtitleWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface SubtitleItem {
  text: string;
  startFrame: number;
  endFrame: number;
  act?: number;
  words: SubtitleWord[];
}

interface SubtitlesOverlayProps {
  subtitles: SubtitleItem[];
}

const actColors: Record<number, string> = {
  1: "#FFFFFF", // Act 1: Pure White
  2: "#FFB830", // Act 2: Warm Amber
  3: "#4FFFB0", // Act 3: Bright Teal/Mint
};

export const SubtitlesOverlay: React.FC<SubtitlesOverlayProps> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find the active sentence-level subtitle item
  const activeSub = subtitles.find(
    (sub) => frame >= sub.startFrame && frame < sub.endFrame
  );

  let activeWord = "";
  let wordStartFrame = 0;

  if (activeSub) {
    const wordEntry = activeSub.words.find(
      (w) => frame >= w.startFrame && frame < w.endFrame
    );
    if (wordEntry) {
      activeWord = wordEntry.text;
      wordStartFrame = wordEntry.startFrame;
    }
  }

  // SNAPPY SCALE POP SPRING ANIMATION
  // Instead of static time-based CSS keyframe animation, we use Remotion's frame-based spring physics.
  const relativeFrame = frame - wordStartFrame;
  const springVal = spring({
    frame: relativeFrame,
    fps,
    config: {
      damping: 12,
      stiffness: 150,
      mass: 0.3,
    },
  });
  const scale = interpolate(springVal, [0, 1], [0.85, 1.0]);
  const color = actColors[activeSub?.act ?? 1] ?? "#FFFFFF";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        // Position in the lower-middle "sweet spot" (not dead center, and clear of bottom IG overlay)
        alignItems: "flex-end",
        paddingBottom: "520px", // Pushes the text up just enough to avoid the Instagram UI overlay
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Subtitles Container - Constrained to 5:4 ratio area (960px width x 768px height) */}
      <div
        style={{
          width: "960px",
          height: "768px", // Strict 5:4 ratio
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          // Completely transparent background (removed glassmorphic card)
          backgroundColor: "transparent",
        }}
      >
        {activeWord && (
          <div
            style={{
              color,
              fontSize: "96px", // Massive, modern ultra-bold single-word font size
              fontWeight: 900,
              fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
              textAlign: "center",
              textTransform: "uppercase", // Trendy all-caps single-word styling
              letterSpacing: "1.5px",
              // Premium high-contrast drop shadow for perfect readability on any image/video background
              textShadow:
                "0 8px 24px rgba(0, 0, 0, 0.9), 0 4px 12px rgba(0, 0, 0, 0.9), 0 2px 4px rgba(0, 0, 0, 0.9)",
              transform: `scale(${scale})`,
            }}
          >
            {activeWord}
          </div>
        )}
      </div>
    </div>
  );
};
