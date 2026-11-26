import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Expand, Layers, Minimize2, RotateCcw } from 'lucide-react';

export type VaultVisualState = 'locked' | 'ringing' | 'verified';
type FinishPreset = 'titanium' | 'obsidian-gold' | 'seeker-emerald';
type CameraPreset = 'hero' | 'core' | 'top';

interface EscrowVault3DProps {
  vaultState: VaultVisualState;
  totalLockedUsd: number;
  activeStakesCount: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

const FINISH_PALETTES: Record<
  FinishPreset,
  {
    label: string;
    swatch: string;
    ringColor: number;
    ringMetalness: number;
    ringRoughness: number;
    bodyColor: number;
    accentColor: number;
    coreColor: number;
  }
> = {
  titanium: {
    label: 'Brushed Titanium',
    swatch: '#CBD5E1',
    ringColor: 0xd4dbe4,
    ringMetalness: 0.92,
    ringRoughness: 0.22,
    bodyColor: 0x222933,
    accentColor: 0xec6b3f,
    coreColor: 0x1d8348,
  },
  'obsidian-gold': {
    label: 'Obsidian Gold',
    swatch: '#D4AF37',
    ringColor: 0xd9b566,
    ringMetalness: 0.95,
    ringRoughness: 0.18,
    bodyColor: 0x171a20,
    accentColor: 0xe7b952,
    coreColor: 0xec6b3f,
  },
  'seeker-emerald': {
    label: 'Seeker Emerald',
    swatch: '#1D8348',
    ringColor: 0x2ca562,
    ringMetalness: 0.78,
    ringRoughness: 0.24,
    bodyColor: 0x13241c,
    accentColor: 0x6ee7b7,
    coreColor: 0xec6b3f,
  },
};

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  hero: { pos: [0, 2.3, 5.4], target: [0, 1.35, 0] },
  core: { pos: [2.2, 1.85, 2.8], target: [0, 1.45, 0] },
  top: { pos: [0, 5.6, 1.5], target: [0, 1.2, 0] },
};

// Reusable scratch math objects outside render loop (zero GC allocation per frame)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c8d0da';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const shade = 185 + Math.floor((Math.sin(y * 0.7) * 0.5 + 0.5) * 32) + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 8})`;
    ctx.fillRect(0, y, 256, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(24, 30, 37, 0.42)');
  grad.addColorStop(0.55, 'rgba(24, 30, 37, 0.14)');
  grad.addColorStop(1, 'rgba(24, 30, 37, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const EscrowVault3D: React.FC<EscrowVault3DProps> = ({
  vaultState,
  totalLockedUsd,
  activeStakesCount,
  expanded = false,
  onToggleExpand,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [exploded, setExploded] = useState(0);
  const [finish, setFinish] = useState<FinishPreset>('titanium');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('hero');
  const [dockOpen, setDockOpen] = useState(false);
  const [webglError, setWebglError] = useState(false);

  // Mutable ref bridge so React controls update the Three.js scene without remounting WebGL
  const sceneStateRef = useRef({
    vaultState,
    exploded,
    finish,
    targetCamPos: new THREE.Vector3(...CAMERA_PRESETS.hero.pos),
    targetControls: new THREE.Vector3(...CAMERA_PRESETS.hero.target),
    camTransitionActive: false,
  });

  useEffect(() => {
    sceneStateRef.current.vaultState = vaultState;
  }, [vaultState]);

  useEffect(() => {
    sceneStateRef.current.exploded = exploded;
  }, [exploded]);

  useEffect(() => {
    sceneStateRef.current.finish = finish;
  }, [finish]);

  const selectCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    const p = CAMERA_PRESETS[preset];
    sceneStateRef.current.targetCamPos.set(...p.pos);
    sceneStateRef.current.targetControls.set(...p.target);
    sceneStateRef.current.camTransitionActive = true;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0xf3eee8);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0xf3eee8, 0.045);

    // Studio environment reflections (PMREM + RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.hero.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.6;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.addEventListener('start', () => {
      sceneStateRef.current.camTransitionActive = false;
    });

    // Warm key directional light + cool hemisphere fill + rim backlight
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xc7bdb0, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(4.5, 7.5, 5.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.15);
    rimLight.position.set(-4.2, 4.0, -4.5);
    scene.add(rimLight);

    // Ground stage + radial contact shadow
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf0eae2,
      roughness: 0.92,
      metalness: 0.02,
    });
    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(14, 48), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const contactShadowTex = createContactShadowTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const contactShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5), contactShadowMat);
    contactShadowPlane.rotation.x = -Math.PI / 2;
    contactShadowPlane.position.y = 0.015;
    scene.add(contactShadowPlane);

    // Procedural brushed metal texture
    const brushedTex = createBrushedMetalTexture();
    brushedTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Shared materials (mutated smoothly by finish preset)
    const outerRingMat = new THREE.MeshPhysicalMaterial({
      color: FINISH_PALETTES.titanium.ringColor,
      map: brushedTex,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.45,
      clearcoatRoughness: 0.18,
    });

    const chassisMat = new THREE.MeshStandardMaterial({
      color: FINISH_PALETTES.titanium.bodyColor,
      metalness: 0.45,
      roughness: 0.62,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: FINISH_PALETTES.titanium.accentColor,
      metalness: 0.35,
      roughness: 0.32,
      emissive: new THREE.Color(0xec6b3f),
      emissiveIntensity: 0.12,
    });

    const coreCrystalMat = new THREE.MeshPhysicalMaterial({
      color: FINISH_PALETTES.titanium.coreColor,
      metalness: 0.15,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color(0x1d8348),
      emissiveIntensity: 0.18,
    });

    const pinSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.88,
      roughness: 0.26,
    });

    // === Composite 8-Part Procedural Actake Escrow Vault Group ===
    // Pivoted at bottom-center (y = 0) flush with ground
    const vaultRoot = new THREE.Group();
    scene.add(vaultRoot);

    // Part 1: Stepped machined pedestal base (LatheGeometry)
    const pedestalPoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.18, 0.0),
      new THREE.Vector2(1.12, 0.14),
      new THREE.Vector2(0.88, 0.22),
      new THREE.Vector2(0.76, 0.32),
      new THREE.Vector2(0.0, 0.32),
    ];
    const pedestalGeo = new THREE.LatheGeometry(pedestalPoints, 48);
    const pedestalMesh = new THREE.Mesh(pedestalGeo, chassisMat);
    pedestalMesh.castShadow = true;
    pedestalMesh.receiveShadow = true;
    vaultRoot.add(pedestalMesh);

    // Part 2: Pedestal brass/coral accent trim ring
    const trimRingGeo = new THREE.TorusGeometry(0.92, 0.035, 16, 48);
    const trimRingMesh = new THREE.Mesh(trimRingGeo, accentMat);
    trimRingMesh.rotation.x = Math.PI / 2;
    trimRingMesh.position.y = 0.22;
    vaultRoot.add(trimRingMesh);

    // Floating Vault Assembly Group (elevates smoothly over pedestal)
    const vaultAssembly = new THREE.Group();
    vaultAssembly.position.y = 1.48;
    vaultRoot.add(vaultAssembly);

    // Part 3: Outer Milled Brushed-Metal Gyroscope Bezel Ring
    const outerRingGeo = new THREE.TorusGeometry(1.02, 0.155, 28, 64);
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.castShadow = true;
    vaultAssembly.add(outerRingMesh);

    // Part 4: Chamfered Hexagonal Lock Collar (ExtrudeGeometry with bevels)
    const hexShape = new THREE.Shape();
    const hexR = 0.78;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * hexR;
      const y = Math.sin(a) * hexR;
      if (i === 0) hexShape.moveTo(x, y);
      else hexShape.lineTo(x, y);
    }
    hexShape.closePath();
    const innerHole = new THREE.Path();
    innerHole.absarc(0, 0, 0.56, 0, Math.PI * 2, true);
    hexShape.holes.push(innerHole);

    const hexCollarGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.035,
      bevelSegments: 3,
    });
    hexCollarGeo.center();
    const hexCollarMesh = new THREE.Mesh(hexCollarGeo, chassisMat);
    hexCollarMesh.castShadow = true;
    vaultAssembly.add(hexCollarMesh);

    // Part 5: Secondary Inner Gimbal Accent Ring
    const innerGimbalGeo = new THREE.TorusGeometry(0.62, 0.042, 18, 48);
    const innerGimbalMesh = new THREE.Mesh(innerGimbalGeo, accentMat);
    vaultAssembly.add(innerGimbalMesh);

    // Part 6: 4 Radial Spring-Loaded Escrow Locking Pins (separate meshes for exploded animation)
    const lockPinGroup = new THREE.Group();
    vaultAssembly.add(lockPinGroup);
    const lockPins: THREE.Group[] = [];
    const pinShaftGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 16);
    const pinCapGeo = new THREE.ConeGeometry(0.085, 0.14, 16);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pinUnit = new THREE.Group();
      const shaft = new THREE.Mesh(pinShaftGeo, pinSteelMat);
      const cap = new THREE.Mesh(pinCapGeo, accentMat);
      cap.position.y = 0.22;
      pinUnit.add(shaft, cap);
      pinUnit.position.set(Math.cos(angle) * 0.92, Math.sin(angle) * 0.92, 0);
      pinUnit.rotation.z = angle - Math.PI / 2;
      lockPinGroup.add(pinUnit);
      lockPins.push(pinUnit);
    }

    // Part 7: Central Faceted Accountability Core Crystal + Shield Check Emblem
    const coreGroup = new THREE.Group();
    vaultAssembly.add(coreGroup);
    const coreCrystalGeo = new THREE.OctahedronGeometry(0.42, 1);
    const coreCrystalMesh = new THREE.Mesh(coreCrystalGeo, coreCrystalMat);
    coreCrystalMesh.castShadow = true;
    coreGroup.add(coreCrystalMesh);

    // Beveled Checkmark Crest mounted on front of Core
    const checkShape = new THREE.Shape();
    checkShape.moveTo(-0.18, 0.01);
    checkShape.lineTo(-0.05, -0.14);
    checkShape.lineTo(0.22, 0.17);
    checkShape.lineTo(0.14, 0.24);
    checkShape.lineTo(-0.05, 0.02);
    checkShape.lineTo(-0.12, 0.08);
    checkShape.closePath();
    const checkGeo = new THREE.ExtrudeGeometry(checkShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.012,
      bevelSegments: 2,
    });
    checkGeo.center();
    const checkMesh = new THREE.Mesh(checkGeo, pinSteelMat);
    checkMesh.position.z = 0.41;
    coreGroup.add(checkMesh);

    // Part 8: 28 Instanced Orbital Stake Token Shards (USDC / SKR)
    const SHARD_COUNT = 28;
    const shardGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.018, 12);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.24,
    });
    const shardInstances = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_COUNT);
    shardInstances.frustumCulled = false;

    const shardColorA = new THREE.Color(0xec6b3f);
    const shardColorB = new THREE.Color(0x1d8348);
    const shardColorC = new THREE.Color(0xcbd5e1);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const c = i % 3 === 0 ? shardColorA : i % 3 === 1 ? shardColorB : shardColorC;
      shardInstances.setColorAt(i, c);
    }
    if (shardInstances.instanceColor) shardInstances.instanceColor.needsUpdate = true;
    vaultAssembly.add(shardInstances);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Handle context loss gracefully
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // ResizeObserver for crisp container fitting
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, entry.contentRect.width);
        const h = Math.max(1, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    // Animation loop with exponential damping + software-WebGL afterDraw pacing
    let frameId = 0;
    let disposed = false;
    let currentExploded = 0;
    const clock = new THREE.Clock();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const st = sceneStateRef.current;

      // Apply finish palette smoothly
      const pal = FINISH_PALETTES[st.finish];
      outerRingMat.color.lerp(new THREE.Color(pal.ringColor), 1 - Math.exp(-6 * dt));
      outerRingMat.metalness = THREE.MathUtils.damp(outerRingMat.metalness, pal.ringMetalness, 6, dt);
      outerRingMat.roughness = THREE.MathUtils.damp(outerRingMat.roughness, pal.ringRoughness, 6, dt);
      chassisMat.color.lerp(new THREE.Color(pal.bodyColor), 1 - Math.exp(-6 * dt));

      // State-reactive color & energy
      const isRinging = st.vaultState === 'ringing';
      const isVerified = st.vaultState === 'verified';
      const targetAccentHex = isRinging ? 0xef4444 : isVerified ? 0x16a34a : pal.accentColor;
      const targetCoreHex = isRinging ? 0xec6b3f : isVerified ? 0x16a34a : pal.coreColor;
      accentMat.color.lerp(new THREE.Color(targetAccentHex), 1 - Math.exp(-5 * dt));
      accentMat.emissive.lerp(new THREE.Color(targetAccentHex), 1 - Math.exp(-5 * dt));
      accentMat.emissiveIntensity = isRinging
        ? 0.45 + Math.sin(elapsed * 8) * 0.25
        : isVerified
          ? 0.35
          : 0.12;

      coreCrystalMat.color.lerp(new THREE.Color(targetCoreHex), 1 - Math.exp(-5 * dt));
      coreCrystalMat.emissive.lerp(new THREE.Color(targetCoreHex), 1 - Math.exp(-5 * dt));

      // Smooth exploded-view damping
      currentExploded = THREE.MathUtils.damp(currentExploded, st.exploded, 7, dt);
      const spinSpeed = isRinging ? 2.4 : isVerified ? 0.9 : 0.42;

      // Vault hover + gyroscopic kinematics
      vaultAssembly.position.y = 1.48 + Math.sin(elapsed * 1.6) * 0.055 + currentExploded * 0.22;
      outerRingMesh.rotation.y = elapsed * spinSpeed;
      outerRingMesh.rotation.x = Math.sin(elapsed * 0.7) * 0.18;

      hexCollarMesh.position.z = currentExploded * 0.42;
      hexCollarMesh.rotation.z = -elapsed * spinSpeed * 0.65;

      innerGimbalMesh.rotation.x = elapsed * spinSpeed * 1.15;
      innerGimbalMesh.rotation.y = -elapsed * spinSpeed * 0.8;
      innerGimbalMesh.position.z = -currentExploded * 0.35;

      coreGroup.rotation.y = elapsed * (spinSpeed * 0.9);
      coreGroup.scale.setScalar(1 + currentExploded * 0.12);

      for (let i = 0; i < lockPins.length; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4 + elapsed * 0.25;
        const radius = 0.92 + currentExploded * 0.58 + (isVerified ? 0.18 : 0);
        lockPins[i].position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, currentExploded * 0.18);
        lockPins[i].rotation.z = angle - Math.PI / 2;
      }

      // Orbital token shards via pre-allocated math objects
      for (let i = 0; i < SHARD_COUNT; i++) {
        const t = (i / SHARD_COUNT) * Math.PI * 2 + elapsed * (0.35 + (i % 3) * 0.08);
        const orbitR = 1.45 + (i % 3) * 0.18 + currentExploded * 0.45;
        const yOff = Math.sin(t * 2 + i) * (0.28 + currentExploded * 0.22);
        _pos.set(Math.cos(t) * orbitR, yOff, Math.sin(t) * orbitR);
        _euler.set(elapsed + i, t, elapsed * 0.5);
        _quat.setFromEuler(_euler);
        const s = 0.82 + (i % 4) * 0.12;
        _scale.set(s, s, s);
        _mat4.compose(_pos, _quat, _scale);
        shardInstances.setMatrixAt(i, _mat4);
      }
      shardInstances.instanceMatrix.needsUpdate = true;

      // Damped camera preset transitions
      if (st.camTransitionActive) {
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(st.targetCamPos, alpha);
        controls.target.lerp(st.targetControls, alpha);
        if (camera.position.distanceTo(st.targetCamPos) < 0.03) {
          st.camTransitionActive = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();

      // Dispose all geometries, materials, textures
      pedestalGeo.dispose();
      trimRingGeo.dispose();
      outerRingGeo.dispose();
      hexCollarGeo.dispose();
      innerGimbalGeo.dispose();
      pinShaftGeo.dispose();
      pinCapGeo.dispose();
      coreCrystalGeo.dispose();
      checkGeo.dispose();
      shardGeo.dispose();
      floorMesh.geometry.dispose();
      contactShadowPlane.geometry.dispose();

      outerRingMat.dispose();
      chassisMat.dispose();
      accentMat.dispose();
      coreCrystalMat.dispose();
      pinSteelMat.dispose();
      shardMat.dispose();
      floorMat.dispose();
      contactShadowMat.dispose();

      brushedTex.dispose();
      contactShadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  if (webglError) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center rounded-3xl bg-[#F3EEE8] border border-[#E6DFD6] p-6 text-center ${className}`}
      >
        <img
          src="/assets/aistudio/Gemini_Generated_Image_eh2x1teh2x1teh2x_c3446dad.jpg"
          alt="Actake Escrow Mascot"
          referrerPolicy="no-referrer"
          className="w-24 h-24 rounded-2xl object-cover shadow-sm mb-3"
        />
        <p className="font-display font-bold text-[#181E25]">Actake Escrow Vault</p>
        <p className="text-xs text-[#5E6873] mt-1 tabular-nums">
          ${totalLockedUsd.toFixed(2)} locked across {activeStakesCount} active pools
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-[#F3EEE8] border border-[#E6DFD6] select-none ${className}`}
    >
      {/* Dedicated isolated WebGL canvas mount container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Minimal Top-Left Vault Spec Overlay (solid/rgba surface — zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3.5 left-3.5 right-3.5 flex items-start justify-between gap-2 z-10">
        <div className="rounded-xl bg-[#FAF7F3]/95 border border-[#E6DFD6] px-3 py-2 shadow-sm">
          <div className="text-[11px] font-medium text-[#646F7C]">Actake Escrow Core</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display text-base font-bold text-[#181E25] tabular-nums">
              ${totalLockedUsd.toFixed(2)} Locked
            </span>
            <span className="text-xs text-[#646F7C] tabular-nums">
              · {activeStakesCount} active
            </span>
          </div>
        </div>

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Exit full 3D view' : 'Expand 3D Vault'}
            className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-[#FAF7F3]/95 border border-[#E6DFD6] text-[#181E25] hover:bg-white flex items-center justify-center shadow-sm transition-colors"
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Collapsible Bottom Control Dock (zero viewport occlusion, solid/rgba surface) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94%] w-fit">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="mb-1.5 px-3 py-1 rounded-lg bg-[#181E25]/92 text-white text-[11px] font-medium flex items-center gap-1.5 hover:bg-[#181E25] transition-colors whitespace-nowrap"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{dockOpen ? 'Hide Vault Controls' : 'Inspect 3D Vault'}</span>
          {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {dockOpen && (
          <div className="rounded-2xl bg-[#FAF7F3]/96 border border-[#DDD5CA] shadow-md px-3.5 py-2.5 flex flex-wrap items-center justify-center gap-3 text-xs">
            {/* Exploded View Slider */}
            <label className="flex items-center gap-2 text-[#181E25] font-medium whitespace-nowrap">
              <span className="text-[11px] text-[#5E6873]">Explode</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={exploded}
                onChange={(e) => setExploded(Number(e.target.value))}
                className="w-20 accent-[#EC6B3F] cursor-pointer"
              />
            </label>

            <span className="h-4 w-px bg-[#DDD5CA] hidden sm:block" />

            {/* Material Finish Swatches */}
            <div className="flex items-center gap-1.5">
              {(Object.keys(FINISH_PALETTES) as FinishPreset[]).map((key) => {
                const pal = FINISH_PALETTES[key];
                const active = finish === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFinish(key)}
                    title={pal.label}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      active ? 'border-[#181E25] scale-110' : 'border-white hover:scale-105'
                    }`}
                    style={{ backgroundColor: pal.swatch }}
                  />
                );
              })}
            </div>

            <span className="h-4 w-px bg-[#DDD5CA] hidden sm:block" />

            {/* Camera Presets */}
            <div className="flex items-center gap-1 bg-[#EAE4DC] p-0.5 rounded-lg">
              {(['hero', 'core', 'top'] as CameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectCameraPreset(preset)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-colors whitespace-nowrap ${
                    cameraPreset === preset
                      ? 'bg-white text-[#181E25] shadow-xs'
                      : 'text-[#5E6873] hover:text-[#181E25]'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setExploded(0);
                  selectCameraPreset('hero');
                }}
                title="Reset view"
                className="p-1 text-[#5E6873] hover:text-[#181E25]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
