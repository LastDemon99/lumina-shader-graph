import React, { useEffect, useRef, useState } from 'react';
import type { GradientStop, ShaderNode } from '../types';
import type { ControlSpec, NodeUiSpec } from '../nodes/types';
import { evaluateCondition } from '../nodes/runtime';
import type { Connection } from '../types';
import { createTextureAtlas, processTextureFile } from '../services/textureUtils';
import { CheckSquare, ChevronDown, Loader2, Plus, Square as SquareIcon, Trash2, Upload, X, Layers } from 'lucide-react';

type BindTarget = 'data' | 'inputValues';

type NodeModuleUIProps = {
  ui: NodeUiSpec;
  node: ShaderNode;
  allConnections: Connection[];
  onUpdateData: (id: string, data: any) => void;
};

const ThrottledColorInput: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const [localValue, setLocalValue] = useState(value);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (!throttleTimeoutRef.current) {
      throttleTimeoutRef.current = setTimeout(() => {
        onChange(newValue);
        throttleTimeoutRef.current = null;
      }, 100);
    }
  };

  return (
    <input
      type="color"
      className="absolute -top-2 -left-2 w-[200%] h-[200%] cursor-pointer p-0 m-0"
      value={localValue}
      onChange={handleChange}
      onMouseDown={e => e.stopPropagation()}
    />
  );
};

const getBoundValue = (node: ShaderNode, target: BindTarget, key: string) => {
  return target === 'data' ? (node.data as any)?.[key] : (node.data as any)?.inputValues?.[key];
};

const setBoundValue = (
  node: ShaderNode,
  onUpdateData: (id: string, data: any) => void,
  target: BindTarget,
  key: string,
  value: any,
) => {
  if (target === 'data') {
    onUpdateData(node.id, { ...node.data, [key]: value });
  } else {
    const currentInputs = (node.data as any)?.inputValues ?? {};
    onUpdateData(node.id, { ...node.data, inputValues: { ...currentInputs, [key]: value } });
  }
};

export const NodeModuleUI: React.FC<NodeModuleUIProps> = ({ ui, node, allConnections, onUpdateData }) => {
  if (!ui.sections || ui.sections.length === 0) return null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const arrayFileInputRef = useRef<HTMLInputElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);

  const [isLoadingTexture, setIsLoadingTexture] = useState(false);
  const [maskOpenId, setMaskOpenId] = useState<string | null>(null);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

  useEffect(() => {
    if (!maskOpenId) return;

    const handleClickOutside = (e: MouseEvent) => {
      // If we clicked outside the open dropdown (which has z-[100]), close it.
      // We check if the target is NOT part of the dropdown button or menu.
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setMaskOpenId(null);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [maskOpenId]);

  const removeArrayLayer = async (bindTarget: BindTarget, bindKey: string, index: number) => {
    const currentLayers: string[] = Array.isArray(getBoundValue(node, bindTarget, bindKey))
      ? (getBoundValue(node, bindTarget, bindKey) as string[])
      : [];

    if (index < 0 || index >= currentLayers.length) return;

    setIsLoadingTexture(true);
    try {
      const newLayers = currentLayers.filter((_, i) => i !== index);
      const atlasUrl = newLayers.length > 0 ? await createTextureAtlas(newLayers) : '';
      setBoundValue(node, onUpdateData, bindTarget, bindKey, newLayers);
      // common convention for atlas-backed nodes
      if (bindTarget === 'data' && bindKey !== 'textureAsset') {
        onUpdateData(node.id, { ...node.data, textureAsset: atlasUrl, layerCount: newLayers.length, layers: newLayers });
      }
    } catch (err) {
      console.error('Texture Array Remove Error:', err);
      alert('Failed to update texture array atlas.');
    } finally {
      setIsLoadingTexture(false);
    }
  };

  const renderControl = (control: ControlSpec) => {
    if (!evaluateCondition(control.when, node, allConnections)) return null;

    const bindTarget: BindTarget = control.bind.scope === 'data' ? 'data' : 'inputValues';
    const boundKey = control.bind.key;
    const value = getBoundValue(node, bindTarget, boundKey);

    if (control.controlType === 'number') {
      return (
        <div className="flex items-center bg-[#0a0a0a] border border-gray-700 rounded px-2 focus-within:border-blue-500 nodrag">
          <span className="text-[10px] text-gray-500 mr-2 font-mono">{control.label}</span>
          <input
            type="number"
            className="w-full h-6 bg-transparent text-[10px] text-white outline-none"
            step={control.number?.step ?? 0.01}
            min={control.number?.min}
            max={control.number?.max}
            value={value ?? 0}
            onChange={(e) => setBoundValue(node, onUpdateData, bindTarget, boundKey, e.target.value)}
            onMouseDown={e => e.stopPropagation()}
          />
        </div>
      );
    }

    if (control.controlType === 'toggle') {
      const boolVal = Boolean(value);
      return (
        <div className="flex items-center justify-between px-1 h-6 bg-[#0a0a0a] border border-gray-700 rounded nodrag">
          <span className="text-[9px] text-gray-400">{control.label}</span>
          <button
            onClick={() => setBoundValue(node, onUpdateData, bindTarget, boundKey, !boolVal)}
            onMouseDown={e => e.stopPropagation()}
            className="text-gray-400 hover:text-white"
          >
            {boolVal ? <CheckSquare className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
          </button>
        </div>
      );
    }

    if (control.controlType === 'select') {
      return (
        <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag">
          <span className="text-[9px] text-gray-500 mr-2">{control.label}</span>
          <select
            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
            value={value ?? ''}
            onChange={(e) => setBoundValue(node, onUpdateData, bindTarget, boundKey, e.target.value)}
            onMouseDown={e => e.stopPropagation()}
          >
            {(control.select?.options ?? []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }

    if (control.controlType === 'color') {
      const colorVal = (typeof value === 'string' && value.startsWith('#')) ? value : '#ffffff';
      return (
        <div className="w-full h-8 rounded border border-gray-700 overflow-hidden relative nodrag">
          <ThrottledColorInput
            value={colorVal}
            onChange={(newVal) => setBoundValue(node, onUpdateData, bindTarget, boundKey, newVal)}
          />
        </div>
      );
    }

    if (control.controlType === 'multiSelectMask') {
      const mask = String(value ?? control.multiSelectMask?.defaultValue ?? '');
      const isOpen = maskOpenId === control.id;
      const options = control.multiSelectMask?.options ?? [];

      return (
        <div className="relative w-full nodrag dropdown-container">
          <button
            className="w-full h-6 bg-[#0a0a0a] border border-gray-700 rounded flex items-center justify-between px-2 text-[10px] text-white hover:border-gray-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setMaskOpenId(isOpen ? null : control.id);
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <span className="truncate tracking-widest">{mask || 'None'}</span>
            <ChevronDown className="w-3 h-3 text-gray-500" />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 w-full bg-[#1e1e1e] border border-gray-600 rounded shadow-2xl mt-1 flex flex-col overflow-hidden z-[100] scale-in-center">
              <button
                className="px-2 py-1.5 text-[9px] text-left text-gray-300 hover:bg-gray-700 hover:text-white border-b border-gray-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setBoundValue(node, onUpdateData, bindTarget, boundKey, '');
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                None
              </button>
              <div className="flex flex-col gap-1 p-2">
                {options.map(opt => {
                  const current = mask;
                  const isActive = current.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      className={`w-full py-1 rounded text-[9px] ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'} hover:bg-gray-700`}
                      onClick={(e) => {
                        e.stopPropagation();
                        let newMask = isActive ? current.replaceAll(opt.value, '') : current + opt.value;
                        const allowDuplicates = control.multiSelectMask?.allowDuplicates ?? false;
                        if (!allowDuplicates) {
                          const order = options.map(o => o.value);
                          newMask = order.filter(c => newMask.includes(c)).join('');
                        }
                        setBoundValue(node, onUpdateData, bindTarget, boundKey, newMask);
                      }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (control.controlType === 'range') {
      const minKey = control.range?.minKey;
      const maxKey = control.range?.maxKey;
      const min = minKey ? Number(getBoundValue(node, 'data', minKey) ?? 0) : 0;
      const max = maxKey ? Number(getBoundValue(node, 'data', maxKey) ?? 1) : 1;
      const numericValue = Number(value ?? (min + max) * 0.5);

      return (
        <div className="flex flex-col gap-3 nodrag">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={max}
              step={control.range?.step ?? 0.01}
              value={numericValue}
              onChange={(e) => setBoundValue(node, onUpdateData, bindTarget, boundKey, parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
              onMouseDown={e => e.stopPropagation()}
            />
            <div className="w-10 bg-[#0a0a0a] border border-gray-700 rounded px-1 flex items-center">
              <input
                type="number"
                step={control.range?.step ?? 0.01}
                className="w-full h-5 bg-transparent text-[10px] text-white outline-none text-right"
                value={numericValue}
                onChange={(e) => setBoundValue(node, onUpdateData, bindTarget, boundKey, parseFloat(e.target.value))}
                onMouseDown={e => e.stopPropagation()}
              />
            </div>
          </div>
        </div>
      );
    }

    if (control.controlType === 'texture') {
      const resolved = typeof value === 'string' ? value : undefined;

      return (
        <div className="flex flex-col gap-2 nodrag">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/png, image/jpeg, image/jpg, image/webp, .tga"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              setIsLoadingTexture(true);
              try {
                const dataUrl = await processTextureFile(file);
                setBoundValue(node, onUpdateData, bindTarget, boundKey, dataUrl);
              } catch (err) {
                console.error('Texture Load Error:', err);
                alert('Failed to load texture. Please try a standard image format or uncompressed TGA.');
              } finally {
                setIsLoadingTexture(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
            }}
          />

          <div className="flex flex-col gap-1.5">
            {control.label && (
              <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider">{control.label}</span>
            )}
            <button
              className={`w-full py-1.5 px-3 rounded border flex items-center justify-center gap-2 transition-all ${resolved
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30 shadow-sm'
                : 'bg-[#0a0a0a] border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                }`}
              onClick={() => fileInputRef.current?.click()}
              onMouseDown={e => e.stopPropagation()}
              disabled={isLoadingTexture}
            >
              {isLoadingTexture ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {isLoadingTexture ? 'Loading...' : resolved ? 'Change Texture' : 'Load Texture'}
              </span>
            </button>
          </div>
        </div>
      );
    }

    if (control.controlType === 'textureArray') {
      const layers: string[] = Array.isArray(value) ? value : [];

      return (
        <div className="flex flex-col gap-2 nodrag">
          <input
            type="file"
            ref={arrayFileInputRef}
            className="hidden"
            accept="image/png, image/jpeg, image/jpg, image/webp, .tga"
            multiple
            onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;

              setIsLoadingTexture(true);
              try {
                const newLayers = [...layers];
                for (let i = 0; i < files.length; i++) {
                  const url = await processTextureFile(files[i]);
                  newLayers.push(url);
                }

                const atlasUrl = newLayers.length > 0 ? await createTextureAtlas(newLayers) : '';
                setBoundValue(node, onUpdateData, bindTarget, boundKey, newLayers);

                if (bindTarget === 'data') {
                  onUpdateData(node.id, { ...node.data, layers: newLayers, textureAsset: atlasUrl, layerCount: newLayers.length });
                }
              } catch (err: any) {
                console.error('Texture Array Load Error:', err);
                alert(err.message || 'Failed to load texture array. Ensure all textures have the same dimensions.');
              } finally {
                setIsLoadingTexture(false);
                if (arrayFileInputRef.current) arrayFileInputRef.current.value = '';
              }
            }}
          />

          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] text-gray-400 font-semibold flex items-center gap-1">
              <Layers className="w-3 h-3" /> {layers.length} Layers
            </span>
            <button
              className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded text-[9px] flex items-center gap-1"
              onClick={() => arrayFileInputRef.current?.click()}
              onMouseDown={e => e.stopPropagation()}
              disabled={isLoadingTexture}
            >
              {isLoadingTexture ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1 max-h-32 overflow-y-auto scrollbar-thin bg-black/20 p-1 rounded">
            {layers.map((layerSrc, idx) => (
              <div key={idx} className="relative group aspect-square border border-gray-700 rounded overflow-hidden">
                <img src={layerSrc} className="w-full h-full object-cover" alt={`layer-${idx}`} />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    className="text-red-400 hover:text-red-200"
                    onClick={() => removeArrayLayer(bindTarget, boundKey, idx)}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] px-1 text-gray-300">{idx}</div>
              </div>
            ))}
            {layers.length === 0 && (
              <div className="col-span-5 text-[9px] text-gray-600 text-center py-4 border border-dashed border-gray-700 rounded">
                No textures loaded.<br />Same size required.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (control.controlType === 'gradient') {
      const getStops = (): GradientStop[] => {
        const stops = getBoundValue(node, bindTarget, boundKey) as GradientStop[] | undefined;
        return stops || [
          { id: '1', t: 0, color: '#000000' },
          { id: '2', t: 1, color: '#ffffff' },
        ];
      };

      const generateGradientCSS = (stops: GradientStop[]) => {
        const sorted = [...stops].sort((a, b) => a.t - b.t);
        return sorted.map(s => `${s.color} ${s.t * 100}%`).join(', ');
      };

      // Persistent cursor position for the specific node (stored in local UI state if needed, or just let it be transient)
      // Since it's a module, multiple nodes might share this. Let's use node.data to store local cursor if we want it persistent, 
      // but for Premiere style, a simple click-to-seek is fine.
      const cursorT = (node.data as any)?._gradientCursorT ?? 0.5;

      const updateStop = (id: string, updates: Partial<GradientStop>) => {
        const stops = getStops().map(s => s.id === id ? { ...s, ...updates } : s);
        stops.sort((a, b) => a.t - b.t);
        // Important: Update directly via onUpdateData skip helper if suspicious of batching
        onUpdateData(node.id, { ...node.data, [boundKey]: stops });
      };

      const addStopAtCursor = () => {
        const stops = getStops();
        const newStop: GradientStop = { id: Date.now().toString(), t: cursorT, color: '#888888' };
        const newStops = [...stops, newStop].sort((a, b) => a.t - b.t);
        onUpdateData(node.id, { ...node.data, [boundKey]: newStops });
        setActiveStopId(newStop.id);
      };

      const removeStop = (id: string) => {
        const stops = getStops();
        if (stops.length <= 1) return; // Allow removing down to 1 if user wants, but 2 is standard. Change to <=1 for flexibility.
        const newStops = stops.filter(s => s.id !== id);
        onUpdateData(node.id, { ...node.data, [boundKey]: newStops });
        if (activeStopId === id) setActiveStopId(null);
      };

      const handleGradientClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!gradientRef.current) return;

        const rect = gradientRef.current.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        // Update seek cursor position
        onUpdateData(node.id, { ...node.data, _gradientCursorT: t });

        // Select nearest stop if clicking close to one (within 2% range)
        const stops = getStops();
        const nearest = stops.find(s => Math.abs(s.t - t) < 0.02);
        if (nearest) {
          setActiveStopId(nearest.id);
        } else {
          setActiveStopId(null);
        }
      };

      const stops = getStops();

      return (
        <div className="flex flex-col gap-2 nodrag">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-400 font-semibold">{control.label}</span>
            <button
              onClick={addStopAtCursor}
              className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded text-[9px] flex items-center gap-1 shadow-lg active:scale-95 transition-transform"
              onMouseDown={e => e.stopPropagation()}
              title="Add Point at Cursor"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>

          <div
            className="w-full h-8 bg-[#0a0a0a] border border-gray-700 rounded relative cursor-pointer group/grad"
            ref={gradientRef}
            onClick={handleGradientClick}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Background Gradient */}
            <div
              className="absolute inset-0 rounded overflow-hidden"
              style={{ background: `linear-gradient(to right, ${generateGradientCSS(stops)})` }}
            />

            {/* Playhead / Seek Cursor (Premiere Style) */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-white shadow-xl z-30 pointer-events-none opacity-60 group-hover/grad:opacity-100 transition-opacity"
              style={{ left: `${cursorT * 100}%` }}
            />

            {/* Stops */}
            {stops.map(stop => (
              <div
                key={stop.id}
                className={`absolute w-4 h-[calc(100%+16px)] -top-2 cursor-ew-resize group ${stop.id === activeStopId ? 'z-40' : 'z-20'}`}
                style={{ left: `${stop.t * 100}%`, transform: 'translateX(-50%)' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveStopId(stop.id);
                  // Also move cursor to the stop position
                  onUpdateData(node.id, { ...node.data, _gradientCursorT: stop.t });
                }}
              >
                <div className={`w-1 h-full mx-auto border transition-all ${stop.id === activeStopId
                  ? 'border-white bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  : 'border-black/50 bg-white shadow-sm group-hover:bg-blue-100'
                  }`} />
              </div>
            ))}
          </div>

          {activeStopId && (() => {
            const stop = stops.find(s => s.id === activeStopId);
            if (!stop) return null;
            return (
              <div className="flex flex-col gap-2 bg-[#0a0a0a] border border-gray-700 rounded p-2 shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500">Position</span>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={stop.t}
                    onChange={(e) => updateStop(stop.id, { t: parseFloat(e.target.value) })}
                    className="flex-1 accent-blue-500"
                    onMouseDown={e => e.stopPropagation()}
                  />
                  <span className="text-[9px] text-gray-400 w-10 text-right">{Math.round(stop.t * 100)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="relative w-8 h-8 rounded border border-gray-600 overflow-hidden shadow-sm">
                    <ThrottledColorInput
                      value={stop.color}
                      onChange={(color) => updateStop(stop.id, { color })}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center bg-black/30 border border-gray-700 rounded px-2">
                      <span className="text-[9px] text-gray-500 mr-1 font-mono">T</span>
                      <input
                        type="number" step="0.01" min="0" max="1"
                        className="w-full bg-transparent text-[10px] text-white outline-none h-5 text-right font-mono"
                        value={stop.t}
                        onChange={(e) => updateStop(stop.id, { t: parseFloat(e.target.value) })}
                        onMouseDown={e => e.stopPropagation()}
                      />
                    </div>
                    <button
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-red-600 rounded-md transition-all shadow-sm"
                      onClick={(e) => { e.stopPropagation(); removeStop(stop.id); }}
                      title="Delete Point"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      {(ui.sections ?? []).map(section => (
        <div key={section.id} className="flex flex-col gap-1">
          {section.title && (
            <div className="text-[9px] text-gray-500 font-semibold uppercase tracking-wide">{section.title}</div>
          )}
          {section.controls.map(ctrl => (
            <div key={ctrl.id} className="mb-1">
              {renderControl(ctrl)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
