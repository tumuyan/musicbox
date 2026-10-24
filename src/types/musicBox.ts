/**
 * Types and definitions for Paper Strip Music Box (纸带八音盒)
 */

export interface MusicBoxNote {
  midi: number;        // MIDI note number (e.g. 60 = C4)
  name: string;        // Pitch name (e.g. "C4", "F#4")
  freq: number;        // Frequency in Hz
  tineIndex: number;   // 0 to N-1 (from bass to treble)
}

export interface PunchHole {
  id: string;          // Unique key
  step: number;        // Time position in 16th-note ticks
  tineIndex: number;   // Pitch index (0 = lowest bass, N-1 = highest)
  midi: number;        // Midi note number
}

export interface SongData {
  id: string;
  title: string;
  titleEn: string;
  composer: string;
  bpm: number;
  timeSignature: [number, number]; // e.g. [4, 4] or [3, 4]
  totalSteps: number;
  holes: PunchHole[];
  isCustom?: boolean;
  importedAt?: number;
}

/**
 * Standard 30-Note DIY Paper Strip Music Box Scale (Sankyo / Muro 30-tone style)
 * Range: C3 to E6 with rich bass and melody range
 */
export const MUSIC_BOX_SCALE: MusicBoxNote[] = [
  { midi: 48, name: 'C3', freq: 130.81, tineIndex: 0 },
  { midi: 50, name: 'D3', freq: 146.83, tineIndex: 1 },
  { midi: 55, name: 'G3', freq: 196.00, tineIndex: 2 },
  { midi: 57, name: 'A3', freq: 220.00, tineIndex: 3 },
  { midi: 59, name: 'B3', freq: 246.94, tineIndex: 4 },
  { midi: 60, name: 'C4', freq: 261.63, tineIndex: 5 },
  { midi: 62, name: 'D4', freq: 293.66, tineIndex: 6 },
  { midi: 64, name: 'E4', freq: 329.63, tineIndex: 7 },
  { midi: 65, name: 'F4', freq: 349.23, tineIndex: 8 },
  { midi: 66, name: 'F#4', freq: 369.99, tineIndex: 9 },
  { midi: 67, name: 'G4', freq: 392.00, tineIndex: 10 },
  { midi: 68, name: 'G#4', freq: 415.30, tineIndex: 11 },
  { midi: 69, name: 'A4', freq: 440.00, tineIndex: 12 },
  { midi: 70, name: 'A#4', freq: 466.16, tineIndex: 13 },
  { midi: 71, name: 'B4', freq: 493.88, tineIndex: 14 },
  { midi: 72, name: 'C5', freq: 523.25, tineIndex: 15 },
  { midi: 73, name: 'C#5', freq: 554.37, tineIndex: 16 },
  { midi: 74, name: 'D5', freq: 587.33, tineIndex: 17 },
  { midi: 75, name: 'D#5', freq: 622.25, tineIndex: 18 },
  { midi: 76, name: 'E5', freq: 659.25, tineIndex: 19 },
  { midi: 77, name: 'F5', freq: 698.46, tineIndex: 20 },
  { midi: 78, name: 'F#5', freq: 739.99, tineIndex: 21 },
  { midi: 79, name: 'G5', freq: 783.99, tineIndex: 22 },
  { midi: 80, name: 'G#5', freq: 830.61, tineIndex: 23 },
  { midi: 81, name: 'A5', freq: 880.00, tineIndex: 24 },
  { midi: 82, name: 'A#5', freq: 932.33, tineIndex: 25 },
  { midi: 83, name: 'B5', freq: 987.77, tineIndex: 26 },
  { midi: 84, name: 'C6', freq: 1046.50, tineIndex: 27 },
  { midi: 86, name: 'D6', freq: 1174.66, tineIndex: 28 },
  { midi: 88, name: 'E6', freq: 1318.51, tineIndex: 29 },
];

export const TOTAL_TINES = MUSIC_BOX_SCALE.length;

// Map MIDI note to closest available music box tine
export function findClosestTine(midi: number): { tineIndex: number; note: MusicBoxNote; distance: number } {
  let closestIndex = 0;
  let minDiff = Infinity;

  for (let i = 0; i < MUSIC_BOX_SCALE.length; i++) {
    const diff = Math.abs(MUSIC_BOX_SCALE[i].midi - midi);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  return {
    tineIndex: closestIndex,
    note: MUSIC_BOX_SCALE[closestIndex],
    distance: minDiff,
  };
}
