import React from "react";
import { Audio, Series, staticFile } from "remotion";
import { KenBurnsImage } from "./components/KenBurnsImage";
import { SubtitlesOverlay, SubtitleItem } from "./components/SubtitlesOverlay";
import { ProgressBar } from "./components/ProgressBar";

export interface BrollImageItem {
  url: string;
  durationInFrames: number;
  act?: number;
}

export interface ReelProps {
  audioUrl?: string;
  brollImages: BrollImageItem[];
  subtitles: SubtitleItem[];
  totalFrames?: number;
}

function resolveUrl(url: string): string {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return staticFile(url);
}

export const ReelComposition: React.FC<ReelProps> = ({
  audioUrl,
  brollImages,
  subtitles,
  totalFrames,
}) => {
  // Compute total frames if not explicitly passed
  const calculatedTotalFrames = totalFrames || 
    subtitles.reduce((max, s) => Math.max(max, s.endFrame), 0) || 
    brollImages.reduce((sum, b) => sum + b.durationInFrames, 0) || 
    300; // sensible default fallback (10s at 30fps)

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#000000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 1. Background narration audio */}
      {audioUrl && <Audio src={resolveUrl(audioUrl)} />}

      {/* 2. B-roll image layer with smooth transitions */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <Series>
          {brollImages.map((broll, index) => (
            <Series.Sequence
              key={index}
              durationInFrames={broll.durationInFrames}
            >
              <KenBurnsImage
                url={resolveUrl(broll.url)}
                durationInFrames={broll.durationInFrames}
                act={broll.act}
              />
            </Series.Sequence>
          ))}
        </Series>
      </div>

      {/* Vignette Overlay: Directs focus to center & darkens peripheral edges (cinematic look) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0, 0, 0, 0.55) 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Progress Bar: Ultra-thin retention element at the top edge */}
      <ProgressBar
        totalFrames={calculatedTotalFrames}
        subtitles={subtitles}
      />

      {/* 3. Subtitles overlay card (centered, 5:4 ratio container) */}
      <SubtitlesOverlay subtitles={subtitles} />
    </div>
  );
};
