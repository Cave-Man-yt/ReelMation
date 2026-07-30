import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export const AmbientLivingBackground: React.FC = () => {
  const { scrollY } = useScroll();
  
  // Parallax shifts for subtle background depth layers
  const yLayer1 = useTransform(scrollY, [0, 2000], [0, -150]);
  const yLayer2 = useTransform(scrollY, [0, 2000], [0, -300]);
  const rotateGlow = useTransform(scrollY, [0, 2000], [0, 45]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#050B16]">
      {/* Background Mesh Grid */}
      <div 
        className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#00f0ff_1px,transparent_1px)] [background-size:32px_32px]"
      />

      {/* Layer 1: Ambient Glowing Radial Flares */}
      <motion.div 
        style={{ y: yLayer1, rotate: rotateGlow }}
        className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-cyan-500/10 via-blue-600/5 to-transparent blur-[140px]"
      />

      <motion.div 
        style={{ y: yLayer2 }}
        className="absolute bottom-[-10%] right-[15%] w-[700px] h-[700px] rounded-full bg-gradient-to-tr from-violet-600/10 via-blue-500/5 to-transparent blur-[160px]"
      />

      {/* Floating Spatial Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-cyan-400/30 blur-[1px]"
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, Math.random() * 20 - 10, 0],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 6 + Math.random() * 6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
};
