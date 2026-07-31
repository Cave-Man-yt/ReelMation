import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface NeuralNetworkLoadingProps {
  currentPhase: number;    // 1-5 pipeline phase
  isComplete: boolean;     // true when generation done
  progress: number;        // 0-1 overall progress
}

export const NeuralNetworkLoading: React.FC<NeuralNetworkLoadingProps> = ({
  currentPhase,
  isComplete,
  progress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPathwayText, setShowPathwayText] = useState(false);

  // refs for mutable animation state
  const isCompleteRef = useRef(false);
  const completionStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isComplete && !isCompleteRef.current) {
      isCompleteRef.current = true;
      completionStartTimeRef.current = performance.now();
      setTimeout(() => setShowPathwayText(true), 1500);
    }
  }, [isComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    // SCENE SETUP
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050B16');

    // CAMERA
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 90;

    // RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // LIGHTS
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const leftLight = new THREE.PointLight(0x00F0FF, 1.5, 100);
    leftLight.position.set(-50, 0, 20);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x8B5CF6, 1.5, 100);
    rightLight.position.set(50, 0, 20);
    scene.add(rightLight);

    // ARCHITECTURE
    const layerCounts = [6, 12, 10, 8, 10, 12, 20];
    const layerColors = [
      new THREE.Color('#00F0FF'), // Input/Layer1
      new THREE.Color('#00F0FF'), 
      new THREE.Color('#3B82F6'), // Layer2/3
      new THREE.Color('#3B82F6'),
      new THREE.Color('#8B5CF6'), // Layer4/5
      new THREE.Color('#8B5CF6'),
      new THREE.Color('#D946EF'), // Output
    ];

    const horizontalSpacing = 16;
    const startX = -((layerCounts.length - 1) * horizontalSpacing) / 2;
    const verticalSpacing = 4.5;

    // PREDETERMINED PATH
    const predeterminedPath = [2, 5, 4, 3, 4, 5, 9];

    // NODES
    const nodeGeometry = new THREE.SphereGeometry(0.8, 12, 12);
    const nodes: { mesh: THREE.Mesh; layer: number; index: number; baseScale: number; phase: number }[][] = [];
    const allNodeMeshes: THREE.Mesh[] = [];

    layerCounts.forEach((count, layerIndex) => {
      const layerNodes = [];
      const startY = -((count - 1) * verticalSpacing) / 2;
      for (let i = 0; i < count; i++) {
        const color = layerColors[layerIndex];
        const material = new THREE.MeshStandardMaterial({
          color: color.clone(),
          emissive: color.clone(),
          emissiveIntensity: 0.8,
          roughness: 0.2,
          metalness: 0.8,
        });

        const mesh = new THREE.Mesh(nodeGeometry, material);
        mesh.position.set(startX + layerIndex * horizontalSpacing, startY + i * verticalSpacing, 0);
        
        scene.add(mesh);
        layerNodes.push({ mesh, layer: layerIndex, index: i, baseScale: 1, phase: Math.random() * Math.PI * 2 });
        allNodeMeshes.push(mesh);
      }
      nodes.push(layerNodes);
    });

    // CONNECTIONS
    const connectionsGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const baseOpacities: number[] = [];

    const connectionMetaData: { isPath: boolean; startColor: THREE.Color; endColor: THREE.Color }[] = [];

    for (let l = 0; l < nodes.length - 1; l++) {
      for (let i = 0; i < nodes[l].length; i++) {
        for (let j = 0; j < nodes[l + 1].length; j++) {
          const startNode = nodes[l][i];
          const endNode = nodes[l + 1][j];
          
          positions.push(startNode.mesh.position.x, startNode.mesh.position.y, startNode.mesh.position.z);
          positions.push(endNode.mesh.position.x, endNode.mesh.position.y, endNode.mesh.position.z);

          const startColor = layerColors[l];
          const endColor = layerColors[l + 1];

          // Base opacity 0.08 to 0.15 -> we multiply color by this factor for AdditiveBlending
          const opacity = 0.08 + Math.random() * 0.07;
          baseOpacities.push(opacity, opacity);

          colors.push(startColor.r * opacity, startColor.g * opacity, startColor.b * opacity);
          colors.push(endColor.r * opacity, endColor.g * opacity, endColor.b * opacity);

          const isPath = predeterminedPath[l] === i && predeterminedPath[l + 1] === j;
          connectionMetaData.push({ isPath, startColor, endColor });
        }
      }
    }

    connectionsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    connectionsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const connectionsMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const connectionsMesh = new THREE.LineSegments(connectionsGeometry, connectionsMaterial);
    scene.add(connectionsMesh);

    // DATA PULSES
    const pulseCount = 50;
    const pulseGeometry = new THREE.SphereGeometry(0.4, 8, 8);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.8,
    });

    // Need type for pulse nodes
    type PulseNode = { mesh: THREE.Mesh; layer: number; index: number; baseScale: number; phase: number };
    const pulses: { mesh: THREE.Mesh; startNode: PulseNode; endNode: PulseNode; progress: number; speed: number }[] = [];

    const getRandConnection = () => {
      const l = Math.floor(Math.random() * (nodes.length - 1));
      const startNode = nodes[l][Math.floor(Math.random() * nodes[l].length)];
      const endNode = nodes[l + 1][Math.floor(Math.random() * nodes[l + 1].length)];
      return { startNode, endNode };
    };

    for (let i = 0; i < pulseCount; i++) {
      const mesh = new THREE.Mesh(pulseGeometry, pulseMaterial);
      const conn = getRandConnection();
      scene.add(mesh);
      pulses.push({
        mesh,
        startNode: conn.startNode,
        endNode: conn.endNode,
        progress: Math.random(),
        speed: 0.005 + Math.random() * 0.015,
      });
    }

    // MOUSE PARALLAX
    const mouse = { x: 0, y: 0 };
    const targetCameraPos = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // RESIZE
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(containerRef.current);

    // ANIMATION LOOP
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Mouse Parallax
      targetCameraPos.x = mouse.x * 5;
      targetCameraPos.y = mouse.y * 5;
      
      camera.position.x += (targetCameraPos.x - camera.position.x) * 0.05;
      
      // Camera gentle y oscillation + parallax
      const yOscillation = Math.sin(elapsedTime * 0.5) * 2;
      camera.position.y += (targetCameraPos.y + yOscillation - camera.position.y) * 0.05;
      
      // Zoom in
      camera.position.z = Math.max(55, camera.position.z - 0.02);
      camera.lookAt(0, 0, 0);

      let completionProgress = 0;
      if (isCompleteRef.current && completionStartTimeRef.current) {
        completionProgress = Math.min(1, (performance.now() - completionStartTimeRef.current) / 1500);
      }

      // Nodes pulsing and transition
      nodes.forEach(layer => {
        layer.forEach(node => {
          const isPathNode = predeterminedPath[node.layer] === node.index;
          let scale = 1 + Math.sin(elapsedTime * 2 + node.phase) * 0.15;
          
          if (isCompleteRef.current) {
            if (isPathNode) {
              scale = 1 + (completionProgress * 1.0) + Math.sin(elapsedTime * 8) * 0.1; // Scale up 2x
              const mat = node.mesh.material as THREE.MeshStandardMaterial;
              mat.color.lerpColors(layerColors[node.layer], new THREE.Color(0xffffff), completionProgress);
              mat.emissive.lerpColors(layerColors[node.layer], new THREE.Color(0x00FFFF), completionProgress);
              mat.emissiveIntensity = 0.8 + completionProgress * 2;
            } else {
              const mat = node.mesh.material as THREE.MeshStandardMaterial;
              mat.opacity = 1 - completionProgress * 0.8;
              mat.transparent = true;
              mat.emissiveIntensity = 0.8 * (1 - completionProgress);
            }
          }
          
          node.mesh.scale.set(scale, scale, scale);
        });
      });

      // Connections Animation
      if (isCompleteRef.current) {
        const colorAttr = connectionsGeometry.attributes.color;
        for (let i = 0; i < connectionMetaData.length; i++) {
          const meta = connectionMetaData[i];
          const baseOpStart = baseOpacities[i * 2];
          const baseOpEnd = baseOpacities[i * 2 + 1];

          let targetOpacityStart = baseOpStart;
          let targetOpacityEnd = baseOpEnd;
          let colorStart = meta.startColor;
          let colorEnd = meta.endColor;

          if (meta.isPath) {
            targetOpacityStart = 1.0;
            targetOpacityEnd = 1.0;
            colorStart = new THREE.Color(0xffffff); // glow bright white/cyan
            colorEnd = new THREE.Color(0x00ffff);
          } else {
            targetOpacityStart = 0.02;
            targetOpacityEnd = 0.02;
          }

          const currentOpacityStart = THREE.MathUtils.lerp(baseOpStart, targetOpacityStart, completionProgress);
          const currentOpacityEnd = THREE.MathUtils.lerp(baseOpEnd, targetOpacityEnd, completionProgress);

          const c1 = meta.startColor.clone().lerp(colorStart, completionProgress);
          const c2 = meta.endColor.clone().lerp(colorEnd, completionProgress);

          colorAttr.setXYZ(i * 2, c1.r * currentOpacityStart, c1.g * currentOpacityStart, c1.b * currentOpacityStart);
          colorAttr.setXYZ(i * 2 + 1, c2.r * currentOpacityEnd, c2.g * currentOpacityEnd, c2.b * currentOpacityEnd);
        }
        colorAttr.needsUpdate = true;
      }

      // Data Pulses
      pulses.forEach(pulse => {
        if (isCompleteRef.current) {
          pulse.mesh.visible = false;
          return;
        }

        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) {
          pulse.progress = 0;
          const conn = getRandConnection();
          pulse.startNode = conn.startNode;
          pulse.endNode = conn.endNode;
        }

        pulse.mesh.position.lerpVectors(pulse.startNode.mesh.position, pulse.endNode.mesh.position, pulse.progress);
      });

      renderer.render(scene, camera);
    };

    animate();

    // CLEANUP
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      
      allNodeMeshes.forEach(mesh => {
        (mesh.material as THREE.Material).dispose();
      });
      nodeGeometry.dispose();
      connectionsGeometry.dispose();
      connectionsMaterial.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
      
      renderer.dispose();
      
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 bg-[#050B16]" />
      {showPathwayText && (
        <div 
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ animation: 'fadeIn 1s ease-in forwards' }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          <div className="text-white font-mono uppercase tracking-[0.3em] text-2xl md:text-3xl font-bold"
               style={{ textShadow: '0 0 15px rgba(0, 240, 255, 0.8), 0 0 30px rgba(0, 240, 255, 0.4)' }}>
            Pathway Selected
          </div>
        </div>
      )}
    </>
  );
};
