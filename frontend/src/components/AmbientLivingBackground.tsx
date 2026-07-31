import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export const AmbientLivingBackground: React.FC = () => {
  const { scrollY } = useScroll();

  // Parallax shifts for subtle background depth layers
  const yLayer1 = useTransform(scrollY, [0, 2000], [0, -50]);
  const yLayer2 = useTransform(scrollY, [0, 2000], [0, -100]);
  const rotateGlow = useTransform(scrollY, [0, 2000], [0, 20]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[var(--nm-bg)]">
      {/* Layer 1: Ambient Glowing Radial Flares */}
      <motion.div
        style={{ y: yLayer1, rotate: rotateGlow }}
        className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full blur-[140px] opacity-70"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="w-full h-full rounded-full bg-gradient-to-br from-[#f5f5fa] to-transparent" />
      </motion.div>

      <motion.div
        style={{ y: yLayer2 }}
        className="absolute bottom-[-10%] right-[15%] w-[700px] h-[700px] rounded-full blur-[160px] opacity-70"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      >
        <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#d5dbe5] to-transparent" />
      </motion.div>
    </div>
  );
};
