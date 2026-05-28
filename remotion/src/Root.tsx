import "./index.css";
import { Composition } from "remotion";
import { ReelComposition, ReelProps } from "./ReelComposition";
import { SubtitleItem } from "./components/SubtitlesOverlay";

const defaultBrolls = [
  { url: "images/scene_001.png", durationInFrames: 90, act: 1 },
  { url: "images/scene_002.png", durationInFrames: 90, act: 2 },
  { url: "images/scene_003.png", durationInFrames: 90, act: 2 },
  { url: "images/scene_004.png", durationInFrames: 90, act: 3 },
];

const defaultSubtitles: SubtitleItem[] = [
  {
    text: "Welcome to the magic of AI storytelling.",
    startFrame: 0,
    endFrame: 60,
    act: 1,
    words: [
      { text: "Welcome", startFrame: 0, endFrame: 8 },
      { text: "to", startFrame: 8, endFrame: 12 },
      { text: "the", startFrame: 12, endFrame: 17 },
      { text: "magic", startFrame: 17, endFrame: 26 },
      { text: "of", startFrame: 26, endFrame: 30 },
      { text: "AI", startFrame: 30, endFrame: 38 },
      { text: "storytelling", startFrame: 38, endFrame: 60 },
    ],
  },
  {
    text: "Every shadow hides a deep, untold secret...",
    startFrame: 60,
    endFrame: 150,
    act: 2,
    words: [
      { text: "Every", startFrame: 60, endFrame: 72 },
      { text: "shadow", startFrame: 72, endFrame: 85 },
      { text: "hides", startFrame: 85, endFrame: 97 },
      { text: "a", startFrame: 97, endFrame: 102 },
      { text: "deep", startFrame: 102, endFrame: 112 },
      { text: "untold", startFrame: 112, endFrame: 127 },
      { text: "secret", startFrame: 127, endFrame: 150 },
    ],
  },
  {
    text: "What lies beyond the misty mountains?",
    startFrame: 150,
    endFrame: 240,
    act: 2,
    words: [
      { text: "What", startFrame: 150, endFrame: 163 },
      { text: "lies", startFrame: 163, endFrame: 177 },
      { text: "beyond", startFrame: 177, endFrame: 192 },
      { text: "the", startFrame: 192, endFrame: 202 },
      { text: "misty", startFrame: 202, endFrame: 218 },
      { text: "mountains", startFrame: 218, endFrame: 240 },
    ],
  },
  {
    text: "Let's explore it together.",
    startFrame: 240,
    endFrame: 360,
    act: 3,
    words: [
      { text: "Lets", startFrame: 240, endFrame: 268 },
      { text: "explore", startFrame: 268, endFrame: 300 },
      { text: "it", startFrame: 300, endFrame: 320 },
      { text: "together", startFrame: 320, endFrame: 360 },
    ],
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReelComposition"
        component={ReelComposition as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          audioUrl: "",
          brollImages: defaultBrolls,
          subtitles: defaultSubtitles,
        } as ReelProps}
        calculateMetadata={async ({ props }) => {
          const p = props as Record<string, unknown>;
          if (p.totalFrames && typeof p.totalFrames === 'number') {
            return {
              durationInFrames: p.totalFrames as number,
            };
          }
          return {};
        }}
      />
    </>
  );
};
