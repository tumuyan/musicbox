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
  Image as ImageIcon
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
    <div className="bg-stone-900 border-b border-stone-800 px-6 py-3 select-none">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Zone 1: Preset Song Selector & Info */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-stone-400 font-medium whitespace-nowrap">曲目预设:</label>
          <select
            value={currentSong.id}
            onChange={(e) => {
              const selected = PRESET_SONGS.find(s => s.id === e.target.value);
              if (selected) {
                onSelectSong(selected);
                onRewind();
              }
            }}
            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-600 transition-colors"
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

          {/* Reference Photo Button */}
          <button
            onClick={onOpenReferenceModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-200/90 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg transition-colors whitespace-nowrap"
            title="对照用户提供的实体八音盒原图"
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>查看参考原图</span>
          </button>
        </div>

        {/* Zone 2: Transport Playback Controls */}
        <div className="flex items-center gap-3">
          {/* Rewind */}
          <button
            onClick={onRewind}
            className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
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
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-xs transition-all shadow-md ${
              isPlaying
                ? 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                : 'bg-stone-100 text-stone-900 hover:bg-white'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>暂停播放</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>自动播放</span>
              </>
            )}
          </button>

          {/* Loop toggle */}
          <button
            onClick={onToggleLoop}
            className={`p-2 rounded-lg transition-colors ${
              isLooping
                ? 'bg-amber-900/40 text-amber-300 border border-amber-700/60'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
            title="循环播放纸带"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Scrubber Timeline with Mouse Wheel Scroll Support */}
          <div 
            onWheel={handleProgressWheel}
            className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-stone-900/60 hover:bg-stone-800/80 border border-stone-800 hover:border-amber-700/60 transition-all cursor-pointer group select-none"
            title="纸带进度条：直接在此滚动鼠标滚轮可步进/倒带，亦可拖拽进度滑块"
          >
            <div className="flex items-center gap-1.5 text-xs font-mono text-stone-400 tabular-nums whitespace-nowrap">
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
              className="w-36 md:w-56 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500 group-hover:h-2 transition-all"
            />
          </div>
        </div>

        {/* Zone 3: Tempo, Volume, Import/Export */}
        <div className="flex items-center gap-4 text-xs text-stone-400">
          {/* BPM Tempo Slider */}
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">速度:</span>
            <input
              type="range"
              min={40}
              max={180}
              value={currentSong.bpm}
              onChange={(e) => handleBpmChange(parseInt(e.target.value))}
              className="w-20 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="font-mono text-stone-300 tabular-nums w-12">{currentSong.bpm} BPM</span>
          </div>

          <span className="text-stone-700">|</span>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleMute}
              className="p-1 text-stone-400 hover:text-stone-200"
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
              className="w-16 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <span className="text-stone-700">|</span>

          {/* MIDI Import / Export */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".mid,.midi"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors"
              title="导入任意MIDI乐曲，自动转换为打孔纸带"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入MIDI</span>
            </button>
            <button
              onClick={handleExportMidi}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors"
              title="将当前打孔纸带导出为MIDI文件"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出MIDI</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
