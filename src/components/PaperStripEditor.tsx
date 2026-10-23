/**
 * Interactive 2D Paper Strip Punch Studio
 * Requirements:
 * - 纸带留白边 (Top and bottom blank margins)
 * - 中间绘制格线 (Horizontal pitch lines + vertical beat/measure lines)
 * - 在midi note对应位置打圆孔，不管多长的音符都是一个圆孔 (Circular punched holes at note onsets)
 * - Interactive hole punching / erasing with real-time audio chime feedback
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { SongData, PunchHole, MUSIC_BOX_SCALE, TOTAL_TINES } from '../types/musicBox';
import { musicBoxSynth } from '../audio/MusicBoxSynth';
import {
  getStepsPerMeasure,
  getTotalMeasures,
  autoAlignSongByBpm,
  snapHolesToGrid,
} from '../utils/bpmAlign';
import {
  ZoomIn,
  ZoomOut,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Music,
  Download,
  Scissors,
  BoxSelect,
  Eraser,
  CheckSquare,
  X,
  Copy,
  Sparkles,
  Wand2,
  RefreshCcw,
} from 'lucide-react';
import { generatePrintablePaperStripSVG } from '../utils/paperExport';

interface PaperStripEditorProps {
  song: SongData;
  currentStep: number;
  onSongChange: (updatedSong: SongData) => void;
  onSeek: (step: number) => void;
  activeTineIndex: number | null;
  isPlaying?: boolean;
}

interface PaperMatrixProps {
  totalSteps: number;
  stepsPerMeasure: number;
  zoom: number;
  rowHeight: number;
  gridHeight: number;
  gridOriginX: number;
  gridGranularity: 'auto' | '1/8' | '1/16' | '1/4';
  holeSet: Set<string>;
  selectedHoleKeySet: Set<string>;
  selectedTool: 'punch' | 'erase' | 'select';
  isMouseDown: boolean;
  onCellClick: (step: number, tineIndex: number, e: React.MouseEvent) => void;
}

// Memoized Pitch Grid & Punched Holes: Isolates 3,840+ cells from 60fps playback re-renders!
// All holes are aligned precisely on the crosshair intersection of horizontal pitch lines and vertical step lines.
const PaperMatrix: React.FC<PaperMatrixProps> = React.memo(({
  totalSteps,
  stepsPerMeasure,
  zoom,
  rowHeight,
  gridHeight,
  gridOriginX,
  gridGranularity,
  holeSet,
  selectedHoleKeySet,
  selectedTool,
  isMouseDown,
  onCellClick,
}) => {
  return (
    <div className="relative w-full" style={{ height: gridHeight }}>
      {/* Horizontal Pitch Lines */}
      {Array.from({ length: TOTAL_TINES }).map((_, idx) => {
        const tineIndex = TOTAL_TINES - 1 - idx;
        const topPos = idx * rowHeight;
        const note = MUSIC_BOX_SCALE[tineIndex];
        const isOctaveC = note.name.startsWith('C') && !note.name.includes('#');
        const isFifthG = note.name.startsWith('G') && !note.name.includes('#');

        return (
          <div
            key={`pitch-line-${tineIndex}`}
            className={`absolute left-0 w-full pointer-events-none ${
              isOctaveC
                ? 'border-b-2 border-[#8E7E6B]'
                : isFifthG
                ? 'border-b border-[#B8AA94]'
                : 'border-b border-[#E8E2D5]'
            }`}
            style={{ top: topPos + rowHeight / 2 }}
          />
        );
      })}

      {/* Vertical Beat & Measure Subdivision Lines */}
      {Array.from({ length: totalSteps + 1 }).map((_, step) => {
        const isMeasure = step % stepsPerMeasure === 0;
        const isBeat = step % 4 === 0;
        const isEighth = step % 2 === 0;
        const leftPos = gridOriginX + step * zoom;

        // Granularity filtering: prevents intense barcode-like visual clutter
        const showSixteenth = gridGranularity === '1/16' || (gridGranularity === 'auto' && zoom >= 22);
        const showEighth = gridGranularity !== '1/4';

        if (!isMeasure && !isBeat) {
          if (isEighth && !showEighth) return null;
          if (!isEighth && !showSixteenth) return null;
        }

        return (
          <div
            key={`step-line-${step}`}
            className={`absolute top-0 bottom-0 pointer-events-none ${
              isMeasure
                ? 'border-l-2 border-[#8E7E6B]'
                : isBeat
                ? 'border-l border-[#B8AA94]'
                : isEighth
                ? 'border-l border-dashed border-[#D2C8B8]'
                : 'border-l border-dotted border-[#E5DECD] opacity-40'
            }`}
            style={{ left: leftPos }}
          />
        );
      })}

      {/* Clickable Matrix Cells for Punching Circular Holes:
          Row flex starts at gridOriginX - zoom / 2, so cell centers align with gridOriginX + step * zoom! */}
      {Array.from({ length: TOTAL_TINES }).map((_, rowIdx) => {
        const tineIndex = TOTAL_TINES - 1 - rowIdx;
        const topPos = rowIdx * rowHeight;

        return (
          <div
            key={`row-${tineIndex}`}
            className="absolute flex"
            style={{ left: gridOriginX - zoom / 2, top: topPos, height: rowHeight }}
          >
            {Array.from({ length: totalSteps }).map((_, step) => {
              const cellKey = `${step}-${tineIndex}`;
              const hasHole = holeSet.has(cellKey);
              const isSelected = selectedHoleKeySet.has(cellKey);

              return (
                <div
                  key={`cell-${cellKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCellClick(step, tineIndex, e);
                  }}
                  onMouseEnter={(e) => {
                    if (isMouseDown && selectedTool !== 'select') {
                      if (selectedTool === 'punch' && !hasHole) {
                        onCellClick(step, tineIndex, e);
                      } else if (selectedTool === 'erase' && hasHole) {
                        onCellClick(step, tineIndex, e);
                      }
                    }
                  }}
                  className={`h-full flex items-center justify-center group ${
                    selectedTool === 'select'
                      ? hasHole ? 'cursor-pointer' : 'cursor-default'
                      : 'cursor-pointer'
                  }`}
                  style={{ width: zoom }}
                  title={`${MUSIC_BOX_SCALE[tineIndex].name} (第 ${step} 步 · 小节 ${Math.floor(step / stepsPerMeasure) + 1})${isSelected ? ' [已选]' : ''}`}
                >
                  {/* Circular Punched Hole: precisely centered on intersection of pitch line and step line */}
                  {hasHole ? (
                    <div className={`relative rounded-full flex items-center justify-center transform transition-all ${
                      isSelected
                        ? 'w-[10px] h-[10px] bg-amber-400 ring-2 ring-amber-400 ring-offset-1 ring-offset-[#FAF7F0] scale-125 shadow-lg shadow-amber-500/60 z-10'
                        : 'w-[8.5px] h-[8.5px] bg-[#1A140E] border border-[#4A3C2F] shadow-inner group-hover:scale-110'
                    }`}>
                      <div className={`rounded-full ${
                        isSelected ? 'w-[5px] h-[5px] bg-amber-950' : 'w-[5px] h-[5px] bg-black/90 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]'
                      }`} />
                    </div>
                  ) : (
                    <div className={`w-[7px] h-[7px] rounded-full ${
                      selectedTool === 'punch'
                        ? 'border border-dashed border-amber-600/0 group-hover:border-amber-600/50 group-hover:bg-amber-500/10'
                        : ''
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

export const PaperStripEditor: React.FC<PaperStripEditorProps> = ({
  song,
  currentStep,
  onSongChange,
  onSeek,
  activeTineIndex,
  isPlaying = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(18); // Pixels per step (16th note)
  const [selectedTool, setSelectedTool] = useState<'punch' | 'erase' | 'select'>('select');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [selectedHoleIds, setSelectedHoleIds] = useState<Set<string>>(new Set());
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [gridGranularity, setGridGranularity] = useState<'auto' | '1/8' | '1/16' | '1/4'>('auto');

  // Auto-scroll with playback playhead smoothly without jitter or back-and-forth shaking
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isMouseDown) return;

    const gridOriginX = 28;
    const playheadX = gridOriginX + currentStep * zoom;
    const containerW = container.clientWidth;
    const scrollLeft = container.scrollLeft;

    if (isPlaying) {
      // While playing, let playhead advance across viewport naturally.
      // When it moves past 65% of visible container, smoothly advance
      if (playheadX > scrollLeft + containerW * 0.65) {
        container.scrollLeft = playheadX - containerW * 0.35;
      } else if (playheadX < scrollLeft - 10) {
        // Looped or rewound back to start: snap back
        container.scrollLeft = Math.max(0, playheadX - containerW * 0.2);
      }
    } else {
      // When paused or seeking: keep playhead visible only if it went off screen
      if (playheadX < scrollLeft || playheadX > scrollLeft + containerW - 40) {
        container.scrollLeft = Math.max(0, playheadX - containerW * 0.3);
      }
    }
  }, [currentStep, zoom, isMouseDown, isPlaying]);

  // Handle cell click (punch, erase, or select)
  const handleCellClick = useCallback((step: number, tineIndex: number, e?: React.MouseEvent) => {
    musicBoxSynth.resume();
    const existingIndex = song.holes.findIndex(h => h.step === step && h.tineIndex === tineIndex);

    if (selectedTool === 'select') {
      if (existingIndex >= 0) {
        const hole = song.holes[existingIndex];
        if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
          setSelectedHoleIds(prev => {
            const next = new Set(prev);
            if (next.has(hole.id)) next.delete(hole.id);
            else next.add(hole.id);
            return next;
          });
        } else {
          setSelectedHoleIds(new Set([hole.id]));
        }
        musicBoxSynth.playTine(tineIndex, 0.9);
      } else {
        if (!e?.shiftKey && !e?.ctrlKey && !e?.metaKey) {
          setSelectedHoleIds(new Set());
        }
      }
      return;
    }

    let updatedHoles: PunchHole[];

    if (existingIndex >= 0) {
      // Hole exists: remove it
      const removedId = song.holes[existingIndex].id;
      updatedHoles = song.holes.filter((_, i) => i !== existingIndex);
      setSelectedHoleIds(prev => {
        const next = new Set(prev);
        next.delete(removedId);
        return next;
      });
      musicBoxSynth.playHolePunchSound();
    } else {
      // Punch new hole: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔"
      const newHole: PunchHole = {
        id: `punch-${step}-${tineIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        step,
        tineIndex,
        midi: MUSIC_BOX_SCALE[tineIndex].midi,
      };
      updatedHoles = [...song.holes, newHole];
      musicBoxSynth.playHolePunchSound();
      musicBoxSynth.playTine(tineIndex, 0.9);
    }

    onSongChange({
      ...song,
      holes: updatedHoles,
    });
  }, [song, onSongChange, selectedTool]);

  // Batch Delete Selected Notes (整体删除所选音符)
  const handleDeleteSelected = useCallback(() => {
    if (selectedHoleIds.size === 0) return;
    const updatedHoles = song.holes.filter(h => !selectedHoleIds.has(h.id));
    onSongChange({
      ...song,
      holes: updatedHoles,
    });
    setSelectedHoleIds(new Set());
    musicBoxSynth.playHolePunchSound();
  }, [song, onSongChange, selectedHoleIds]);

  // Batch Move Selected Notes in Time (整体水平移动所选音符)
  const handleMoveSelected = useCallback((deltaSteps: number) => {
    if (selectedHoleIds.size === 0 || deltaSteps === 0) return;

    const selectedHoles = song.holes.filter(h => selectedHoleIds.has(h.id));
    const minStep = Math.min(...selectedHoles.map(h => h.step));
    const maxStep = Math.max(...selectedHoles.map(h => h.step));

    let actualDelta = deltaSteps;
    if (minStep + actualDelta < 0) {
      actualDelta = -minStep;
    }
    if (actualDelta === 0) return;

    let newTotalSteps = song.totalSteps;
    if (maxStep + actualDelta >= song.totalSteps) {
      const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
      newTotalSteps = Math.ceil((maxStep + actualDelta + 8) / stepsPerMeasure) * stepsPerMeasure;
    }

    const movedMap = new Map<string, PunchHole>();
    const newSelectedIds = new Set<string>();

    selectedHoles.forEach(h => {
      const targetStep = h.step + actualDelta;
      const targetKey = `${targetStep}-${h.tineIndex}`;
      const newId = `punch-${targetStep}-${h.tineIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      movedMap.set(targetKey, {
        ...h,
        id: newId,
        step: targetStep,
      });
      newSelectedIds.add(newId);
    });

    const keptUnselected = song.holes.filter(
      h => !selectedHoleIds.has(h.id) && !movedMap.has(`${h.step}-${h.tineIndex}`)
    );

    onSongChange({
      ...song,
      totalSteps: newTotalSteps,
      holes: [...keptUnselected, ...Array.from(movedMap.values())],
    });
    setSelectedHoleIds(newSelectedIds);
    musicBoxSynth.playHolePunchSound();
  }, [song, onSongChange, selectedHoleIds]);

  // Batch Transpose Selected Notes by Tine Row (整体上下移调音齿)
  const handleTransposeTines = useCallback((deltaTines: number) => {
    if (selectedHoleIds.size === 0 || deltaTines === 0) return;

    const selectedHoles = song.holes.filter(h => selectedHoleIds.has(h.id));
    const minTine = Math.min(...selectedHoles.map(h => h.tineIndex));
    const maxTine = Math.max(...selectedHoles.map(h => h.tineIndex));

    let actualDelta = deltaTines;
    if (minTine + actualDelta < 0) {
      actualDelta = -minTine;
    }
    if (maxTine + actualDelta >= TOTAL_TINES) {
      actualDelta = TOTAL_TINES - 1 - maxTine;
    }
    if (actualDelta === 0) return;

    const movedMap = new Map<string, PunchHole>();
    const newSelectedIds = new Set<string>();

    selectedHoles.forEach(h => {
      const targetTine = h.tineIndex + actualDelta;
      const targetKey = `${h.step}-${targetTine}`;
      const newId = `punch-${h.step}-${targetTine}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      movedMap.set(targetKey, {
        ...h,
        id: newId,
        tineIndex: targetTine,
        midi: MUSIC_BOX_SCALE[targetTine].midi,
      });
      newSelectedIds.add(newId);
    });

    const keptUnselected = song.holes.filter(
      h => !selectedHoleIds.has(h.id) && !movedMap.has(`${h.step}-${h.tineIndex}`)
    );

    onSongChange({
      ...song,
      holes: [...keptUnselected, ...Array.from(movedMap.values())],
    });
    setSelectedHoleIds(newSelectedIds);
    musicBoxSynth.playHolePunchSound();

    if (actualDelta > 0 && maxTine + actualDelta < TOTAL_TINES) {
      musicBoxSynth.playTine(maxTine + actualDelta, 0.9);
    } else if (minTine + actualDelta >= 0) {
      musicBoxSynth.playTine(minTine + actualDelta, 0.9);
    }
  }, [song, onSongChange, selectedHoleIds]);

  // Batch Transpose Selected Notes by Semitone (整体按半音移调)
  const handleTransposeSemitones = useCallback((semitones: number) => {
    if (selectedHoleIds.size === 0 || semitones === 0) return;

    const selectedHoles = song.holes.filter(h => selectedHoleIds.has(h.id));
    const movedMap = new Map<string, PunchHole>();
    const newSelectedIds = new Set<string>();

    selectedHoles.forEach(h => {
      const targetMidi = h.midi + semitones;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < MUSIC_BOX_SCALE.length; i++) {
        const diff = Math.abs(MUSIC_BOX_SCALE[i].midi - targetMidi);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const targetKey = `${h.step}-${closestIdx}`;
      const newId = `punch-${h.step}-${closestIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      movedMap.set(targetKey, {
        ...h,
        id: newId,
        tineIndex: closestIdx,
        midi: MUSIC_BOX_SCALE[closestIdx].midi,
      });
      newSelectedIds.add(newId);
    });

    const keptUnselected = song.holes.filter(
      h => !selectedHoleIds.has(h.id) && !movedMap.has(`${h.step}-${h.tineIndex}`)
    );

    onSongChange({
      ...song,
      holes: [...keptUnselected, ...Array.from(movedMap.values())],
    });
    setSelectedHoleIds(newSelectedIds);
    musicBoxSynth.playHolePunchSound();
  }, [song, onSongChange, selectedHoleIds]);

  // Duplicate Selected Notes (复制选中的音符)
  const handleDuplicateSelected = useCallback(() => {
    if (selectedHoleIds.size === 0) return;
    const selectedHoles = song.holes.filter(h => selectedHoleIds.has(h.id));
    const offset = 4; // Shift copy forward by 1 beat (4 steps)
    const duplicatedHoles: PunchHole[] = [];
    const newSelectedIds = new Set<string>();

    selectedHoles.forEach(h => {
      const targetStep = h.step + offset;
      const newId = `punch-${targetStep}-${h.tineIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      duplicatedHoles.push({
        ...h,
        id: newId,
        step: targetStep,
      });
      newSelectedIds.add(newId);
    });

    onSongChange({
      ...song,
      holes: [...song.holes, ...duplicatedHoles],
    });
    setSelectedHoleIds(newSelectedIds);
    musicBoxSynth.playHolePunchSound();
  }, [song, onSongChange, selectedHoleIds]);

  // Select All Notes (全选)
  const handleSelectAll = useCallback(() => {
    setSelectedHoleIds(new Set(song.holes.map(h => h.id)));
  }, [song.holes]);

  // Invert Selection (反选)
  const handleInvertSelection = useCallback(() => {
    const inverted = new Set<string>();
    song.holes.forEach(h => {
      if (!selectedHoleIds.has(h.id)) {
        inverted.add(h.id);
      }
    });
    setSelectedHoleIds(inverted);
  }, [song.holes, selectedHoleIds]);

  // Clear Selection (取消选择)
  const handleClearSelection = useCallback(() => {
    setSelectedHoleIds(new Set());
  }, []);

  // Keyboard Shortcuts (Delete, Esc, Ctrl+A, Arrows for Move & Transpose)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHoleIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (e.key === 'Escape') {
        if (selectedHoleIds.size > 0) {
          e.preventDefault();
          handleClearSelection();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
        setSelectedTool('select');
      } else if (selectedHoleIds.size > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleMoveSelected(e.shiftKey ? -4 : -1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleMoveSelected(e.shiftKey ? 4 : 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleTransposeTines(1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          handleTransposeTines(-1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHoleIds, handleDeleteSelected, handleClearSelection, handleSelectAll, handleMoveSelected, handleTransposeTines]);

  // Clear all holes
  const handleClearTape = () => {
    if (window.confirm('确定要清空当前纸带上的所有打孔吗？')) {
      onSongChange({
        ...song,
        holes: [],
      });
      setSelectedHoleIds(new Set());
    }
  };

  // Add or subtract measures
  const handleAddMeasures = (delta: number) => {
    const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
    const currentMeasures = getTotalMeasures(song.totalSteps, stepsPerMeasure);
    const newMeasures = Math.max(2, currentMeasures + delta);
    onSongChange({
      ...song,
      totalSteps: newMeasures * stepsPerMeasure,
    });
  };

  // Set beats per measure (每小节几拍, 如 2, 3, 4, 6 拍)
  const handleSetBeatsPerMeasure = (newBeats: number) => {
    const beats = Math.max(1, Math.min(16, Math.round(newBeats)));
    const denom = song.timeSignature ? song.timeSignature[1] : 4;
    const oldStepsPerMeasure = getStepsPerMeasure(song.timeSignature);
    const currentMeasures = getTotalMeasures(song.totalSteps, oldStepsPerMeasure);
    const newStepsPerMeasure = denom === 8 ? beats * 2 : beats * 4;
    onSongChange({
      ...song,
      timeSignature: [beats, denom],
      totalSteps: currentMeasures * newStepsPerMeasure,
    });
  };

  // Set total measures directly (一共多少节)
  const handleSetTotalMeasures = (newMeasures: number) => {
    const measures = Math.max(2, Math.min(256, Math.round(newMeasures)));
    const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
    onSongChange({
      ...song,
      totalSteps: measures * stepsPerMeasure,
    });
  };

  // Auto-align holes and grid lines via BPM (默认通过调节BPM自动对齐孔和格线)
  const [alignToast, setAlignToast] = useState<string | null>(null);

  const handleAutoAlignBpm = () => {
    const alignedSong = autoAlignSongByBpm(song);
    onSongChange(alignedSong);
    setAlignToast(`已自动测算并调节 BPM 至 ${alignedSong.bpm}，孔与格线已对齐！`);
    setTimeout(() => setAlignToast(null), 3500);
  };

  const handleSnapToGrid = () => {
    const snappedSong = snapHolesToGrid(song, 1);
    onSongChange(snappedSong);
    setAlignToast('所有孔已吸附对齐到最近格线！');
    setTimeout(() => setAlignToast(null), 3000);
  };

  const handleBpmChange = (newBpm: number) => {
    const bpm = Math.max(30, Math.min(240, Math.round(newBpm)));
    onSongChange({
      ...song,
      bpm,
    });
  };

  // Transpose song +/- 1 semitone
  const handleTranspose = (semitones: number) => {
    if (selectedHoleIds.size > 0) {
      handleTransposeSemitones(semitones);
      return;
    }

    const updatedHoles: PunchHole[] = [];

    song.holes.forEach(hole => {
      const newMidi = hole.midi + semitones;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < MUSIC_BOX_SCALE.length; i++) {
        const diff = Math.abs(MUSIC_BOX_SCALE[i].midi - newMidi);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      if (minDiff <= 1) {
        updatedHoles.push({
          ...hole,
          tineIndex: closestIdx,
          midi: MUSIC_BOX_SCALE[closestIdx].midi,
        });
      }
    });

    onSongChange({
      ...song,
      holes: updatedHoles,
    });
  };

  // Download printable SVG
  const handleDownloadSVG = () => {
    const svgContent = generatePrintablePaperStripSVG(song);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title.replace(/\s+/g, '_')}_30Note_PaperStrip.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Geometry dimensions
  const rowHeight = 15; // 15px per pitch tine
  const topMarginHeight = 36; // 留白边
  const bottomMarginHeight = 36; // 留白边
  const gridHeight = TOTAL_TINES * rowHeight;
  const totalPaperHeight = topMarginHeight + gridHeight + bottomMarginHeight;
  const gridOriginX = 28; // Start offset so step 0 crosshair is not clipped at left edge
  const totalPaperWidth = gridOriginX + song.totalSteps * zoom + 120; // with lead-out

  const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
  const beatsPerMeasure = song.timeSignature ? song.timeSignature[0] : 4;
  const numMeasures = getTotalMeasures(song.totalSteps, stepsPerMeasure);

  // Quick lookup set for holes: `${step}-${tineIndex}` (memoized to avoid rebuilding on playback)
  const holeSet = useMemo(() => new Set(song.holes.map(h => `${h.step}-${h.tineIndex}`)), [song.holes]);

  // Quick lookup set for selected holes
  const selectedHoleKeySet = useMemo(() => {
    if (selectedHoleIds.size === 0) return new Set<string>();
    const set = new Set<string>();
    song.holes.forEach(h => {
      if (selectedHoleIds.has(h.id)) {
        set.add(`${h.step}-${h.tineIndex}`);
      }
    });
    return set;
  }, [song.holes, selectedHoleIds]);

  // Paper Mouse Handlers for Marquee Box Selection
  const handlePaperMouseDown = (e: React.MouseEvent) => {
    setIsMouseDown(true);
    if (selectedTool !== 'select') return;

    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const step = Math.round((x - gridOriginX) / zoom);
    if (step < 0 || step >= song.totalSteps) return;

    const rowIdx = Math.floor((y - topMarginHeight) / rowHeight);
    if (rowIdx < 0 || rowIdx >= TOTAL_TINES) return;
    const tineIndex = TOTAL_TINES - 1 - rowIdx;

    const holeAtPos = song.holes.find(h => h.step === step && h.tineIndex === tineIndex);
    if (holeAtPos) {
      return;
    }

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedHoleIds(new Set());
    }
    setMarqueeBox({ startX: x, startY: y, currentX: x, currentY: y });
    setIsMarqueeSelecting(true);
  };

  const handlePaperMouseMove = (e: React.MouseEvent) => {
    if (!isMarqueeSelecting || !marqueeBox) return;

    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setMarqueeBox(prev => (prev ? { ...prev, currentX, currentY } : null));

    const minX = Math.min(marqueeBox.startX, currentX);
    const maxX = Math.max(marqueeBox.startX, currentX);
    const minY = Math.min(marqueeBox.startY, currentY);
    const maxY = Math.max(marqueeBox.startY, currentY);

    const enclosedIds = new Set<string>();
    song.holes.forEach(hole => {
      const hx = gridOriginX + hole.step * zoom;
      const hy = topMarginHeight + (TOTAL_TINES - 1 - hole.tineIndex + 0.5) * rowHeight;
      if (hx >= minX && hx <= maxX && hy >= minY && hy <= maxY) {
        enclosedIds.add(hole.id);
      }
    });

    setSelectedHoleIds(enclosedIds);
  };

  const handlePaperMouseUp = () => {
    setIsMouseDown(false);
    setIsMarqueeSelecting(false);
    setMarqueeBox(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1A1918] border-t border-stone-800 text-stone-200">
      {/* Ribbon Control Toolbar: Clean, fully visible, non-scrolling layout */}
      <div className="bg-stone-900 border-b border-stone-800 text-xs px-3 sm:px-4 py-2 select-none">
        {/* Desktop View (md and up): Balanced single row */}
        <div className="hidden md:flex items-center justify-between gap-4">
          {/* Mode Switch & Select All */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-stone-800 p-0.5 rounded-lg border border-stone-700/60">
              <button
                onClick={() => setSelectedTool('select')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  selectedTool === 'select'
                    ? 'bg-amber-600 text-stone-900 shadow-sm font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="选择工具：框选或点击选择音符，可整体移动、移调、删除"
              >
                <BoxSelect className="w-3.5 h-3.5" />
                <span>选择工具</span>
              </button>
              <button
                onClick={() => setSelectedTool('punch')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  selectedTool === 'punch'
                    ? 'bg-amber-600 text-stone-900 shadow-sm font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="打孔笔：在格点上打孔"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>打孔笔</span>
              </button>
              <button
                onClick={() => setSelectedTool('erase')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  selectedTool === 'erase'
                    ? 'bg-amber-600 text-stone-900 shadow-sm font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="橡皮擦：擦除已有打孔"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>橡皮擦</span>
              </button>
            </div>

            <button
              onClick={() => {
                handleSelectAll();
                setSelectedTool('select');
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-md border border-stone-700/50 transition-colors cursor-pointer"
              title="全选纸带所有音符 (快捷键: Ctrl+A)"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>全选</span>
            </button>
            <button
              onClick={() => {
                handleInvertSelection();
                setSelectedTool('select');
              }}
              className="flex items-center gap-1 px-2 py-1 text-stone-400 hover:text-amber-300 hover:bg-stone-800 rounded-md border border-stone-700/50 transition-colors cursor-pointer"
              title="反向选择未选中的音符"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>反选</span>
            </button>
          </div>

          {/* Quick Edit (Beats/Measure, Total Measures, Grid Granularity) */}
          <div className="flex items-center gap-2.5 text-stone-300">
            {/* 1. 每小节几拍 (Beats per Measure) - 下拉选择 */}
            <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-1 rounded-lg border border-stone-700/60 shrink-0">
              <span className="text-stone-400 text-xs">拍数:</span>
              <select
                value={beatsPerMeasure}
                onChange={(e) => handleSetBeatsPerMeasure(parseInt(e.target.value, 10))}
                className="bg-stone-900 border border-stone-700/70 hover:border-amber-600/70 text-amber-300 font-mono text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                title="选择每小节拍数 (如4/4拍、3/4拍等)"
              >
                <option value={2}>2 拍 (2/4)</option>
                <option value={3}>3 拍 (3/4)</option>
                <option value={4}>4 拍 (4/4)</option>
                <option value={5}>5 拍 (5/4)</option>
                <option value={6}>6 拍 (6/8)</option>
                <option value={8}>8 拍 (8/8)</option>
              </select>
            </div>

            {/* 2. 一共多少节 (Total Measures) - 极简紧凑步进胶囊 */}
            <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-1 rounded-lg border border-stone-700/60 shrink-0">
              <span className="text-stone-400 text-xs">小节:</span>
              <div className="flex items-center bg-stone-900 border border-stone-700/70 rounded px-1 py-0.5">
                <button
                  onClick={() => handleAddMeasures(-1)}
                  className="w-4 h-4 flex items-center justify-center hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 text-xs cursor-pointer transition-colors"
                  title="减少1个小节"
                >
                  -
                </button>
                <input
                  type="number"
                  min={2}
                  max={256}
                  value={numMeasures}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 2 && v <= 256) {
                      handleSetTotalMeasures(v);
                    }
                  }}
                  className="w-8 text-center bg-transparent font-mono text-amber-200 font-bold text-xs focus:outline-none"
                  title="输入总小节数 (回车确认)"
                />
                <span className="text-stone-500 text-[11px] pr-0.5 select-none">节</span>
                <button
                  onClick={() => handleAddMeasures(1)}
                  className="w-4 h-4 flex items-center justify-center hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 text-xs cursor-pointer transition-colors"
                  title="增加1个小节"
                >
                  +
                </button>
              </div>
            </div>

            {/* 3. 格线粒度 (Grid Granularity) - 自适应/清晰/精细/整拍 */}
            <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-1 rounded-lg border border-stone-700/60 shrink-0">
              <span className="text-stone-400 text-xs">格线:</span>
              <select
                value={gridGranularity}
                onChange={(e) => setGridGranularity(e.target.value as any)}
                className="bg-stone-900 border border-stone-700/70 hover:border-amber-600/70 text-stone-200 text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                title="调整纸带时间竖线的分辨率与疏密 (避免密集条形码视觉疲劳)"
              >
                <option value="auto">自适应 (推荐)</option>
                <option value="1/8">1/8 拍 (清晰标准)</option>
                <option value="1/16">1/16 拍 (精细刻度)</option>
                <option value="1/4">1/4 拍 (整拍主线)</option>
              </select>
            </div>
          </div>

          {/* Zoom & Tape Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Zoom */}
            <div className="flex items-center gap-1 bg-stone-800 px-1 py-0.5 rounded-lg border border-stone-700/60">
              <button
                onClick={() => setZoom(z => Math.max(10, z - 2))}
                className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
                title="缩小纸带"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-xs text-stone-400 tabular-nums">{zoom}px</span>
              <button
                onClick={() => setZoom(z => Math.min(36, z + 2))}
                className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
                title="放大纸带"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleDownloadSVG}
              className="flex items-center gap-1.5 px-3 py-1 bg-stone-800 hover:bg-amber-950/60 hover:text-amber-300 border border-stone-700 hover:border-amber-700/60 rounded-lg text-stone-300 transition-colors whitespace-nowrap cursor-pointer"
              title="下载1:1标准70mm宽矢量纸带"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              <span>导出SVG</span>
            </button>

            <button
              onClick={handleClearTape}
              className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              title="清空纸带所有打孔"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile View (< md): Clean non-scrolling 2-row layout */}
        <div className="flex md:hidden flex-col gap-2">
          {/* Mobile Row 1: Tools & Primary Actions */}
          <div className="flex items-center justify-between gap-1.5">
            {/* Mode Switcher */}
            <div className="flex items-center bg-stone-800 p-0.5 rounded-lg border border-stone-700/60 shrink-0">
              <button
                onClick={() => setSelectedTool('select')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                  selectedTool === 'select'
                    ? 'bg-amber-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <BoxSelect className="w-3.5 h-3.5" />
                <span>选择</span>
              </button>
              <button
                onClick={() => setSelectedTool('punch')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                  selectedTool === 'punch'
                    ? 'bg-amber-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>打孔</span>
              </button>
              <button
                onClick={() => setSelectedTool('erase')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                  selectedTool === 'erase'
                    ? 'bg-amber-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>橡皮</span>
              </button>
            </div>

            {/* Mobile Actions: All / Invert / Export / Clear */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  handleSelectAll();
                  setSelectedTool('select');
                }}
                className="px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md border border-stone-700 cursor-pointer"
                title="全选所有音符"
              >
                全选
              </button>
              <button
                onClick={() => {
                  handleInvertSelection();
                  setSelectedTool('select');
                }}
                className="px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-md border border-stone-700 cursor-pointer"
                title="反向选择音符"
              >
                反选
              </button>
              <button
                onClick={handleDownloadSVG}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-md border border-stone-700 cursor-pointer"
              >
                <Download className="w-3 h-3 text-amber-400" />
                <span>SVG</span>
              </button>
              <button
                onClick={handleClearTape}
                className="p-1 text-stone-500 hover:text-red-400 bg-stone-800/80 rounded-md border border-stone-700/50 cursor-pointer"
                title="清空纸带"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Row 2: Secondary Controls (Beats, Measures, Grid, Zoom) */}
          <div className="flex items-center justify-between gap-1 text-[11px] text-stone-400 pt-1 border-t border-stone-800/60 overflow-x-auto">
            {/* Beats per measure */}
            <div className="flex items-center gap-1 shrink-0">
              <span>拍:</span>
              <select
                value={beatsPerMeasure}
                onChange={(e) => handleSetBeatsPerMeasure(parseInt(e.target.value, 10))}
                className="bg-stone-800 border border-stone-700 text-amber-300 font-mono text-[10px] rounded px-1 py-0.5 cursor-pointer"
              >
                <option value={2}>2拍</option>
                <option value={3}>3拍</option>
                <option value={4}>4拍</option>
                <option value={6}>6拍</option>
              </select>
            </div>

            {/* Measures */}
            <div className="flex items-center gap-0.5 shrink-0 bg-stone-800/80 px-1 py-0.5 rounded border border-stone-700/50">
              <button
                onClick={() => handleAddMeasures(-1)}
                className="w-3.5 h-3.5 flex items-center justify-center hover:bg-stone-700 rounded text-stone-300 cursor-pointer"
              >
                -
              </button>
              <span className="font-mono text-amber-200 font-semibold px-0.5">{numMeasures}节</span>
              <button
                onClick={() => handleAddMeasures(1)}
                className="w-3.5 h-3.5 flex items-center justify-center hover:bg-stone-700 rounded text-stone-300 cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Grid Granularity */}
            <div className="flex items-center gap-1 shrink-0">
              <span>格线:</span>
              <select
                value={gridGranularity}
                onChange={(e) => setGridGranularity(e.target.value as any)}
                className="bg-stone-800 border border-stone-700 text-stone-300 text-[10px] rounded px-1 py-0.5 cursor-pointer"
              >
                <option value="auto">自适应</option>
                <option value="1/8">1/8</option>
                <option value="1/16">1/16</option>
                <option value="1/4">1/4</option>
              </select>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-0.5 bg-stone-800/80 px-1 py-0.5 rounded border border-stone-700/50 shrink-0">
              <button
                onClick={() => setZoom(z => Math.max(10, z - 2))}
                className="p-0.5 text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="font-mono text-stone-300 text-[10px] tabular-nums">{zoom}</span>
              <button
                onClick={() => setZoom(z => Math.min(36, z + 2))}
                className="p-0.5 text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Align Toast Feedback */}
      {alignToast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-stone-950 font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xl border border-amber-300 animate-bounce flex items-center gap-1.5 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{alignToast}</span>
        </div>
      )}

      {/* Main Paper Ribbon Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Note Pitch Labels Sidebar (Piano / Comb Tines Ruler) */}
        <div
          className="w-20 bg-stone-900 border-r border-stone-800 shrink-0 select-none z-20 flex flex-col shadow-md"
          style={{ height: totalPaperHeight }}
        >
          {/* Top Margin Label */}
          <div
            className="h-[36px] flex items-center justify-center text-[10px] text-stone-500 border-b border-stone-800 bg-stone-950/40 uppercase tracking-wider"
          >
            留白上边
          </div>

          {/* 30 Note Tine Buttons (from treble at top to bass at bottom) */}
          <div className="flex-1 flex flex-col">
            {Array.from({ length: TOTAL_TINES }).map((_, idx) => {
              // High pitch (index 29) on top, bass (index 0) on bottom
              const tineIndex = TOTAL_TINES - 1 - idx;
              const note = MUSIC_BOX_SCALE[tineIndex];
              const isSharp = note.name.includes('#');
              const isPlucking = activeTineIndex === tineIndex;

              return (
                <button
                  key={note.name}
                  onClick={() => {
                    musicBoxSynth.resume();
                    musicBoxSynth.playTine(tineIndex, 0.95);
                  }}
                  className={`h-[15px] flex items-center justify-between px-2 text-[10px] font-mono transition-colors border-b border-stone-800/40 ${
                    isPlucking
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : isSharp
                      ? 'bg-stone-950/70 text-stone-400 hover:bg-amber-900/40 hover:text-amber-200'
                      : 'bg-stone-900 text-stone-300 hover:bg-stone-800 hover:text-amber-300'
                  }`}
                  title={`点击试听 ${note.name} (${note.midi})`}
                >
                  <span className="font-semibold">{note.name}</span>
                  <span className="text-[9px] opacity-40">{note.midi}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom Margin Label */}
          <div
            className="h-[36px] flex items-center justify-center text-[10px] text-stone-500 border-t border-stone-800 bg-stone-950/40 uppercase tracking-wider"
          >
            留白下边
          </div>
        </div>

        {/* Scrollable Paper Strip Canvas */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden bg-[#2D2A26] relative ${
            selectedTool === 'select' ? 'cursor-default' : 'cursor-crosshair'
          }`}
          onMouseLeave={() => {
            setIsMouseDown(false);
            setIsMarqueeSelecting(false);
            setMarqueeBox(null);
          }}
        >
          {/* Authentic Cream Paper Strip */}
          <div
            ref={paperRef}
            className="relative bg-[#FAF7F0] shadow-2xl select-none"
            style={{
              width: totalPaperWidth,
              height: totalPaperHeight,
              boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.8)',
            }}
            onMouseDown={handlePaperMouseDown}
            onMouseMove={handlePaperMouseMove}
            onMouseUp={handlePaperMouseUp}
          >
            {/* 1. TOP BLANK MARGIN (留白边) */}
            <div
              className="h-[36px] w-full border-b border-dashed border-[#D5CDBC] relative flex items-center px-4 bg-gradient-to-b from-[#F2EEE4] to-[#FAF7F0] select-none"
            >
              <div className="flex items-center gap-2 text-xs text-[#8C7D6B] font-serif">
                <Music className="w-3.5 h-3.5 text-amber-700" />
                <span className="font-semibold">{song.title}</span>
                <span className="text-[11px] opacity-60">· {song.bpm} BPM</span>
              </div>

              {/* Measure Number Markers along the top margin */}
              {Array.from({ length: numMeasures + 1 }).map((_, mIdx) => {
                const measureStep = mIdx * stepsPerMeasure;
                const leftPos = gridOriginX + measureStep * zoom;
                return (
                  <div
                    key={`measure-${mIdx}`}
                    onClick={() => onSeek(measureStep)}
                    className="absolute bottom-1 -translate-x-1/2 text-[10px] font-mono font-bold text-[#8C7D6B] hover:text-amber-800 cursor-pointer bg-[#F5F0E4] px-1 py-0.2 rounded border border-[#D5CDBC]"
                    style={{ left: leftPos }}
                  >
                    M{mIdx + 1}
                  </div>
                );
              })}
            </div>

            {/* 2. MIDDLE PITCH & TIME GRID (中间绘制格线) - Memoized PaperMatrix with exact crosshairs */}
            <PaperMatrix
              totalSteps={song.totalSteps}
              stepsPerMeasure={stepsPerMeasure}
              zoom={zoom}
              rowHeight={rowHeight}
              gridHeight={gridHeight}
              gridOriginX={gridOriginX}
              gridGranularity={gridGranularity}
              holeSet={holeSet}
              selectedHoleKeySet={selectedHoleKeySet}
              selectedTool={selectedTool}
              isMouseDown={isMouseDown}
              onCellClick={handleCellClick}
            />

            {/* Marquee Selection Bounding Box */}
            {marqueeBox && isMarqueeSelecting && (
              <div
                className="absolute pointer-events-none z-40 border-2 border-amber-600 border-dashed bg-amber-500/20 rounded shadow-sm"
                style={{
                  left: Math.min(marqueeBox.startX, marqueeBox.currentX),
                  top: Math.min(marqueeBox.startY, marqueeBox.currentY),
                  width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
                  height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
                }}
              />
            )}

            {/* 3. BOTTOM BLANK MARGIN (留白边) */}
            <div
              className="h-[36px] w-full border-t border-dashed border-[#D5CDBC] relative flex items-center justify-between px-4 bg-gradient-to-t from-[#F2EEE4] to-[#FAF7F0] select-none text-[10px] text-[#8C7D6B]"
            >
              <div className="flex items-center gap-1.5 font-mono">
                <ArrowRight className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                <span>进纸方向 (前面板入 ➔ 后面板出)</span>
              </div>
              <div className="font-mono text-[9px] opacity-70">
                标准30音纸带规格 · 70mm宽度 · 拍数: {beatsPerMeasure}拍/节 · 共 {numMeasures} 节
              </div>
            </div>

            {/* DYNAMIC PLAYHEAD READ LINE (Syncs with music box movement, aligned with crosshair centers) */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none will-change-transform"
              style={{
                left: 0,
                transform: `translate3d(${gridOriginX + currentStep * zoom}px, 0, 0)`,
              }}
            >
              {/* Playhead Vertical Line: centered exactly on currentStep crosshair */}
              <div className="w-[2px] h-full bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.8)] relative -translate-x-[1px]">
                {/* Top Arrow Indicator */}
                <div className="absolute -top-1 -left-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-amber-600" />
                {/* Bottom Arrow Indicator */}
                <div className="absolute -bottom-1 -left-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-amber-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Floating Batch Actions Bar for Selected Notes (整体删除 / 移调 / 移动) */}
        {selectedHoleIds.size > 0 && (
          <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 p-2 bg-stone-900/95 backdrop-blur-md border border-amber-600/70 rounded-2xl shadow-2xl text-xs text-stone-200 select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Desktop Layout (md and up): Clean single-row floating bar with vertically stacked +/- steppers */}
            <div className="hidden md:flex items-center gap-2.5">
              {/* Badge & Invert */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/80 border border-amber-700/60 rounded-lg text-amber-300 font-medium">
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>已选 <strong className="font-mono text-amber-200">{selectedHoleIds.size}</strong> 音符</span>
                </div>
                <button
                  onClick={handleInvertSelection}
                  className="flex items-center gap-1 px-2 py-1 bg-stone-800 hover:bg-stone-700 active:scale-95 rounded-lg text-stone-300 hover:text-amber-200 border border-stone-700/60 transition-all cursor-pointer text-xs"
                  title="反向选择未被选中的所有音符"
                >
                  <RefreshCcw className="w-3 h-3 text-amber-400" />
                  <span>反选</span>
                </button>
              </div>

              <div className="w-[1px] h-5 bg-stone-800 shrink-0" />

              {/* Time Steppers: Stacked +/- for Step and Beat */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Step +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1.5 py-0.5">
                  <span className="text-[11px] text-stone-300 font-mono pr-1 select-none">步</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-1">
                    <button
                      onClick={() => handleMoveSelected(1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-t text-[10px] text-stone-300 hover:text-amber-300 leading-none cursor-pointer transition-colors active:scale-90"
                      title="向右移动 1 步 (快捷键: →)"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveSelected(-1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-b text-[10px] text-stone-300 hover:text-amber-300 leading-none cursor-pointer transition-colors active:scale-90"
                      title="向左移动 1 步 (快捷键: ←)"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Beat +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1.5 py-0.5">
                  <span className="text-[11px] text-stone-300 font-mono pr-1 select-none">拍</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-1">
                    <button
                      onClick={() => handleMoveSelected(4)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-t text-[10px] font-bold text-stone-300 hover:text-amber-300 leading-none cursor-pointer transition-colors active:scale-90"
                      title="向右移动 1 拍 (4步) (快捷键: Shift+→)"
                    >
                      +
                    </button>
                    <button
                      onClick={() => handleMoveSelected(-4)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-b text-[10px] font-bold text-stone-300 hover:text-amber-300 leading-none cursor-pointer transition-colors active:scale-90"
                      title="向左移动 1 拍 (4步) (快捷键: Shift+←)"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-[1px] h-5 bg-stone-800 shrink-0" />

              {/* Pitch Steppers: Stacked +/- for Tine and Semitone */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Tine +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1.5 py-0.5">
                  <span className="text-[11px] text-stone-300 font-mono pr-1 select-none">齿</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-1">
                    <button
                      onClick={() => handleTransposeTines(1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-t text-[10px] text-amber-300 hover:text-amber-200 leading-none cursor-pointer transition-colors active:scale-90"
                      title="音高上移 1 音齿 (快捷键: ↑)"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleTransposeTines(-1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-b text-[10px] text-amber-300 hover:text-amber-200 leading-none cursor-pointer transition-colors active:scale-90"
                      title="音高下移 1 音齿 (快捷键: ↓)"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Semitone +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1.5 py-0.5">
                  <span className="text-[11px] text-stone-300 font-mono pr-1 select-none">半音</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-1">
                    <button
                      onClick={() => handleTransposeSemitones(1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-t text-[10px] font-bold text-stone-300 hover:text-white leading-none cursor-pointer transition-colors active:scale-90"
                      title="升半音 (+1 Semitone)"
                    >
                      +
                    </button>
                    <button
                      onClick={() => handleTransposeSemitones(-1)}
                      className="w-4 h-3 flex items-center justify-center hover:bg-stone-700 rounded-b text-[10px] font-bold text-stone-300 hover:text-white leading-none cursor-pointer transition-colors active:scale-90"
                      title="降半音 (-1 Semitone)"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-[1px] h-5 bg-stone-800 shrink-0" />

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleDuplicateSelected}
                  className="flex items-center gap-1 px-2.5 py-1 bg-stone-800 hover:bg-stone-700 active:scale-95 rounded text-stone-300 hover:text-stone-100 transition-all cursor-pointer"
                  title="复制选中的音符 (向后偏移1拍)"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-400" />
                  <span>复制</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-950/70 hover:bg-red-900 border border-red-700/60 active:scale-95 rounded text-red-200 hover:text-red-100 transition-all cursor-pointer"
                  title="删除选中的音符 (快捷键: Delete / Backspace)"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>删除</span>
                </button>
                <button
                  onClick={handleClearSelection}
                  className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition-colors ml-0.5 cursor-pointer"
                  title="取消选择 (快捷键: Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile Layout (< md): Non-scrolling compact layout with stacked +/- steppers */}
            <div className="flex md:hidden flex-col gap-1.5 w-auto max-w-[340px] text-xs">
              {/* Row 1: Badge + Invert + Actions */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/80 border border-amber-700/60 rounded-md text-amber-300 font-medium shrink-0">
                  <CheckSquare className="w-3 h-3 text-amber-400" />
                  <span>已选 <strong className="font-mono text-amber-200">{selectedHoleIds.size}</strong></span>
                </div>

                <button
                  onClick={handleInvertSelection}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 rounded text-stone-300 hover:text-amber-300 border border-stone-700 cursor-pointer text-[11px]"
                >
                  <RefreshCcw className="w-3 h-3 text-amber-400" />
                  <span>反选</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDuplicateSelected}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 active:scale-95 rounded text-stone-200 transition-all cursor-pointer text-[11px]"
                    title="复制音符"
                  >
                    <Copy className="w-3 h-3 text-blue-400" />
                    <span>复制</span>
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-950/80 hover:bg-red-900 border border-red-700/60 active:scale-95 rounded text-red-200 transition-all cursor-pointer text-[11px]"
                    title="删除音符"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                    <span>删除</span>
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="p-0.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 rounded cursor-pointer ml-0.5"
                    title="取消选择"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Row 2: Stacked +/- Steppers for Time and Pitch */}
              <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-stone-800/80 text-[11px]">
                {/* Step +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1 py-0.5">
                  <span className="text-[10px] text-stone-400 pr-0.5 select-none">步</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-0.5">
                    <button onClick={() => handleMoveSelected(1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">▲</button>
                    <button onClick={() => handleMoveSelected(-1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">▼</button>
                  </div>
                </div>

                {/* Beat +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1 py-0.5">
                  <span className="text-[10px] text-stone-400 pr-0.5 select-none">拍</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-0.5">
                    <button onClick={() => handleMoveSelected(4)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">+</button>
                    <button onClick={() => handleMoveSelected(-4)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">-</button>
                  </div>
                </div>

                {/* Tine +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1 py-0.5">
                  <span className="text-[10px] text-amber-400 pr-0.5 select-none">齿</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-0.5">
                    <button onClick={() => handleTransposeTines(1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-amber-300 leading-none">▲</button>
                    <button onClick={() => handleTransposeTines(-1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-amber-300 leading-none">▼</button>
                  </div>
                </div>

                {/* Semitone +/- */}
                <div className="flex items-center bg-stone-800/90 border border-stone-700/70 rounded px-1 py-0.5">
                  <span className="text-[10px] text-stone-300 pr-0.5 select-none">半音</span>
                  <div className="flex flex-col -my-0.5 border-l border-stone-700/80 pl-0.5">
                    <button onClick={() => handleTransposeSemitones(1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">+</button>
                    <button onClick={() => handleTransposeSemitones(-1)} className="w-3.5 h-2.5 flex items-center justify-center hover:bg-stone-700 text-[9px] text-stone-300 leading-none">-</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
