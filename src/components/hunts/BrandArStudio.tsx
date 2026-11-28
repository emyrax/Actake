import React, { useRef, useState } from 'react';
import {
  Box,
  Image as ImageIcon,
  Layers,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  GeoDropAi3DBlueprint,
  GeoDropArAsset,
  GeoDropArAssetKind,
  GeoDropImageFrameStyle,
  GeoDropTokenSymbol,
} from '../../types/geodrops';
import { ChestModel } from './ChestModel';

interface BrandArStudioProps {
  value: GeoDropArAsset;
  tokenSymbol: GeoDropTokenSymbol;
  onChange: (next: GeoDropArAsset) => void;
}

const ACCENT_PRESETS = ['#F16A2E', '#F59E0B', '#10B981', '#3B82F6', '#A855F7', '#EC4899'];

/** Downscales uploaded brand images to max 768px PNG/WebP for crisp, lightweight 3D textures */
function compressBrandImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a supported image.'));
      img.onload = () => {
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const w = Math.max(64, Math.round(img.width * scale));
        const h = Math.max(64, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // Preserve PNG transparency for brand logos; use WebP/PNG depending on alpha
        const out = canvas.toDataURL('image/png');
        resolve(out);
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected .glb file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export const BrandArStudio: React.FC<BrandArStudioProps> = ({
  value,
  tokenSymbol,
  onChange,
}) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);

  const [convertingAi, setConvertingAi] = useState(false);
  const [uploadingGlb, setUploadingGlb] = useState(false);
  const [stylePrompt, setStylePrompt] = useState('');
  const [studioError, setStudioError] = useState<string | null>(null);

  const activeKind: GeoDropArAssetKind = value.kind || 'chest';

  const handleSelectKind = (kind: GeoDropArAssetKind) => {
    setStudioError(null);
    onChange({
      ...value,
      kind,
      depthStrength: value.depthStrength ?? 0.68,
      frameStyle: value.frameStyle ?? 'card',
      accentHex: value.accentHex || (tokenSymbol === 'SKR' ? '#10B981' : '#F16A2E'),
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setStudioError('Please upload a PNG, JPG, or WebP brand image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStudioError('Brand image must be 4 MB or smaller.');
      return;
    }

    setStudioError(null);
    try {
      const compressedDataUrl = await compressBrandImageFile(file);
      onChange({
        ...value,
        kind: activeKind === 'ai_3d_sculpture' ? 'ai_3d_sculpture' : 'image_depth',
        imageDataUrl: compressedDataUrl,
        depthStrength: value.depthStrength ?? 0.68,
        frameStyle: value.frameStyle ?? 'card',
        accentHex: value.accentHex || '#F16A2E',
      });
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Unable to process brand image.');
    }
  };

  const handleConvertImageTo3D = async () => {
    if (!value.imageDataUrl) {
      setStudioError('Upload a brand image first so AI can sculpt a 3D AR asset from it.');
      return;
    }
    setConvertingAi(true);
    setStudioError(null);
    try {
      const resp = await fetch('/api/hunts/ai-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: value.imageDataUrl,
          brandName: value.brandName || '',
          hint: stylePrompt.trim(),
        }),
      });
      const data = (await resp.json()) as {
        blueprint?: GeoDropAi3DBlueprint;
        error?: string;
      };
      if (!resp.ok || !data.blueprint) {
        throw new Error(data.error || 'AI 3D conversion failed. Please try again.');
      }

      onChange({
        ...value,
        kind: 'ai_3d_sculpture',
        aiBlueprint: data.blueprint,
        accentHex: data.blueprint.accentColorHex,
      });
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Unable to generate AI 3D sculpture right now.'
      );
    } finally {
      setConvertingAi(false);
    }
  };

  const handleGlbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!/\.glb$/i.test(file.name)) {
      setStudioError('Please upload a binary glTF 2.0 (.glb) 3D model file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStudioError('Custom .glb 3D model must be 10 MB or smaller.');
      return;
    }

    setUploadingGlb(true);
    setStudioError(null);
    try {
      const base64Data = await fileToBase64(file);
      const resp = await fetch('/api/hunts/assets/glb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64Data,
        }),
      });
      const data = (await resp.json()) as {
        modelAssetUrl?: string;
        fileName?: string;
        sizeBytes?: number;
        error?: string;
      };
      if (!resp.ok || !data.modelAssetUrl) {
        throw new Error(data.error || 'Unable to validate and upload .glb model.');
      }

      onChange({
        ...value,
        kind: 'custom_glb',
        modelAssetUrl: data.modelAssetUrl,
        modelFileName: data.fileName || file.name,
        modelSizeBytes: data.sizeBytes || file.size,
      });
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Unable to upload custom 3D model.');
    } finally {
      setUploadingGlb(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#FFF9F5] border border-[#EEDCD1] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-[#111114] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#F16A2E]" />
            <span>Brand AR 3D Asset Studio (Optional)</span>
          </div>
          <p className="text-[11px] text-[#6B6663] mt-0.5">
            Keep the classic 3D chest, give a brand image real 3D depth, convert it with AI, or upload a .glb model.
          </p>
        </div>
      </div>

      {/* 4-Mode Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { id: 'chest', label: '3D Chest', icon: Box },
            { id: 'image_depth', label: '3D Depth Image', icon: Layers },
            { id: 'ai_3d_sculpture', label: 'AI Image → 3D', icon: Wand2 },
            { id: 'custom_glb', label: 'Upload .GLB', icon: Upload },
          ] as Array<{
            id: GeoDropArAssetKind;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }>
        ).map((item) => {
          const Icon = item.icon;
          const selected = activeKind === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectKind(item.id)}
              className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                selected
                  ? 'bg-[#111114] text-white border-[#111114]'
                  : 'bg-white text-[#534E4B] border-[#E6D6CC] hover:border-[#F16A2E]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-[#F4976C]' : ''}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live 3D Studio Turntable + Mode Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        {/* Live Interactive 3D Preview */}
        <div className="md:col-span-5 relative rounded-2xl overflow-hidden bg-[#141416] border border-[#242630] min-h-[220px] flex flex-col">
          <div className="flex-1 min-h-[195px]">
            <ChestModel
              relativeBearing={0}
              insideGeofence={true}
              tokenSymbol={tokenSymbol}
              unlocking={false}
              unlocked={false}
              arAsset={value}
              previewMode={true}
              onTapChest={() => {}}
            />
          </div>
          <div className="px-3 py-1.5 bg-[#1B1C22] border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-white/70">
            <span>Drag to inspect 3D depth</span>
            <span className="text-[#F4976C]">
              {activeKind === 'chest'
                ? 'Classic Chest'
                : activeKind === 'image_depth'
                  ? '3D Relief'
                  : activeKind === 'ai_3d_sculpture'
                    ? value.aiBlueprint
                      ? `${value.aiBlueprint.parts.length} AI Parts`
                      : 'AI Pending'
                    : value.modelFileName
                      ? 'GLB Ready'
                      : 'No GLB Yet'}
            </span>
          </div>
        </div>

        {/* Right Controls Column */}
        <div className="md:col-span-7 space-y-3 flex flex-col justify-between">
          {activeKind === 'chest' && (
            <div className="rounded-xl bg-white border border-[#E6D6CC] p-4 space-y-1.5 text-xs text-[#534E4B]">
              <div className="font-bold text-[#111114]">Default Actake 3D Treasure Chest</div>
              <p className="leading-relaxed">
                Renders the classic hinged obsidian-and-gold 3D vault inside AR camera view. Switch
                to <strong>3D Depth Image</strong>, <strong>AI Image → 3D</strong>, or{' '}
                <strong>Upload .GLB</strong> anytime to showcase a custom brand object instead.
              </p>
            </div>
          )}

          {(activeKind === 'image_depth' || activeKind === 'ai_3d_sculpture') && (
            <div className="space-y-3">
              {/* Brand Name + Image File Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={value.brandName || ''}
                  onChange={(e) => onChange({ ...value, brandName: e.target.value })}
                  maxLength={60}
                  placeholder="Brand name (optional)"
                  className="min-h-[42px] px-3 rounded-xl bg-white border border-[#E6D6CC] text-xs text-[#111114]"
                />

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="min-h-[42px] px-3.5 rounded-xl bg-white hover:bg-[#FFF4EE] border border-dashed border-[#D6B9A8] text-xs font-bold text-[#111114] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-[#F16A2E]" />
                  <span>{value.imageDataUrl ? 'Replace Brand Image' : 'Upload Brand Image'}</span>
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleImageUpload(e)}
                  className="hidden"
                />
              </div>

              {activeKind === 'image_depth' && (
                <div className="space-y-3 rounded-xl bg-white border border-[#E6D6CC] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#111114]">3D Frame Shape</span>
                    <div className="inline-flex gap-1">
                      {(
                        [
                          { id: 'card', label: '3D Card' },
                          { id: 'medallion', label: 'Medallion' },
                          { id: 'cutout', label: 'Cutout' },
                        ] as Array<{ id: GeoDropImageFrameStyle; label: string }>
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onChange({ ...value, frameStyle: f.id })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            (value.frameStyle || 'card') === f.id
                              ? 'bg-[#111114] text-white'
                              : 'bg-[#F5ECE6] text-[#6B6663] hover:text-[#111114]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-[#534E4B] tabular-nums">
                      <span>3D Relief Depth Strength</span>
                      <span>{Math.round((value.depthStrength ?? 0.68) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.0}
                      step={0.05}
                      value={value.depthStrength ?? 0.68}
                      onChange={(e) =>
                        onChange({ ...value, depthStrength: Number(e.target.value) })
                      }
                      className="w-full accent-[#F16A2E] cursor-pointer"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#111114]">Rim & Glow Accent</span>
                    <div className="flex items-center gap-1.5">
                      {ACCENT_PRESETS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`Select accent color ${hex}`}
                          onClick={() => onChange({ ...value, accentHex: hex })}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            value.accentHex === hex
                              ? 'border-[#111114] scale-110'
                              : 'border-white shadow-xs'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeKind === 'ai_3d_sculpture' && (
                <div className="space-y-2.5 rounded-xl bg-white border border-[#E6D6CC] p-3.5">
                  <input
                    type="text"
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    maxLength={140}
                    placeholder="Optional AI sculpture cue (e.g., chrome sneaker trophy, neon coffee cup)"
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#FFFDFB] border border-[#E6D6CC] text-xs text-[#111114]"
                  />

                  <button
                    type="button"
                    disabled={convertingAi || !value.imageDataUrl}
                    onClick={() => void handleConvertImageTo3D()}
                    className="w-full min-h-[44px] px-4 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-[#E7DDD6] disabled:text-[#8E8680] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    {convertingAi ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sculpting 3D AR Asset with AI...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        <span>
                          {value.aiBlueprint
                            ? 'Regenerate AI 3D Sculpture'
                            : 'Convert Image to 3D with AI'}
                        </span>
                      </>
                    )}
                  </button>

                  {value.aiBlueprint && (
                    <div className="text-[11px] text-[#534E4B] bg-[#FFF6F0] border border-[#F2DACB] rounded-lg px-3 py-2">
                      <span className="font-bold text-[#111114]">{value.aiBlueprint.title}:</span>{' '}
                      {value.aiBlueprint.summary}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeKind === 'custom_glb' && (
            <div className="rounded-xl bg-white border border-[#E6D6CC] p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#111114]">
                  Optional Custom 3D Model (.GLB)
                </div>
                <p className="text-[11px] text-[#6B6663] leading-relaxed">
                  Upload any self-contained binary glTF 2.0 (<code>.glb</code>) model up to 10 MB.
                  We auto-center, auto-scale, and light it with PBR studio reflections for AR.
                </p>
              </div>

              <button
                type="button"
                disabled={uploadingGlb}
                onClick={() => glbInputRef.current?.click()}
                className="w-full min-h-[46px] px-4 rounded-xl bg-[#FFF6F0] hover:bg-[#FFE9DC] border border-dashed border-[#F16A2E] text-xs font-bold text-[#D85316] flex items-center justify-center gap-2 transition-colors"
              >
                {uploadingGlb ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validating & Uploading .GLB...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>
                      {value.modelFileName
                        ? `Replace ${value.modelFileName}`
                        : 'Select .GLB 3D Model (Max 10 MB)'}
                    </span>
                  </>
                )}
              </button>
              <input
                ref={glbInputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(e) => void handleGlbUpload(e)}
                className="hidden"
              />

              {value.modelAssetUrl && value.modelFileName && (
                <div className="font-mono text-[11px] text-[#15803D] tabular-nums">
                  Loaded: {value.modelFileName} (
                  {((value.modelSizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB)
                </div>
              )}
            </div>
          )}

          {studioError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 text-xs font-medium text-[#B91C1C]">
              {studioError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
