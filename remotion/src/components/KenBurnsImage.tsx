import React from "react";
import { interpolate, useCurrentFrame, Img } from "remotion";

interface KenBurnsImageProps {
  url: string;
  durationInFrames: number;
  act?: number;
}

const actFilters: Record<number, string> = {
  1: "brightness(0.90) contrast(1.02) saturate(1.05)",  // Act 1: slightly warm, natural — "establishing"
  2: "brightness(0.72) contrast(1.18) saturate(0.75)",  // Act 2: dark, contrasty, desaturated — "tension"
  3: "brightness(0.95) contrast(1.00) saturate(1.15)",  // Act 3: bright, vivid — "resolution"
};

export const KenBurnsImage: React.FC<KenBurnsImageProps> = ({ url, durationInFrames, act = 1 }) => {
  const frame = useCurrentFrame();

  // Slow zoom effect from 1.0 to 1.12
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1.0, 1.12],
    {
      extrapolateRight: "clamp",
    }
  );

  // Subtle pan effect
  const translateX = interpolate(
    frame,
    [0, durationInFrames],
    [0, -15],
    {
      extrapolateRight: "clamp",
    }
  );

  const translateY = interpolate(
    frame,
    [0, durationInFrames],
    [0, -10],
    {
      extrapolateRight: "clamp",
    }
  );

  const filter = actFilters[act] ?? "brightness(0.85) contrast(1.05)";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#0d0d0d",
      }}
    >
      <Img
        src={url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center center",
          filter,
        }}
        alt="B-roll sequence"
      />
    </div>
  );
};
