import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ReasoningPath } from '../../types';

interface NeuralReasoningEngineProps {
  reasoningPaths: ReasoningPath[];
  activeStepIndex: number;
  selectedPathId: string | null;
  onSelectPath?: (pathId: string) => void;
}

export const NeuralReasoningEngine: React.FC<NeuralReasoningEngineProps> = ({
  reasoningPaths,
  activeStepIndex,
  selectedPathId,
  onSelectPath,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050b16, 0.008);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 15, 95);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.8);
    scene.add(ambientLight);

    const blueLight = new THREE.PointLight(0x00f0ff, 3, 120);
    blueLight.position.set(-25, 20, 20);
    scene.add(blueLight);

    const violetLight = new THREE.PointLight(0x8b5cf6, 3, 120);
    violetLight.position.set(25, -15, 20);
    scene.add(violetLight);

    const coreLight = new THREE.PointLight(0x38bdf8, 4, 100);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // Generate 100 Nodes in 5 Clusters
    const TOTAL_NODES = 100;
    const nodes: {
      id: number;
      cluster: number;
      position: THREE.Vector3;
      baseColor: THREE.Color;
      mesh: THREE.Mesh;
      baseScale: number;
    }[] = [];

    const clusterCenters = [
      new THREE.Vector3(-32, 18, -10), // Knowledge Parsing
      new THREE.Vector3(-12, -22, 15), // Hook Paradox Engine
      new THREE.Vector3(0, 5, -5),      // Core Script Logic
      new THREE.Vector3(22, 20, -15),  // Visual Storyboard
      new THREE.Vector3(30, -18, 10),  // Voice & Algorithm Optimization
    ];

    const clusterColors = [
      new THREE.Color('#38BDF8'), // Sky Blue
      new THREE.Color('#A855F7'), // Purple
      new THREE.Color('#00F0FF'), // Electric Cyan
      new THREE.Color('#3B82F6'), // Cobalt Blue
      new THREE.Color('#10B981'), // Emerald
    ];

    const nodeGroup = new THREE.Group();

    // Node Material Template
    const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);

    for (let i = 1; i <= TOTAL_NODES; i++) {
      const clusterIdx = Math.floor((i - 1) / (TOTAL_NODES / 5));
      const center = clusterCenters[clusterIdx];

      // Gaussian-like dispersion around cluster center
      const offsetX = (Math.random() - 0.5) * 28;
      const offsetY = (Math.random() - 0.5) * 22;
      const offsetZ = (Math.random() - 0.5) * 28;

      const pos = new THREE.Vector3(
        center.x + offsetX,
        center.y + offsetY,
        center.z + offsetZ
      );

      const color = clusterColors[clusterIdx].clone();
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      const scale = 0.6 + Math.random() * 0.8;
      mesh.scale.set(scale, scale, scale);

      nodeGroup.add(mesh);

      nodes.push({
        id: i,
        cluster: clusterIdx,
        position: pos,
        baseColor: color,
        mesh,
        baseScale: scale,
      });
    }

    scene.add(nodeGroup);

    // Structural Network Edges (Connections between nodes)
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const nodeConnections: [number, number][] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const dist = n1.position.distanceTo(n2.position);

        // Connect within cluster or close across clusters
        const sameCluster = n1.cluster === n2.cluster;
        const maxDist = sameCluster ? 20 : 25;

        if (dist < maxDist && Math.random() < (sameCluster ? 0.45 : 0.15)) {
          linePositions.push(
            n1.position.x, n1.position.y, n1.position.z,
            n2.position.x, n2.position.y, n2.position.z
          );

          const c1 = n1.baseColor;
          const c2 = n2.baseColor;
          lineColors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
          nodeConnections.push([i, j]);
        }
      }
    }

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });

    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    scene.add(edgeLines);

    // Moving Signal Particles along Edges
    const signalCount = 35;
    const signalGroup = new THREE.Group();
    const signalGeo = new THREE.SphereGeometry(0.6, 8, 8);
    const signalMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    const signals: {
      mesh: THREE.Mesh;
      connectionIdx: number;
      progress: number;
      speed: number;
    }[] = [];

    for (let i = 0; i < signalCount; i++) {
      const mesh = new THREE.Mesh(signalGeo, signalMat);
      const connIdx = Math.floor(Math.random() * nodeConnections.length);
      const speed = 0.005 + Math.random() * 0.015;

      signalGroup.add(mesh);
      signals.push({ mesh, connectionIdx: connIdx, progress: Math.random(), speed });
    }

    scene.add(signalGroup);

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
      mouseY = -((e.clientY - rect.top) / height - 0.5) * 2;
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
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Camera Slow Orbit + Parallax
      const radius = 95;
      const orbitSpeed = 0.12;
      const camX = Math.sin(elapsedTime * orbitSpeed) * radius + mouseX * 12;
      const camZ = Math.cos(elapsedTime * orbitSpeed) * radius;
      const camY = Math.sin(elapsedTime * 0.08) * 15 + mouseY * 12 + 10;

      camera.position.x += (camX - camera.position.x) * 0.05;
      camera.position.y += (camY - camera.position.y) * 0.05;
      camera.position.z += (camZ - camera.position.z) * 0.05;
      camera.lookAt(0, 0, 0);

      // Rotate group gently
      nodeGroup.rotation.y = elapsedTime * 0.02;
      edgeLines.rotation.y = nodeGroup.rotation.y;
      signalGroup.rotation.y = nodeGroup.rotation.y;

      // Determine active reasoning nodes based on selectedPathId or cycle during processing
      const activePathObj = reasoningPaths.find((p) => p.id === selectedPathId || p.status === 'optimal') || reasoningPaths[0];
      const activeNodeIds = activePathObj?.activeNodeIds || [8, 22, 45, 78, 91];

      // Pulse nodes
      nodes.forEach((n) => {
        const mat = n.mesh.material as THREE.MeshStandardMaterial;
        const isActivePathNode = activeNodeIds.includes(n.id);

        if (isActivePathNode) {
          const pulse = Math.sin(elapsedTime * 6 + n.id) * 0.4 + 1.2;
          n.mesh.scale.set(n.baseScale * pulse, n.baseScale * pulse, n.baseScale * pulse);
          mat.emissive.setHex(0x00f0ff);
          mat.emissiveIntensity = 1.8;
        } else {
          n.mesh.scale.set(n.baseScale, n.baseScale, n.baseScale);
          mat.emissive.copy(n.baseColor);
          mat.emissiveIntensity = 0.4 + Math.sin(elapsedTime * 2 + n.id) * 0.15;
        }
      });

      // Animate Signals along edges
      signals.forEach((sig) => {
        if (nodeConnections.length === 0) return;
        sig.progress += sig.speed;
        if (sig.progress >= 1) {
          sig.progress = 0;
          sig.connectionIdx = Math.floor(Math.random() * nodeConnections.length);
        }

        const [i1, i2] = nodeConnections[sig.connectionIdx];
        const n1 = nodes[i1];
        const n2 = nodes[i2];
        if (n1 && n2) {
          sig.mesh.position.lerpVectors(n1.position, n2.position, sig.progress);
        }
      });

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
      renderer.dispose();
    };
  }, [reasoningPaths, activeStepIndex, selectedPathId]);

  return (
    <div className="relative w-full h-full min-h-[480px] bg-[#050B16] rounded-xl border border-slate-800/80 overflow-hidden flex flex-col justify-between p-4">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Top HUD Overlay */}
      <div className="relative z-10 flex items-center justify-between bg-slate-950/70 backdrop-blur-md px-4 py-2.5 rounded-lg border border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-xs font-mono font-medium tracking-wider text-cyan-300 uppercase">
            3D Neural Reasoning Matrix
          </span>
        </div>

        <div className="flex items-center space-x-4 text-[11px] font-mono text-slate-400">
          <div>
            NODES: <span className="text-slate-200">100 ACTIVE</span>
          </div>
          <div className="hidden sm:block">
            CANDIDATES: <span className="text-cyan-400">{reasoningPaths.length || 10} EVALUATED</span>
          </div>
        </div>
      </div>

      {/* Bottom Candidate Reasoning Paths Selector */}
      <div className="relative z-10 mt-auto pt-4">
        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Candidate Reasoning Paths (10-12 Explored)
            </span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Optimal Path Selected
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {reasoningPaths.slice(0, 10).map((path, idx) => {
              const isOptimal = path.status === 'optimal';
              const isSelected = selectedPathId === path.id;

              return (
                <button
                  key={path.id}
                  onClick={() => onSelectPath && onSelectPath(path.id)}
                  onMouseEnter={() => setHoveredPath(path.id)}
                  onMouseLeave={() => setHoveredPath(null)}
                  className={`text-left px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-all duration-200 cursor-pointer ${
                    isOptimal || isSelected
                      ? 'bg-cyan-950/60 border-cyan-500/80 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[10px]">
                      PATH #{idx + 1}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        isOptimal ? 'text-emerald-400' : 'text-cyan-400/80'
                      }`}
                    >
                      {path.score}%
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-slate-300 mt-0.5">
                    {path.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
