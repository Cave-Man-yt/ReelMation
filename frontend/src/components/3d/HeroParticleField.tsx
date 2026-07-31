import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const HeroParticleField: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 85;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Particle Geometry
    const particleCount = 450;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const scales = new Float32Array(particleCount);

    const color1 = new THREE.Color('#7c5cbf'); // Muted Purple
    const color2 = new THREE.Color('#6e8efb'); // Soft Blue
    const color3 = new THREE.Color('#a78bfa'); // Lavender

    for (let i = 0; i < particleCount; i++) {
      // Create a layered ring / organic distribution
      const radius = 15 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.8;

      positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(phi) + (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = radius * Math.cos(theta) * Math.cos(phi);

      const mixedColor = color1.clone();
      const rand = Math.random();
      if (rand > 0.6) mixedColor.lerp(color2, Math.random());
      else if (rand > 0.3) mixedColor.lerp(color3, Math.random());

      colors[i * 3] = mixedColor.r;
      colors[i * 3 + 1] = mixedColor.g;
      colors[i * 3 + 2] = mixedColor.b;

      scales[i] = Math.random() * 2.5 + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle Texture Canvas Creation
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(124,92,191,0.6)');
      grad.addColorStop(0.7, 'rgba(110,142,251,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(16, 16, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      map: texture,
      transparent: true,
      opacity: 0.7,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Subtle Connecting Lines between nearby points
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x31344b,
      transparent: true,
      opacity: 0.08,
      blending: THREE.NormalBlending,
    });

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions: number[] = [];
    const maxDist = 22;

    for (let i = 0; i < 150; i++) {
      const x1 = positions[i * 3];
      const y1 = positions[i * 3 + 1];
      const z1 = positions[i * 3 + 2];

      for (let j = i + 1; j < 150; j++) {
        const x2 = positions[j * 3];
        const y2 = positions[j * 3 + 1];
        const z2 = positions[j * 3 + 2];

        const dist = Math.hypot(x1 - x2, y1 - y2, z1 - z2);
        if (dist < maxDist) {
          linePositions.push(x1, y1, z1, x2, y2, z2);
        }
      }
    }

    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Mouse Parallax & Repulsion Physics
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetMouseX = ((event.clientX - rect.left) / width - 0.5) * 2;
      targetMouseY = -((event.clientY - rect.top) / height - 0.5) * 2;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Ultra-sensitive mouse interpolation (increased reactivity)
      mouseX += (targetMouseX - mouseX) * 0.12;
      mouseY += (targetMouseY - mouseY) * 0.12;

      // Dynamic rotation with high cursor sensitivity
      particles.rotation.y = elapsedTime * 0.08 + mouseX * 0.75;
      particles.rotation.x = Math.sin(elapsedTime * 0.05) * 0.15 + mouseY * 0.55;

      lines.rotation.y = particles.rotation.y;
      lines.rotation.x = particles.rotation.x;

      // Pulse and displace particle positions with high cursor proximity sensitivity
      const posAttr = geometry.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        const y = positions[i * 3 + 1];
        const x = positions[i * 3];

        // Cursor distance repulsion
        const dx = x - mouseX * 40;
        const dy = y - mouseY * 40;
        const dist = Math.hypot(dx, dy);
        const repulsion = dist < 25 ? (25 - dist) * 0.15 : 0;

        posAttr.setY(i, y + Math.sin(elapsedTime * 2 + i) * 0.12 + dy * repulsion * 0.02);
        posAttr.setX(i, x + dx * repulsion * 0.02);
      }
      posAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
    />
  );
};
