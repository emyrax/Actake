import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GeoDropTokenSymbol } from '../../types/geodrops';

interface ChestModelProps {
  /** Signed compass delta in degrees [-180, +180]: 0 = dead center in camera frustum */
  relativeBearing: number;
  /** Whether the hunter is inside the geofence radius/polygon */
  insideGeofence: boolean;
  /** Token type determines primary chest glow (USDC = Amber Gold, SKR = Seeker Emerald) */
  tokenSymbol: GeoDropTokenSymbol;
  /** True while claim signature is in progress */
  unlocking: boolean;
  /** True once claim succeeds — swings lid open and fires token burst */
  unlocked: boolean;
  /** Fires when the user taps/clicks directly on the 3D treasure chest */
  onTapChest: () => void;
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

export const ChestModel: React.FC<ChestModelProps> = ({
  relativeBearing,
  insideGeofence,
  tokenSymbol,
  unlocking,
  unlocked,
  onTapChest,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    relativeBearing,
    insideGeofence,
    tokenSymbol,
    unlocking,
    unlocked,
    onTapChest,
  });

  propsRef.current = {
    relativeBearing,
    insideGeofence,
    tokenSymbol,
    unlocking,
    unlocked,
    onTapChest,
  };

  useEffect(() => {
    if (unlocked) {
      playChestUnlockChime();
    }
  }, [unlocked]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

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
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.setClearColor(0x000000, 0);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'manipulation';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.72, 4.4);
    camera.lookAt(0, 0.08, 0);

    // Procedural PBR Studio Reflections via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Warm Key + Cool Fill + Glowing Chest Core Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b2314, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(3.2, 5.4, 4.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.15);
    rimLight.position.set(-4.0, 2.2, -3.0);
    scene.add(rimLight);

    const accentColorHex = tokenSymbol === 'SKR' ? 0x10b981 : 0xf59e0b;
    const accentGlowHex = tokenSymbol === 'SKR' ? 0x34d399 : 0xfbbf24;

    const coreLight = new THREE.PointLight(accentGlowHex, 2.6, 5.5, 1.8);
    coreLight.position.set(0, 0.12, 0.45);

    // =========================================================================
    // Composite Multi-Part PBR Treasure Chest (10+ engineered components)
    // =========================================================================
    const chestRoot = new THREE.Group();
    scene.add(chestRoot);

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
      color: accentColorHex,
      emissive: accentGlowHex,
      emissiveIntensity: 1.55,
      roughness: 0.15,
      metalness: 0.35,
    });

    const ringMat = new THREE.MeshStandardMaterial({
      color: accentGlowHex,
      emissive: accentColorHex,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.85,
      transparent: true,
      opacity: 0.82,
    });

    // 1. Lower Chest Body
    const baseGeo = new THREE.BoxGeometry(1.56, 0.78, 1.02);
    const baseMesh = new THREE.Mesh(baseGeo, woodMat);
    baseMesh.position.set(0, -0.22, 0);
    chestRoot.add(baseMesh);

    // 2. Inset Dark Obsidian Front/Side Panels
    const panelFrontGeo = new THREE.BoxGeometry(1.32, 0.56, 1.05);
    const panelFront = new THREE.Mesh(panelFrontGeo, obsidianMat);
    panelFront.position.set(0, -0.22, 0);
    chestRoot.add(panelFront);

    // 3. Lower Brushed Gold Base Rim & Corner Straps
    const lowerTrimGeo = new THREE.BoxGeometry(1.64, 0.1, 1.1);
    const lowerTrim = new THREE.Mesh(lowerTrimGeo, goldMat);
    lowerTrim.position.set(0, -0.58, 0);
    chestRoot.add(lowerTrim);

    const upperTrimGeo = new THREE.BoxGeometry(1.64, 0.08, 1.1);
    const upperTrim = new THREE.Mesh(upperTrimGeo, goldMat);
    upperTrim.position.set(0, 0.16, 0);
    chestRoot.add(upperTrim);

    const cornerStrapGeo = new THREE.BoxGeometry(0.14, 0.82, 1.08);
    [-0.72, 0.72].forEach((x) => {
      const strap = new THREE.Mesh(cornerStrapGeo, goldMat);
      strap.position.set(x, -0.21, 0);
      chestRoot.add(strap);
    });

    // 4. Central Lockplate + Glowing Solana Core Gem
    const lockPlateGeo = new THREE.BoxGeometry(0.32, 0.36, 0.12);
    const lockPlate = new THREE.Mesh(lockPlateGeo, goldMat);
    lockPlate.position.set(0, 0.05, 0.53);
    chestRoot.add(lockPlate);

    const gemGeo = new THREE.OctahedronGeometry(0.11, 0);
    const frontGem = new THREE.Mesh(gemGeo, gemMat);
    frontGem.position.set(0, 0.05, 0.61);
    chestRoot.add(frontGem);

    // 5. Interior Glowing Core (revealed dramatically when the hinged lid opens)
    const innerCoreGeo = new THREE.IcosahedronGeometry(0.34, 1);
    const innerCore = new THREE.Mesh(innerCoreGeo, gemMat);
    innerCore.position.set(0, 0.18, 0);
    chestRoot.add(innerCore);
    chestRoot.add(coreLight);

    // 6. Hinged Domed Lid Group (pivots cleanly at the rear top edge z = -0.51, y = 0.18)
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.18, -0.51);
    chestRoot.add(lidPivot);

    const domeGeo = new THREE.CylinderGeometry(0.51, 0.51, 1.56, 24, 1, false, 0, Math.PI);
    domeGeo.rotateZ(Math.PI / 2);
    domeGeo.rotateY(Math.PI);
    const domeMesh = new THREE.Mesh(domeGeo, woodMat);
    domeMesh.position.set(0, 0, 0.51);
    lidPivot.add(domeMesh);

    // Lid End Caps
    const endCapGeo = new THREE.CircleGeometry(0.51, 24, 0, Math.PI);
    [-0.782, 0.782].forEach((x, idx) => {
      const cap = new THREE.Mesh(endCapGeo, obsidianMat);
      cap.position.set(x, 0, 0.51);
      cap.rotation.y = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
      lidPivot.add(cap);
    });

    // Lid Gold Arch Ribs
    const ribGeo = new THREE.TorusGeometry(0.525, 0.045, 10, 24, Math.PI);
    [-0.72, 0, 0.72].forEach((x) => {
      const rib = new THREE.Mesh(ribGeo, goldMat);
      rib.position.set(x, 0, 0.51);
      rib.rotation.y = Math.PI / 2;
      lidPivot.add(rib);
    });

    // Lid Front Clasp Tongue
    const claspGeo = new THREE.BoxGeometry(0.18, 0.2, 0.09);
    const clasp = new THREE.Mesh(claspGeo, goldMat);
    clasp.position.set(0, -0.02, 1.03);
    lidPivot.add(clasp);

    // 7. Orbiting AR Energy Halo Ring
    const haloGeo = new THREE.TorusGeometry(1.26, 0.022, 12, 64);
    const haloRing = new THREE.Mesh(haloGeo, ringMat);
    haloRing.rotation.x = Math.PI / 2.25;
    haloRing.position.set(0, -0.35, 0);
    chestRoot.add(haloRing);

    // 8. Celebratory Token Burst (InstancedMesh — 36 metallic coins, zero per-frame allocations)
    const TOKEN_COUNT = 36;
    const coinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.032, 18);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: accentGlowHex,
      emissive: accentColorHex,
      emissiveIntensity: 0.65,
      roughness: 0.18,
      metalness: 0.94,
    });
    const tokenBurst = new THREE.InstancedMesh(coinGeo, coinMat, TOKEN_COUNT);
    tokenBurst.visible = false;
    chestRoot.add(tokenBurst);

    const tokenVelocities: THREE.Vector3[] = [];
    const tokenPositions: THREE.Vector3[] = [];
    const tokenSpins: THREE.Vector3[] = [];
    for (let i = 0; i < TOKEN_COUNT; i++) {
      const angle = (i / TOKEN_COUNT) * Math.PI * 2 + (i % 3) * 0.2;
      const radialSpeed = 0.8 + (i % 5) * 0.32;
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

    // Pre-allocated scratch objects (zero GC in render loop)
    const dummyObj = new THREE.Object3D();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    // Pointer tap/click raycasting on the 3D chest
    let pointerDownX = 0;
    let pointerDownY = 0;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };
    const handlePointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (moved > 18) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(chestRoot, true);
      if (hits.length > 0 && propsRef.current.insideGeofence) {
        propsRef.current.onTapChest();
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // ResizeObserver for crisp layout transitions
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

    // WebGL context loss recovery
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

    // Animation state
    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let burstElapsed = 0;
    let burstStarted = false;
    let currentX = 0;
    let currentScale = 0.01;
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
        } = propsRef.current;

        // Position chest horizontally inside camera frustum based on compass alignment
        const clampedDelta = Math.max(-55, Math.min(55, bearingDelta));
        const targetX = (clampedDelta / 55) * 1.45;
        currentX = THREE.MathUtils.damp(currentX, targetX, 6.5, dt);

        // Scale up smoothly when inside the geofence
        const targetScale = activeInZone ? (isUnlocking ? 1.06 : 1.0) : 0.42;
        currentScale = THREE.MathUtils.damp(currentScale, targetScale, 5.5, dt);

        chestRoot.position.x = currentX;
        chestRoot.position.y = Math.sin(elapsed * 2.1) * 0.1 + 0.06;
        chestRoot.scale.setScalar(currentScale);

        // Spin gently while idle; accelerate slightly while awaiting wallet signature
        const spinSpeed = isUnlocking ? 2.4 : isUnlocked ? 0.42 : 0.68;
        chestRoot.rotation.y += dt * spinSpeed;

        // Open hinged lid smoothly once claimed
        const targetLid = isUnlocked ? -Math.PI * 0.62 : isUnlocking ? -0.18 : 0;
        currentLidAngle = THREE.MathUtils.damp(currentLidAngle, targetLid, 5.0, dt);
        lidPivot.rotation.x = currentLidAngle;

        // Pulse core glow + halo ring
        const pulse = 1.25 + Math.sin(elapsed * 3.8) * 0.35;
        gemMat.emissiveIntensity = isUnlocked ? 2.8 : pulse;
        coreLight.intensity = isUnlocked ? 4.8 : activeInZone ? 2.4 + Math.sin(elapsed * 3.8) * 0.6 : 0.8;
        haloRing.rotation.z = elapsed * (isUnlocking ? 2.2 : 0.75);
        innerCore.rotation.y = -elapsed * 1.6;
        innerCore.position.y = isUnlocked ? 0.48 + Math.sin(elapsed * 3.2) * 0.06 : 0.18;

        // Trigger token burst fountain on unlock
        if (isUnlocked) {
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
            pos.set(
              vel.x * t,
              0.22 + vel.y * t - 2.35 * t * t,
              vel.z * t
            );
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
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      // Dispose all geometries, materials, and environment render target
      [
        baseGeo,
        panelFrontGeo,
        lowerTrimGeo,
        upperTrimGeo,
        cornerStrapGeo,
        lockPlateGeo,
        gemGeo,
        innerCoreGeo,
        domeGeo,
        endCapGeo,
        ribGeo,
        claspGeo,
        haloGeo,
        coinGeo,
      ].forEach((g) => g.dispose());
      [woodMat, obsidianMat, goldMat, gemMat, ringMat, coinMat].forEach((m) => m.dispose());
      envTarget.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [tokenSymbol]);

  return (
    <div
      ref={mountRef}
      role="button"
      tabIndex={insideGeofence ? 0 : -1}
      aria-label={
        insideGeofence
          ? '3D GeoDrop Treasure Chest — tap or press Enter to unlock'
          : '3D GeoDrop Treasure Chest preview'
      }
      onKeyDown={(e) => {
        if (insideGeofence && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onTapChest();
        }
      }}
      className={`w-full h-full select-none ${
        insideGeofence ? 'cursor-pointer' : 'pointer-events-none'
      }`}
    />
  );
};
