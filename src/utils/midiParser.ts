/**
 * MIDI Import & Export utilities for Paper Strip Music Box
 * Adheres strictly to: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔"
 */

import { Midi } from '@tonejs/midi';
import { SongData, PunchHole, findClosestTine, MUSIC_BOX_SCALE } from '../types/musicBox';

export interface MidiImportResult {
  song: SongData;
  totalNotesFound: number;
  outOfRangeNotes: number;
  recommendedTranspose: number;
}

/**
 * Parse an uploaded .mid / .midi file and quantize note onsets into paper strip punch holes.
 */
export async function parseMidiFile(file: File | ArrayBuffer, transposeSemitones: number = 0): Promise<MidiImportResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const midi = new Midi(buffer);

  // Determine song metadata
  const title = (file instanceof File ? file.name.replace(/\.[^/.]+$/, '') : 'Imported MIDI') || 'Custom Music Box Tape';
  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 100;
  const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
    ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]]
    : [4, 4];

  // Seconds per step (16th note: 4 steps per beat)
  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4;

  const rawNotes: { step: number; midi: number }[] = [];

  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      // Step position calculated strictly from note onset time
      const step = Math.round(note.time / secondsPerStep);
      const transposedMidi = note.midi + transposeSemitones;
      rawNotes.push({ step, midi: transposedMidi });
    });
  });

  // Calculate best transposition recommendation if not manually specified
  let bestTranspose = 0;
  let maxMatched = -1;
  const minScaleMidi = MUSIC_BOX_SCALE[0].midi;
  const maxScaleMidi = MUSIC_BOX_SCALE[MUSIC_BOX_SCALE.length - 1].midi;

  for (let t = -12; t <= 12; t++) {
    let matched = 0;
    rawNotes.forEach((n) => {
      const targetMidi = n.midi - transposeSemitones + t;
      if (targetMidi >= minScaleMidi && targetMidi <= maxScaleMidi) {
        matched++;
      }
    });
    if (matched > maxMatched) {
      maxMatched = matched;
      bestTranspose = t;
    }
  }

  // Deduplicate: "不管多长的音符都是一个圆孔" (only one hole per step and tine)
  const holeMap = new Map<string, PunchHole>();
  let outOfRangeCount = 0;
  let maxStep = 32;

  rawNotes.forEach((n, idx) => {
    const { tineIndex, distance } = findClosestTine(n.midi);
    if (distance > 2) {
      outOfRangeCount++;
    }

    const key = `${n.step}-${tineIndex}`;
    if (!holeMap.has(key)) {
      holeMap.set(key, {
        id: `imported-${n.step}-${tineIndex}-${idx}`,
        step: n.step,
        tineIndex,
        midi: MUSIC_BOX_SCALE[tineIndex].midi,
      });
    }

    if (n.step > maxStep) {
      maxStep = n.step;
    }
  });

  // Round up totalSteps to next multiple of 16 (or measure)
  const stepsPerMeasure = timeSignature[0] * 4;
  const totalSteps = Math.max(64, Math.ceil((maxStep + 8) / stepsPerMeasure) * stepsPerMeasure);

  const holes = Array.from(holeMap.values()).sort((a, b) => a.step - b.step || a.tineIndex - b.tineIndex);

  const song: SongData = {
    id: `midi-${Date.now()}`,
    title,
    titleEn: 'MIDI Import',
    composer: 'Custom Punch Tape',
    bpm: Math.min(220, Math.max(40, bpm)),
    timeSignature,
    totalSteps,
    holes,
  };

  return {
    song,
    totalNotesFound: rawNotes.length,
    outOfRangeNotes: outOfRangeCount,
    recommendedTranspose: bestTranspose,
  };
}

/**
 * Export current punched holes to a standard downloadable MIDI file
 */
export function exportSongToMidi(song: SongData): Blob {
  const midi = new Midi();
  midi.header.setTempo(song.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: song.timeSignature,
    measures: 0,
  });

  const track = midi.addTrack();
  track.name = song.title;

  const secondsPerBeat = 60 / song.bpm;
  const secondsPerStep = secondsPerBeat / 4;

  song.holes.forEach((hole) => {
    const time = hole.step * secondsPerStep;
    track.addNote({
      midi: hole.midi,
      time,
      duration: 0.15, // Discrete music box strike duration
      velocity: 0.8,
    });
  });

  const bytes = midi.toArray();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Blob([arrayBuffer as BlobPart], { type: 'audio/midi' });
}
