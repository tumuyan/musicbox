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
import { SongData, MUSIC_BOX_SCALE, TOTAL_TINES } from '../types/musicBox';
import { musicBoxSynth } from '../audio/MusicBoxSynth';
import { Camera, RotateCcw, Eye, Disc, Cog } from 'lucide-react';

interface MusicBox3DProps {
  song: SongData;
  currentStep: number;
  isPlaying: boolean;
  onStepChange?: (step: number) => void;
  onTinePluck?: (tineIndex: number) => void;
}

export const MusicBox3D: React.FC<MusicBox3DProps> = ({
  song,
  currentStep,
  isPlaying,
  onStepChange,
  onTinePluck,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'photo' | 'top' | 'front' | 'macro' | 'gears'>('photo');

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
  const paperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paperTextureRef = useRef<THREE.CanvasTexture | null>(null);

  // Animation frame & orbit tracking
  const animFrameId = useRef<number | null>(null);
  const isDraggingCrank = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isOrbiting = useRef<boolean>(false);
  const cameraTarget = useRef<THREE.Vector3>(new THREE.Vector3(4, 2, 2));
  const cameraDistance = useRef<number>(220);
  const cameraPhi = useRef<number>(1.08); // Elevation (~62 deg)
  const cameraTheta = useRef<number>(-0.72); // Azimuth (~-41 deg)

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
  const paperWidth = 46;    // Proportional paper strip width
  const slotWidth = 52;     // Front and back panel slot width
  const slotHeight = 5.0;   // 5mm vertical slot opening
  const paperY = 4.0;       // Center height of slot and paper
  const boxWidth = 140;
  const boxDepth = 100;
  const boxHeight = 44;
  const wallThick = 7;

  // Render dynamic Paper Strip Texture onto a 2D canvas
  const updatePaperTexture = useCallback(() => {
    const canvas = paperCanvasRef.current;
    const texture = paperTextureRef.current;
    if (!canvas || !texture) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background: warm creamy antique cardstock
    ctx.fillStyle = '#FAF7EE';
    ctx.fillRect(0, 0, w, h);

    // Margins (留白边: 14% top, 14% bottom)
    const topMargin = h * 0.14;
    const bottomMargin = h * 0.14;
    const usableHeight = h - topMargin - bottomMargin;
    const tinePitch = usableHeight / (TOTAL_TINES - 1);

    // Paper edge shadow
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.06)');
    grad.addColorStop(0.05, 'rgba(0,0,0,0)');
    grad.addColorStop(0.95, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Margin demarcation dashed lines
    ctx.strokeStyle = '#D8D0C0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, topMargin);
    ctx.lineTo(w, topMargin);
    ctx.moveTo(0, h - bottomMargin);
    ctx.lineTo(w, h - bottomMargin);
    ctx.stroke();
    ctx.setLineDash([]);

    // Horizontal pitch lines (中间绘制格线)
    ctx.strokeStyle = '#E5DFD2';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < TOTAL_TINES; i++) {
      const y = h - bottomMargin - (i * tinePitch);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Step window calculation
    const visibleStepsWindow = 50;
    const stepWidthPx = w / visibleStepsWindow;
    const readPointFraction = 0.49;
    const combReadOffsetSteps = visibleStepsWindow * readPointFraction;
    const startStep = currentStep - combReadOffsetSteps;

    // Draw vertical beat / measure lines
    for (let s = Math.floor(startStep); s <= startStep + visibleStepsWindow + 1; s++) {
      const x = (s - startStep) * stepWidthPx;
      if (x < 0 || x > w) continue;

      const isMeasure = s >= 0 && s % 16 === 0;
      const isBeat = s >= 0 && s % 4 === 0;

      if (isMeasure) {
        ctx.strokeStyle = '#B6ABA0';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, topMargin - 4);
        ctx.lineTo(x, h - bottomMargin + 4);
        ctx.stroke();

        const barNum = Math.floor(s / 16) + 1;
        ctx.fillStyle = '#8A7A68';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`M${barNum}`, x + 3, topMargin - 4);
      } else if (isBeat) {
        ctx.strokeStyle = '#CCC3B2';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, h - bottomMargin);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#ECE5D8';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, h - bottomMargin);
        ctx.stroke();
      }
    }

    // Read-head indicator line
    const readHeadX = combReadOffsetSteps * stepWidthPx;
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(readHeadX, 0);
    ctx.lineTo(readHeadX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw circular punched holes: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔"
    const visibleHoles = song.holes.filter(
      hole => hole.step >= startStep - 2 && hole.step <= startStep + visibleStepsWindow + 2
    );

    const holeRadius = 3.8;

    visibleHoles.forEach(hole => {
      const x = (hole.step - startStep) * stepWidthPx;
      const y = h - bottomMargin - (hole.tineIndex * tinePitch);

      ctx.save();
      // Hole interior (showing metal star-wheel & comb tine beneath paper!)
      ctx.beginPath();
      ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#221B14';
      ctx.fill();

      // Hole edge shadow
      ctx.strokeStyle = '#5E4E3C';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Inner rim bevel
      ctx.beginPath();
      ctx.arc(x - 0.5, y - 0.5, holeRadius - 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = '#18120C';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
    });

    texture.needsUpdate = true;
  }, [currentStep, song.holes]);

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

  // Helper to build 3D Brass Spur Gears with teeth and axle hub
  const createGearMesh = (radius: number, thickness: number, numTeeth: number, brassMaterial: THREE.Material): THREE.Group => {
    const gearGroup = new THREE.Group();

    // Central circular hub
    const hubGeo = new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, thickness, 24);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMesh = new THREE.Mesh(hubGeo, brassMaterial);
    gearGroup.add(hubMesh);

    // Axle collar
    const collarGeo = new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, thickness * 1.35, 16);
    collarGeo.rotateZ(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, brassMaterial);
    gearGroup.add(collarMesh);

    // Radial gear teeth
    const toothW = thickness * 0.95;
    const toothH = radius * 0.28;
    const toothD = ((Math.PI * 2 * radius) / numTeeth) * 0.52;
    const toothGeo = new THREE.BoxGeometry(toothW, toothH, toothD);

    for (let i = 0; i < numTeeth; i++) {
      const angle = (i / numTeeth) * Math.PI * 2;
      const toothMesh = new THREE.Mesh(toothGeo, brassMaterial);
      toothMesh.position.set(0, Math.sin(angle) * (radius * 0.9), Math.cos(angle) * (radius * 0.9));
      toothMesh.rotation.x = -angle;
      gearGroup.add(toothMesh);
    }

    return gearGroup;
  };

  // Update camera position
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const phi = cameraPhi.current;
    const theta = cameraTheta.current;
    const r = cameraDistance.current;

    cameraRef.current.position.x = cameraTarget.current.x + r * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = cameraTarget.current.y + r * Math.cos(phi);
    cameraRef.current.position.z = cameraTarget.current.z + r * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(cameraTarget.current);
  }, []);

  // Set preset camera views
  const setCameraPreset = useCallback((preset: 'photo' | 'top' | 'front' | 'macro' | 'gears') => {
    setActiveView(preset);
    if (preset === 'photo') {
      // Exactly matches reference photo perspective!
      cameraDistance.current = 220;
      cameraPhi.current = 1.08;
      cameraTheta.current = -0.72;
      cameraTarget.current.set(4, 2, 2);
    } else if (preset === 'top') {
      // Top-down inspection of paper feed
      cameraDistance.current = 200;
      cameraPhi.current = 0.15;
      cameraTheta.current = -Math.PI / 2;
      cameraTarget.current.set(0, 2, 0);
    } else if (preset === 'front') {
      // Front slot entry view
      cameraDistance.current = 180;
      cameraPhi.current = 1.38;
      cameraTheta.current = 0.02;
      cameraTarget.current.set(0, 0, 30);
    } else if (preset === 'macro') {
      // Close up of roller and pressure plate
      cameraDistance.current = 110;
      cameraPhi.current = 0.88;
      cameraTheta.current = -0.58;
      cameraTarget.current.set(4, 5, 0);
    } else if (preset === 'gears') {
      // Close up of gear transmission
      cameraDistance.current = 100;
      cameraPhi.current = 0.95;
      cameraTheta.current = -0.15;
      cameraTarget.current.set(34, 6, -6);
    }
    updateCameraPosition();
  }, [updateCameraPosition]);

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

    // 5. Open Lid with Glass Mirror (Angled back ~70 deg like in photo)
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, boxHeight / 2, backZ);
    lidGroup.rotation.x = -Math.PI * 0.42;
    musicBoxGroup.add(lidGroup);

    const lidFrameW = boxWidth;
    const lidFrameD = boxDepth;
    const lidFrameThick = 7;
    const lidInnerW = boxWidth - 24;
    const lidInnerD = boxDepth - 24;

    const lidRailL = new THREE.Mesh(new THREE.BoxGeometry(12, lidFrameThick, lidFrameD), woodMat);
    lidRailL.position.set(-lidFrameW / 2 + 6, lidFrameThick / 2, lidFrameD / 2);
    lidGroup.add(lidRailL);

    const lidRailR = new THREE.Mesh(new THREE.BoxGeometry(12, lidFrameThick, lidFrameD), woodMat);
    lidRailR.position.set(lidFrameW / 2 - 6, lidFrameThick / 2, lidFrameD / 2);
    lidGroup.add(lidRailR);

    const lidRailFront = new THREE.Mesh(new THREE.BoxGeometry(lidInnerW, lidFrameThick, 12), woodMat);
    lidRailFront.position.set(0, lidFrameThick / 2, lidFrameD - 6);
    lidGroup.add(lidRailFront);

    const lidRailBack = new THREE.Mesh(new THREE.BoxGeometry(lidInnerW, lidFrameThick, 12), woodMat);
    lidRailBack.position.set(0, lidFrameThick / 2, 6);
    lidGroup.add(lidRailBack);

    // Mirror pane
    const mirrorGeo = new THREE.PlaneGeometry(lidInnerW, lidInnerD);
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xCCCCCC,
      metalness: 0.88,
      roughness: 0.08,
      transparent: true,
      opacity: 0.88,
    });
    const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirrorMesh.rotation.x = -Math.PI / 2;
    mirrorMesh.position.set(0, 1.8, lidFrameD / 2);
    lidGroup.add(mirrorMesh);

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

    // Brass Bed Plate under the movement
    const chassisW = 76;
    const chassisD = 68;
    const chassisThick = 4;
    const chassisY = -0.5; // Firmly underneath comb and paper
    const chassisMesh = new THREE.Mesh(new THREE.BoxGeometry(chassisW, chassisThick, chassisD), brassMat);
    chassisMesh.position.set(0, chassisY, 0);
    chassisMesh.receiveShadow = true;
    mechGroup.add(chassisMesh);

    // =========================================================================
    // Comb teeth rendering disabled per request ("先不要绘制音齿了")
    // =========================================================================
    tinesRef.current = [];

    // =========================================================================
    // UPGRADE 2: 上方使用薄金属片压纸 (Thin Metal Spring Plate ABOVE Paper Strip)
    // =========================================================================
    // Thin polished metal plate sitting above the paper at y = 4.35
    const plateWidth = 48; // Spanning the 46mm paper
    const plateDepth = 12; // Along Z: from z = +6 to z = -6
    const plateThick = 0.45; // Thin sheet metal

    // Create plate with observation window in center to view holes
    const plateGroup = new THREE.Group();
    plateGroup.position.set(0, paperY + 0.35, 0); // Resting right over paper
    mechGroup.add(plateGroup);

    // Front lip of pressure plate
    const plateFrontLip = new THREE.Mesh(new THREE.BoxGeometry(plateWidth, plateThick, 3), springSteelMat);
    plateFrontLip.position.set(0, 0, 4.5);
    plateGroup.add(plateFrontLip);

    // Back lip of pressure plate
    const plateBackLip = new THREE.Mesh(new THREE.BoxGeometry(plateWidth, plateThick, 3), springSteelMat);
    plateBackLip.position.set(0, 0, -4.5);
    plateGroup.add(plateBackLip);

    // Left and right side bands connecting lips
    const plateSideL = new THREE.Mesh(new THREE.BoxGeometry(5, plateThick, plateDepth), springSteelMat);
    plateSideL.position.set(-plateWidth / 2 + 2.5, 0, 0);
    plateGroup.add(plateSideL);

    const plateSideR = new THREE.Mesh(new THREE.BoxGeometry(5, plateThick, plateDepth), springSteelMat);
    plateSideR.position.set(plateWidth / 2 - 2.5, 0, 0);
    plateGroup.add(plateSideR);

    // Brass Arch Mounting Brackets & Knurled Thumb Screws holding the pressure plate
    const archBracketGeo = new THREE.BoxGeometry(3.5, 5, 8);
    const archBracketL = new THREE.Mesh(archBracketGeo, brassMat);
    archBracketL.position.set(-plateWidth / 2 - 2.5, paperY + 1.2, 0);
    mechGroup.add(archBracketL);

    const archBracketR = new THREE.Mesh(archBracketGeo, brassMat);
    archBracketR.position.set(plateWidth / 2 + 2.5, paperY + 1.2, 0);
    mechGroup.add(archBracketR);

    const thumbScrewGeo = new THREE.CylinderGeometry(2.0, 2.0, 2.5, 16);
    const thumbScrewL = new THREE.Mesh(thumbScrewGeo, brassMat);
    thumbScrewL.position.set(-plateWidth / 2 - 2.5, paperY + 4.2, 0);
    mechGroup.add(thumbScrewL);

    const thumbScrewR = new THREE.Mesh(thumbScrewGeo, brassMat);
    thumbScrewR.position.set(plateWidth / 2 + 2.5, paperY + 4.2, 0);
    mechGroup.add(thumbScrewR);

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
    // UPGRADE 4: 侧面曲柄通过齿轮传动带动纸带运动 (Gear Train Transmission)
    // =========================================================================
    // Right side mechanical gear train connecting Crank Shaft -> Roller Axle!
    const gearX = 35; // Positioned between paper right edge (23) and right wall (63)

    // Gear 1: Crank Pinion Gear on the crank drive shaft (radius 4.5, 12 teeth)
    const gear1Group = createGearMesh(4.5, 3.2, 12, brassMat);
    gear1Group.position.set(gearX, paperY, 0);
    mechGroup.add(gear1Group);
    gear1Ref.current = gear1Group;

    // Gear 2: Intermediate Transmission Gear (radius 5.5, 16 teeth)
    // Meshes between Gear 1 and Gear 3
    const gear2Group = createGearMesh(5.5, 3.0, 16, brassMat);
    gear2Group.position.set(gearX, 6.4, -7.0);
    mechGroup.add(gear2Group);
    gear2Ref.current = gear2Group;

    // Gear 3: Feed Roller Spur Gear (radius 5.2, 14 teeth)
    // Mounted directly on the feed roller axle at z = -14, y = rollerY
    const gear3Group = createGearMesh(5.2, 3.2, 14, brassMat);
    gear3Group.position.set(gearX, rollerY, rollerZ);
    mechGroup.add(gear3Group);
    gear3Ref.current = gear3Group;

    // Gear train mounting bracket
    const gearPlate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 14, 24), brassMat);
    gearPlate.position.set(gearX + 3.0, 6.5, -7.0);
    mechGroup.add(gearPlate);

    // 8. Continuous Paper Tape Ribbon:
    const paperCanvas = document.createElement('canvas');
    paperCanvas.width = 1024;
    paperCanvas.height = 256;
    paperCanvasRef.current = paperCanvas;

    const paperTexture = new THREE.CanvasTexture(paperCanvas);
    paperTexture.wrapS = THREE.ClampToEdgeWrapping;
    paperTexture.wrapT = THREE.ClampToEdgeWrapping;
    paperTextureRef.current = paperTexture;

    const paperMaterial = new THREE.MeshStandardMaterial({
      map: paperTexture,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    // Build Continuous Seamless Curved Paper Ribbon passing through front & back slots
    const pathPoints: [number, number][] = [
      [145, -14.0], // Front desk edge
      [120, -5.0],
      [95, 1.5],
      [70, 3.6],
      [50, paperY], // FRONT PANEL SLOT CENTER (Exact Entry!)
      [25, paperY],
      [0, paperY],  // Read line under pressure plate & above comb
      [-25, paperY],
      [-50, paperY], // REAR PANEL SLOT CENTER (Exact Exit!)
      [-70, 3.5],
      [-95, 1.0],
      [-120, -6.0],
      [-140, -14.0], // Rear desk edge
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

    for (let k = 0; k < numCrossSections; k++) {
      const [z, y] = pathPoints[k];
      const u = 1.0 - (arcLengths[k] / totalArcLength);

      positions.push(-halfW, y, z);
      uvs.push(u, 0.0);

      positions.push(halfW, y, z);
      uvs.push(u, 1.0);

      if (k > 0) {
        const prevL = (k - 1) * 2;
        const prevR = prevL + 1;
        const currL = k * 2;
        const currR = currL + 1;

        indices.push(prevL, prevR, currL);
        indices.push(prevR, currR, currL);
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
    musicBoxGroup.add(continuousPaperMesh);

    // 9. Brass Hand Crank on right exterior wall
    // Shaft extends from gear1 at x = gearX through the right wall to the crank handle
    const crankGroup = new THREE.Group();
    crankGroup.position.set(boxWidth / 2 + 1, paperY, 0);
    musicBoxGroup.add(crankGroup);
    crankGroupRef.current = crankGroup;

    // Drive shaft extending through right wall
    const shaftGeo = new THREE.CylinderGeometry(1.6, 1.6, 38, 16);
    shaftGeo.rotateZ(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeo, brassMat);
    shaftMesh.position.set(-10, 0, 0); // Passes from gear1 to outer crank
    crankGroup.add(shaftMesh);

    // Lever arm
    const leverGeo = new THREE.BoxGeometry(2.2, 19, 3.6);
    const leverMesh = new THREE.Mesh(leverGeo, brassMat);
    leverMesh.position.set(9, 7.5, 0);
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
    crankGroup.add(knobMesh);

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

      // Synchronous Gear Train Transmission:
      // Crank drives Gear 1 -> drives Gear 2 -> drives Gear 3 & Thick Feed Roller
      const crankAngle = currentStep * 0.45;

      if (crankGroupRef.current) {
        crankGroupRef.current.rotation.x = crankAngle;
      }
      if (gear1Ref.current) {
        gear1Ref.current.rotation.x = crankAngle;
      }
      if (gear2Ref.current) {
        // Counter-rotating gear 2
        gear2Ref.current.rotation.x = -crankAngle * (4.5 / 5.5);
      }
      if (gear3Ref.current) {
        // Driven feed roller gear
        const rollerAngle = crankAngle * (4.5 / 5.2);
        gear3Ref.current.rotation.x = rollerAngle;
        if (rollerMeshRef.current) {
          rollerMeshRef.current.rotation.x = rollerAngle;
        }
      }

      renderer.render(scene, camera);
    };

    const renderer = rendererRef.current;
    animate(performance.now());

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      renderer.dispose();
      walnutTex.dispose();
      paperTexture.dispose();
      continuousPaperGeo.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update paper texture when currentStep or song changes
  useEffect(() => {
    updatePaperTexture();
  }, [currentStep, song, updatePaperTexture]);

  // Mouse / Touch Event Handlers for 3D Orbit
  const handleMouseDown = (e: React.MouseEvent) => {
    isOrbiting.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isOrbiting.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    cameraTheta.current += dx * 0.008;
    cameraPhi.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraPhi.current - dy * 0.008));
    updateCameraPosition();
  };

  const handleMouseUp = () => {
    isOrbiting.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraDistance.current = Math.max(80, Math.min(400, cameraDistance.current + e.deltaY * 0.25));
    updateCameraPosition();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isOrbiting.current = true;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isOrbiting.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMousePos.current.x;
    const dy = e.touches[0].clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    cameraTheta.current += dx * 0.008;
    cameraPhi.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraPhi.current - dy * 0.008));
    updateCameraPosition();
  };

  const handleTouchEnd = () => {
    isOrbiting.current = false;
  };

  return (
    <div className="relative w-full h-full min-h-[460px] bg-stone-950 overflow-hidden select-none flex flex-col">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="w-full flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Floating Camera Angle Bar */}
      <div 
        className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-1.5 p-1 bg-stone-900/90 backdrop-blur-md border border-stone-800 rounded-lg shadow-lg pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreset('photo');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeView === 'photo'
              ? 'bg-amber-700/80 text-amber-100 shadow-sm'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
          title="Matches the uploaded reference photo angle"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>参考原图视角</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreset('macro');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeView === 'macro'
              ? 'bg-amber-700/80 text-amber-100 shadow-sm'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>压纸片与粗滚轮</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreset('gears');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeView === 'gears'
              ? 'bg-amber-700/80 text-amber-100 shadow-sm'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <Cog className="w-3.5 h-3.5" />
          <span>齿轮传动特写</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreset('top');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeView === 'top'
              ? 'bg-amber-700/80 text-amber-100 shadow-sm'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>俯视纸带</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreset('front');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeView === 'front'
              ? 'bg-amber-700/80 text-amber-100 shadow-sm'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
          }`}
        >
          <span>前面板进纸槽</span>
        </button>
      </div>

      {/* Floating Mechanical Status & Paper Feed Indicator */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3 px-3 py-1.5 bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-lg text-xs text-stone-300">
        <span className="text-amber-400 font-medium font-serif">精密机械结构</span>
        <span className="text-stone-600">|</span>
        <span className="text-stone-400">下置音梳 · 上置薄片压纸</span>
        <span className="text-stone-600">|</span>
        <span className="text-amber-300">曲柄齿轮啮合驱动</span>
      </div>

      {/* Interactive Virtual Hand-Crank Knob */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-3 p-2 bg-stone-900/90 backdrop-blur-md border border-stone-800 rounded-xl shadow-xl">
        <div className="flex flex-col text-right">
          <span className="text-xs font-medium text-amber-200">手摇曲柄</span>
          <span className="text-[11px] text-stone-400">驱动齿轮带动滚轮</span>
        </div>

        <div
          className="relative w-12 h-12 rounded-full border-2 border-amber-600/40 bg-stone-800/80 flex items-center justify-center cursor-grab active:cursor-grabbing hover:border-amber-500 transition-colors shadow-inner"
          onMouseDown={(e) => {
            isDraggingCrank.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
          }}
          onMouseMove={(e) => {
            if (!isDraggingCrank.current || !onStepChange) return;
            const dy = lastMousePos.current.y - e.clientY;
            const dx = e.clientX - lastMousePos.current.x;
            lastMousePos.current = { x: e.clientX, y: e.clientY };

            const deltaSteps = (dx + dy) * 0.15;
            if (Math.abs(deltaSteps) > 0.01) {
              const newStep = Math.max(0, Math.min(song.totalSteps, currentStep + deltaSteps));
              onStepChange(newStep);
              musicBoxSynth.playGearTick();
            }
          }}
          onMouseUp={() => { isDraggingCrank.current = false; }}
          onMouseLeave={() => { isDraggingCrank.current = false; }}
          title="按住旋转曲柄，驱动齿轮组带动压纸滚轮"
        >
          <div
            className="w-8 h-8 rounded-full border border-amber-500/60 bg-gradient-to-tr from-amber-800 to-amber-600 flex items-center justify-center text-amber-100 shadow-sm"
            style={{ transform: `rotate(${currentStep * 40}deg)` }}
          >
            <RotateCcw className="w-4 h-4 text-amber-200" />
          </div>
        </div>
      </div>
    </div>
  );
};
