import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface NeuralNetworkLoadingProps {
  currentPhase: number;    // 1-5 pipeline phase
  isComplete: boolean;     // true when generation done
  progress: number;        // 0-1 overall progress
}

// ── Types ──────────────────────────────────────────────────────────────
type NodeData = {
  mesh: THREE.Mesh;
  layer: number;
  index: number;
  baseScale: number;
  phase: number;
  glowIntensity: number;     // current glow (0-1), decays per frame
  baseEmissiveIntensity: number;
};

type ConnectionMeta = {
  isPath: boolean;
  startColor: THREE.Color;
  endColor: THREE.Color;
  srcLayer: number;
  srcIndex: number;
  dstLayer: number;
  dstIndex: number;
};

type Pulse = {
  // Head mesh (bright leading sphere)
  headMesh: THREE.Mesh;
  // Trail meshes (comet tail — smaller, fading spheres behind the head)
  trailMeshes: THREE.Mesh[];
  // Current connection
  srcLayer: number;
  srcIndex: number;
  dstLayer: number;
  dstIndex: number;
  // Animation state
  progress: number;           // 0-1 along current edge
  speed: number;              // per-frame increment
  easing: number;             // exponent for easeIn feel (1.0-2.5)
  // Lifecycle
  active: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────
const TRAIL_LENGTH = 5;
const TRAIL_SPACING = 0.06;   // progress gap between trail segments
const BASE_PULSE_COUNT = 35;
const MAX_PULSE_COUNT = 80;
const NODE_GLOW_DECAY = 0.92;
const NODE_GLOW_TRIGGER = 1.0;

export const NeuralNetworkLoading: React.FC<NeuralNetworkLoadingProps> = ({
  currentPhase,
  isComplete,
  progress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPathwayText, setShowPathwayText] = useState(false);

  // Mutable refs for animation-loop access to React props
  const isCompleteRef = useRef(false);
  const completionStartTimeRef = useRef<number | null>(null);
  const currentPhaseRef = useRef(currentPhase);
  const progressRef = useRef(progress);

  useEffect(() => { currentPhaseRef.current = currentPhase; }, [currentPhase]);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  useEffect(() => {
    if (isComplete && !isCompleteRef.current) {
      isCompleteRef.current = true;
      completionStartTimeRef.current = performance.now();
      setTimeout(() => setShowPathwayText(true), 1800);
    }
  }, [isComplete]);

  // ── Main Three.js Setup ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e0e5ec');

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 90;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const leftLight = new THREE.PointLight(0x7c5cbf, 1.2, 120);
    leftLight.position.set(-55, 10, 25);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x6e8efb, 1.2, 120);
    rightLight.position.set(55, -10, 25);
    scene.add(rightLight);

    const centerLight = new THREE.PointLight(0xa78bfa, 0.8, 80);
    centerLight.position.set(0, 0, 15);
    scene.add(centerLight);

    // ── Network Architecture ────────────────────────────────────────────
    const layerCounts = [6, 12, 10, 8, 10, 12, 20];
    const layerColors = [
      new THREE.Color('#7c5cbf'),
      new THREE.Color('#8b7fc7'),
      new THREE.Color('#6e8efb'),
      new THREE.Color('#a78bfa'),
      new THREE.Color('#d97bba'),
      new THREE.Color('#c084cf'),
      new THREE.Color('#6dbe8b'),
    ];

    const horizontalSpacing = 16;
    const startX = -((layerCounts.length - 1) * horizontalSpacing) / 2;
    const verticalSpacing = 4.5;

    // Predetermined "golden path" for final lock-in
    const predeterminedPath = [2, 5, 4, 3, 4, 5, 9];

    // ── Nodes ───────────────────────────────────────────────────────────
    const nodeGeometry = new THREE.SphereGeometry(0.8, 14, 14);
    const nodes: NodeData[][] = [];
    const allNodeMeshes: THREE.Mesh[] = [];

    // Node glow ring geometry (flat ring around each node for radial glow)
    const glowRingGeo = new THREE.RingGeometry(1.2, 3.0, 24);
    const glowRings: THREE.Mesh[] = [];

    layerCounts.forEach((count, layerIndex) => {
      const layerNodes: NodeData[] = [];
      const startY = -((count - 1) * verticalSpacing) / 2;

      for (let i = 0; i < count; i++) {
        const color = layerColors[layerIndex];
        const material = new THREE.MeshStandardMaterial({
          color: color.clone(),
          emissive: color.clone(),
          emissiveIntensity: 0.3,
          roughness: 0.5,
          metalness: 0.3,
        });

        const mesh = new THREE.Mesh(nodeGeometry, material);
        const pos = new THREE.Vector3(
          startX + layerIndex * horizontalSpacing,
          startY + i * verticalSpacing,
          0
        );
        mesh.position.copy(pos);
        scene.add(mesh);

        // Glow ring (initially invisible)
        const ringMat = new THREE.MeshBasicMaterial({
          color: color.clone(),
          transparent: true,
          opacity: 0,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(glowRingGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(camera.position);
        scene.add(ring);
        glowRings.push(ring);

        const nodeData: NodeData = {
          mesh, layer: layerIndex, index: i,
          baseScale: 1,
          phase: Math.random() * Math.PI * 2,
          glowIntensity: 0,
          baseEmissiveIntensity: 0.3,
        };
        layerNodes.push(nodeData);
        allNodeMeshes.push(mesh);
      }
      nodes.push(layerNodes);
    });

    // Helper: get flat node index for glow ring lookup
    const getNodeFlatIndex = (layer: number, index: number): number => {
      let flat = 0;
      for (let l = 0; l < layer; l++) flat += layerCounts[l];
      return flat + index;
    };

    // ── Connections (LineSegments) ───────────────────────────────────────
    const connectionsGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const baseOpacities: number[] = [];
    const connectionMeta: ConnectionMeta[] = [];

    // Build an adjacency map: for each node, list of outgoing connection indices
    const outgoingConnections: Map<string, number[]> = new Map();

    let connIndex = 0;
    for (let l = 0; l < nodes.length - 1; l++) {
      for (let i = 0; i < nodes[l].length; i++) {
        for (let j = 0; j < nodes[l + 1].length; j++) {
          const sn = nodes[l][i];
          const en = nodes[l + 1][j];

          positions.push(
            sn.mesh.position.x, sn.mesh.position.y, sn.mesh.position.z,
            en.mesh.position.x, en.mesh.position.y, en.mesh.position.z
          );

          const sc = layerColors[l];
          const ec = layerColors[l + 1];
          const opacity = 0.06 + Math.random() * 0.06;
          baseOpacities.push(opacity, opacity);

          colors.push(sc.r * opacity, sc.g * opacity, sc.b * opacity);
          colors.push(ec.r * opacity, ec.g * opacity, ec.b * opacity);

          const isPath = predeterminedPath[l] === i && predeterminedPath[l + 1] === j;
          connectionMeta.push({ isPath, startColor: sc, endColor: ec, srcLayer: l, srcIndex: i, dstLayer: l + 1, dstIndex: j });

          // Track outgoing connections
          const key = `${l}-${i}`;
          if (!outgoingConnections.has(key)) outgoingConnections.set(key, []);
          outgoingConnections.get(key)!.push(connIndex);

          connIndex++;
        }
      }
    }

    connectionsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    connectionsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const connectionsMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.NormalBlending,
      transparent: true,
      depthWrite: false,
    });

    const connectionLines = new THREE.LineSegments(connectionsGeometry, connectionsMaterial);
    scene.add(connectionLines);

    // ── Connection Brightening Buffer ────────────────────────────────────
    // Each connection has a "current boost" value that decays.
    // When a pulse travels along it, we brighten it temporarily.
    const connectionBoost = new Float32Array(connectionMeta.length).fill(0);

    // ── Data Pulse System ───────────────────────────────────────────────

    // Head material: bright white/cyan
    const pulseHeadGeo = new THREE.SphereGeometry(0.55, 10, 10);

    // Trail segment materials (progressively dimmer)
    const trailGeo = new THREE.SphereGeometry(0.35, 8, 8);

    const createPulseMeshes = (): { headMesh: THREE.Mesh; trailMeshes: THREE.Mesh[] } => {
      const headMat = new THREE.MeshBasicMaterial({
        color: 0x7c5cbf,
        blending: THREE.NormalBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const headMesh = new THREE.Mesh(pulseHeadGeo, headMat);
      headMesh.visible = false;
      scene.add(headMesh);

      const trailMeshes: THREE.Mesh[] = [];
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        const trailFade = 1 - (t + 1) / (TRAIL_LENGTH + 1);
        const trailMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#7c5cbf'),
          blending: THREE.NormalBlending,
          transparent: true,
          opacity: trailFade * 0.6,
          depthWrite: false,
        });
        const trailMesh = new THREE.Mesh(trailGeo, trailMat);
        trailMesh.visible = false;
        const scaleFactor = 1 - (t + 1) / (TRAIL_LENGTH + 1) * 0.6;
        trailMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        scene.add(trailMesh);
        trailMeshes.push(trailMesh);
      }

      return { headMesh, trailMeshes };
    };

    // Pick a random outgoing connection from a destination node
    const getNextConnection = (dstLayer: number, dstIndex: number): ConnectionMeta | null => {
      const key = `${dstLayer}-${dstIndex}`;
      const outgoing = outgoingConnections.get(key);
      if (!outgoing || outgoing.length === 0) return null;
      return connectionMeta[outgoing[Math.floor(Math.random() * outgoing.length)]];
    };

    const getRandStartConnection = (): ConnectionMeta => {
      const l = Math.floor(Math.random() * (nodes.length - 1));
      const i = Math.floor(Math.random() * nodes[l].length);
      const j = Math.floor(Math.random() * nodes[l + 1].length);
      // Find the corresponding connection meta
      let idx = 0;
      for (let ll = 0; ll < l; ll++) {
        idx += nodes[ll].length * nodes[ll + 1].length;
      }
      idx += i * nodes[l + 1].length + j;
      return connectionMeta[idx];
    };

    const initPulse = (pulse: Pulse) => {
      const conn = getRandStartConnection();
      pulse.srcLayer = conn.srcLayer;
      pulse.srcIndex = conn.srcIndex;
      pulse.dstLayer = conn.dstLayer;
      pulse.dstIndex = conn.dstIndex;
      pulse.progress = 0;
      pulse.speed = 0.008 + Math.random() * 0.022;
      pulse.easing = 1.0 + Math.random() * 1.2;
      pulse.active = true;
      pulse.headMesh.visible = true;
      pulse.trailMeshes.forEach(m => { m.visible = true; });
    };

    // Create initial pool of pulses
    const pulses: Pulse[] = [];
    for (let i = 0; i < MAX_PULSE_COUNT; i++) {
      const { headMesh, trailMeshes } = createPulseMeshes();
      const pulse: Pulse = {
        headMesh, trailMeshes,
        srcLayer: 0, srcIndex: 0, dstLayer: 1, dstIndex: 0,
        progress: 0, speed: 0.01, easing: 1.5,
        active: false,
      };
      if (i < BASE_PULSE_COUNT) {
        initPulse(pulse);
        pulse.progress = Math.random(); // stagger initial positions
      }
      pulses.push(pulse);
    }

    // Find connection index for a given src→dst
    const findConnectionIndex = (srcL: number, srcI: number, dstL: number, dstI: number): number => {
      let idx = 0;
      for (let l = 0; l < srcL; l++) {
        idx += nodes[l].length * nodes[l + 1].length;
      }
      idx += srcI * nodes[srcL + 1].length + dstI;
      return idx;
    };

    // ── Mouse Parallax ──────────────────────────────────────────────────
    const mouse = { x: 0, y: 0 };
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(container);

    // ── Animation Loop ──────────────────────────────────────────────────
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const tmpVec3A = new THREE.Vector3();
    const tmpVec3B = new THREE.Vector3();
    const tmpColor = new THREE.Color();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const dt = clock.getDelta();

      // ── Camera ──
      const targetX = mouse.x * 6;
      const targetY = mouse.y * 5 + Math.sin(elapsed * 0.4) * 2.5;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (targetY - camera.position.y) * 0.04;
      camera.position.z = Math.max(55, camera.position.z - 0.015);
      camera.lookAt(0, 0, 0);

      // ── Completion transition ──
      let completionT = 0;
      if (isCompleteRef.current && completionStartTimeRef.current) {
        completionT = Math.min(1, (performance.now() - completionStartTimeRef.current) / 2000);
      }

      // ── Determine active pulse count based on LLM activity ──
      const phase = currentPhaseRef.current;
      const prog = progressRef.current;
      // Higher phase + active streaming = more pulses
      let targetActivePulses = BASE_PULSE_COUNT;
      if (phase >= 1) targetActivePulses = BASE_PULSE_COUNT + Math.floor(phase * 6);
      if (phase === 1 || phase === 3) targetActivePulses += 15; // Script gen & image gen are "busy"
      if (prog > 0 && prog < 1) targetActivePulses += 10; // Active streaming boost
      targetActivePulses = Math.min(targetActivePulses, MAX_PULSE_COUNT);

      if (isCompleteRef.current) targetActivePulses = 0;

      // Activate/deactivate pulses to match target
      let activeCount = pulses.filter(p => p.active).length;
      if (activeCount < targetActivePulses) {
        for (const p of pulses) {
          if (!p.active) {
            initPulse(p);
            activeCount++;
            if (activeCount >= targetActivePulses) break;
          }
        }
      }

      // ── Decay connection boosts ──
      for (let i = 0; i < connectionBoost.length; i++) {
        connectionBoost[i] *= 0.93;
        if (connectionBoost[i] < 0.01) connectionBoost[i] = 0;
      }

      // ── Animate Pulses ──
      for (const pulse of pulses) {
        if (!pulse.active) {
          pulse.headMesh.visible = false;
          pulse.trailMeshes.forEach(m => { m.visible = false; });
          continue;
        }

        // Completion fade-out
        if (isCompleteRef.current) {
          const headMat = pulse.headMesh.material as THREE.MeshBasicMaterial;
          headMat.opacity *= 0.9;
          if (headMat.opacity < 0.02) {
            pulse.active = false;
            pulse.headMesh.visible = false;
            pulse.trailMeshes.forEach(m => { m.visible = false; });
          }
          continue;
        }

        // Advance progress with easing
        const easedSpeed = pulse.speed * (0.5 + Math.pow(pulse.progress, pulse.easing) * 1.5);
        pulse.progress += easedSpeed;

        // Get source & destination positions
        const srcNode = nodes[pulse.srcLayer][pulse.srcIndex];
        const dstNode = nodes[pulse.dstLayer][pulse.dstIndex];

        if (pulse.progress >= 1) {
          // ── Pulse arrived at destination node ──

          // Trigger radial glow on destination node
          dstNode.glowIntensity = NODE_GLOW_TRIGGER;

          // Try to continue along an outgoing connection
          const nextConn = getNextConnection(pulse.dstLayer, pulse.dstIndex);
          if (nextConn) {
            pulse.srcLayer = nextConn.srcLayer;
            pulse.srcIndex = nextConn.srcIndex;
            pulse.dstLayer = nextConn.dstLayer;
            pulse.dstIndex = nextConn.dstIndex;
            pulse.progress = 0;
            // Slightly randomize speed for organic feel
            pulse.speed = 0.008 + Math.random() * 0.022;
            pulse.easing = 1.0 + Math.random() * 1.2;
          } else {
            // Reached output layer — reinitialize from random start
            initPulse(pulse);
          }
          continue;
        }

        // Brighten the connection this pulse is traveling on
        const connIdx = findConnectionIndex(pulse.srcLayer, pulse.srcIndex, pulse.dstLayer, pulse.dstIndex);
        connectionBoost[connIdx] = Math.max(connectionBoost[connIdx], 0.6 + pulse.progress * 0.4);

        // Position head
        tmpVec3A.copy(srcNode.mesh.position);
        tmpVec3B.copy(dstNode.mesh.position);
        pulse.headMesh.position.lerpVectors(tmpVec3A, tmpVec3B, pulse.progress);
        pulse.headMesh.visible = true;

        // Color the head: white at leading edge blending to layer color
        const headMat = pulse.headMesh.material as THREE.MeshBasicMaterial;
        const layerBlendColor = layerColors[pulse.srcLayer].clone().lerp(layerColors[pulse.dstLayer], pulse.progress);
        tmpColor.copy(layerBlendColor).lerp(new THREE.Color(0x7c5cbf), 0.7);
        headMat.color.copy(tmpColor);
        headMat.opacity = 0.85 + Math.sin(elapsed * 12 + pulse.progress * 5) * 0.15;

        // Scale head: slightly larger at the leading edge
        const headScale = 0.8 + pulse.progress * 0.4;
        pulse.headMesh.scale.set(headScale, headScale, headScale);

        // Position trail segments (comet tail behind the head)
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const trailProgress = pulse.progress - (t + 1) * TRAIL_SPACING;
          const trailMesh = pulse.trailMeshes[t];

          if (trailProgress < 0) {
            trailMesh.visible = false;
            continue;
          }

          trailMesh.visible = true;
          trailMesh.position.lerpVectors(tmpVec3A, tmpVec3B, trailProgress);

          // Trail color: fades from layer color to dim, with decreasing opacity
          const trailMat = trailMesh.material as THREE.MeshBasicMaterial;
          const trailFade = 1 - (t + 1) / (TRAIL_LENGTH + 1);
          trailMat.color.copy(layerBlendColor);
          trailMat.opacity = trailFade * 0.5;
        }
      }

      // ── Node Glow & Pulsing ──────────────────────────────────────────
      let ringIdx = 0;
      nodes.forEach((layer, layerIdx) => {
        layer.forEach((node, nodeIdx) => {
          const mat = node.mesh.material as THREE.MeshStandardMaterial;
          const isPathNode = predeterminedPath[node.layer] === node.index;

          // Decay glow
          node.glowIntensity *= NODE_GLOW_DECAY;

          if (isCompleteRef.current) {
            // ── Completion animation ──
            if (isPathNode) {
              const scale = 1 + completionT * 1.2 + Math.sin(elapsed * 6) * 0.08;
              node.mesh.scale.set(scale, scale, scale);
              mat.color.lerpColors(layerColors[layerIdx], new THREE.Color(0x2d2f45), completionT * 0.8);
              mat.emissive.lerpColors(layerColors[layerIdx], new THREE.Color(0x7c5cbf), completionT);
              mat.emissiveIntensity = 0.3 + completionT * 3;

              // Glow ring on path nodes during completion
              const ring = glowRings[ringIdx];
              const ringMat = ring.material as THREE.MeshBasicMaterial;
              ringMat.opacity = completionT * 0.5;
              ringMat.color.set(0x7c5cbf);
              const ringScale = 1 + completionT * 1.5;
              ring.scale.set(ringScale, ringScale, ringScale);
            } else {
              mat.transparent = true;
              mat.opacity = 1 - completionT * 0.85;
              mat.emissiveIntensity = 0.3 * (1 - completionT);
              node.mesh.scale.set(1, 1, 1);

              const ring = glowRings[ringIdx];
              (ring.material as THREE.MeshBasicMaterial).opacity = 0;
            }
          } else {
            // ── Normal pulsing + glow on data arrival ──
            const basePulse = Math.sin(elapsed * 1.8 + node.phase) * 0.12;
            const glowScale = node.glowIntensity * 0.5;
            const scale = 1 + basePulse + glowScale;
            node.mesh.scale.set(scale, scale, scale);

            // Emissive intensity boost on glow
            mat.emissiveIntensity = node.baseEmissiveIntensity + node.glowIntensity * 1.8;

            // Briefly brighten the node color when data arrives
            if (node.glowIntensity > 0.1) {
              tmpColor.copy(layerColors[layerIdx]).lerp(new THREE.Color(0x2d2f45), node.glowIntensity * 0.6);
              mat.emissive.copy(tmpColor);
            } else {
              mat.emissive.copy(layerColors[layerIdx]);
            }

            // Glow ring effect
            const ring = glowRings[ringIdx];
            const ringMat = ring.material as THREE.MeshBasicMaterial;
            ringMat.opacity = node.glowIntensity * 0.35;
            ringMat.color.copy(layerColors[layerIdx]);
            const ringScale = 1 + node.glowIntensity * 1.2;
            ring.scale.set(ringScale, ringScale, ringScale);
            ring.lookAt(camera.position);
          }

          ringIdx++;
        });
      });

      // ── Connection Line Colors (boost + completion) ───────────────────
      const colorAttr = connectionsGeometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < connectionMeta.length; i++) {
        const meta = connectionMeta[i];
        const baseOpS = baseOpacities[i * 2];
        const baseOpE = baseOpacities[i * 2 + 1];
        const boost = connectionBoost[i];

        if (isCompleteRef.current) {
          // Completion: path connections glow, others fade
          let opS: number, opE: number;
          let cS: THREE.Color, cE: THREE.Color;

          if (meta.isPath) {
            opS = THREE.MathUtils.lerp(baseOpS, 1.0, completionT);
            opE = THREE.MathUtils.lerp(baseOpE, 1.0, completionT);
            cS = meta.startColor.clone().lerp(new THREE.Color(0x2d2f45), completionT * 0.7);
            cE = meta.endColor.clone().lerp(new THREE.Color(0x7c5cbf), completionT * 0.7);
          } else {
            opS = THREE.MathUtils.lerp(baseOpS, 0.008, completionT);
            opE = THREE.MathUtils.lerp(baseOpE, 0.008, completionT);
            cS = meta.startColor;
            cE = meta.endColor;
          }

          colorAttr.setXYZ(i * 2, cS.r * opS, cS.g * opS, cS.b * opS);
          colorAttr.setXYZ(i * 2 + 1, cE.r * opE, cE.g * opE, cE.b * opE);
        } else {
          // Normal: base color + boost from passing pulses
          const opS = baseOpS + boost * 0.45;
          const opE = baseOpE + boost * 0.45;

          // When boosted, blend toward white/cyan for that hot-wire look
          const bS = meta.startColor.clone();
          const bE = meta.endColor.clone();
          if (boost > 0.05) {
            bS.lerp(new THREE.Color(0x2d2f45), boost * 0.4);
            bE.lerp(new THREE.Color(0x7c5cbf), boost * 0.3);
          }

          colorAttr.setXYZ(i * 2, bS.r * opS, bS.g * opS, bS.b * opS);
          colorAttr.setXYZ(i * 2 + 1, bE.r * opE, bE.g * opE, bE.b * opE);
        }
      }
      colorAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ──
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);

      // Dispose nodes
      allNodeMeshes.forEach(mesh => {
        (mesh.material as THREE.Material).dispose();
      });
      nodeGeometry.dispose();
      glowRingGeo.dispose();
      glowRings.forEach(r => {
        (r.material as THREE.Material).dispose();
      });

      // Dispose connections
      connectionsGeometry.dispose();
      connectionsMaterial.dispose();

      // Dispose pulses
      pulseHeadGeo.dispose();
      trailGeo.dispose();
      pulses.forEach(p => {
        (p.headMesh.material as THREE.Material).dispose();
        p.trailMeshes.forEach(t => {
          (t.material as THREE.Material).dispose();
        });
      });

      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 bg-[var(--nm-bg)]" />
      {showPathwayText && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ animation: 'nnFadeIn 1.2s ease-out forwards' }}
        >
          <style>{`
            @keyframes nnFadeIn {
              0% { opacity: 0; transform: scale(0.9); filter: blur(8px); }
              100% { opacity: 1; transform: scale(1); filter: blur(0px); }
            }
          `}</style>
          <div
            className="text-[var(--nm-text-heading)] font-mono uppercase tracking-[0.35em] text-2xl md:text-4xl font-bold"
            style={{
              textShadow: '0 2px 12px rgba(124, 92, 191, 0.4), 0 4px 24px rgba(110, 142, 251, 0.2)',
            }}
          >
            Pathway Selected
          </div>
        </div>
      )}
    </>
  );
};
