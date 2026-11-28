import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  GeoDropAi3DBlueprint,
  GeoDropArAsset,
  GeoDropTokenSymbol,
} from '../../types/geodrops';

interface ChestModelProps {
  /** Signed compass delta in degrees [-180, +180]: 0 = dead center in camera frustum */
  relativeBearing: number;
  /** Whether the hunter is inside the geofence radius/polygon */
  insideGeofence: boolean;
  /** Token type determines default glow (USDC = Amber Gold, SKR = Seeker Emerald) */
  tokenSymbol: GeoDropTokenSymbol;
  /** True while claim signature is in progress */
  unlocking: boolean;
  /** True once claim succeeds — plays unlock animation and token burst */
  unlocked: boolean;
  /** Optional custom Brand AR 3D asset (3D depth image, AI 3D sculpture, or uploaded GLB) */
  arAsset?: GeoDropArAsset | null;
  /** Interactive studio turntable preview mode (enables drag-to-inspect rotation) */
  previewMode?: boolean;
  /** Fires when the user taps/clicks directly on the 3D AR asset */
  onTapChest: () => void;
}

function parseSafeColor(hex: string | undefined, fallback: number): number {
  if (!hex || typeof hex !== 'string') return fallback;
  const clean = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return parseInt(clean.slice(1), 16);
  }
  return fallback;
}

/** Synthesize a bright Web Audio treasure unlock chime without external audio assets */
function playChestUnlockChime(): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.085);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.085);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.085 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.085 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.085);
      osc.stop(now + idx * 0.085 + 0.45);
    });
    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // Audio playback is optional
  }
}

interface GeneratedImageMaps {
  albedoTexture: THREE.CanvasTexture;
  heightTexture: THREE.CanvasTexture;
  aspect: number;
}

/**
 * Generates an sRGB color texture AND a sculpted grayscale 3D height/bump map
 * directly from an uploaded brand image so logos & products render with real 3D relief depth.
 */
function buildImageReliefMaps(
  imageDataUrl: string,
  circularMask: boolean
): Promise<GeneratedImageMaps> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 512;
      const aspect = Math.max(0.65, Math.min(1.5, img.width / Math.max(1, img.height)));

      // 1. Albedo Canvas
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = size;
      colorCanvas.height = size;
      const cCtx = colorCanvas.getContext('2d');
      if (!cCtx) {
        reject(new Error('2D canvas unavailable'));
        return;
      }

      cCtx.clearRect(0, 0, size, size);
      if (circularMask) {
        cCtx.save();
        cCtx.beginPath();
        cCtx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
        cCtx.closePath();
        cCtx.clip();
      }

      // Fit image cleanly inside canvas preserving aspect ratio
      const scale = Math.min((size * 0.92) / img.width, (size * 0.92) / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (size - drawW) / 2;
      const drawY = (size - drawH) / 2;
      cCtx.drawImage(img, drawX, drawY, drawW, drawH);

      if (circularMask) {
        cCtx.restore();
      }

      // 2. Grayscale Height / Relief Displacement Canvas (luminance + alpha + edge bevel)
      const heightCanvas = document.createElement('canvas');
      heightCanvas.width = size;
      heightCanvas.height = size;
      const hCtx = heightCanvas.getContext('2d');
      if (!hCtx) {
        reject(new Error('2D height canvas unavailable'));
        return;
      }

      const imgData = cCtx.getImageData(0, 0, size, size);
      const outData = hCtx.createImageData(size, size);
      const src = imgData.data;
      const dst = outData.data;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const r = src[i];
          const g = src[i + 1];
          const b = src[i + 2];
          const a = src[i + 3] / 255;

          // Edge bevel falloff near border so displaced edges seat smoothly inside frame
          const nx = (x / size) * 2 - 1;
          const ny = (y / size) * 2 - 1;
          const edgeDist = circularMask
            ? Math.max(0, 1 - Math.hypot(nx, ny) / 0.96)
            : Math.max(0, 1 - Math.max(Math.abs(nx), Math.abs(ny)) / 0.96);
          const bevel = Math.min(1, edgeDist * 6);

          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // Combine solid alpha presence + luminance contrast for tactile embossing
          const heightVal = Math.round(Math.max(0, Math.min(1, a * (0.38 + lum * 0.62) * bevel)) * 255);
          dst[i] = heightVal;
          dst[i + 1] = heightVal;
          dst[i + 2] = heightVal;
          dst[i + 3] = 255;
        }
      }

      hCtx.putImageData(outData, 0, 0);

      // Gentle blur pass on height map for smooth sculpted 3D transitions without jagged spikes
      const smoothCanvas = document.createElement('canvas');
      smoothCanvas.width = size;
      smoothCanvas.height = size;
      const sCtx = smoothCanvas.getContext('2d');
      if (sCtx) {
        sCtx.filter = 'blur(3px)';
        sCtx.drawImage(heightCanvas, 0, 0);
      }

      const albedoTexture = new THREE.CanvasTexture(colorCanvas);
      albedoTexture.colorSpace = THREE.SRGBColorSpace;
      albedoTexture.needsUpdate = true;

      const heightTexture = new THREE.CanvasTexture(sCtx ? smoothCanvas : heightCanvas);
      heightTexture.needsUpdate = true;

      resolve({ albedoTexture, heightTexture, aspect });
    };
    img.onerror = () => reject(new Error('Failed to load uploaded brand image.'));
    img.src = imageDataUrl;
  });
}

function createPrimitiveGeometry(shape: string): THREE.BufferGeometry {
  switch (shape) {
    case 'cylinder':
      return new THREE.CylinderGeometry(0.45, 0.45, 1.0, 28);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 28, 22);
    case 'torus':
      return new THREE.TorusGeometry(0.55, 0.14, 16, 36);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1.0, 28);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.35, 0.55, 12, 24);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(0.52, 0);
    case 'box':
    default:
      return new THREE.BoxGeometry(1.0, 1.0, 1.0);
  }
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m) return;
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.displacementMap?.dispose();
        std.bumpMap?.dispose();
        std.normalMap?.dispose();
        std.roughnessMap?.dispose();
        std.metalnessMap?.dispose();
        std.emissiveMap?.dispose();
        m.dispose();
      });
    }
  });
}

export const ChestModel: React.FC<ChestModelProps> = ({
  relativeBearing,
  insideGeofence,
  tokenSymbol,
  unlocking,
  unlocked,
  arAsset,
  previewMode = false,
  onTapChest,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    relativeBearing,
    insideGeofence,
    tokenSymbol,
    unlocking,
    unlocked,
    previewMode,
    onTapChest,
  });

  propsRef.current = {
    relativeBearing,
    insideGeofence,
    tokenSymbol,
    unlocking,
    unlocked,
    previewMode,
    onTapChest,
  };

  useEffect(() => {
    if (unlocked && !previewMode) {
      playChestUnlockChime();
    }
  }, [unlocked, previewMode]);

  // Serialize stable structural dependency key so Three.js rebuilds only when the AR asset actually changes
  const assetKey = JSON.stringify({
    tokenSymbol,
    previewMode,
    kind: arAsset?.kind || 'chest',
    imageDataUrl: arAsset?.imageDataUrl || '',
    depthStrength: arAsset?.depthStrength ?? 0.6,
    frameStyle: arAsset?.frameStyle || 'card',
    accentHex: arAsset?.accentHex || '',
    aiBlueprint: arAsset?.aiBlueprint || null,
    modelAssetUrl: arAsset?.modelAssetUrl || '',
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const effectiveAsset: GeoDropArAsset = arAsset || { kind: 'chest' };

    // Detect software WebGL renderers (SwiftShader / llvmpipe) to pace frames cleanly
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      probeCanvas.getContext('experimental-webgl');
    let isSoftwareGl = false;
    if (probeGl && 'getExtension' in probeGl) {
      const dbg = (probeGl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const rendererStr = String(
          (probeGl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''
        );
        isSoftwareGl = /SwiftShader|llvmpipe|Software|Mesa/i.test(rendererStr);
      }
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.setClearColor(0x000000, 0);

    const width = Math.max(container.clientWidth, 240);
    const height = Math.max(container.clientHeight, 220);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = previewMode ? 'none' : 'manipulation';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.52, previewMode ? 3.85 : 4.35);
    camera.lookAt(0, 0.06, 0);

    // Procedural PBR Studio Reflections via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Warm Key + Cool Fill + Brand Accent Core Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b2314, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.35);
    keyLight.position.set(3.2, 5.2, 4.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.25);
    rimLight.position.set(-4.0, 2.4, -3.2);
    scene.add(rimLight);

    const defaultAccentHex = tokenSymbol === 'SKR' ? 0x10b981 : 0xf59e0b;
    const defaultGlowHex = tokenSymbol === 'SKR' ? 0x34d399 : 0xfbbf24;
    const brandAccentColor = parseSafeColor(
      effectiveAsset.aiBlueprint?.accentColorHex || effectiveAsset.accentHex,
      defaultAccentHex
    );
    const brandGlowColor = parseSafeColor(
      effectiveAsset.aiBlueprint?.glowColorHex || effectiveAsset.accentHex,
      defaultGlowHex
    );

    const coreLight = new THREE.PointLight(brandGlowColor, 2.4, 6.0, 1.7);
    coreLight.position.set(0, 0.18, 0.85);

    const heroRoot = new THREE.Group();
    scene.add(heroRoot);
    heroRoot.add(coreLight);

    const contentGroup = new THREE.Group();
    heroRoot.add(contentGroup);

    // Orbiting AR Energy Halo Ring (shared across all 4 AR asset modes)
    const ringMat = new THREE.MeshStandardMaterial({
      color: brandGlowColor,
      emissive: brandAccentColor,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.88,
      transparent: true,
      opacity: 0.82,
    });
    const haloGeo = new THREE.TorusGeometry(1.28, 0.022, 12, 64);
    const haloRing = new THREE.Mesh(haloGeo, ringMat);
    haloRing.rotation.x = Math.PI / 2.25;
    haloRing.position.set(0, -0.58, 0);
    heroRoot.add(haloRing);

    // Shared 36-Coin Brand-Colored Celebratory Token Burst (InstancedMesh)
    const TOKEN_COUNT = 36;
    const coinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.032, 18);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: brandGlowColor,
      emissive: brandAccentColor,
      emissiveIntensity: 0.7,
      roughness: 0.18,
      metalness: 0.94,
    });
    const tokenBurst = new THREE.InstancedMesh(coinGeo, coinMat, TOKEN_COUNT);
    tokenBurst.visible = false;
    heroRoot.add(tokenBurst);

    const tokenVelocities: THREE.Vector3[] = [];
    const tokenPositions: THREE.Vector3[] = [];
    const tokenSpins: THREE.Vector3[] = [];
    for (let i = 0; i < TOKEN_COUNT; i++) {
      const angle = (i / TOKEN_COUNT) * Math.PI * 2 + (i % 3) * 0.2;
      const radialSpeed = 0.85 + (i % 5) * 0.3;
      tokenVelocities.push(
        new THREE.Vector3(
          Math.cos(angle) * radialSpeed,
          2.2 + (i % 4) * 0.55,
          Math.sin(angle) * radialSpeed
        )
      );
      tokenPositions.push(new THREE.Vector3(0, 0.15, 0));
      tokenSpins.push(new THREE.Vector3(2.2 + (i % 3), 3.4 + (i % 4), 1.8));
    }

    // Optional animation handles populated per asset mode
    let lidPivot: THREE.Group | null = null;
    let innerCore: THREE.Mesh | null = null;
    let gemMatRef: THREE.MeshStandardMaterial | null = null;
    let gltfMixer: THREE.AnimationMixer | null = null;
    let asyncCancelled = false;

    const buildDefaultChest = () => {
      const woodMat = new THREE.MeshStandardMaterial({
        color: 0x2b1d17,
        roughness: 0.52,
        metalness: 0.12,
      });
      const obsidianMat = new THREE.MeshStandardMaterial({
        color: 0x16171d,
        roughness: 0.34,
        metalness: 0.45,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xe6b44c,
        roughness: 0.24,
        metalness: 0.92,
      });
      const gemMat = new THREE.MeshStandardMaterial({
        color: brandAccentColor,
        emissive: brandGlowColor,
        emissiveIntensity: 1.55,
        roughness: 0.15,
        metalness: 0.35,
      });
      gemMatRef = gemMat;

      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.78, 1.02), woodMat);
      baseMesh.position.set(0, -0.22, 0);
      contentGroup.add(baseMesh);

      const panelFront = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.56, 1.05), obsidianMat);
      panelFront.position.set(0, -0.22, 0);
      contentGroup.add(panelFront);

      const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.1, 1.1), goldMat);
      lowerTrim.position.set(0, -0.58, 0);
      contentGroup.add(lowerTrim);

      const upperTrim = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.08, 1.1), goldMat);
      upperTrim.position.set(0, 0.16, 0);
      contentGroup.add(upperTrim);

      [-0.72, 0.72].forEach((x) => {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 1.08), goldMat);
        strap.position.set(x, -0.21, 0);
        contentGroup.add(strap);
      });

      const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.12), goldMat);
      lockPlate.position.set(0, 0.05, 0.53);
      contentGroup.add(lockPlate);

      const frontGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), gemMat);
      frontGem.position.set(0, 0.05, 0.61);
      contentGroup.add(frontGem);

      innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), gemMat);
      innerCore.position.set(0, 0.18, 0);
      contentGroup.add(innerCore);

      lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.18, -0.51);
      contentGroup.add(lidPivot);

      const domeGeo = new THREE.CylinderGeometry(0.51, 0.51, 1.56, 24, 1, false, 0, Math.PI);
      domeGeo.rotateZ(Math.PI / 2);
      domeGeo.rotateY(Math.PI);
      const domeMesh = new THREE.Mesh(domeGeo, woodMat);
      domeMesh.position.set(0, 0, 0.51);
      lidPivot.add(domeMesh);

      const endCapGeo = new THREE.CircleGeometry(0.51, 24, 0, Math.PI);
      [-0.782, 0.782].forEach((x, idx) => {
        const cap = new THREE.Mesh(endCapGeo, obsidianMat);
        cap.position.set(x, 0, 0.51);
        cap.rotation.y = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
        lidPivot!.add(cap);
      });

      const ribGeo = new THREE.TorusGeometry(0.525, 0.045, 10, 24, Math.PI);
      [-0.72, 0, 0.72].forEach((x) => {
        const rib = new THREE.Mesh(ribGeo, goldMat);
        rib.position.set(x, 0, 0.51);
        rib.rotation.y = Math.PI / 2;
        lidPivot!.add(rib);
      });

      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.09), goldMat);
      clasp.position.set(0, -0.02, 1.03);
      lidPivot.add(clasp);
    };

    const buildDepthImagePlaque = async (
      imageDataUrl: string,
      depthStrength: number,
      frameStyle: 'card' | 'medallion' | 'cutout',
      rimHex: number
    ) => {
      try {
        const maps = await buildImageReliefMaps(imageDataUrl, frameStyle === 'medallion');
        if (asyncCancelled) {
          maps.albedoTexture.dispose();
          maps.heightTexture.dispose();
          return;
        }

        const clampedDepth = Math.max(0.15, Math.min(1.0, depthStrength));
        const slabThickness = 0.16 + clampedDepth * 0.22;
        const reliefScale = 0.08 + clampedDepth * 0.24;

        const metallicRimMat = new THREE.MeshStandardMaterial({
          color: rimHex,
          roughness: 0.22,
          metalness: 0.88,
        });
        const obsidianCoreMat = new THREE.MeshStandardMaterial({
          color: 0x15161c,
          roughness: 0.35,
          metalness: 0.45,
        });
        const reliefMat = new THREE.MeshStandardMaterial({
          map: maps.albedoTexture,
          displacementMap: maps.heightTexture,
          displacementScale: reliefScale,
          bumpMap: maps.heightTexture,
          bumpScale: 0.055 * clampedDepth,
          roughness: 0.32,
          metalness: 0.18,
          transparent: frameStyle === 'cutout' || frameStyle === 'medallion',
          alphaTest: frameStyle === 'cutout' ? 0.12 : 0.02,
          side: THREE.FrontSide,
        });

        if (frameStyle === 'medallion') {
          // Solid 3D Coin Medallion with sculpted double-sided relief
          const coinBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.96, 0.96, slabThickness, 56),
            obsidianCoreMat
          );
          coinBody.rotation.x = Math.PI / 2;
          contentGroup.add(coinBody);

          const outerBevel = new THREE.Mesh(
            new THREE.TorusGeometry(0.98, 0.085, 18, 56),
            metallicRimMat
          );
          contentGroup.add(outerBevel);

          const frontPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.66, 64, 64), reliefMat);
          frontPlane.position.z = slabThickness * 0.5 + 0.008;
          contentGroup.add(frontPlane);

          const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.66, 64, 64), reliefMat);
          backPlane.position.z = -(slabThickness * 0.5 + 0.008);
          backPlane.rotation.y = Math.PI;
          contentGroup.add(backPlane);
        } else if (frameStyle === 'cutout') {
          // Floating Volumetric Cutout Relief with translucent glowing edge layers
          const w = 1.65;
          const h = 1.65;
          const frontRelief = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 72, 72), reliefMat);
          frontRelief.position.z = slabThickness * 0.35;
          contentGroup.add(frontRelief);

          const backRelief = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 72, 72), reliefMat);
          backRelief.position.z = -slabThickness * 0.35;
          backRelief.rotation.y = Math.PI;
          contentGroup.add(backRelief);

          // Stacked inner extrusion slices give solid 3D silhouette thickness from side angles
          const sliceMat = new THREE.MeshStandardMaterial({
            map: maps.albedoTexture,
            color: rimHex,
            roughness: 0.35,
            metalness: 0.72,
            transparent: true,
            alphaTest: 0.16,
            side: THREE.DoubleSide,
          });
          const sliceCount = 5;
          for (let s = 0; s < sliceCount; s++) {
            const z = ((s / (sliceCount - 1)) - 0.5) * slabThickness * 0.68;
            const slice = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), sliceMat);
            slice.position.z = z;
            contentGroup.add(slice);
          }
        } else {
          // Classic Collectible 3D Depth Card Slab with metallic corner rails
          const cardW = 1.56;
          const cardH = 1.56;
          const core = new THREE.Mesh(
            new THREE.BoxGeometry(cardW, cardH, slabThickness),
            obsidianCoreMat
          );
          contentGroup.add(core);

          // Metallic perimeter frame rails
          const railThick = 0.075;
          const railDepth = slabThickness + 0.04;
          const topRail = new THREE.Mesh(
            new THREE.BoxGeometry(cardW + railThick * 2, railThick, railDepth),
            metallicRimMat
          );
          topRail.position.y = cardH / 2 + railThick / 2;
          contentGroup.add(topRail);

          const bottomRail = new THREE.Mesh(
            new THREE.BoxGeometry(cardW + railThick * 2, railThick, railDepth),
            metallicRimMat
          );
          bottomRail.position.y = -(cardH / 2 + railThick / 2);
          contentGroup.add(bottomRail);

          const leftRail = new THREE.Mesh(
            new THREE.BoxGeometry(railThick, cardH, railDepth),
            metallicRimMat
          );
          leftRail.position.x = -(cardW / 2 + railThick / 2);
          contentGroup.add(leftRail);

          const rightRail = new THREE.Mesh(
            new THREE.BoxGeometry(railThick, cardH, railDepth),
            metallicRimMat
          );
          rightRail.position.x = cardW / 2 + railThick / 2;
          contentGroup.add(rightRail);

          const frontFace = new THREE.Mesh(
            new THREE.PlaneGeometry(cardW * 0.94, cardH * 0.94, 64, 64),
            reliefMat
          );
          frontFace.position.z = slabThickness / 2 + 0.008;
          contentGroup.add(frontFace);

          const backFace = new THREE.Mesh(
            new THREE.PlaneGeometry(cardW * 0.94, cardH * 0.94, 64, 64),
            reliefMat
          );
          backFace.position.z = -(slabThickness / 2 + 0.008);
          backFace.rotation.y = Math.PI;
          contentGroup.add(backFace);
        }
      } catch {
        if (!asyncCancelled) buildDefaultChest();
      }
    };

    const buildAiSculpture = async (
      blueprint: GeoDropAi3DBlueprint,
      emblemImageUrl?: string
    ) => {
      const sculptureGroup = new THREE.Group();
      contentGroup.add(sculptureGroup);

      const isNeonGlass = blueprint.finish === 'neon_glass';
      for (const part of blueprint.parts.slice(0, 14)) {
        const geo = createPrimitiveGeometry(part.shape);
        const mat = new THREE.MeshStandardMaterial({
          color: parseSafeColor(part.colorHex, brandAccentColor),
          metalness: isNeonGlass ? 0.25 : Math.max(0, Math.min(1, part.metalness)),
          roughness: isNeonGlass ? 0.14 : Math.max(0.08, Math.min(1, part.roughness)),
          emissive: parseSafeColor(part.emissiveHex, 0x000000),
          emissiveIntensity: Math.max(0, Math.min(2.2, part.emissiveIntensity ?? 0)),
          transparent: isNeonGlass,
          opacity: isNeonGlass ? 0.88 : 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(part.position[0], part.position[1], part.position[2]);
        mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
        mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
        sculptureGroup.add(mesh);
      }

      // Normalize the assembled AI sculpture cleanly to ~1.95 units
      const box = new THREE.Box3().setFromObject(sculptureGroup);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z, 0.5);
      const normScale = 1.95 / maxDim;
      sculptureGroup.scale.setScalar(normScale);
      sculptureGroup.position.set(
        -center.x * normScale,
        -center.y * normScale + 0.05,
        -center.z * normScale
      );

      // Mount a sculpted 3D brand emblem disc in front of the AI sculpture when artwork was uploaded
      if (emblemImageUrl) {
        try {
          const maps = await buildImageReliefMaps(emblemImageUrl, true);
          if (asyncCancelled) {
            maps.albedoTexture.dispose();
            maps.heightTexture.dispose();
            return;
          }
          const emblemGroup = new THREE.Group();
          emblemGroup.position.set(0, 0.05, 0.72);

          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.42, 0.042, 14, 40),
            new THREE.MeshStandardMaterial({
              color: parseSafeColor(blueprint.accentColorHex, brandAccentColor),
              metalness: 0.9,
              roughness: 0.2,
            })
          );
          emblemGroup.add(rim);

          const backing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.41, 0.41, 0.07, 36),
            new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.35, metalness: 0.5 })
          );
          backing.rotation.x = Math.PI / 2;
          emblemGroup.add(backing);

          const emblemFace = new THREE.Mesh(
            new THREE.PlaneGeometry(0.74, 0.74, 40, 40),
            new THREE.MeshStandardMaterial({
              map: maps.albedoTexture,
              displacementMap: maps.heightTexture,
              displacementScale: 0.08,
              bumpMap: maps.heightTexture,
              bumpScale: 0.03,
              transparent: true,
              alphaTest: 0.05,
              roughness: 0.28,
              metalness: 0.15,
            })
          );
          emblemFace.position.z = 0.04;
          emblemGroup.add(emblemFace);

          contentGroup.add(emblemGroup);
        } catch {
          // Sculpture still renders cleanly without emblem
        }
      }
    };

    const buildCustomGlb = (modelUrl: string) => {
      // Temporary crystal placeholder while GLB downloads & parses
      const loadingCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({
          color: brandAccentColor,
          emissive: brandGlowColor,
          emissiveIntensity: 0.9,
          wireframe: true,
        })
      );
      contentGroup.add(loadingCrystal);

      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          if (asyncCancelled) {
            disposeObjectTree(gltf.scene);
            return;
          }
          contentGroup.remove(loadingCrystal);
          loadingCrystal.geometry.dispose();
          (loadingCrystal.material as THREE.Material).dispose();

          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const normScale = 2.05 / maxDim;
          model.scale.setScalar(normScale);
          model.position.set(
            -center.x * normScale,
            -center.y * normScale + 0.04,
            -center.z * normScale
          );
          contentGroup.add(model);

          if (gltf.animations && gltf.animations.length > 0) {
            gltfMixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
              gltfMixer?.clipAction(clip).play();
            });
          }
        },
        undefined,
        () => {
          if (asyncCancelled) return;
          contentGroup.remove(loadingCrystal);
          loadingCrystal.geometry.dispose();
          (loadingCrystal.material as THREE.Material).dispose();
          buildDefaultChest();
        }
      );
    };

    // Dispatch chosen AR 3D asset mode
    if (effectiveAsset.kind === 'image_depth' && effectiveAsset.imageDataUrl) {
      void buildDepthImagePlaque(
        effectiveAsset.imageDataUrl,
        effectiveAsset.depthStrength ?? 0.65,
        effectiveAsset.frameStyle || 'card',
        brandAccentColor
      );
    } else if (effectiveAsset.kind === 'ai_3d_sculpture' && effectiveAsset.aiBlueprint) {
      void buildAiSculpture(effectiveAsset.aiBlueprint, effectiveAsset.imageDataUrl);
    } else if (effectiveAsset.kind === 'custom_glb' && effectiveAsset.modelAssetUrl) {
      buildCustomGlb(effectiveAsset.modelAssetUrl);
    } else {
      buildDefaultChest();
    }

    // Pre-allocated scratch objects (zero GC in render loop)
    const dummyObj = new THREE.Object3D();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    // Pointer interaction: Drag-to-spin in Preview Mode OR Tap-to-Unlock Raycast in AR Mode
    let isDragging = false;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let lastDragX = 0;
    let lastDragY = 0;
    let manualYaw = 0;
    let manualPitch = 0;

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      if (propsRef.current.previewMode) {
        isDragging = true;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !propsRef.current.previewMode) return;
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      manualYaw += dx * 0.012;
      manualPitch = Math.max(-0.55, Math.min(0.55, manualPitch + dy * 0.008));
    };

    const handlePointerUp = (e: PointerEvent) => {
      isDragging = false;
      if (propsRef.current.previewMode) return;
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (moved > 18) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(heroRoot, true);
      if (hits.length > 0 && propsRef.current.insideGeofence) {
        propsRef.current.onTapChest();
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 1);
        const h = Math.max(entry.contentRect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    let contextLost = false;
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let burstElapsed = 0;
    let burstStarted = false;
    let currentX = 0;
    let currentScale = previewMode ? 1.0 : 0.01;
    let currentLidAngle = 0;

    const tick = (now: number) => {
      if (disposed) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      if (!contextLost) {
        const {
          relativeBearing: bearingDelta,
          insideGeofence: activeInZone,
          unlocking: isUnlocking,
          unlocked: isUnlocked,
          previewMode: isPreview,
        } = propsRef.current;

        if (isPreview) {
          heroRoot.position.x = 0;
          heroRoot.position.y = Math.sin(elapsed * 1.9) * 0.07 + 0.04;
          heroRoot.scale.setScalar(1.0);
          if (!isDragging) {
            manualYaw += dt * 0.55;
            manualPitch = THREE.MathUtils.damp(manualPitch, 0.08, 3.0, dt);
          }
          contentGroup.rotation.y = manualYaw;
          contentGroup.rotation.x = manualPitch;
        } else {
          const clampedDelta = Math.max(-55, Math.min(55, bearingDelta));
          const targetX = (clampedDelta / 55) * 1.45;
          currentX = THREE.MathUtils.damp(currentX, targetX, 6.5, dt);

          const targetScale = activeInZone ? (isUnlocking ? 1.08 : 1.0) : 0.42;
          currentScale = THREE.MathUtils.damp(currentScale, targetScale, 5.5, dt);

          heroRoot.position.x = currentX;
          heroRoot.position.y =
            Math.sin(elapsed * 2.1) * 0.1 + (isUnlocked ? 0.24 : 0.06);
          heroRoot.scale.setScalar(currentScale);

          const spinSpeed = isUnlocking ? 2.5 : isUnlocked ? 0.55 : 0.68;
          contentGroup.rotation.y += dt * spinSpeed;
        }

        if (lidPivot) {
          const targetLid = isUnlocked ? -Math.PI * 0.62 : isUnlocking ? -0.18 : 0;
          currentLidAngle = THREE.MathUtils.damp(currentLidAngle, targetLid, 5.0, dt);
          lidPivot.rotation.x = currentLidAngle;
        }

        if (gemMatRef) {
          gemMatRef.emissiveIntensity = isUnlocked
            ? 2.8
            : 1.25 + Math.sin(elapsed * 3.8) * 0.35;
        }

        if (innerCore) {
          innerCore.rotation.y = -elapsed * 1.6;
          innerCore.position.y = isUnlocked
            ? 0.48 + Math.sin(elapsed * 3.2) * 0.06
            : 0.18;
        }

        coreLight.intensity = isUnlocked
          ? 4.6
          : activeInZone || isPreview
            ? 2.4 + Math.sin(elapsed * 3.8) * 0.55
            : 0.9;
        haloRing.rotation.z = elapsed * (isUnlocking ? 2.2 : 0.72);

        if (gltfMixer) {
          gltfMixer.update(dt);
        }

        if (isUnlocked && !isPreview) {
          if (!burstStarted) {
            burstStarted = true;
            burstElapsed = 0;
            tokenBurst.visible = true;
            for (let i = 0; i < TOKEN_COUNT; i++) {
              tokenPositions[i].set(0, 0.2, 0);
            }
          }
          burstElapsed += dt;
          for (let i = 0; i < TOKEN_COUNT; i++) {
            const vel = tokenVelocities[i];
            const pos = tokenPositions[i];
            const spin = tokenSpins[i];
            const t = burstElapsed % 2.4;
            pos.set(vel.x * t, 0.22 + vel.y * t - 2.35 * t * t, vel.z * t);
            const fadeScale = Math.max(0.001, 1 - t / 2.4);
            dummyObj.position.copy(pos);
            dummyObj.rotation.set(spin.x * t, spin.y * t, spin.z * t);
            dummyObj.scale.setScalar(fadeScale);
            dummyObj.updateMatrix();
            tokenBurst.setMatrixAt(i, dummyObj.matrix);
          }
          tokenBurst.instanceMatrix.needsUpdate = true;
        } else {
          burstStarted = false;
          tokenBurst.visible = false;
        }

        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        window.setTimeout(() => {
          if (!disposed) rafId = window.requestAnimationFrame(tick);
        }, 40);
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      asyncCancelled = true;
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      disposeObjectTree(contentGroup);
      haloGeo.dispose();
      ringMat.dispose();
      coinGeo.dispose();
      coinMat.dispose();
      envTarget.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [assetKey]);

  return (
    <div
      ref={mountRef}
      role={previewMode ? 'img' : 'button'}
      tabIndex={!previewMode && insideGeofence ? 0 : -1}
      aria-label={
        previewMode
          ? 'Interactive 3D Brand AR Asset Preview — drag to rotate'
          : insideGeofence
            ? '3D GeoDrop AR Asset — tap or press Enter to unlock'
            : '3D GeoDrop AR Asset preview'
      }
      onKeyDown={(e) => {
        if (!previewMode && insideGeofence && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onTapChest();
        }
      }}
      className={`w-full h-full select-none ${
        previewMode
          ? 'cursor-grab active:cursor-grabbing'
          : insideGeofence
            ? 'cursor-pointer'
            : 'pointer-events-none'
      }`}
    />
  );
};
