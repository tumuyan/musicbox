/**
 * 3D Simulation of Walnut Mechanical Paper Strip Music Box
 * Upgraded Features:
 * 1. Comb teeth mechanism (音梳/拨齿) placed UNDER the paper strip (音齿结构放到纸带下方)
 * 2. Thin polished metal spring pressure plate ABOVE the paper strip (上方使用薄金属片压纸)
 * 3. Thickened cylindrical pressure feed roller (加粗压纸轮, radius ~4.8mm)
 * 4. Mechanical gear train transmission from side crank to feed roller (侧面曲柄通过齿轮传动带动纸带运动)
 * 5. Smooth continuous paper ribbon entering front panel slot and exiting rear panel slot
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SongData, MUSIC_BOX_SCALE, TOTAL_TINES } from '../types/musicBox';
import { musicBoxSynth } from '../audio/MusicBoxSynth';
import { Camera, RotateCcw, Eye, Disc, Cog, Sliders, ChevronDown, ChevronUp, Move, Maximize2, Minimize2, Play, Pause } from 'lucide-react';

interface MusicBox3DProps {
  song: SongData;
  currentStep: number;
  isPlaying: boolean;
  onStepChange?: (step: number) => void;
  onTinePluck?: (tineIndex: number) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onTogglePlay?: () => void;
}

export const MusicBox3D: React.FC<MusicBox3DProps> = ({
  song,
  currentStep,
  isPlaying,
  onStepChange,
  onTinePluck,
  isMaximized = false,
  onToggleMaximize,
  onTogglePlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'photo' | 'top' | 'front' | 'macro' | 'gears'>('photo');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState<boolean>(false);

  // Lid angle and glass parameters state (Default: 100° open, half-reflective half-transparent)
  const [lidAngle, setLidAngle] = useState<number>(100); // 0° to 120°
  const [glassPreset, setGlassPreset] = useState<'mirror' | 'glass' | 'half' | 'frosted' | 'custom'>('half');
  const [transmittance, setTransmittance] = useState<number>(50); // 50% transmittance
  const [reflectivity, setReflectivity] = useState<number>(60); // 60% reflectivity
  const [roughness, setRoughness] = useState<number>(5); // 0 to 100%
  const [isControlsExpanded, setIsControlsExpanded] = useState<boolean>(false);

  // Smooth lid animation refs (initialized at 100°)
  const targetLidAngleRef = useRef<number>((100 * Math.PI) / 180);
  const currentLidAngleRef = useRef<number>((100 * Math.PI) / 180);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const tinesRef = useRef<THREE.Mesh[]>([]);
  const tineVibrations = useRef<Float32Array>(new Float32Array(TOTAL_TINES));
  const rollerMeshRef = useRef<THREE.Mesh | null>(null);
  const crankGroupRef = useRef<THREE.Group | null>(null);
  const gear1Ref = useRef<THREE.Group | null>(null);
  const gear2Ref = useRef<THREE.Group | null>(null);
  const gear3Ref = useRef<THREE.Group | null>(null);
  const lidGroupRef = useRef<THREE.Group | null>(null);
  const glassMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const glassMeshRef = useRef<THREE.Mesh | null>(null);
  const reflectorRef = useRef<Reflector | null>(null);
  const paperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paperTextureRef = useRef<THREE.CanvasTexture | null>(null);

  const starWheelsRef = useRef<THREE.Group[]>([]);

  // Synchronous Step and Song References for the render loop
  const currentStepRef = useRef(currentStep);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const songRef = useRef(song);
  useEffect(() => {
    songRef.current = song;
  }, [song]);



  // 3D Navigation Mode: 'orbit' (rotate perspective) or 'pan' (move perspective)
  const [navMode, setNavMode] = useState<'orbit' | 'pan'>('orbit');

  // Animation frame & camera orbit/pan tracking
  const animFrameId = useRef<number | null>(null);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isOrbiting = useRef<boolean>(false);
  const isPanning = useRef<boolean>(false);
  const touchStartDist = useRef<number>(0);
  const touchStartMid = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan Camera helper: moves camera target in screen-space plane
  const panCamera = useCallback((deltaX: number, deltaY: number) => {
    if (!cameraRef.current) return;
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    cameraRef.current.matrix.extractBasis(cameraRight, cameraUp, new THREE.Vector3());
    cameraRight.normalize();
    cameraUp.normalize();

    const factor = targetCameraDistance.current * 0.0016;
    // Moving mouse right (deltaX > 0) shifts target left -> 3D scene moves right following the cursor
    targetCameraTarget.current.addScaledVector(cameraRight, -deltaX * factor);
    // Moving mouse down (deltaY > 0) shifts target up -> 3D scene moves down following the cursor
    targetCameraTarget.current.addScaledVector(cameraUp, deltaY * factor);
  }, []);



  // Smooth camera interpolation targets and current positions
  const currentCameraTarget = useRef<THREE.Vector3>(new THREE.Vector3(4, 2, 2));
  const targetCameraTarget = useRef<THREE.Vector3>(new THREE.Vector3(4, 2, 2));
  const currentCameraDistance = useRef<number>(220);
  const targetCameraDistance = useRef<number>(220);
  const currentCameraPhi = useRef<number>(1.08); // Elevation (~62 deg)
  const targetCameraPhi = useRef<number>(1.08);
  const currentCameraTheta = useRef<number>(-0.72); // Azimuth (~-41 deg)
  const targetCameraTheta = useRef<number>(-0.72);

  // Track triggered steps to prevent duplicate triggers
  const lastTriggeredStep = useRef<number>(-1);

  // Trigger visual tines vibration
  const triggerTine = useCallback((index: number) => {
    if (index >= 0 && index < TOTAL_TINES) {
      tineVibrations.current[index] = 1.0;
      if (onTinePluck) onTinePluck(index);
    }
  }, [onTinePluck]);

  // Check notes at currentStep
  useEffect(() => {
    const roundedStep = Math.floor(currentStep);
    if (roundedStep !== lastTriggeredStep.current) {
      lastTriggeredStep.current = roundedStep;
      const stepHoles = song.holes.filter(h => h.step === roundedStep);
      stepHoles.forEach(h => {
        triggerTine(h.tineIndex);
      });
    }
  }, [currentStep, song.holes, triggerTine]);

  // Geometry dimensions
  const paperWidth = 46;    // Proportional paper strip width (mm)
  const slotWidth = 52;     // Front and back panel slot width
  const slotHeight = 5.0;   // 5mm vertical slot opening
  const paperY = 4.0;       // Center height of slot and paper
  const boxWidth = 140;
  const boxDepth = 100;
  const boxHeight = 44;
  const wallThick = 7;

  // Physical specifications of paper strip & high-definition pixel projection constants
  const CANVAS_W = 4096;
  const CANVAS_H = 652;
  const TOTAL_ARC_LENGTH = 290.127; // mm
  const READ_HEAD_FRACTION = 142.633 / TOTAL_ARC_LENGTH; // ~0.491624
  const READ_HEAD_X = CANVAS_W * READ_HEAD_FRACTION;     // 2013.68 px
  const STEP_PITCH_MM = 5.0;                             // 5mm per 16th-note step
  const SCALE_X = CANVAS_W / TOTAL_ARC_LENGTH;           // 14.118 px/mm
  const STEP_WIDTH_PX = STEP_PITCH_MM * SCALE_X;         // 70.59 px/step
  const TILE_STEPS = 16;                                 // 1 Measure = 16 steps
  const TOP_MARGIN = 98;
  const BOTTOM_MARGIN = 98;
  const USABLE_H = CANVAS_H - TOP_MARGIN - BOTTOM_MARGIN; // 456 px
  const TINE_PITCH = USABLE_H / (TOTAL_TINES - 1);        // 15.724 px per tine track (30 tracks)
  const HOLE_RADIUS = 6.8;                               // 6.8px radius (13.6px diameter, perfectly fits 15.72px tine pitch)

  // Render dynamic Paper Strip Texture onto 2D canvas continuously within visible window (zero seams, no half-holes)
  const updatePaperTexture = useCallback(() => {
    const canvas = paperCanvasRef.current;
    const texture = paperTextureRef.current;
    if (!canvas || !texture) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Fill base paper cardstock background
    ctx.fillStyle = '#FAF6ED';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle edge depth gradient near paper margins
    const edgeGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0.06)');
    edgeGrad.addColorStop(0.04, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(0.96, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. Margins boundary lines (Crisp and solid)
    ctx.strokeStyle = '#6E5845';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, TOP_MARGIN);
    ctx.lineTo(CANVAS_W, TOP_MARGIN);
    ctx.moveTo(0, CANVAS_H - BOTTOM_MARGIN);
    ctx.lineTo(CANVAS_W, CANVAS_H - BOTTOM_MARGIN);
    ctx.stroke();

    // 3. 30 Horizontal pitch guide lines (Uniform solid lines across all tracks - completely smooth and even!)
    ctx.setLineDash([]);
    for (let i = 0; i < TOTAL_TINES; i++) {
      const y = CANVAS_H - BOTTOM_MARGIN - (i * TINE_PITCH);
      const note = MUSIC_BOX_SCALE[i];
      const noteName = note ? note.name : '';
      const isC = noteName.startsWith('C') && !noteName.includes('#');

      ctx.beginPath();
      if (isC) {
        // Octave C lines (C3, C4, C5, C6): Subtle darker tone, uniform line width
        ctx.strokeStyle = '#503A28';
        ctx.lineWidth = 1.35;
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();

        // High-contrast pitch name badge on left margin guide
        ctx.fillStyle = '#503A28';
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(noteName, 18, y + 5);
      } else {
        // All other pitch tracks: Uniform, consistent, continuous solid lines
        ctx.strokeStyle = '#8C7762';
        ctx.lineWidth = 1.1;
        ctx.moveTo(25, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }
    }

    // 4. Calculate visible step range (only ~58 steps visible at once, avoiding whole-song baking)
    // x(s) = READ_HEAD_X + (s - currentStep) * STEP_WIDTH_PX
    const startStep = currentStep - READ_HEAD_X / STEP_WIDTH_PX;
    const endStep = currentStep + (CANVAS_W - READ_HEAD_X) / STEP_WIDTH_PX;
    const minStep = Math.floor(startStep) - 2;
    const maxStep = Math.ceil(endStep) + 2;
    const stepsPerMeasure = song.timeSignature
      ? (song.timeSignature[1] === 8 ? Math.max(2, song.timeSignature[0] * 2) : Math.max(4, song.timeSignature[0] * 4))
      : 16;

    // Vertical Measure & Beat Grid Lines (Uniform, flush bounds, no broken dashes or uneven heights)
    ctx.setLineDash([]);
    for (let s = minStep; s <= maxStep; s++) {
      const x = READ_HEAD_X + (s - currentStep) * STEP_WIDTH_PX;
      if (x < -40 || x > CANVAS_W + 40) continue;

      const isMeasure = s >= 0 && s % stepsPerMeasure === 0;
      const isBeat = s >= 0 && s % 4 === 0;
      const isEighth = s >= 0 && s % 2 === 0 && !isBeat;
      const isSixteenth = s >= 0 && !isMeasure && !isBeat && !isEighth;

      if (isMeasure) {
        // Measure line: Solid, flush from TOP_MARGIN to BOTTOM_MARGIN
        ctx.strokeStyle = '#4A3422';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.stroke();

        // Uniform margin ruler ticks (6px)
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN - 6);
        ctx.lineTo(x, TOP_MARGIN);
        ctx.moveTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN + 6);
        ctx.stroke();

        // Clean sans-serif measure labels in top and bottom margins
        const m = Math.floor(s / stepsPerMeasure);
        ctx.fillStyle = '#4A3422';
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`M${m + 1}`, x, TOP_MARGIN - 14);
        ctx.fillText(`M${m + 1}`, x, CANVAS_H - BOTTOM_MARGIN + 28);
        ctx.textAlign = 'left';
      } else if (isBeat) {
        // Beat line: Solid, flush from TOP_MARGIN to BOTTOM_MARGIN
        ctx.strokeStyle = '#75604D';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.stroke();

        // Uniform margin ruler ticks (4px)
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN - 4);
        ctx.lineTo(x, TOP_MARGIN);
        ctx.moveTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN + 4);
        ctx.stroke();
      } else if (isEighth) {
        // 8th-note line: Clean, solid fine hairline (flush from margin to margin)
        ctx.strokeStyle = '#A89784';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.stroke();

        // Margin ruler ticks (3px)
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN - 3);
        ctx.lineTo(x, TOP_MARGIN);
        ctx.moveTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN + 3);
        ctx.stroke();
      } else if (isSixteenth) {
        // 16th-note: Clean ruler ticks in margin only, leaving cell body clear and even
        ctx.strokeStyle = '#B8A895';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN - 3);
        ctx.lineTo(x, TOP_MARGIN);
        ctx.moveTo(x, CANVAS_H - BOTTOM_MARGIN);
        ctx.lineTo(x, CANVAS_H - BOTTOM_MARGIN + 3);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 5. Punched Circular Holes (True Physical Through-Holes with continuous coordinates - zero seam cuts!)
    const visibleHoles = song.holes.filter(h => h.step >= minStep - 1 && h.step <= maxStep + 1);

    visibleHoles.forEach(hole => {
      const hx = READ_HEAD_X + (hole.step - currentStep) * STEP_WIDTH_PX;
      const hy = CANVAS_H - BOTTOM_MARGIN - (hole.tineIndex * TINE_PITCH);

      if (hx < -HOLE_RADIUS * 2 || hx > CANVAS_W + HOLE_RADIUS * 2) return;

      // A. Physical Cutout: Clears pixels to alpha = 0 (transparent through-hole)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(hx, hy, HOLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.restore();

      // B. Cardstock Cut Edge: punch impression, interior shadow and highlight
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // Outer mechanical punch impression ring
      ctx.beginPath();
      ctx.arc(hx, hy, HOLE_RADIUS + 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(160, 145, 125, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Top-left interior cut-edge shadow (paper thickness depth)
      ctx.beginPath();
      ctx.arc(hx, hy, HOLE_RADIUS + 0.2, Math.PI * 0.7, Math.PI * 1.8);
      ctx.strokeStyle = 'rgba(40, 26, 14, 0.8)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Bottom-right cut-edge highlight
      ctx.beginPath();
      ctx.arc(hx, hy, HOLE_RADIUS + 0.2, -Math.PI * 0.2, Math.PI * 0.7);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    });

    // 6. Hairline alignment indicator under the pressure plate at read line
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.4)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(READ_HEAD_X, 0);
    ctx.lineTo(READ_HEAD_X, CANVAS_H);
    ctx.stroke();
    ctx.setLineDash([]);

    texture.needsUpdate = true;
  }, [currentStep, song.holes, song.timeSignature]);

  // Procedural Walnut Wood Texture Generator
  const createWalnutTexture = useCallback((): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3E2517';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 512; i += 2) {
      const alpha = 0.12 + Math.sin(i * 0.05) * 0.08 + Math.cos(i * 0.012) * 0.04;
      ctx.fillStyle = i % 8 === 0 ? `rgba(32, 17, 10, ${alpha * 1.5})` : `rgba(74, 46, 28, ${alpha})`;
      ctx.fillRect(0, i, 512, 1.5);
    }

    for (let j = 0; j < 30; j++) {
      const yBase = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      for (let x = 0; x <= 512; x += 20) {
        const yOffset = Math.sin(x * 0.02 + j) * 8 + Math.cos(x * 0.008) * 12;
        ctx.lineTo(x, yBase + yOffset);
      }
      ctx.strokeStyle = 'rgba(25, 12, 6, 0.25)';
      ctx.lineWidth = 1.2 + Math.random() * 2;
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }, []);

  // Helper to build 3D Brass Spur Gears with teeth, axle hub and optional open spokes
  // Helper to build 3D Brass Spur Gears with authentic tapered & pointed teeth, bevels, and axle hub
  const createGearMesh = (
    radius: number,
    thickness: number,
    numTeeth: number,
    brassMaterial: THREE.Material,
    hasSpokes: boolean = false
  ): THREE.Group => {
    const gearGroup = new THREE.Group();

    // 1. Central axle hub collar with hollow bore through which the shaft passes
    const collarOuterR = radius * 0.28;
    const collarInnerR = 1.42;
    const collarShape = new THREE.Shape();
    collarShape.absarc(0, 0, collarOuterR, 0, Math.PI * 2, false);
    const collarHole = new THREE.Path();
    collarHole.absarc(0, 0, collarInnerR, 0, Math.PI * 2, true);
    collarShape.holes.push(collarHole);
    const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
      depth: thickness * 1.35,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    collarGeo.translate(0, 0, -(thickness * 1.35) / 2);
    collarGeo.rotateY(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, brassMaterial);
    gearGroup.add(collarMesh);

    // 2. Generate 2D Gear Profile Shape with authentic sharp, pointed & tapered clockwork teeth for clear interlocking
    const shape = new THREE.Shape();
    const deltaAngle = (Math.PI * 2) / numTeeth;
    const module = (2 * radius) / numTeeth;
    const ha = 1.15 * module; // Taller addendum for authentic deep tooth bite
    const hd = 1.25 * module; // Deeper dedendum for clear root clearance
    const rRoot = Math.max(radius * 0.44, radius - hd);
    const rTip = radius + ha;
    const rPitch = radius;

    for (let i = 0; i < numTeeth; i++) {
      const theta = i * deltaAngle;

      // Point 1: Deep root valley trough start
      const t1 = theta - 0.46 * deltaAngle;
      const p1x = Math.cos(t1) * rRoot;
      const p1y = Math.sin(t1) * rRoot;

      // Point 2: Tooth base root fillet (taper starts promptly)
      const t2 = theta - 0.20 * deltaAngle;
      const p2x = Math.cos(t2) * (rRoot + 0.12 * hd);
      const p2y = Math.sin(t2) * (rRoot + 0.12 * hd);

      // Point 3: Pitch line flank (narrow, tapered)
      const t3 = theta - 0.08 * deltaAngle;
      const p3x = Math.cos(t3) * rPitch;
      const p3y = Math.sin(t3) * rPitch;

      // Point 4: Sharp pointed apex tip crest (very pointed triangular apex)
      const t4 = theta - 0.015 * deltaAngle;
      const p4x = Math.cos(t4) * (rTip - 0.03 * ha);
      const p4y = Math.sin(t4) * (rTip - 0.03 * ha);

      // Point 5: Sharp apex point
      const p5x = Math.cos(theta) * rTip;
      const p5y = Math.sin(theta) * rTip;

      // Point 6: Sharp pointed apex tip right
      const t6 = theta + 0.015 * deltaAngle;
      const p6x = Math.cos(t6) * (rTip - 0.03 * ha);
      const p6y = Math.sin(t6) * (rTip - 0.03 * ha);

      // Point 7: Right pitch line flank
      const t7 = theta + 0.08 * deltaAngle;
      const p7x = Math.cos(t7) * rPitch;
      const p7y = Math.sin(t7) * rPitch;

      // Point 8: Tooth base right root fillet
      const t8 = theta + 0.20 * deltaAngle;
      const p8x = Math.cos(t8) * (rRoot + 0.12 * hd);
      const p8y = Math.sin(t8) * (rRoot + 0.12 * hd);

      // Point 9: Deep root valley trough end
      const t9 = theta + 0.46 * deltaAngle;
      const p9x = Math.cos(t9) * rRoot;
      const p9y = Math.sin(t9) * rRoot;

      if (i === 0) {
        shape.moveTo(p1x, p1y);
      } else {
        shape.lineTo(p1x, p1y);
      }
      shape.lineTo(p2x, p2y);
      shape.lineTo(p3x, p3y);
      shape.lineTo(p4x, p4y);
      shape.lineTo(p5x, p5y);
      shape.lineTo(p6x, p6y);
      shape.lineTo(p7x, p7y);
      shape.lineTo(p8x, p8y);
      shape.lineTo(p9x, p9y);
    }
    shape.closePath();

    // 3. Cutout window holes for open spoke clockwork design
    if (hasSpokes) {
      const spokeHoleInner = radius * 0.36;
      const spokeHoleOuter = rRoot - 0.35;
      if (spokeHoleOuter > spokeHoleInner + 0.3) {
        for (let s = 0; s < 4; s++) {
          const sStart = (s / 4) * Math.PI * 2 + 0.18;
          const sEnd = ((s + 1) / 4) * Math.PI * 2 - 0.18;
          const spokeHole = new THREE.Path();
          const arcDivs = 8;
          for (let k = 0; k <= arcDivs; k++) {
            const a = sStart + (k / arcDivs) * (sEnd - sStart);
            const x = Math.cos(a) * spokeHoleOuter;
            const y = Math.sin(a) * spokeHoleOuter;
            if (k === 0) spokeHole.moveTo(x, y);
            else spokeHole.lineTo(x, y);
          }
          for (let k = arcDivs; k >= 0; k--) {
            const a = sStart + (k / arcDivs) * (sEnd - sStart);
            const x = Math.cos(a) * spokeHoleInner;
            const y = Math.sin(a) * spokeHoleInner;
            spokeHole.lineTo(x, y);
          }
          spokeHole.closePath();
          shape.holes.push(spokeHole);
        }
      }
    }

    // Central axle bore through the gear disc (allows axle shaft to pass through cleanly)
    const centerBorePath = new THREE.Path();
    centerBorePath.absarc(0, 0, 1.42, 0, Math.PI * 2, true);
    shape.holes.push(centerBorePath);

    // 4. Extrude the gear with crisp, delicate bevels along the shaft axis that preserve pointed tooth tips
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.03,
      bevelSegments: 2,
      curveSegments: 1,
    };
    const gearGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center along extrusion depth:
    gearGeo.translate(0, 0, -thickness / 2);
    // Rotate so extrusion depth aligns with 3D scene X axis:
    gearGeo.rotateY(Math.PI / 2);
    gearGeo.computeVertexNormals();

    const gearMesh = new THREE.Mesh(gearGeo, brassMaterial);
    gearMesh.castShadow = true;
    gearMesh.receiveShadow = true;
    gearGroup.add(gearMesh);

    return gearGroup;
  };

  // Helper to generate pointed 6-tooth brass star-wheel geometry (齿状金属星轮)
  const createStarWheelGeometry = (): THREE.BufferGeometry => {
    const shape = new THREE.Shape();
    const numTeeth = 6;
    const rTip = 2.10;  // Sharp pointed tooth tip radius
    const rRoot = 1.30; // Root valley radius

    for (let j = 0; j < numTeeth; j++) {
      const angleRoot1 = (j * 2 * Math.PI) / numTeeth - Math.PI / (numTeeth * 1.4);
      const angleTip = (j * 2 * Math.PI) / numTeeth;
      const angleRoot2 = (j * 2 * Math.PI) / numTeeth + Math.PI / (numTeeth * 1.4);

      const xR1 = Math.cos(angleRoot1) * rRoot;
      const yR1 = Math.sin(angleRoot1) * rRoot;
      const xTip = Math.cos(angleTip) * rTip;
      const yTip = Math.sin(angleTip) * rTip;
      const xR2 = Math.cos(angleRoot2) * rRoot;
      const yR2 = Math.sin(angleRoot2) * rRoot;

      if (j === 0) {
        shape.moveTo(xR1, yR1);
      } else {
        shape.lineTo(xR1, yR1);
      }
      // Ramps up to sharp pointed tooth apex
      shape.lineTo(xTip, yTip);
      // Drops down to root
      shape.lineTo(xR2, yR2);
    }
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.55,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 2,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -0.275); // Center along extrusion depth
    geo.rotateY(Math.PI / 2);    // Axle along X, teeth rotate in Z-Y plane
    geo.computeVertexNormals();
    return geo;
  };

  // Apply glass transmittance, reflectivity, and roughness with TRUE optical planar mirror reflection
  const applyGlassMaterial = useCallback((trans: number, refl: number, rough: number) => {
    const t = trans / 100;
    const r = refl / 100;
    const ro = rough / 100;

    // 1. Planar Mirror Reflection on Glass Inner Surface (玻璃内侧为唯一定向反射面)
    if (reflectorRef.current) {
      const reflector = reflectorRef.current;
      // Mirror reflector active for mirror mode and semi-reflective half-mirror mode
      const isMirrorActive = r > 0.20 && t < 0.95;
      reflector.visible = isMirrorActive;

      if (isMirrorActive) {
        // Reflector opacity: scaled by reflectivity and transmittance
        const mirrorOpacity = Math.min(0.98, Math.max(0.0, r * (1.0 - t * 0.85)));
        const mat = reflector.material as THREE.ShaderMaterial;
        if (mat.uniforms && mat.uniforms.opacity) {
          mat.uniforms.opacity.value = mirrorOpacity;
        }
        mat.transparent = true;
        mat.depthWrite = mirrorOpacity >= 0.95;
        mat.side = THREE.FrontSide; // Only reflect from inner face facing into the music box!
        reflector.renderOrder = 15;

        if (mat.uniforms && mat.uniforms.color) {
          mat.uniforms.color.value.setHex(0xD8DDE2);
        }
      }
    }

    // 2. Physical Glass Pane (Pure Optical Transmission - other surfaces do NOT reflect)
    // 玻璃基板纯透光呈现，外表面不参与反射，杜绝双表面干涉抖动
    if (glassMaterialRef.current && glassMeshRef.current) {
      const mat = glassMaterialRef.current;
      const isGlassActive = t > 0.05 || r < 0.95;
      glassMeshRef.current.visible = isGlassActive;

      if (isGlassActive) {
        mat.transmission = t * 0.96;
        mat.opacity = Math.max(0.06, (1.0 - t) * 0.80);
        mat.metalness = 0.0;     // No conflicting metallic reflection on outer surfaces
        mat.roughness = Math.max(0.01, ro);
        mat.reflectivity = 0.0;  // 0% outer reflection to eliminate dual-surface shimmer
        mat.clearcoat = 0.0;     // No outer clearcoat reflection
        mat.clearcoatRoughness = 0.0;
        mat.transparent = true;
        mat.depthWrite = false;
        glassMeshRef.current.renderOrder = 10;

        if (t > 0.6) {
          mat.color.setHex(0xE8F2FC); // Clean optical crystal tint
        } else if (r > 0.5) {
          mat.color.setHex(0xD8DDE2); // Polished silver tint
        } else {
          mat.color.setHex(0xCCCCCC);
        }
        mat.needsUpdate = true;
      }
    }
  }, []);

  // Update physical material when params change
  useEffect(() => {
    applyGlassMaterial(transmittance, reflectivity, roughness);
  }, [transmittance, reflectivity, roughness, applyGlassMaterial]);

  // Update lid rotation target when lidAngle changes
  useEffect(() => {
    targetLidAngleRef.current = (lidAngle * Math.PI) / 180;
  }, [lidAngle]);

  const selectGlassPreset = (preset: 'mirror' | 'glass' | 'half' | 'frosted') => {
    setGlassPreset(preset);
    if (preset === 'mirror') {
      setTransmittance(0);
      setReflectivity(98);
      setRoughness(3);
    } else if (preset === 'glass') {
      setTransmittance(95);
      setReflectivity(0);
      setRoughness(2);
    } else if (preset === 'half') {
      setTransmittance(50);
      setReflectivity(60);
      setRoughness(5);
    } else if (preset === 'frosted') {
      setTransmittance(75);
      setReflectivity(0);
      setRoughness(45);
    }
  };

  // Immediate Camera Position Update
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const phi = targetCameraPhi.current;
    const theta = targetCameraTheta.current;
    const r = targetCameraDistance.current;
    const tgt = targetCameraTarget.current;

    cameraRef.current.position.x = tgt.x + r * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = tgt.y + r * Math.cos(phi);
    cameraRef.current.position.z = tgt.z + r * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(tgt);

    currentCameraPhi.current = phi;
    currentCameraTheta.current = theta;
    currentCameraDistance.current = r;
    currentCameraTarget.current.copy(tgt);
  }, []);

  // Set preset camera views with smooth flight interpolation
  const setCameraPreset = useCallback((preset: 'photo' | 'top' | 'front' | 'macro' | 'gears') => {
    setActiveView(preset);
    if (preset === 'photo') {
      // Exactly matches reference photo perspective!
      targetCameraDistance.current = 220;
      targetCameraPhi.current = 1.08;
      targetCameraTheta.current = -0.72;
      targetCameraTarget.current.set(4, 2, 2);
    } else if (preset === 'top') {
      // Top-down inspection of paper feed
      targetCameraDistance.current = 210;
      targetCameraPhi.current = 0.22;
      targetCameraTheta.current = -Math.PI / 2;
      targetCameraTarget.current.set(0, 2, 0);
    } else if (preset === 'front') {
      // Front slot entry view
      targetCameraDistance.current = 180;
      targetCameraPhi.current = 1.38;
      targetCameraTheta.current = 0.02;
      targetCameraTarget.current.set(0, 0, 30);
    } else if (preset === 'macro') {
      // Close up of roller and pressure plate
      targetCameraDistance.current = 110;
      targetCameraPhi.current = 0.88;
      targetCameraTheta.current = -0.58;
      targetCameraTarget.current.set(4, 5, 0);
    } else if (preset === 'gears') {
      // Close up of gear transmission
      targetCameraDistance.current = 100;
      targetCameraPhi.current = 0.95;
      targetCameraTheta.current = -0.15;
      targetCameraTarget.current.set(34, 6, -6);
    }
  }, []);

  // Build the complete 3D scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#141312');

    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 1500);
    cameraRef.current = camera;
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    rendererRef.current.setSize(width, height);
    rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current.toneMappingExposure = 1.25;

    container.replaceChildren(rendererRef.current.domElement);

    updateCameraPosition();

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xFFF7EC, 1.25);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xFFF5E6, 3.2);
    mainKeyLight.position.set(120, 220, 150);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 2048;
    mainKeyLight.shadow.mapSize.height = 2048;
    mainKeyLight.shadow.bias = -0.0005;
    scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0xE0E7FF, 1.0);
    fillLight.position.set(-150, 120, -100);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xFDE68A, 1.6);
    rimLight.position.set(-60, 180, 120);
    scene.add(rimLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(1200, 1200);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181716,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -boxHeight / 2 - 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // 3. Materials
    const walnutTex = createWalnutTexture();
    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTex,
      roughness: 0.55,
      metalness: 0.05,
      color: 0x5D3823,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xD4AF37,
      metalness: 0.88,
      roughness: 0.28,
    });

    const springSteelMat = new THREE.MeshStandardMaterial({
      color: 0xE8D176, // Polished spring brass / steel plate
      metalness: 0.92,
      roughness: 0.18,
    });

    const steelCombMat = new THREE.MeshStandardMaterial({
      color: 0xB5BAC1,
      metalness: 0.95,
      roughness: 0.22,
    });

    const whiteRollerMat = new THREE.MeshStandardMaterial({
      color: 0xF5F2EA,
      roughness: 0.45,
      metalness: 0.05,
    });

    // 4. Music Box Body: Walnut Box with Front Slot and Rear Slot
    const musicBoxGroup = new THREE.Group();
    scene.add(musicBoxGroup);

    // Bottom plate
    const bottomGeo = new THREE.BoxGeometry(boxWidth, wallThick, boxDepth);
    const bottomMesh = new THREE.Mesh(bottomGeo, woodMat);
    bottomMesh.position.y = -boxHeight / 2 + wallThick / 2;
    bottomMesh.castShadow = true;
    bottomMesh.receiveShadow = true;
    musicBoxGroup.add(bottomMesh);

    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(wallThick, boxHeight - wallThick, boxDepth);
    const leftWallMesh = new THREE.Mesh(sideWallGeo, woodMat);
    leftWallMesh.position.set(-boxWidth / 2 + wallThick / 2, wallThick / 2, 0);
    leftWallMesh.castShadow = true;
    musicBoxGroup.add(leftWallMesh);

    // Right wall
    const rightWallMesh = new THREE.Mesh(sideWallGeo, woodMat);
    rightWallMesh.position.set(boxWidth / 2 - wallThick / 2, wallThick / 2, 0);
    rightWallMesh.castShadow = true;
    musicBoxGroup.add(rightWallMesh);

    // Front & Back Wall Construction with Slots centered at paperY = 4.0
    const floorY = -boxHeight / 2 + wallThick; // -15
    const topY = boxHeight / 2;                // +22
    const slotYMin = paperY - slotHeight / 2;  // 1.5
    const slotYMax = paperY + slotHeight / 2;  // 6.5

    const sideCheekWidth = (boxWidth - slotWidth) / 2; // 44
    const cheekY = (floorY + topY) / 2;               // 3.5
    const cheekH = topY - floorY;                     // 37

    const underSlotH = slotYMin - floorY;             // 16.5
    const underSlotY = (floorY + slotYMin) / 2;       // -6.75

    const aboveSlotH = topY - slotYMax;               // 15.5
    const aboveSlotY = (slotYMax + topY) / 2;         // 14.25

    // Front Wall at z = 46.5
    const frontZ = boxDepth / 2 - wallThick / 2;

    const frontLeftCheek = new THREE.Mesh(new THREE.BoxGeometry(sideCheekWidth, cheekH, wallThick), woodMat);
    frontLeftCheek.position.set(-boxWidth / 2 + sideCheekWidth / 2, cheekY, frontZ);
    frontLeftCheek.castShadow = true;
    musicBoxGroup.add(frontLeftCheek);

    const frontRightCheek = new THREE.Mesh(new THREE.BoxGeometry(sideCheekWidth, cheekH, wallThick), woodMat);
    frontRightCheek.position.set(boxWidth / 2 - sideCheekWidth / 2, cheekY, frontZ);
    frontRightCheek.castShadow = true;
    musicBoxGroup.add(frontRightCheek);

    const frontBottomPiece = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, underSlotH, wallThick), woodMat);
    frontBottomPiece.position.set(0, underSlotY, frontZ);
    frontBottomPiece.castShadow = true;
    musicBoxGroup.add(frontBottomPiece);

    const frontTopPiece = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, aboveSlotH, wallThick), woodMat);
    frontTopPiece.position.set(0, aboveSlotY, frontZ);
    frontTopPiece.castShadow = true;
    musicBoxGroup.add(frontTopPiece);

    // Front brass stud
    const frontStudGeo = new THREE.CylinderGeometry(2.2, 2.2, 3, 16);
    const frontStud = new THREE.Mesh(frontStudGeo, brassMat);
    frontStud.position.set(0, boxHeight / 2, frontZ);
    musicBoxGroup.add(frontStud);

    // Back Wall at z = -46.5
    const backZ = -boxDepth / 2 + wallThick / 2;

    const backLeftCheek = new THREE.Mesh(new THREE.BoxGeometry(sideCheekWidth, cheekH, wallThick), woodMat);
    backLeftCheek.position.set(-boxWidth / 2 + sideCheekWidth / 2, cheekY, backZ);
    backLeftCheek.castShadow = true;
    musicBoxGroup.add(backLeftCheek);

    const backRightCheek = new THREE.Mesh(new THREE.BoxGeometry(sideCheekWidth, cheekH, wallThick), woodMat);
    backRightCheek.position.set(boxWidth / 2 - sideCheekWidth / 2, cheekY, backZ);
    backRightCheek.castShadow = true;
    musicBoxGroup.add(backRightCheek);

    const backBottomPiece = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, underSlotH, wallThick), woodMat);
    backBottomPiece.position.set(0, underSlotY, backZ);
    backBottomPiece.castShadow = true;
    musicBoxGroup.add(backBottomPiece);

    const backTopPiece = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, aboveSlotH, wallThick), woodMat);
    backTopPiece.position.set(0, aboveSlotY, backZ);
    backTopPiece.castShadow = true;
    musicBoxGroup.add(backTopPiece);

    // 5. Open Lid with Glass Mirror / Transparent Window
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, boxHeight / 2, backZ);
    lidGroup.rotation.x = -currentLidAngleRef.current;
    musicBoxGroup.add(lidGroup);
    lidGroupRef.current = lidGroup;

    const lidFrameW = boxWidth;
    const lidFrameD = boxDepth;
    const lidFrameThick = 7;
    const lidInnerW = boxWidth - 24;
    const lidInnerD = boxDepth - 24;

    const lidRailL = new THREE.Mesh(new THREE.BoxGeometry(12, lidFrameThick, lidFrameD), woodMat);
    lidRailL.position.set(-lidFrameW / 2 + 6, lidFrameThick / 2, lidFrameD / 2);
    lidRailL.castShadow = true;
    lidGroup.add(lidRailL);

    const lidRailR = new THREE.Mesh(new THREE.BoxGeometry(12, lidFrameThick, lidFrameD), woodMat);
    lidRailR.position.set(lidFrameW / 2 - 6, lidFrameThick / 2, lidFrameD / 2);
    lidRailR.castShadow = true;
    lidGroup.add(lidRailR);

    const lidRailFront = new THREE.Mesh(new THREE.BoxGeometry(lidInnerW, lidFrameThick, 12), woodMat);
    lidRailFront.position.set(0, lidFrameThick / 2, lidFrameD - 6);
    lidRailFront.castShadow = true;
    lidGroup.add(lidRailFront);

    const lidRailBack = new THREE.Mesh(new THREE.BoxGeometry(lidInnerW, lidFrameThick, 12), woodMat);
    lidRailBack.position.set(0, lidFrameThick / 2, 6);
    lidRailBack.castShadow = true;
    lidGroup.add(lidRailBack);

    // 5A. True Planar Mirror Reflector on Inner Surface (玻璃内侧镜面成像)
    // Inset slightly by 1.0mm from frame rails to completely prevent edge clipping / Z-fighting with wood
    const reflectorGeo = new THREE.PlaneGeometry(lidInnerW - 1.0, lidInnerD - 1.0);
    const mirrorCustomShader = {
      name: 'MusicBoxMirrorShader',
      uniforms: {
        color: { value: new THREE.Color(0xD8DDE2) },
        tDiffuse: { value: null },
        textureMatrix: { value: new THREE.Matrix4() },
        opacity: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vUv = textureMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float opacity;
        varying vec4 vUv;
        #include <logdepthbuf_pars_fragment>
        float blendOverlay( float base, float blend ) {
          return ( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
        }
        vec3 blendOverlay( vec3 base, vec3 blend ) {
          return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
        }
        void main() {
          #include <logdepthbuf_fragment>
          vec4 base = texture2DProj( tDiffuse, vUv );
          vec3 reflected = blendOverlay( base.rgb, color );
          gl_FragColor = vec4( reflected, opacity );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    };

    const mirrorReflector = new Reflector(reflectorGeo, {
      clipBias: 0.0001, // Minimal clipBias prevents edge clipping flutter
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0xD8DDE2,
      multisample: 4,
      shader: mirrorCustomShader,
    });
    mirrorReflector.rotation.x = Math.PI / 2;
    mirrorReflector.position.set(0, 1.4, lidFrameD / 2);
    (mirrorReflector.material as THREE.ShaderMaterial).side = THREE.FrontSide; // Only reflect from inner face facing into the music box!
    lidGroup.add(mirrorReflector);
    reflectorRef.current = mirrorReflector;

    // 5B. Physical Transparent Glass Pane (Pure Optical Transmission - other surfaces do NOT reflect)
    // Inset slightly to prevent overlapping edges
    const glassGeo = new THREE.BoxGeometry(lidInnerW - 1.0, 1.4, lidInnerD - 1.0);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xE8F2FC,
      metalness: 0.0,
      roughness: 0.02,
      transmission: 0.95,
      transparent: true,
      opacity: 0.15,
      ior: 1.52,
      reflectivity: 0.0, // Outer surfaces have 0 reflection to avoid double-surface fighting
      clearcoat: 0.0,
      clearcoatRoughness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, lidFrameThick / 2, lidFrameD / 2);
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = false;
    glassMesh.renderOrder = 10;
    lidGroup.add(glassMesh);
    glassMaterialRef.current = glassMat;
    glassMeshRef.current = glassMesh;

    // Apply active glass & mirror material settings immediately
    applyGlassMaterial(transmittance, reflectivity, roughness);

    // Hinges
    const hingeGeo = new THREE.CylinderGeometry(1.5, 1.5, 10, 12);
    const hinge1 = new THREE.Mesh(hingeGeo, brassMat);
    hinge1.rotation.z = Math.PI / 2;
    hinge1.position.set(-boxWidth / 3, 0, 0);
    lidGroup.add(hinge1);

    const hinge2 = new THREE.Mesh(hingeGeo, brassMat);
    hinge2.rotation.z = Math.PI / 2;
    hinge2.position.set(boxWidth / 3, 0, 0);
    lidGroup.add(hinge2);

    // 6. Mechanical Movement Chassis
    const mechGroup = new THREE.Group();
    musicBoxGroup.add(mechGroup);

    // Brass Bed Plate with engineered Gear 1 Clearance Well (避让槽)
    const chassisThick = 4;
    const chassisY = -0.5; // Top face at y = +1.5, bottom face at y = -2.5

    // 1. Main Left Bed Plate (x in [-38, +29.5], depth 68mm)
    const mainChassisGeo = new THREE.BoxGeometry(67.5, chassisThick, 68);
    const mainChassisMesh = new THREE.Mesh(mainChassisGeo, brassMat);
    mainChassisMesh.position.set(-4.25, chassisY, 0);
    mainChassisMesh.receiveShadow = true;
    mechGroup.add(mainChassisMesh);

    // 2. Front Gearbox Bridge (x in [29.5, 42.5], z in [+6.8, +34.0])
    const frontGearBridgeGeo = new THREE.BoxGeometry(13, chassisThick, 27.2);
    const frontGearBridgeMesh = new THREE.Mesh(frontGearBridgeGeo, brassMat);
    frontGearBridgeMesh.position.set(36.0, chassisY, 20.4);
    frontGearBridgeMesh.receiveShadow = true;
    mechGroup.add(frontGearBridgeMesh);

    // 3. Rear Gearbox Bridge (x in [29.5, 42.5], z in [-34.0, -6.8])
    const rearGearBridgeGeo = new THREE.BoxGeometry(13, chassisThick, 27.2);
    const rearGearBridgeMesh = new THREE.Mesh(rearGearBridgeGeo, brassMat);
    rearGearBridgeMesh.position.set(36.0, chassisY, -20.4);
    rearGearBridgeMesh.receiveShadow = true;
    mechGroup.add(rearGearBridgeMesh);

    // 4. Outer Right Frame Flange (x in [40.5, 42.5], z in [-6.8, +6.8])
    const outerGearFlangeGeo = new THREE.BoxGeometry(2.0, chassisThick, 13.6);
    const outerGearFlangeMesh = new THREE.Mesh(outerGearFlangeGeo, brassMat);
    outerGearFlangeMesh.position.set(41.5, chassisY, 0);
    outerGearFlangeMesh.receiveShadow = true;
    mechGroup.add(outerGearFlangeMesh);

    // 5. Recessed Lower Sump Plate under Gear 1 (Hollow clearance well at y = -3.2)
    // Allows Gear 1 (lowest point y = -1.8) to spin freely with 1.4mm clearance and zero clipping!
    const gearWellPanGeo = new THREE.BoxGeometry(11, 1.4, 13.6);
    const gearWellPanMesh = new THREE.Mesh(gearWellPanGeo, brassMat);
    gearWellPanMesh.position.set(35.0, -3.2, 0);
    gearWellPanMesh.receiveShadow = true;
    mechGroup.add(gearWellPanMesh);

    // =========================================================================
    // Comb teeth rendering disabled per request ("先不要绘制音齿了")
    // =========================================================================
    tinesRef.current = [];

    // =========================================================================
    // Lower Paper Guide Bed & Star-Wheel Carrier (下托纸金属导向板与星轮阵列)
    // Firmly supports paper underneath front/rear lips, with central recessed channel for star wheels
    // =========================================================================
    // Front Lower Guide Bed Plate (Supports paper under front pressure lip at z in [5.25, 11.75])
    // Positioned with top face at y = 3.50mm, leaving a safe 0.5mm clearance below paper ribbon (y = 4.0mm) to prevent Z-fighting
    const lowerFrontPlateGeo = new THREE.BoxGeometry(50, 1.2, 6.5);
    const lowerFrontPlateMesh = new THREE.Mesh(lowerFrontPlateGeo, brassMat);
    lowerFrontPlateMesh.position.set(0, paperY - 0.5 - 0.6, 8.5);
    lowerFrontPlateMesh.receiveShadow = true;
    mechGroup.add(lowerFrontPlateMesh);

    // Rear Lower Guide Bed Plate (Supports paper under rear pressure lip at z in [-11.75, -5.25])
    // Positioned with top face at y = 3.50mm, leaving safe 0.5mm clearance below paper ribbon (y = 4.0mm)
    const lowerRearPlateGeo = new THREE.BoxGeometry(50, 1.2, 6.5);
    const lowerRearPlateMesh = new THREE.Mesh(lowerRearPlateGeo, brassMat);
    lowerRearPlateMesh.position.set(0, paperY - 0.5 - 0.6, -8.5);
    lowerRearPlateMesh.receiveShadow = true;
    mechGroup.add(lowerRearPlateMesh);

    // Recessed Star-Wheel Carrier block (Recessed below the paper deformation arch so it never clips)
    const carrierBlockGeo = new THREE.BoxGeometry(46, 2.0, 11.5);
    const carrierBlockMesh = new THREE.Mesh(carrierBlockGeo, brassMat);
    carrierBlockMesh.position.set(0, 1.4, 0);
    carrierBlockMesh.receiveShadow = true;
    mechGroup.add(carrierBlockMesh);

    // Star-Wheel Carrier steel axle at z = 0, y = 1.85
    const starWheelAxleGeo = new THREE.CylinderGeometry(0.7, 0.7, 44, 16);
    starWheelAxleGeo.rotateZ(Math.PI / 2);
    const starWheelAxleMesh = new THREE.Mesh(starWheelAxleGeo, steelCombMat);
    starWheelAxleMesh.position.set(0, 1.85, 0);
    mechGroup.add(starWheelAxleMesh);

    // 30 Pointed Brass Star-Wheels (齿状金属星轮) aligned with the 30 pitch channels
    // When paper has no hole, tooth tips rest flush below paper bottom (y_top <= 3.95 < y_paper_arch 4.36).
    // When a hole passes the read line, the tooth pops up through the hole aperture (y_top = 4.50)!
    const starWheelPitch = 32.2 / (TOTAL_TINES - 1); // ~1.11mm
    const starWheelStart = -16.1;
    const starWheelGeo = createStarWheelGeometry();
    const swGroups: THREE.Group[] = [];

    for (let i = 0; i < TOTAL_TINES; i++) {
      const sx = starWheelStart + i * starWheelPitch;
      const swGroup = new THREE.Group();
      swGroup.position.set(sx, 1.85, 0);

      const swMesh = new THREE.Mesh(starWheelGeo, brassMat);
      swMesh.castShadow = true;
      swGroup.add(swMesh);

      // Fine central hub bushing collar
      const hubCollarGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.75, 12);
      hubCollarGeo.rotateZ(Math.PI / 2);
      const hubCollarMesh = new THREE.Mesh(hubCollarGeo, brassMat);
      swGroup.add(hubCollarMesh);

      mechGroup.add(swGroup);
      swGroups.push(swGroup);
    }
    starWheelsRef.current = swGroups;

    // =========================================================================
    // UPGRADE 2: 加宽压纸片与大尺寸中间镂空观察窗 (Widened Spring Steel Pressure Plate)
    // Widen pressure plate along X and Z, with a spacious central cutout window
    // =========================================================================
    const plateWidth = 52;   // Widened to 52mm (covers 46mm paper with 3mm margin on each side)
    const plateDepth = 21;   // Spans z = -9.5 to +11.5
    const plateThick = 0.50; // Spring steel plate thickness

    const plateGroup = new THREE.Group();
    plateGroup.position.set(0, paperY + 0.35, 0); // Resting right over paper
    mechGroup.add(plateGroup);

    // Front clamping lip of pressure plate (Flat clamping section: z in [6.0, 10.5])
    const plateFrontLip = new THREE.Mesh(new THREE.BoxGeometry(plateWidth, plateThick, 4.5), springSteelMat);
    plateFrontLip.position.set(0, 0, 8.25);
    plateGroup.add(plateFrontLip);

    // Flared front entry guide bevel (angled upward by ~14 deg to smoothly guide incoming paper)
    const frontFlareGeo = new THREE.BoxGeometry(plateWidth, plateThick, 1.7);
    const frontFlare = new THREE.Mesh(frontFlareGeo, springSteelMat);
    frontFlare.position.set(0, 0.25, 11.2);
    frontFlare.rotation.x = -0.24;
    plateGroup.add(frontFlare);

    // Rear clamping lip of pressure plate (Flat clamping section: z in [-9.5, -6.0])
    const plateBackLip = new THREE.Mesh(new THREE.BoxGeometry(plateWidth, plateThick, 3.5), springSteelMat);
    plateBackLip.position.set(0, 0, -7.75);
    plateGroup.add(plateBackLip);

    // Flared rear exit guide bevel (angled upward by ~14 deg)
    const rearFlareGeo = new THREE.BoxGeometry(plateWidth, plateThick, 1.5);
    const rearFlare = new THREE.Mesh(rearFlareGeo, springSteelMat);
    rearFlare.position.set(0, 0.22, -10.1);
    rearFlare.rotation.x = 0.24;
    plateGroup.add(rearFlare);

    // Left and right side connector rails (Width 3.5mm, spanning the full depth)
    // Center cutout window between rails is 45.0mm wide (x in [-22.5, +22.5])
    // Center cutout window between lips is 12.0mm deep (z in [-6.0, +6.0]) - DOUBLED from previous 6mm!
    const plateSideGeo = new THREE.BoxGeometry(3.5, plateThick, plateDepth);
    const plateSideL = new THREE.Mesh(plateSideGeo, springSteelMat);
    plateSideL.position.set(-plateWidth / 2 + 1.75, 0, 0.85);
    plateGroup.add(plateSideL);

    const plateSideR = new THREE.Mesh(plateSideGeo, springSteelMat);
    plateSideR.position.set(plateWidth / 2 - 1.75, 0, 0.85);
    plateGroup.add(plateSideR);

    // Brass Arch Mounting Brackets & Dual Knurled Thumb Screws holding the pressure plate
    const archBracketGeo = new THREE.BoxGeometry(4.0, 5.5, 16);
    const archBracketL = new THREE.Mesh(archBracketGeo, brassMat);
    archBracketL.position.set(-plateWidth / 2 - 2.5, paperY + 1.2, 0.5);
    mechGroup.add(archBracketL);

    const archBracketR = new THREE.Mesh(archBracketGeo, brassMat);
    archBracketR.position.set(plateWidth / 2 + 2.5, paperY + 1.2, 0.5);
    mechGroup.add(archBracketR);

    // 2 Knurled brass thumbscrews per side at z = +4.5 and z = -4.5
    const thumbScrewGeo = new THREE.CylinderGeometry(2.0, 2.0, 2.5, 16);
    [-4.5, 4.5].forEach(zPos => {
      const tsL = new THREE.Mesh(thumbScrewGeo, brassMat);
      tsL.position.set(-plateWidth / 2 - 2.5, paperY + 4.2, zPos + 0.5);
      mechGroup.add(tsL);

      const tsR = new THREE.Mesh(thumbScrewGeo, brassMat);
      tsR.position.set(plateWidth / 2 + 2.5, paperY + 4.2, zPos + 0.5);
      mechGroup.add(tsR);
    });

    // =========================================================================
    // UPGRADE 3: 加粗压纸轮 (Thickened Cylindrical Feed Roller)
    // =========================================================================
    // Substantial chunky white feed roller (radius 4.8mm, diameter ~9.6mm)
    const rollerLength = 50;
    const rollerRadius = 4.8; // Thickened substantially
    const rollerZ = -14;
    const rollerY = paperY + rollerRadius; // Center at 8.8 (bottom touches paper at 4.0!)

    const rollerGeo = new THREE.CylinderGeometry(rollerRadius, rollerRadius, rollerLength, 32);
    rollerGeo.rotateZ(Math.PI / 2);
    const rollerMesh = new THREE.Mesh(rollerGeo, whiteRollerMat);
    rollerMesh.position.set(0, rollerY, rollerZ);
    rollerMesh.castShadow = true;
    mechGroup.add(rollerMesh);
    rollerMeshRef.current = rollerMesh;

    // Brass Bearing Pillars holding the thickened feed roller on both ends
    const rollerPillarGeo = new THREE.BoxGeometry(4, 11, 8);
    const rollerPillarL = new THREE.Mesh(rollerPillarGeo, brassMat);
    rollerPillarL.position.set(-rollerLength / 2 - 2.5, rollerY - 1.5, rollerZ);
    mechGroup.add(rollerPillarL);

    const rollerPillarR = new THREE.Mesh(rollerPillarGeo, brassMat);
    rollerPillarR.position.set(rollerLength / 2 + 2.5, rollerY - 1.5, rollerZ);
    mechGroup.add(rollerPillarR);

    // Steel axle passing through the roller and into the gear train
    const axleGeo = new THREE.CylinderGeometry(1.6, 1.6, 72, 16);
    axleGeo.rotateZ(Math.PI / 2);
    const axleMesh = new THREE.Mesh(axleGeo, steelCombMat);
    axleMesh.position.set(8, rollerY, rollerZ);
    mechGroup.add(axleMesh);

    // =========================================================================
    // UPGRADE 4: 侧面曲柄通过二级减速齿轮传动带动纸带运动 (Compound Reduction Gear Train)
    // =========================================================================
    // Right side mechanical gear train connecting Crank Shaft -> Roller Axle!
    // Realistic 3.08 : 1 Reduction Ratio: Crank turns ~3 times per roller turn!
    const gearX = 35; // Positioned between paper right edge (23) and right wall (63)

    // Stage 1 Driving Gear: Large Spur Gear on Crank Shaft at (x = 35, y = 4.0, z = 0)
    // Z1 = 20 teeth, radius 5.8mm with elegant spokes (Large driver reduces crank rotation speed)
    const gear1Group = createGearMesh(5.8, 2.4, 20, brassMat, true);
    gear1Group.position.set(gearX, paperY, 0);
    mechGroup.add(gear1Group);
    gear1Ref.current = gear1Group;

    // Stage 1 Driven + Stage 2 Driving: Compound Intermediate Gear Unit at (y = 11.9, z = -5.5)
    // True pitch circle tangency: d(Gear1, Gear2A) = 9.60mm, d(Gear2B, Gear3) = 9.15mm
    const gear2CompoundGroup = new THREE.Group();
    gear2CompoundGroup.position.set(gearX, 11.9, -5.5);
    mechGroup.add(gear2CompoundGroup);
    gear2Ref.current = gear2CompoundGroup;

    // Intermediate steel axle pin (Firmly anchored between inner and outer brackets, NO floating!)
    // Spans from x = 30.2 to x = 41.8, fully supported at both ends by brass bearing bosses
    const interAxleGeo = new THREE.CylinderGeometry(1.2, 1.2, 11.6, 16);
    interAxleGeo.rotateZ(Math.PI / 2);
    const interAxleMesh = new THREE.Mesh(interAxleGeo, steelCombMat);
    interAxleMesh.position.set(1.0, 0, 0);
    gear2CompoundGroup.add(interAxleMesh);

    // Gear 2A: Intermediate Pinion (Z2A = 12 teeth, radius 3.8mm, driven by Gear 1)
    const gear2AGroup = createGearMesh(3.8, 2.2, 12, brassMat);
    gear2AGroup.position.set(0, 0, 0);
    gear2CompoundGroup.add(gear2AGroup);

    // Gear 2B: Coaxial Intermediate Stepping Gear (Z2B = 18 teeth, radius 5.4mm with spokes)
    // Shifted along X by +3.2mm to mesh with Gear 3
    const gear2BGroup = createGearMesh(5.4, 2.2, 18, brassMat, true);
    gear2BGroup.position.set(3.2, 0, 0);
    gear2CompoundGroup.add(gear2BGroup);

    // Stage 2 Driven Gear: Roller Spur Gear on Feed Roller Axle (z = -14, y = rollerY)
    // Meshes with Gear 2B (Z2B = 18 -> Z3 = 12 teeth, radius 3.8mm)
    // Total Speed-Up Ratio = (20/12) * (18/12) = 2.5 : 1
    // Crank speed is lowered to natural, gentle hand-crank speed!
    const gear3Group = createGearMesh(3.8, 2.4, 12, brassMat);
    gear3Group.position.set(gearX + 3.2, rollerY, rollerZ);
    mechGroup.add(gear3Group);
    gear3Ref.current = gear3Group;

    const bossGeo = new THREE.CylinderGeometry(2.0, 2.0, 1.5, 12);
    bossGeo.rotateZ(Math.PI / 2);

    // Inner Gearbox Support Bracket with bearing bosses (x = 30.5)
    // Firmly holds the inner ends of the Gear 2 axle, Crank shaft, and Roller axle
    const innerGearPlate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 18, 26), brassMat);
    innerGearPlate.position.set(gearX - 4.5, 8.2, -6.5);
    mechGroup.add(innerGearPlate);

    const bossCrankInner = new THREE.Mesh(bossGeo, brassMat);
    bossCrankInner.position.set(gearX - 5.2, paperY, 0);
    mechGroup.add(bossCrankInner);

    const bossInterInner = new THREE.Mesh(bossGeo, brassMat);
    bossInterInner.position.set(gearX - 5.2, 11.9, -5.5);
    mechGroup.add(bossInterInner);

    const bossRollerInner = new THREE.Mesh(bossGeo, brassMat);
    bossRollerInner.position.set(gearX - 5.2, rollerY, rollerZ);
    mechGroup.add(bossRollerInner);

    // Outer Gearbox Support Bracket with bearing bosses (x = 40.5)
    const gearPlate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 18, 26), brassMat);
    gearPlate.position.set(gearX + 5.5, 8.2, -6.5);
    mechGroup.add(gearPlate);

    const bossCrank = new THREE.Mesh(bossGeo, brassMat);
    bossCrank.position.set(gearX + 6.2, paperY, 0);
    mechGroup.add(bossCrank);

    const bossInter = new THREE.Mesh(bossGeo, brassMat);
    bossInter.position.set(gearX + 6.2, 11.9, -5.5);
    mechGroup.add(bossInter);

    const bossRoller = new THREE.Mesh(bossGeo, brassMat);
    bossRoller.position.set(gearX + 6.2, rollerY, rollerZ);
    mechGroup.add(bossRoller);

    // 8. Continuous Paper Tape Ribbon:
    const paperCanvas = document.createElement('canvas');
    paperCanvas.width = CANVAS_W;
    paperCanvas.height = CANVAS_H;
    paperCanvasRef.current = paperCanvas;

    const paperTexture = new THREE.CanvasTexture(paperCanvas);
    paperTexture.wrapS = THREE.ClampToEdgeWrapping;
    paperTexture.wrapT = THREE.ClampToEdgeWrapping;
    paperTexture.colorSpace = THREE.SRGBColorSpace;
    paperTexture.generateMipmaps = false;
    paperTexture.minFilter = THREE.LinearFilter;
    paperTexture.magFilter = THREE.LinearFilter;
    if (rendererRef.current) {
      paperTexture.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy();
    }
    paperTextureRef.current = paperTexture;

    const paperMaterial = new THREE.MeshStandardMaterial({
      map: paperTexture,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.5,
      depthWrite: true,
      shadowSide: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    // Build Continuous Seamless Curved Paper Ribbon passing through front & back slots
    // Features realistic physical UPWARD BULGE / convex arch across the pressure plate cutout window (压纸片槽处向上凸起)
    const pathPoints: [number, number][] = [
      [145, -14.0], // Front desk edge
      [120, -5.0],
      [95, 1.5],
      [70, 3.6],
      [50, paperY], // FRONT PANEL SLOT CENTER (Exact Entry!)
      [28, paperY],
      [16, paperY],
      [10.5, paperY],       // Clamped flat under front lip
      [6.0, paperY],        // Front lip trailing edge (entering cutout window)
      [4.5, paperY + 0.12], // Smooth convex upward bulge in hollow cutout window
      [3.0, paperY + 0.24],
      [1.5, paperY + 0.32],
      [0.0, paperY + 0.36], // Read line (apex of upward bulge arch)
      [-1.5, paperY + 0.32],
      [-3.0, paperY + 0.24],
      [-4.5, paperY + 0.12],
      [-6.0, paperY],       // Rear lip leading edge (entering clamp)
      [-9.5, paperY],       // Clamped flat under rear lip
      [-14, paperY],        // Feed roller tangent
      [-25, paperY],
      [-50, paperY],        // REAR PANEL SLOT CENTER (Exact Exit!)
      [-70, 3.5],
      [-95, 1.0],
      [-120, -6.0],
      [-140, -14.0],        // Rear desk edge
    ];

    const numCrossSections = pathPoints.length;
    const arcLengths: number[] = [0];
    for (let k = 1; k < numCrossSections; k++) {
      const dz = pathPoints[k][0] - pathPoints[k - 1][0];
      const dy = pathPoints[k][1] - pathPoints[k - 1][1];
      const dist = Math.sqrt(dz * dz + dy * dy);
      arcLengths.push(arcLengths[k - 1] + dist);
    }
    const totalArcLength = arcLengths[numCrossSections - 1];

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const halfW = paperWidth / 2; // 23mm
    const numCols = 9;

    for (let k = 0; k < numCrossSections; k++) {
      const [z, yBase] = pathPoints[k];
      const u = 1.0 - (arcLengths[k] / totalArcLength);

      for (let c = 0; c < numCols; c++) {
        const colFrac = c / (numCols - 1);
        const x = -halfW + colFrac * paperWidth;
        const v = colFrac;

        // Subtle transverse cardstock convex arch within the hollow cutout region (|z| < 6.0)
        let y = yBase;
        if (Math.abs(z) < 6.0) {
          const transFactor = (1.0 - Math.pow(2 * colFrac - 1, 2)); // 1.0 at center, 0.0 at outer edges
          const zFactor = (1.0 - Math.pow(z / 6.0, 2));
          y += 0.06 * transFactor * zFactor; // Upward convex arch
        }

        positions.push(x, y, z);
        uvs.push(u, v);

        if (k > 0 && c > 0) {
          const prevRow = (k - 1) * numCols;
          const currRow = k * numCols;
          const pL = prevRow + (c - 1);
          const pR = prevRow + c;
          const cL = currRow + (c - 1);
          const cR = currRow + c;

          indices.push(pL, pR, cL);
          indices.push(pR, cR, cL);
        }
      }
    }

    const continuousPaperGeo = new THREE.BufferGeometry();
    continuousPaperGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    continuousPaperGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    continuousPaperGeo.setIndex(indices);
    continuousPaperGeo.computeVertexNormals();

    const continuousPaperMesh = new THREE.Mesh(continuousPaperGeo, paperMaterial);
    continuousPaperMesh.castShadow = true;
    continuousPaperMesh.receiveShadow = true;
    continuousPaperMesh.renderOrder = 0;
    musicBoxGroup.add(continuousPaperMesh);

    // 9. Brass Hand Crank on right exterior wall
    // Shaft extends from inner bracket (x = 30.5) through Gear 1 (x = 35.0),
    // through outer gearbox bracket (x = 40.5) and right box wall (x = 63.5-70) into crank handle
    const crankGroup = new THREE.Group();
    crankGroup.position.set(boxWidth / 2 + 1, paperY, 0);
    musicBoxGroup.add(crankGroup);
    crankGroupRef.current = crankGroup;

    // Drive shaft extending through inner bracket, Gear 1 bore, outer bracket, and right wall
    // Inner tip at world x = 29.5 (local -41.5), outer tip at local x = 9.5 (world 80.5)
    // Total length = 51.0mm, center local x = -16.0mm. Radius 1.38mm fits inside Gear 1's 1.42mm bore.
    const shaftLength = 51.0;
    const shaftGeo = new THREE.CylinderGeometry(1.38, 1.38, shaftLength, 16);
    shaftGeo.rotateZ(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeo, brassMat);
    shaftMesh.position.set(-16.0, 0, 0); // Passes from inner bracket boss through gear1 to outer crank
    shaftMesh.userData = { isCrank: true };
    crankGroup.add(shaftMesh);

    // Lever arm
    const leverGeo = new THREE.BoxGeometry(2.2, 19, 3.6);
    const leverMesh = new THREE.Mesh(leverGeo, brassMat);
    leverMesh.position.set(9, 7.5, 0);
    leverMesh.userData = { isCrank: true };
    crankGroup.add(leverMesh);

    // Turned walnut knob
    const knobGeo = new THREE.CylinderGeometry(3.2, 2.8, 12, 16);
    knobGeo.rotateZ(Math.PI / 2);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x4E2F1B,
      roughness: 0.4,
      metalness: 0.1,
    });
    const knobMesh = new THREE.Mesh(knobGeo, knobMat);
    knobMesh.position.set(15, 15, 0);
    knobMesh.userData = { isCrank: true };
    crankGroup.add(knobMesh);

    // Generous invisible hit volume for smooth cursor hover and mouse wheel interaction
    const hitBoxGeo = new THREE.BoxGeometry(22, 28, 22);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const crankHitMesh = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    crankHitMesh.position.set(12, 10, 0);
    crankHitMesh.userData = { isCrank: true };
    crankGroup.add(crankHitMesh);

    // Initial paper texture render
    updatePaperTexture();

    // 10. Animation Loop: Clockwork Gear Transmission
    let lastTime = performance.now();
    let elapsedTime = 0;

    const animate = (now: number) => {
      animFrameId.current = requestAnimationFrame(animate);
      const currentTime = now || performance.now();
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      elapsedTime += delta;

      // Animate Tines spring vibration decay (safely guards when tines rendering is disabled)
      const tines = tinesRef.current;
      const vibs = tineVibrations.current;
      for (let i = 0; i < TOTAL_TINES; i++) {
        if (vibs[i] > 0.001) {
          vibs[i] = Math.max(0, vibs[i] - delta * 4.5);
          if (tines && tines[i]) {
            const osc = Math.sin(elapsedTime * 55) * vibs[i] * 0.06;
            tines[i].rotation.x = -osc;
          }
        } else if (tines && tines[i]) {
          tines[i].rotation.x = 0;
        }
      }

      // Synchronous Two-Stage Compound Gear Transmission (Lowered Crank Speed & Natural Cadence)
      // Tooth meshing: Crank Gear 1 (Z1=20) -> Compound Gear 2A (Z2A=12, Z2B=18) -> Feed Roller Gear 3 (Z3=12)
      // Compound gear ratio from crank to feed roller: i = (20 / 12) * (18 / 12) = 2.5 : 1
      // Paper feed linear pitch: 5.0mm/step. Feed roller radius: 4.8mm.
      // Roller angular displacement: 5.0 / 4.8 = 1.04167 rad/step (zero paper slip)
      // Reduced crank speed: 1.04167 / 2.5 = 0.41667 rad/step (lowered ~7.7x, ~15 steps per complete 360° turn)
      const crankAngle = currentStepRef.current * 0.41667;
      // Phase offset Math.PI / 12 ensures Gear 2A pointed teeth cleanly enter Gear 1 root valleys
      const gear2Angle = -crankAngle * (20 / 12) + (Math.PI / 12);
      const rollerAngle = -(gear2Angle - (Math.PI / 12)) * (18 / 12) + (Math.PI / 12);

      if (crankGroupRef.current) {
        crankGroupRef.current.rotation.x = crankAngle;
      }
      if (gear1Ref.current) {
        gear1Ref.current.rotation.x = crankAngle;
      }
      if (gear2Ref.current) {
        gear2Ref.current.rotation.x = gear2Angle;
      }
      if (gear3Ref.current) {
        gear3Ref.current.rotation.x = rollerAngle;
      }
      if (rollerMeshRef.current) {
        rollerMeshRef.current.rotation.x = rollerAngle;
      }

      // Star-Wheel Teeth Dynamic Engagement (纸带开孔处才露出齿状金属，未开孔处不露出)
      // When a punched hole passes the read line (|step - currentStep| < 0.65), the star wheel engages
      // and its pointed brass tooth tip pops UP through the hole aperture (+0.14mm above the paper).
      // On solid unpunched paper, tooth rests flush underneath (y_top <= 3.40 < y_paper 3.64), completely occluded.
      const swList = starWheelsRef.current;
      const currentStepVal = currentStepRef.current;
      const currentHoles = songRef.current ? songRef.current.holes : [];

      if (swList && swList.length === TOTAL_TINES) {
        for (let i = 0; i < TOTAL_TINES; i++) {
          const sw = swList[i];
          if (!sw) continue;

          // Find closest punched hole in track i within engagement range
          let minDiff = 999;
          for (let hIdx = 0; hIdx < currentHoles.length; hIdx++) {
            const h = currentHoles[hIdx];
            if (h.tineIndex === i) {
              const diff = h.step - currentStepVal;
              if (Math.abs(diff) < Math.abs(minDiff)) {
                minDiff = diff;
              }
            }
          }

          if (Math.abs(minDiff) <= 0.65) {
            // Hole is present at the reading aperture: tooth engages and pops up into the hole!
            const pop = Math.max(0, 1.0 - Math.pow(minDiff / 0.65, 2));
            const targetY = 1.85 + pop * 0.55; // Tooth apex rises to 2.40 + 2.10 = 4.50mm (+0.14mm into the punched hole)
            const dz = minDiff * 5.0; // mm offset along Z
            const targetRot = (currentStepVal * 0.41667) + (dz / 2.10);

            sw.position.y += (targetY - sw.position.y) * 0.35;
            sw.rotation.x = targetRot;
          } else {
            // No hole: tooth rests safely beneath the paper (y_top <= 3.95 < y_paper_arch 4.36)
            const targetY = 1.85;
            const targetRot = currentStepVal * 0.41667;

            sw.position.y += (targetY - sw.position.y) * 0.35;
            sw.rotation.x = targetRot;
          }
        }
      }

      // Smooth Camera Glide Interpolation (Silky smooth cinematic response)
      const camLerp = 0.085;
      currentCameraPhi.current += (targetCameraPhi.current - currentCameraPhi.current) * camLerp;
      currentCameraTheta.current += (targetCameraTheta.current - currentCameraTheta.current) * camLerp;
      currentCameraDistance.current += (targetCameraDistance.current - currentCameraDistance.current) * camLerp;
      currentCameraTarget.current.lerp(targetCameraTarget.current, camLerp);

      const phi = currentCameraPhi.current;
      const theta = currentCameraTheta.current;
      const r = currentCameraDistance.current;
      const tgt = currentCameraTarget.current;

      camera.position.x = tgt.x + r * Math.sin(phi) * Math.sin(theta);
      camera.position.y = tgt.y + r * Math.cos(phi);
      camera.position.z = tgt.z + r * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(tgt);

      // Smooth Lid Opening Angle Interpolation
      const lidLerp = 0.12;
      currentLidAngleRef.current += (targetLidAngleRef.current - currentLidAngleRef.current) * lidLerp;
      if (lidGroupRef.current) {
        lidGroupRef.current.rotation.x = -currentLidAngleRef.current;
      }

      renderer.render(scene, camera);
    };

    const renderer = rendererRef.current;
    animate(performance.now());

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      if (newW === 0 || newH === 0) return;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      renderer.dispose();
      walnutTex.dispose();
      paperTexture.dispose();
      continuousPaperGeo.dispose();
      if (glassMaterialRef.current) glassMaterialRef.current.dispose();
      if (reflectorRef.current) reflectorRef.current.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update paper texture when currentStep or song changes
  useEffect(() => {
    updatePaperTexture();
  }, [currentStep, song, updatePaperTexture]);

  // Keyboard shortcut: Esc to exit maximized/immersive mode
  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggleMaximize?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMaximized, onToggleMaximize]);



  // Mouse / Touch Event Handlers for 3D Orbit & Pan Navigation
  const handleMouseDown = (e: React.MouseEvent) => {
    // Determine whether rotating or panning:
    // Right button (2), Middle button (1), Shift key, or navMode === 'pan' triggers pan
    if (e.button === 2 || e.button === 1 || e.shiftKey || navMode === 'pan') {
      isPanning.current = true;
      isOrbiting.current = false;
    } else {
      isOrbiting.current = true;
      isPanning.current = false;
    }
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isOrbiting.current && !isPanning.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    if (isPanning.current) {
      panCamera(dx, dy);
    } else if (isOrbiting.current) {
      targetCameraTheta.current -= dx * 0.006;
      targetCameraPhi.current = Math.max(0.10, Math.min(Math.PI / 2 - 0.02, targetCameraPhi.current - dy * 0.006));
    }
  };

  const handleMouseUp = () => {
    isOrbiting.current = false;
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    targetCameraDistance.current = Math.max(70, Math.min(380, targetCameraDistance.current + e.deltaY * 0.25));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if (navMode === 'pan') {
        isPanning.current = true;
        isOrbiting.current = false;
      } else {
        isOrbiting.current = true;
        isPanning.current = false;
      }
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isOrbiting.current = false;
      isPanning.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist.current = Math.hypot(dx, dy);
      touchStartMid.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastMousePos.current.x;
      const dy = e.touches[0].clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      if (isPanning.current) {
        panCamera(dx, dy);
      } else if (isOrbiting.current) {
        targetCameraTheta.current -= dx * 0.006;
        targetCameraPhi.current = Math.max(0.10, Math.min(Math.PI / 2 - 0.02, targetCameraPhi.current - dy * 0.006));
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      const currentMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };

      // Pinch zoom
      if (touchStartDist.current > 0) {
        const pinchDelta = touchStartDist.current - currentDist;
        targetCameraDistance.current = Math.max(70, Math.min(380, targetCameraDistance.current + pinchDelta * 0.6));
        touchStartDist.current = currentDist;
      }

      // Two-finger pan
      const panDx = currentMid.x - touchStartMid.current.x;
      const panDy = currentMid.y - touchStartMid.current.y;
      touchStartMid.current = currentMid;
      panCamera(panDx, panDy);
    }
  };

  const handleTouchEnd = () => {
    isOrbiting.current = false;
    isPanning.current = false;
    touchStartDist.current = 0;
  };

  return (
    <div className={`relative w-full h-full ${isMaximized ? 'h-screen' : 'min-h-[460px]'} bg-stone-950 overflow-hidden select-none flex flex-col`}>
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className={`w-full flex-1 select-none ${
          navMode === 'pan' 
            ? 'cursor-move' 
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* 1. Floating Camera Angle Bar (Top-Left) */}
      {!isMaximized && (
        <div 
          className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 p-1 bg-stone-900/95 backdrop-blur-md border border-stone-800/90 rounded-xl shadow-xl pointer-events-auto select-none"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Preset Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsViewMenuOpen(!isViewMenuOpen);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700/90 text-amber-200 border border-amber-800/50 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
              title="点击切换3D观察视角"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold">
                {activeView === 'photo' && '默认'}
                {activeView === 'top' && '俯视纸带'}
                {activeView === 'gears' && '齿轮特写'}
                {activeView === 'macro' && '滚轮特写'}
                {activeView === 'front' && '进纸槽'}
              </span>
              <ChevronDown className={`w-3 h-3 text-stone-400 transition-transform ${isViewMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isViewMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-40 bg-stone-900/95 backdrop-blur-md border border-stone-700/80 rounded-xl shadow-2xl p-1 z-50 flex flex-col gap-0.5 text-xs animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCameraPreset('photo');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    activeView === 'photo' ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs' : 'text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>默认视角</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCameraPreset('top');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    activeView === 'top' ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs' : 'text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>俯视纸带</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCameraPreset('gears');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    activeView === 'gears' ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs' : 'text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <Cog className="w-3.5 h-3.5" />
                  <span>齿轮传动特写</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCameraPreset('macro');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    activeView === 'macro' ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs' : 'text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <Disc className="w-3.5 h-3.5" />
                  <span>压纸片与粗滚轮</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCameraPreset('front');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    activeView === 'front' ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs' : 'text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>前面板进纸槽</span>
                </button>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-stone-800 mx-0.5 shrink-0" />

          {/* View Mode Toggle: Orbit vs Pan */}
          <div className="flex items-center bg-stone-950/80 p-0.5 rounded-lg border border-stone-800/80 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNavMode('orbit');
              }}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                navMode === 'orbit'
                  ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="左键拖拽旋转视角 (也可随时按住鼠标右键平移)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>旋转</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNavMode('pan');
              }}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                navMode === 'pan'
                  ? 'bg-amber-600 text-stone-950 font-semibold shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="拖拽平移移动视角 (也可按住右键/中键/Shift直接平移)"
            >
              <Move className="w-3 h-3" />
              <span>平移</span>
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              targetCameraTarget.current.set(4, 2, 2);
              setCameraPreset('photo');
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 rounded-md transition-colors cursor-pointer shrink-0"
            title="复位视角和居中位置"
          >
            <span>复位</span>
          </button>

          {onToggleMaximize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-300 hover:text-amber-100 hover:bg-stone-800/80 rounded-md transition-colors cursor-pointer shrink-0 border border-amber-800/50 hover:border-amber-600 ml-0.5"
              title="最大化 / 沉浸式查看3D八音盒（收起所有操作控件）"
            >
              <Maximize2 className="w-3 h-3 text-amber-400" />
              <span>最大化</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Floating Lid Angle & Glass Material Control Panel (Top-Right) */}
      {!isMaximized && (
        <div 
          className="absolute top-4 right-4 z-20 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
        {isControlsExpanded ? (
          <div className="w-80 bg-stone-900/95 backdrop-blur-md border border-stone-700/80 rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-stone-200 select-none">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-950 border border-amber-700/50 flex items-center justify-center text-amber-400">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-100 font-serif">盒盖参数</span>
              </div>
              <button
                type="button"
                onClick={() => setIsControlsExpanded(false)}
                className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                title="收起盒盖参数面板"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Lid Open Angle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-300 font-medium">盒盖打开角度</span>
                <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-mono text-[11px] font-bold">
                  {lidAngle}°
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="120"
                step="1"
                value={lidAngle}
                onChange={(e) => setLidAngle(Number(e.target.value))}
                className="w-full accent-amber-500 bg-stone-800 h-1.5 rounded-lg cursor-pointer"
              />

              {/* Quick Angle Presets */}
              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                {[
                  { label: '0° 合盖', val: 0 },
                  { label: '45° 半开', val: 45 },
                  { label: '75° 倾斜', val: 75 },
                  { label: '100° 半反', val: 100 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setLidAngle(item.val)}
                    className={`py-1 px-1.5 text-center text-[10px] rounded-md border transition-all cursor-pointer ${
                      lidAngle === item.val
                        ? 'bg-amber-700/70 border-amber-500 text-amber-100 font-medium shadow-sm'
                        : 'bg-stone-800/80 border-stone-700/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Glass / Mirror Mode Presets */}
            <div className="space-y-2 pt-1 border-t border-stone-800/80">
              <div className="flex items-center justify-between">
                <span className="text-stone-300 font-medium">材质模式预设</span>
                <span className="text-[10px] text-stone-500">透明 ⇄ 镜面</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => selectGlassPreset('mirror')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    glassPreset === 'mirror'
                      ? 'bg-amber-900/60 border-amber-500 text-amber-100 shadow-sm'
                      : 'bg-stone-800/80 border-stone-700/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700/60'
                  }`}
                >
                  <span className="text-sm">🪞</span>
                  <div>
                    <div className="font-medium text-[11px] leading-tight">梳妆水银镜</div>
                    <div className="text-[9px] text-stone-500">100%反光·不透光</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => selectGlassPreset('glass')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    glassPreset === 'glass'
                      ? 'bg-amber-900/60 border-amber-500 text-amber-100 shadow-sm'
                      : 'bg-stone-800/80 border-stone-700/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700/60'
                  }`}
                >
                  <span className="text-sm">🪟</span>
                  <div>
                    <div className="font-medium text-[11px] leading-tight">透明观赏窗</div>
                    <div className="text-[9px] text-stone-500">92%透光·见内部</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => selectGlassPreset('half')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    glassPreset === 'half'
                      ? 'bg-amber-900/60 border-amber-500 text-amber-100 shadow-sm'
                      : 'bg-stone-800/80 border-stone-700/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700/60'
                  }`}
                >
                  <span className="text-sm">🌓</span>
                  <div>
                    <div className="font-medium text-[11px] leading-tight">半透半反镜</div>
                    <div className="text-[9px] text-stone-500">50%透光·50%反射</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => selectGlassPreset('frosted')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    glassPreset === 'frosted'
                      ? 'bg-amber-900/60 border-amber-500 text-amber-100 shadow-sm'
                      : 'bg-stone-800/80 border-stone-700/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700/60'
                  }`}
                >
                  <span className="text-sm">🌫️</span>
                  <div>
                    <div className="font-medium text-[11px] leading-tight">磨砂漫射玻</div>
                    <div className="text-[9px] text-stone-500">70%透光·哑光磨砂</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Detailed Parameter Tuning */}
            <div className="space-y-2.5 pt-1 border-t border-stone-800/80 text-[11px]">
              {/* Transmittance Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-stone-400">
                  <span>透光率 (透视内部)</span>
                  <span className="font-mono text-amber-300 font-semibold">{transmittance}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={transmittance}
                  onChange={(e) => {
                    setTransmittance(Number(e.target.value));
                    setGlassPreset('custom');
                  }}
                  className="w-full accent-amber-500 bg-stone-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-stone-500">
                  <span>0% (不透光/水银镜)</span>
                  <span>100% (完全透明玻璃)</span>
                </div>
              </div>

              {/* Reflectivity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-stone-400">
                  <span>反射率 (镜面反光)</span>
                  <span className="font-mono text-amber-300 font-semibold">{reflectivity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={reflectivity}
                  onChange={(e) => {
                    setReflectivity(Number(e.target.value));
                    setGlassPreset('custom');
                  }}
                  className="w-full accent-amber-500 bg-stone-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-stone-500">
                  <span>0% (哑光无反光)</span>
                  <span>100% (高亮银镜反射)</span>
                </div>
              </div>

              {/* Roughness Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-stone-400">
                  <span>表面粗糙度</span>
                  <span className="font-mono text-amber-300 font-semibold">{roughness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={roughness}
                  onChange={(e) => {
                    setRoughness(Number(e.target.value));
                    setGlassPreset('custom');
                  }}
                  className="w-full accent-amber-500 bg-stone-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-stone-500">
                  <span>0% (高光镜面)</span>
                  <span>100% (磨砂漫射)</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsControlsExpanded(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-stone-900/95 hover:bg-stone-800 text-stone-200 border border-stone-700/80 rounded-xl shadow-xl transition-all cursor-pointer text-xs"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium">盒盖参数</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-mono text-[10px]">
              {lidAngle}°
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
          </button>
        )}
      </div>
      )}

      {/* 3. Small Floating Restore Control when in Immersive Maximize Mode */}
      {isMaximized && (
        <div 
          className="absolute top-4 right-4 z-50 pointer-events-auto select-none flex items-center gap-2"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {onTogglePlay && (
            <button
              type="button"
              onClick={() => {
                musicBoxSynth.resume();
                onTogglePlay();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900/90 hover:bg-stone-800 text-stone-200 hover:text-white border border-stone-700/80 rounded-full shadow-2xl backdrop-blur-md transition-all cursor-pointer text-xs font-medium"
              title={isPlaying ? '暂停播放' : '继续播放'}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400 fill-current" />
                  <span>暂停</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-amber-400 fill-current ml-0.5" />
                  <span>播放</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMaximize}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900/95 hover:bg-stone-800 text-amber-200 hover:text-amber-100 border border-amber-600/70 hover:border-amber-400 rounded-full shadow-2xl backdrop-blur-md transition-all cursor-pointer text-xs font-medium group"
            title="退出沉浸模式，恢复所有操作控件 (快捷键: Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>恢复界面</span>
            <kbd className="text-[10px] bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded font-mono ml-0.5">Esc</kbd>
          </button>
        </div>
      )}
    </div>
  );
};
