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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PRESET_SONGS } from './data/presetSongs';
import { SongData } from './types/musicBox';
import { MusicBox3D } from './components/MusicBox3D';
import { PaperStripEditor } from './components/PaperStripEditor';
import { TransportControls } from './components/TransportControls';
import { ReferenceModal } from './components/ReferenceModal';
import { musicBoxSynth } from './audio/MusicBoxSynth';
import { generatePrintablePaperStripSVG } from './utils/paperExport';
import { parseMidiFile, exportSongToMidi } from './utils/midiParser';
import { Box, Layers, Music2, Download, Upload, HelpCircle } from 'lucide-react';

const STORAGE_KEY_CUSTOM_SONGS = 'paper_musicbox_custom_songs_v1';

export default function App() {
  // Restore any previously imported / created songs from localStorage
  const [customSongs, setCustomSongs] = useState<SongData[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SONGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to restore custom songs from localStorage:', e);
    }
    return [];
  });

  const [currentSong, setCurrentSong] = useState<SongData>(PRESET_SONGS[0]); // Default: Castle in the Sky
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [activeTineIndex, setActiveTineIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'split' | '3d' | 'strip'>('3d'); // Default to 3D music box view
  const [isMaximized3D, setIsMaximized3D] = useState<boolean>(false); // Immersive 3D view mode
  const [isRefModalOpen, setIsRefModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep customSongs synced to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_SONGS, JSON.stringify(customSongs));
    } catch (e) {
      console.warn('Failed to save custom songs to localStorage:', e);
    }
  }, [customSongs]);

  // Combined list of preset songs and custom imported songs
  const allSongs = useMemo(() => {
    return [...PRESET_SONGS, ...customSongs];
  }, [customSongs]);

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

  // Handle switching to a song from the dropdown or list
  const handleSelectSong = useCallback((song: SongData) => {
    setCurrentSong(song);
    handleRewind();
  }, [handleRewind]);

  // Handle adding an imported MIDI or custom song
  const handleAddSong = useCallback((newSong: SongData) => {
    const customSong: SongData = {
      ...newSong,
      isCustom: true,
      importedAt: newSong.importedAt || Date.now(),
    };
    setCustomSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === customSong.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = customSong;
        return next;
      }
      return [customSong, ...prev];
    });
    setCurrentSong(customSong);
    handleRewind();
  }, [handleRewind]);

  // Handle deleting an imported / custom song
  const handleDeleteSong = useCallback((songId: string) => {
    setCustomSongs((prev) => prev.filter((s) => s.id !== songId));
    if (currentSong.id === songId) {
      setCurrentSong(PRESET_SONGS[0]);
      handleRewind();
    }
  }, [currentSong.id, handleRewind]);

  // Handle updating song holes / BPM from editor or auto-align
  const handleSongChange = useCallback((updatedSong: SongData) => {
    setCurrentSong(updatedSong);
    setCustomSongs((prev) => {
      const exists = prev.some((s) => s.id === updatedSong.id);
      if (exists) {
        return prev.map((s) => (s.id === updatedSong.id ? updatedSong : s));
      }
      return prev;
    });
  }, []);

  // Handle MIDI file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseMidiFile(file);
      handleAddSong(result.song);
      setToastMessage(`已成功导入 MIDI: "${result.song.title}" (${result.song.holes.length} 个音符孔)`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
      setToastMessage('MIDI 文件解析失败，请确保上传标准 .mid 格式文件。');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export current song to MIDI
  const handleExportMidi = useCallback(() => {
    const blob = exportSongToMidi(currentSong);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSong.title.replace(/\s+/g, '_')}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMessage(`已导出 MIDI: ${currentSong.title}.mid`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [currentSong]);

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
    setToastMessage(`已导出打印纸带 (SVG)`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [currentSong]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-950 text-stone-100 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-stone-900/95 border border-amber-600/70 text-amber-200 text-xs rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2 select-none pointer-events-none">
          <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP BAR CONTRACT (hidden when in 3D immersive maximized mode) */}
      {!isMaximized3D && (
        <header className="flex items-center justify-between gap-2 sm:gap-6 px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-stone-800 bg-[#121110] shrink-0 z-30">
          {/* Zone 1: Brand Wordmark & Help Button */}
          <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-amber-800 to-amber-600 flex items-center justify-center text-amber-100 shadow-md border border-amber-600/40 shrink-0">
              <Music2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-amber-100 font-serif">
                纸带八音盒<span className="hidden xs:inline">播放器</span>
              </h1>
              <button
                onClick={() => setIsRefModalOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-medium text-amber-300 hover:text-amber-100 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/60 hover:border-amber-500 rounded-lg transition-colors cursor-pointer shadow-xs ml-0.5 sm:ml-1"
                title="查看帮助、视角操作与原图结构对照"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>帮助</span>
              </button>
            </div>
          </div>

          {/* Zone 2: Viewport Mode Tabs */}
          <nav className="flex items-center gap-1 p-0.5 sm:p-1 bg-stone-900 border border-stone-800/80 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'split'
                  ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="联动分屏观察 (3D机芯 + 2D纸带)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">联动视角</span>
              <span className="sm:hidden">联动</span>
            </button>

            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                viewMode === '3d'
                  ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="全屏3D精细机械八音盒"
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">3D八音盒</span>
              <span className="sm:hidden">3D</span>
            </button>

            <button
              onClick={() => setViewMode('strip')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'strip'
                  ? 'bg-amber-700/80 text-amber-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="全屏纸带打孔工作台"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">打孔纸带台</span>
              <span className="sm:hidden">纸带</span>
            </button>
          </nav>

          {/* Zone 3: Primary Actions - Import MIDI, Export MIDI, and Export SVG together */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              accept=".mid,.midi"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Import MIDI */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 bg-stone-800 hover:bg-stone-700 hover:text-amber-300 text-stone-200 border border-stone-700/80 cursor-pointer shadow-sm"
              title="导入外部 .mid / .midi 文件并自动打孔"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">导入 MIDI</span>
              <span className="sm:hidden">导入</span>
            </button>

            {/* Export MIDI */}
            <button
              onClick={handleExportMidi}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 bg-stone-800 hover:bg-stone-700 hover:text-amber-300 text-stone-200 border border-stone-700/80 cursor-pointer shadow-sm"
              title="导出当前曲目打孔为标准 .mid 文件"
            >
              <Download className="w-3.5 h-3.5 text-stone-300" />
              <span className="hidden sm:inline">导出 MIDI</span>
              <span className="sm:hidden">导出MID</span>
            </button>

            {/* Export Printable SVG */}
            <button
              onClick={handleDownloadSVG}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 bg-amber-950/70 hover:bg-amber-900/90 text-amber-200 hover:text-amber-100 border border-amber-700/70 hover:border-amber-500 cursor-pointer shadow-sm"
              title="下载可直接打印在标准卡纸上的1:1矢量纸带 (70mm标准宽)"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">导出打印纸带 (SVG)</span>
              <span className="md:hidden">导出SVG</span>
            </button>
          </div>
        </header>
      )}

      {/* 2. TRANSPORT CONTROLS BAR (hidden when in 3D immersive maximized mode) */}
      {!isMaximized3D && (
        <TransportControls
          currentSong={currentSong}
          presetSongs={PRESET_SONGS}
          customSongs={customSongs}
          onSelectSong={handleSelectSong}
          onDeleteSong={handleDeleteSong}
          onSongChange={handleSongChange}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          currentStep={currentStep}
          onSeek={handleSeek}
          onRewind={handleRewind}
          isLooping={isLooping}
          onToggleLoop={() => setIsLooping(!isLooping)}
          onOpenReferenceModal={() => setIsRefModalOpen(true)}
        />
      )}

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {isMaximized3D ? (
          <div className="fixed inset-0 z-50 w-screen h-screen bg-stone-950">
            <MusicBox3D
              song={currentSong}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onStepChange={handleSeek}
              onTinePluck={handleTinePluck}
              isMaximized={true}
              onToggleMaximize={() => setIsMaximized3D(false)}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
            />
          </div>
        ) : (
          <>
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
                    isMaximized={false}
                    onToggleMaximize={() => setIsMaximized3D(true)}
                    onTogglePlay={() => setIsPlaying(!isPlaying)}
                  />
                </div>

                {/* Bottom: 2D Paper Strip Editor View */}
                <div className="h-[48%] w-full min-h-0 relative">
                  <PaperStripEditor
                    song={currentSong}
                    currentStep={currentStep}
                    onSongChange={handleSongChange}
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
                  isMaximized={false}
                  onToggleMaximize={() => setIsMaximized3D(true)}
                  onTogglePlay={() => setIsPlaying(!isPlaying)}
                />
              </div>
            )}

            {/* Full Paper Strip Studio */}
            {viewMode === 'strip' && (
              <div className="flex-1 w-full h-full relative">
                <PaperStripEditor
                  song={currentSong}
                  currentStep={currentStep}
                  onSongChange={handleSongChange}
                  onSeek={handleSeek}
                  activeTineIndex={activeTineIndex}
                  isPlaying={isPlaying}
                />
              </div>
            )}
          </>
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
