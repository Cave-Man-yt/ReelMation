import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

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

interface ProgressBarProps {
  totalFrames: number;
  subtitles: SubtitleItem[];
}

const actThemes: Record<number, { gradient: string; glow: string; color: string }> = {
  1: {
    gradient: "linear-gradient(90deg, #D6D6D6 0%, #FFFFFF 100%)",
    color: "#FFFFFF",
    glow: "rgba(255, 255, 255, 0.9)",
  },
  2: {
    gradient: "linear-gradient(90deg, #FF7B00 0%, #FFB830 100%)",
    color: "#FFB830",
    glow: "rgba(255, 184, 48, 0.9)",
  },
  3: {
    gradient: "linear-gradient(90deg, #00B5B5 0%, #4FFFB0 100%)",
    color: "#4FFFB0",
    glow: "rgba(79, 255, 176, 0.9)",
  },
};

export const ProgressBar: React.FC<ProgressBarProps> = ({ totalFrames, subtitles }) => {
  const frame = useCurrentFrame();

  // Determine the active act based on current frame in subtitles
  const activeSub = subtitles.find(
    (sub) => frame >= sub.startFrame && frame < sub.endFrame
  );

  // Fallback act determination if frame is outside any specific subtitle frame range
  let act = 1;
  if (activeSub?.act) {
    act = activeSub.act;
  } else {
    const ratio = frame / Math.max(totalFrames, 1);
    if (ratio < 1.0 / 3.0) {
      act = 1;
    } else if (ratio < 2.0 / 3.0) {
      act = 2;
    } else {
      act = 3;
    }
  }

  const theme = actThemes[act] ?? actThemes[1];

  const percent = interpolate(frame, [0, totalFrames], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "1080px", // Strict canvas width
        height: "4px", // Premium thin height
        backgroundColor: "rgba(0, 0, 0, 0.25)",
        zIndex: 30, // Keeps it at the absolute top layer
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${percent}%`,
          background: theme.gradient,
          position: "relative",
        }}
      >
        {/* Leading edge subtle glow */}
        {percent > 0 && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "-2px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: theme.color,
              boxShadow: `0 0 8px ${theme.glow}, 0 0 16px ${theme.glow}`,
              transform: "translateX(50%)",
            }}
          />
        )}
      </div>
    </div>
  );
};
