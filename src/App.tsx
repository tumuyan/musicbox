/**
 * Main Application Component: Paper Strip Music Box (纸带八音盒播放器)
 *
 * Implements:
 * 1. 纸带留白边 (Top and bottom blank margins)
 * 2. 中间绘制格线 (Pitch grid lines + beat subdivision lines)
 * 3. 在midi note对应位置打圆孔，不管多长的音符都是一个圆孔 (Circular punched hole at note onsets)
 * 4. 音乐盒前后面板有孔，纸带应该从前面板进后面板出 (Front inlet slot and rear outlet slot feed)
 * 5. Authentic walnut wood casing, brass mechanical movement, physical comb synthesis
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PRESET_SONGS } from './data/presetSongs';
import { SongData } from './types/musicBox';
import { MusicBox3D } from './components/MusicBox3D';
import { PaperStripEditor } from './components/PaperStripEditor';
import { TransportControls } from './components/TransportControls';
import { ReferenceModal } from './components/ReferenceModal';
import { musicBoxSynth } from './audio/MusicBoxSynth';
import { generatePrintablePaperStripSVG } from './utils/paperExport';
import { Box, Layers, Music2, Download } from 'lucide-react';

export default function App() {
  const [currentSong, setCurrentSong] = useState<SongData>(PRESET_SONGS[0]); // Default: Castle in the Sky
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [activeTineIndex, setActiveTineIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'split' | '3d' | 'strip'>('split');
  const [isRefModalOpen, setIsRefModalOpen] = useState<boolean>(false);

  // Playback timer refs: Monotonic reference clock
  const startTimeRef = useRef<number>(0);
  const startStepRef = useRef<number>(0);
  const playheadRef = useRef<number>(0);

  // Main playback tick animation loop with monotonic clock
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    startTimeRef.current = performance.now();
    startStepRef.current = playheadRef.current;
    let animationFrameId: number;

    const tick = (time: number) => {
      const elapsedSeconds = (time - startTimeRef.current) / 1000;
      // Steps per beat = 4 (16th note resolution)
      // Beats per second = bpm / 60
      // Steps per second = (bpm / 60) * 4
      const stepsPerSecond = (currentSong.bpm / 60) * 4;
      const nextStep = startStepRef.current + elapsedSeconds * stepsPerSecond;

      if (nextStep >= currentSong.totalSteps) {
        if (isLooping) {
          startTimeRef.current = time;
          startStepRef.current = 0;
          playheadRef.current = 0;
          setCurrentStep(0);
        } else {
          setIsPlaying(false);
          playheadRef.current = currentSong.totalSteps;
          setCurrentStep(currentSong.totalSteps);
          return;
        }
      } else {
        playheadRef.current = nextStep;
        setCurrentStep(nextStep);
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, currentSong.bpm, currentSong.totalSteps, isLooping]);

  // Handle tine pluck animation feedback
  const handleTinePluck = useCallback((tineIndex: number) => {
    setActiveTineIndex(tineIndex);
    setTimeout(() => {
      setActiveTineIndex(prev => (prev === tineIndex ? null : prev));
    }, 150);
  }, []);

  const lastTriggeredStep = useRef<number>(-1);

  // Centralized Audio Note Trigger: triggers chimes reliably in ALL views (3D, Split, and Paper Strip Studio)
  useEffect(() => {
    const roundedStep = Math.floor(currentStep);
    const prev = lastTriggeredStep.current;

    if (prev === -1) {
      lastTriggeredStep.current = roundedStep;
      const stepHoles = currentSong.holes.filter(h => h.step === roundedStep);
      stepHoles.forEach(h => {
        musicBoxSynth.playTine(h.tineIndex);
        handleTinePluck(h.tineIndex);
      });
      return;
    }

    if (roundedStep > prev) {
      // Forward playback: trigger all holes that were crossed between prev and roundedStep
      if (roundedStep - prev <= 12) {
        const stepHoles = currentSong.holes.filter(h => h.step > prev && h.step <= roundedStep);
        stepHoles.forEach(h => {
          musicBoxSynth.playTine(h.tineIndex);
          handleTinePluck(h.tineIndex);
        });
      } else {
        const stepHoles = currentSong.holes.filter(h => h.step === roundedStep);
        stepHoles.forEach(h => {
          musicBoxSynth.playTine(h.tineIndex);
          handleTinePluck(h.tineIndex);
        });
      }
      lastTriggeredStep.current = roundedStep;
    } else if (roundedStep < prev) {
      lastTriggeredStep.current = roundedStep;
      const stepHoles = currentSong.holes.filter(h => h.step === roundedStep);
      stepHoles.forEach(h => {
        musicBoxSynth.playTine(h.tineIndex);
        handleTinePluck(h.tineIndex);
      });
    }
  }, [currentStep, currentSong.holes, handleTinePluck]);

  // Handle manual seek
  const handleSeek = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(currentSong.totalSteps, step));
    playheadRef.current = clamped;
    startStepRef.current = clamped;
    startTimeRef.current = performance.now();
    lastTriggeredStep.current = -1;
    setCurrentStep(clamped);
  }, [currentSong.totalSteps]);

  // Handle rewind
  const handleRewind = useCallback(() => {
    playheadRef.current = 0;
    startStepRef.current = 0;
    startTimeRef.current = performance.now();
    lastTriggeredStep.current = -1;
    setCurrentStep(0);
  }, []);

  // Export printable paper strip SVG
  const handleDownloadSVG = useCallback(() => {
    const svgContent = generatePrintablePaperStripSVG(currentSong);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSong.title.replace(/\s+/g, '_')}_30Note_PaperStrip.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentSong]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-950 text-stone-100 font-sans">
      {/* 1. TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-stone-800 bg-[#121110] shrink-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-800 to-amber-600 flex items-center justify-center text-amber-100 shadow-md border border-amber-600/40">
            <Music2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-amber-100 font-serif">
              纸带八音盒播放器
            </h1>
          </div>
        </div>

        {/* Zone 2: Viewport Mode Tabs */}
        <nav className="flex items-center gap-1.5 p-1 bg-stone-900 border border-stone-800/80 rounded-xl">
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'split'
                ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>联动视角</span>
          </button>

          <button
            onClick={() => setViewMode('3d')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              viewMode === '3d'
                ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D八音盒</span>
          </button>

          <button
            onClick={() => setViewMode('strip')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'strip'
                ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>打孔纸带台</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action - Download Printable SVG */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleDownloadSVG}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 bg-stone-800 hover:bg-stone-700 hover:text-amber-300 text-stone-200 border border-stone-700/80 cursor-pointer shadow-sm"
            title="下载可直接打印在标准卡纸上的1:1矢量纸带 (70mm标准宽)"
          >
            <Download className="w-3.5 h-3.5 text-amber-500" />
            <span>导出打印纸带 (SVG)</span>
          </button>
        </div>
      </header>

      {/* 2. TRANSPORT CONTROLS BAR */}
      <TransportControls
        currentSong={currentSong}
        onSelectSong={setCurrentSong}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        currentStep={currentStep}
        onSeek={handleSeek}
        onRewind={handleRewind}
        isLooping={isLooping}
        onToggleLoop={() => setIsLooping(!isLooping)}
        onOpenReferenceModal={() => setIsRefModalOpen(true)}
      />

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Split View */}
        {viewMode === 'split' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top: 3D Music Box View */}
            <div className="h-[52%] w-full min-h-0 relative border-b border-stone-800">
              <MusicBox3D
                song={currentSong}
                currentStep={currentStep}
                isPlaying={isPlaying}
                onStepChange={handleSeek}
                onTinePluck={handleTinePluck}
              />
            </div>

            {/* Bottom: 2D Paper Strip Editor View */}
            <div className="h-[48%] w-full min-h-0 relative">
              <PaperStripEditor
                song={currentSong}
                currentStep={currentStep}
                onSongChange={setCurrentSong}
                onSeek={handleSeek}
                activeTineIndex={activeTineIndex}
                isPlaying={isPlaying}
              />
            </div>
          </div>
        )}

        {/* Full 3D View */}
        {viewMode === '3d' && (
          <div className="flex-1 w-full h-full relative">
            <MusicBox3D
              song={currentSong}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onStepChange={handleSeek}
              onTinePluck={handleTinePluck}
            />
          </div>
        )}

        {/* Full Paper Strip Studio */}
        {viewMode === 'strip' && (
          <div className="flex-1 w-full h-full relative">
            <PaperStripEditor
              song={currentSong}
              currentStep={currentStep}
              onSongChange={setCurrentSong}
              onSeek={handleSeek}
              activeTineIndex={activeTineIndex}
              isPlaying={isPlaying}
            />
          </div>
        )}
      </main>

      {/* Reference Comparison Modal */}
      <ReferenceModal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
      />
    </div>
  );
}
