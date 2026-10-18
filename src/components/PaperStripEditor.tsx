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
  ZoomIn,
  ZoomOut,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  Music,
  Download,
  Scissors
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
  holeSet: Set<string>;
  selectedTool: 'punch' | 'erase';
  isMouseDown: boolean;
  onCellClick: (step: number, tineIndex: number) => void;
}

// Memoized Pitch Grid & Punched Holes: Isolates 3,840+ cells from 60fps playback re-renders!
const PaperMatrix: React.FC<PaperMatrixProps> = React.memo(({
  totalSteps,
  stepsPerMeasure,
  zoom,
  rowHeight,
  gridHeight,
  holeSet,
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
        const isOctaveC = MUSIC_BOX_SCALE[tineIndex].name.startsWith('C');

        return (
          <div
            key={`pitch-line-${tineIndex}`}
            className={`absolute left-0 w-full pointer-events-none ${
              isOctaveC
                ? 'border-b border-[#C8BDAB]'
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
        const leftPos = step * zoom;

        return (
          <div
            key={`step-line-${step}`}
            className={`absolute top-0 bottom-0 pointer-events-none ${
              isMeasure
                ? 'border-l-2 border-[#B8AC98]'
                : isBeat
                ? 'border-l border-[#D6CDBC]'
                : 'border-l border-[#EDE7DB]'
            }`}
            style={{ left: leftPos }}
          />
        );
      })}

      {/* Clickable Matrix Cells for Punching Circular Holes */}
      {Array.from({ length: TOTAL_TINES }).map((_, rowIdx) => {
        const tineIndex = TOTAL_TINES - 1 - rowIdx;
        const topPos = rowIdx * rowHeight;

        return (
          <div
            key={`row-${tineIndex}`}
            className="absolute left-0 w-full flex"
            style={{ top: topPos, height: rowHeight }}
          >
            {Array.from({ length: totalSteps }).map((_, step) => {
              const hasHole = holeSet.has(`${step}-${tineIndex}`);

              return (
                <div
                  key={`cell-${step}-${tineIndex}`}
                  onClick={() => onCellClick(step, tineIndex)}
                  onMouseEnter={() => {
                    if (isMouseDown) {
                      if (selectedTool === 'punch' && !hasHole) {
                        onCellClick(step, tineIndex);
                      } else if (selectedTool === 'erase' && hasHole) {
                        onCellClick(step, tineIndex);
                      }
                    }
                  }}
                  className="h-full flex items-center justify-center cursor-pointer group"
                  style={{ width: zoom }}
                  title={`Punch Step ${step}, Note ${MUSIC_BOX_SCALE[tineIndex].name}`}
                >
                  {/* Circular Punched Hole: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔" */}
                  {hasHole ? (
                    <div className="relative w-[8.5px] h-[8.5px] rounded-full bg-[#1A140E] border border-[#4A3C2F] shadow-inner flex items-center justify-center transform group-hover:scale-110">
                      <div className="w-[5px] h-[5px] rounded-full bg-black/90 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
                    </div>
                  ) : (
                    <div className="w-[7px] h-[7px] rounded-full border border-dashed border-amber-600/0 group-hover:border-amber-600/50 group-hover:bg-amber-500/10" />
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
  const [zoom, setZoom] = useState<number>(18); // Pixels per step (16th note)
  const [selectedTool, setSelectedTool] = useState<'punch' | 'erase'>('punch');
  const [isMouseDown, setIsMouseDown] = useState(false);

  // Auto-scroll with playback playhead smoothly without jitter or back-and-forth shaking
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isMouseDown) return;

    const playheadX = currentStep * zoom;
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

  // Handle cell click (punch or erase)
  const handleCellClick = useCallback((step: number, tineIndex: number) => {
    musicBoxSynth.resume();
    const existingIndex = song.holes.findIndex(h => h.step === step && h.tineIndex === tineIndex);

    let updatedHoles: PunchHole[];

    if (existingIndex >= 0) {
      // Hole exists: remove it
      updatedHoles = song.holes.filter((_, i) => i !== existingIndex);
      musicBoxSynth.playHolePunchSound();
    } else {
      // Punch new hole: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔"
      const newHole: PunchHole = {
        id: `punch-${step}-${tineIndex}-${Date.now()}`,
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
  }, [song, onSongChange]);

  // Clear all holes
  const handleClearTape = () => {
    if (window.confirm('确定要清空当前纸带上的所有打孔吗？')) {
      onSongChange({
        ...song,
        holes: [],
      });
    }
  };

  // Add measures
  const handleAddMeasures = (delta: number) => {
    const stepsPerMeasure = song.timeSignature[0] * 4;
    const newSteps = Math.max(32, song.totalSteps + delta * stepsPerMeasure);
    onSongChange({
      ...song,
      totalSteps: newSteps,
    });
  };

  // Transpose song +/- 1 semitone
  const handleTranspose = (semitones: number) => {
    const updatedHoles: PunchHole[] = [];

    song.holes.forEach(hole => {
      const newMidi = hole.midi + semitones;
      // Find closest tine
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < MUSIC_BOX_SCALE.length; i++) {
        const diff = Math.abs(MUSIC_BOX_SCALE[i].midi - newMidi);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      if (minDiff <= 1) { // Within reasonable range
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
  const totalPaperWidth = song.totalSteps * zoom + 120; // with lead-out

  const stepsPerMeasure = song.timeSignature[0] * 4;
  const numMeasures = Math.ceil(song.totalSteps / stepsPerMeasure);

  // Quick lookup set for holes: `${step}-${tineIndex}` (memoized to avoid rebuilding on playback)
  const holeSet = useMemo(() => new Set(song.holes.map(h => `${h.step}-${h.tineIndex}`)), [song.holes]);

  return (
    <div className="flex flex-col h-full bg-[#1A1918] border-t border-stone-800 text-stone-200">
      {/* Ribbon Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-stone-900 border-b border-stone-800 text-xs">
        {/* Left: Punch Mode & Quick Tools */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-800 p-0.5 rounded-lg border border-stone-700/60">
            <button
              onClick={() => setSelectedTool('punch')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                selectedTool === 'punch'
                  ? 'bg-amber-600 text-stone-900 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>打孔笔</span>
            </button>
            <button
              onClick={() => setSelectedTool('erase')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                selectedTool === 'erase'
                  ? 'bg-amber-600 text-stone-900 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <span>橡皮擦</span>
            </button>
          </div>

          <span className="text-stone-600">|</span>

          {/* Transpose */}
          <div className="flex items-center gap-1 text-stone-400">
            <span>移调:</span>
            <button
              onClick={() => handleTranspose(-1)}
              className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-amber-400"
              title="降半音 (-1 Semitone)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleTranspose(1)}
              className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-amber-400"
              title="升半音 (+1 Semitone)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-stone-600">|</span>

          {/* Measure Length */}
          <div className="flex items-center gap-1 text-stone-400">
            <span>小节数 ({numMeasures}):</span>
            <button
              onClick={() => handleAddMeasures(-2)}
              className="px-1.5 py-0.5 hover:bg-stone-800 rounded text-stone-300"
              title="减少2个小节"
            >
              -2
            </button>
            <button
              onClick={() => handleAddMeasures(2)}
              className="px-1.5 py-0.5 hover:bg-stone-800 rounded text-stone-300"
              title="增加2个小节"
            >
              +2
            </button>
          </div>
        </div>

        {/* Right: Zoom & Export Printable Tape */}
        <div className="flex items-center gap-3">
          {/* Zoom buttons */}
          <div className="flex items-center gap-1 bg-stone-800 px-1 py-0.5 rounded-lg border border-stone-700/60">
            <button
              onClick={() => setZoom(z => Math.max(10, z - 2))}
              className="p-1 text-stone-400 hover:text-stone-200"
              title="缩小纸带"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[11px] text-stone-400 tabular-nums">{zoom}px</span>
            <button
              onClick={() => setZoom(z => Math.min(36, z + 2))}
              className="p-1 text-stone-400 hover:text-stone-200"
              title="放大纸带"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleDownloadSVG}
            className="flex items-center gap-1.5 px-3 py-1 bg-stone-800 hover:bg-amber-950/60 hover:text-amber-300 border border-stone-700 hover:border-amber-700/60 rounded-lg text-stone-300 transition-colors whitespace-nowrap"
            title="下载可直接打印在卡纸上的1:1比例矢量纸带 (70mm标准宽)"
          >
            <Download className="w-3.5 h-3.5 text-amber-500" />
            <span>导出打印纸带 (SVG)</span>
          </button>

          <button
            onClick={handleClearTape}
            className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded-lg transition-colors"
            title="清空纸带打孔"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
          className="flex-1 overflow-x-auto overflow-y-hidden bg-[#2D2A26] relative cursor-crosshair"
          onMouseDown={() => setIsMouseDown(true)}
          onMouseUp={() => setIsMouseDown(false)}
          onMouseLeave={() => setIsMouseDown(false)}
        >
          {/* Authentic Cream Paper Strip */}
          <div
            className="relative bg-[#FAF7F0] shadow-2xl"
            style={{
              width: totalPaperWidth,
              height: totalPaperHeight,
              boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.8)',
            }}
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
                const leftPos = measureStep * zoom;
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

            {/* 2. MIDDLE PITCH & TIME GRID (中间绘制格线) - Memoized PaperMatrix */}
            <PaperMatrix
              totalSteps={song.totalSteps}
              stepsPerMeasure={stepsPerMeasure}
              zoom={zoom}
              rowHeight={rowHeight}
              gridHeight={gridHeight}
              holeSet={holeSet}
              selectedTool={selectedTool}
              isMouseDown={isMouseDown}
              onCellClick={handleCellClick}
            />

            {/* 3. BOTTOM BLANK MARGIN (留白边) */}
            <div
              className="h-[36px] w-full border-t border-dashed border-[#D5CDBC] relative flex items-center justify-between px-4 bg-gradient-to-t from-[#F2EEE4] to-[#FAF7F0] select-none text-[10px] text-[#8C7D6B]"
            >
              <div className="flex items-center gap-1.5 font-mono">
                <ArrowRight className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                <span>进纸方向 (前面板入 ➔ 后面板出)</span>
              </div>
              <div className="font-mono text-[9px] opacity-70">
                标准30音纸带规格 · 70mm宽度 · 圆孔直径2.5mm
              </div>
            </div>

            {/* DYNAMIC PLAYHEAD READ LINE (Syncs with music box movement) */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none will-change-transform"
              style={{
                left: 0,
                transform: `translate3d(${currentStep * zoom}px, 0, 0)`,
              }}
            >
              {/* Playhead Vertical Line */}
              <div className="w-[2px] h-full bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.8)] relative">
                {/* Top Arrow Indicator */}
                <div className="absolute -top-1 -left-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-amber-600" />
                {/* Bottom Arrow Indicator */}
                <div className="absolute -bottom-1 -left-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-amber-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
