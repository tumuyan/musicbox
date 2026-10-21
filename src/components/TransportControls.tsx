/**
 * Playback Transport & Song Management Bar
 */

import React, { useRef } from 'react';
import { SongData } from '../types/musicBox';
import { PRESET_SONGS } from '../data/presetSongs';
import { parseMidiFile, exportSongToMidi } from '../utils/midiParser';
import { musicBoxSynth } from '../audio/MusicBoxSynth';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Upload,
  Download,
  Repeat,
  Image as ImageIcon,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface TransportControlsProps {
  currentSong: SongData;
  onSelectSong: (song: SongData) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentStep: number;
  onSeek: (step: number) => void;
  onRewind: () => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  onOpenReferenceModal: () => void;
}

export const TransportControls: React.FC<TransportControlsProps> = ({
  currentSong,
  onSelectSong,
  isPlaying,
  onTogglePlay,
  currentStep,
  onSeek,
  onRewind,
  isLooping,
  onToggleLoop,
  onOpenReferenceModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [volume, setVolume] = React.useState<number>(85);
  const [isMuted, setIsMuted] = React.useState<boolean>(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = React.useState<boolean>(false);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    musicBoxSynth.setVolume(newVol / 100);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    musicBoxSynth.setMuted(nextMute);
  };

  const handleBpmChange = (newBpm: number) => {
    onSelectSong({
      ...currentSong,
      bpm: newBpm,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseMidiFile(file);
      onSelectSong(result.song);
      onRewind();
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
      window.alert('MIDI文件解析失败，请确保上传标准.mid格式文件。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportMidi = () => {
    const blob = exportSongToMidi(currentSong);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSong.title.replace(/\s+/g, '_')}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleProgressWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // deltaY > 0: wheel down/forward advances song steps
    // deltaY < 0: wheel up/backward rewinds song steps
    const stepDelta = e.deltaY > 0 ? 0.5 : -0.5;
    const nextStep = Math.max(0, Math.min(currentSong.totalSteps, currentStep + stepDelta));
    if (nextStep !== currentStep) {
      onSeek(nextStep);
      musicBoxSynth.playGearTick();
    }
  };

  const progressPercent = (currentStep / currentSong.totalSteps) * 100;
  const currentMeasure = Math.floor(currentStep / (currentSong.timeSignature[0] * 4)) + 1;
  const totalMeasures = Math.ceil(currentSong.totalSteps / (currentSong.timeSignature[0] * 4));

  return (
    <div className="bg-stone-900 border-b border-stone-800 px-3 sm:px-6 py-2 sm:py-2.5 select-none">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Desktop Layout (md and up): Clean, unified single row */}
        <div className="hidden md:flex items-center justify-between gap-4">
          {/* Zone 1: Preset Song Selector & Info */}
          <div className="flex items-center gap-2.5 shrink-0">
            <label className="text-xs text-stone-400 font-medium whitespace-nowrap">曲目:</label>
            <select
              value={currentSong.id}
              onChange={(e) => {
                const selected = PRESET_SONGS.find(s => s.id === e.target.value);
                if (selected) {
                  onSelectSong(selected);
                  onRewind();
                }
              }}
              className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-600 transition-colors w-44 lg:w-56 truncate cursor-pointer"
            >
              {PRESET_SONGS.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title} ({song.composer})
                </option>
              ))}
              {!PRESET_SONGS.some(s => s.id === currentSong.id) && (
                <option value={currentSong.id}>{currentSong.title} (自定)</option>
              )}
            </select>
          </div>

          {/* Zone 2: Playback & Scrubber */}
          <div className="flex-1 flex items-center justify-center gap-3 max-w-xl">
            {/* Rewind */}
            <button
              onClick={onRewind}
              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              title="倒带回开头"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={() => {
                musicBoxSynth.resume();
                onTogglePlay();
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-medium text-xs transition-all shadow-md cursor-pointer whitespace-nowrap ${
                isPlaying
                  ? 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                  : 'bg-stone-100 text-stone-900 hover:bg-white'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>暂停</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>播放</span>
                </>
              )}
            </button>

            {/* Loop */}
            <button
              onClick={onToggleLoop}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLooping
                  ? 'bg-amber-900/40 text-amber-300 border border-amber-700/60'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
              title="循环播放纸带"
            >
              <Repeat className="w-4 h-4" />
            </button>

            {/* Scrubber Timeline */}
            <div 
              onWheel={handleProgressWheel}
              className="flex-1 flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-stone-900/60 hover:bg-stone-800/80 border border-stone-800 hover:border-amber-700/60 transition-all cursor-pointer group select-none min-w-[180px]"
              title="纸带进度条：滚动滚轮可步进/倒带，亦可拖拽滑块"
            >
              <div className="flex items-center gap-1 text-xs font-mono text-stone-400 tabular-nums whitespace-nowrap shrink-0">
                <span className="text-amber-400 font-medium">M{currentMeasure}/{totalMeasures}</span>
                <span className="text-stone-600">·</span>
                <span className="text-stone-300 text-[11px]">{Math.floor(currentStep)}/{currentSong.totalSteps}步</span>
              </div>
              <input
                type="range"
                min={0}
                max={currentSong.totalSteps}
                step={0.5}
                value={currentStep}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500 group-hover:h-2 transition-all"
              />
            </div>
          </div>

          {/* Zone 3: Tempo, Volume, Import/Export */}
          <div className="flex items-center gap-3.5 text-xs text-stone-400 shrink-0">
            {/* BPM */}
            <div className="flex items-center gap-1.5">
              <span className="whitespace-nowrap">速度:</span>
              <input
                type="range"
                min={40}
                max={180}
                value={currentSong.bpm}
                onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                className="w-16 lg:w-20 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="font-mono text-stone-300 tabular-nums w-11">{currentSong.bpm}</span>
            </div>

            <span className="text-stone-700">|</span>

            {/* Volume */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleMute}
                className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
                title={isMuted ? '取消静音' : '静音'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="w-14 lg:w-16 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            <span className="text-stone-700">|</span>

            {/* MIDI Import / Export */}
            <div className="flex items-center gap-1.5">
              <input
                type="file"
                ref={fileInputRef}
                accept=".mid,.midi"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors cursor-pointer"
                title="导入任意MIDI乐曲"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>导入</span>
              </button>
              <button
                onClick={handleExportMidi}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors cursor-pointer"
                title="导出MIDI文件"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Layout (< md): Non-scrolling 2-row layout with expandable parameters drawer */}
        <div className="flex md:hidden flex-col gap-2">
          {/* Row 1: Song Select + Core Playback + Settings Toggle */}
          <div className="flex items-center justify-between gap-2">
            <select
              value={currentSong.id}
              onChange={(e) => {
                const selected = PRESET_SONGS.find(s => s.id === e.target.value);
                if (selected) {
                  onSelectSong(selected);
                  onRewind();
                }
              }}
              className="flex-1 min-w-0 bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-600 transition-colors truncate cursor-pointer"
            >
              {PRESET_SONGS.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title} ({song.composer})
                </option>
              ))}
              {!PRESET_SONGS.some(s => s.id === currentSong.id) && (
                <option value={currentSong.id}>{currentSong.title} (自定)</option>
              )}
            </select>

            {/* Playback buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onRewind}
                className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                title="倒带"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  musicBoxSynth.resume();
                  onTogglePlay();
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-medium text-xs transition-all shadow-md cursor-pointer whitespace-nowrap ${
                  isPlaying
                    ? 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                    : 'bg-stone-100 text-stone-900 hover:bg-white'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>暂停</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    <span>播放</span>
                  </>
                )}
              </button>

              <button
                onClick={onToggleLoop}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLooping
                    ? 'bg-amber-900/40 text-amber-300 border border-amber-700/60'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`}
                title="循环播放"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isSettingsExpanded
                    ? 'bg-amber-900/60 text-amber-200 border-amber-700/80 shadow-xs'
                    : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                }`}
                title="展开调音/速度/MIDI设置"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Full Width Scrubber Timeline */}
          <div 
            onWheel={handleProgressWheel}
            className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg bg-stone-900/60 hover:bg-stone-800/80 border border-stone-800 select-none cursor-pointer"
          >
            <div className="flex items-center gap-1 text-[11px] font-mono text-stone-400 tabular-nums whitespace-nowrap shrink-0">
              <span className="text-amber-400 font-medium">M{currentMeasure}/{totalMeasures}</span>
              <span className="text-stone-600">·</span>
              <span className="text-stone-300">{Math.floor(currentStep)}/{currentSong.totalSteps}步</span>
            </div>
            <input
              type="range"
              min={0}
              max={currentSong.totalSteps}
              step={0.5}
              value={currentStep}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Expandable Parameters Drawer (Non-scrolling, clear organized card) */}
          {isSettingsExpanded && (
            <div className="p-3 bg-stone-950/80 border border-stone-800 rounded-xl space-y-2.5 text-xs text-stone-300 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="grid grid-cols-2 gap-3 items-center">
                {/* BPM Slider */}
                <div className="flex items-center justify-between gap-2 bg-stone-900/90 p-2 rounded-lg border border-stone-800">
                  <span className="text-stone-400 text-[11px]">速度:</span>
                  <input
                    type="range"
                    min={40}
                    max={180}
                    value={currentSong.bpm}
                    onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="font-mono text-amber-300 tabular-nums text-[11px] w-9 text-right font-medium">{currentSong.bpm}</span>
                </div>

                {/* Volume Slider */}
                <div className="flex items-center justify-between gap-2 bg-stone-900/90 p-2 rounded-lg border border-stone-800">
                  <button
                    onClick={handleToggleMute}
                    className="p-0.5 text-stone-400 hover:text-stone-200 cursor-pointer"
                    title={isMuted ? '取消静音' : '静音'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-stone-300" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="font-mono text-stone-300 tabular-nums text-[11px] w-7 text-right">{isMuted ? 0 : volume}%</span>
                </div>
              </div>

              {/* Action buttons row */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors cursor-pointer border border-stone-700/60"
                  >
                    <Upload className="w-3 h-3 text-amber-400" />
                    <span>导入MIDI</span>
                  </button>
                  <button
                    onClick={handleExportMidi}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors cursor-pointer border border-stone-700/60"
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>导出MIDI</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
