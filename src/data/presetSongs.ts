/**
 * Preset Songs arranged for 30-Note Paper Strip Music Box
 * Every note onset is represented as a single circular punched hole.
 */

import { SongData, findClosestTine } from '../types/musicBox';

// Helper to build PunchHoles from raw [step, midi] tuples
function createHoles(notes: [number, number][]): SongData['holes'] {
  return notes.map(([step, midi], index) => {
    const { tineIndex } = findClosestTine(midi);
    return {
      id: `hole-${step}-${tineIndex}-${index}`,
      step,
      tineIndex,
      midi,
    };
  });
}

export const PRESET_SONGS: SongData[] = [
  {
    id: 'laputa',
    title: '天空之城 (Carrying You)',
    titleEn: 'Castle in the Sky',
    composer: '久石让 (Joe Hisaishi)',
    bpm: 86,
    timeSignature: [4, 4],
    totalSteps: 128,
    // Step: 4 steps = 1 beat (16th note resolution)
    holes: createHoles([
      // Intro / Theme pickup
      // A4 - B4
      [0, 69], [2, 71],
      // Bar 1: C5 (step 4), B4 (step 8), C5 (step 10), E5 (step 12) + bass C4 (step 4)
      [4, 60], [4, 72], [8, 71], [10, 72], [12, 76],
      // Bar 2: B4 (step 16), E4 bass (step 16), G4 (step 20), E4 (step 24)
      [16, 64], [16, 71], [20, 67], [24, 64],
      // Bar 3: A4 (step 28), G4 (step 32), A4 (step 34), C5 (step 36) + F4 bass (step 28)
      [28, 65], [28, 69], [32, 67], [34, 69], [36, 72],
      // Bar 4: G4 (step 40), C4 bass (step 40), E4 (step 44), D4 (step 48)
      [40, 60], [40, 67], [44, 64], [48, 62],
      // Bar 5: F4 (step 52), E4 (step 56), F4 (step 58), A4 (step 60) + D4 bass (step 52)
      [52, 62], [52, 65], [56, 64], [58, 65], [60, 69],
      // Bar 6: E4 (step 64), C4 (step 68), D4 (step 72), E4 (step 74) + A3 bass (step 64)
      [64, 57], [64, 64], [68, 60], [72, 62], [74, 64],
      // Bar 7: D4 (step 76), B3 (step 80), C4 (step 84), D4 (step 86) + G3 bass (step 76)
      [76, 55], [76, 62], [80, 59], [84, 60], [86, 62],
      // Bar 8: B3 (step 88), G3 bass (step 88), E3 (step 92)
      [88, 55], [88, 59], [92, 52],
      // Phrase 2 Climax: A4 (step 96)
      [96, 57], [96, 69], [98, 71],
      [100, 60], [100, 72], [104, 71], [106, 72], [108, 76],
      [112, 64], [112, 71], [116, 67],
      [120, 65], [120, 69], [124, 72], [126, 74],
    ]),
  },
  {
    id: 'canon',
    title: '卡农 (Canon in D)',
    titleEn: 'Canon in D',
    composer: '约翰·帕赫贝尔 (Pachelbel)',
    bpm: 76,
    timeSignature: [4, 4],
    totalSteps: 128,
    holes: createHoles([
      // Classic 8-chord progression with music box arpeggio
      // 1. D - F# - A - D (step 0)
      [0, 50], [0, 62], [2, 66], [4, 69], [6, 74],
      // 2. A - C# - E - A (step 8)
      [8, 57], [8, 64], [10, 69], [12, 73], [14, 76],
      // 3. B - D - F# - B (step 16)
      [16, 59], [16, 62], [18, 66], [20, 71], [22, 74],
      // 4. F# - A - C# - F# (step 24)
      [24, 54], [24, 61], [26, 66], [28, 69], [30, 73],
      // 5. G - B - D - G (step 32)
      [32, 55], [32, 62], [34, 67], [36, 71], [38, 74],
      // 6. D - F# - A - D (step 40)
      [40, 50], [40, 62], [42, 66], [44, 69], [46, 74],
      // 7. G - B - D - G (step 48)
      [48, 55], [48, 62], [50, 67], [52, 71], [54, 74],
      // 8. A - C# - E - A (step 56)
      [56, 57], [56, 64], [58, 69], [60, 73], [62, 76],
      // Variation: Melody running in 16ths
      [64, 50], [64, 74], [66, 73], [68, 74], [70, 76],
      [72, 57], [72, 78], [74, 76], [76, 74], [78, 73],
      [80, 59], [80, 71], [82, 73], [84, 74], [86, 71],
      [88, 54], [88, 69], [90, 71], [92, 73], [94, 69],
      [96, 55], [96, 67], [98, 69], [100, 71], [102, 67],
      [104, 50], [104, 66], [106, 67], [108, 69], [110, 66],
      [112, 55], [112, 67], [114, 66], [116, 67], [118, 69],
      [120, 57], [120, 71], [122, 69], [124, 71], [126, 73],
    ]),
  },
  {
    id: 'spirited-away',
    title: '千与千寻 (Always With Me)',
    titleEn: 'Always With Me',
    composer: '木村弓 (Youmi Kimura)',
    bpm: 96,
    timeSignature: [3, 4],
    totalSteps: 96,
    holes: createHoles([
      // Waltz 3/4 (3 beats = 12 steps per bar)
      // Bar 1: C5 (step 0), E5 (step 4), G5 (step 8) with C4 bass
      [0, 60], [0, 72], [4, 76], [8, 79],
      // Bar 2: G5 (step 12), F5 (step 16), E5 (step 20) with G3 bass
      [12, 55], [12, 79], [16, 77], [20, 76],
      // Bar 3: F5 (step 24), D5 (step 28), F5 (step 32) with F4 bass
      [24, 65], [24, 77], [28, 74], [32, 77],
      // Bar 4: E5 (step 36), D5 (step 40), C5 (step 44) with C4 bass
      [36, 60], [36, 76], [40, 74], [44, 72],
      // Bar 5: D5 (step 48), G4 (step 52), B4 (step 56) with G3 bass
      [48, 55], [48, 74], [52, 67], [56, 71],
      // Bar 6: C5 (step 60), D5 (step 64), E5 (step 68) with A3 bass
      [60, 57], [60, 72], [64, 74], [68, 76],
      // Bar 7: D5 (step 72), C5 (step 76), B4 (step 80) with D4 bass
      [72, 62], [72, 74], [76, 72], [80, 71],
      // Bar 8: C5 (step 84), G4 (step 88), C4 (step 92) with C3 bass
      [84, 48], [84, 72], [88, 67], [92, 60],
    ]),
  },
  {
    id: 'fur-elise',
    title: '致爱丽丝 (Für Elise)',
    titleEn: 'Für Elise',
    composer: '贝多芬 (Beethoven)',
    bpm: 110,
    timeSignature: [3, 8],
    totalSteps: 96,
    holes: createHoles([
      // Iconic motif: E5 - D#5 - E5 - D#5 - E5 - B4 - D5 - C5 - A4
      [0, 76], [2, 75], [4, 76], [6, 75], [8, 76], [10, 71], [12, 74], [14, 72],
      // A4 with A3 bass + C4 + E4 arpeggio
      [16, 57], [16, 69], [20, 60], [24, 64], [28, 69],
      // B4 with E3 bass + G#3 + E4 arpeggio
      [32, 52], [32, 71], [36, 56], [40, 64], [44, 68], [48, 71],
      // C5 with A3 bass + E4 arpeggio
      [52, 57], [52, 72], [56, 64], [60, 69],
      // Repeat opening motif
      [64, 76], [66, 75], [68, 76], [70, 75], [72, 76], [74, 71], [76, 74], [78, 72],
      [80, 57], [80, 69], [84, 60], [88, 64], [92, 69],
    ]),
  },
  {
    id: 'merry-go-round',
    title: '哈尔的移动城堡 (Merry-Go-Round of Life)',
    titleEn: 'Merry-Go-Round of Life',
    composer: '久石让 (Joe Hisaishi)',
    bpm: 92,
    timeSignature: [3, 4],
    totalSteps: 96,
    holes: createHoles([
      // Waltz bass-chord-chord + melody
      // Bar 1: D4 bass (0), F4+A4 (4), F4+A4 (8) | Melody: D5 (0), F5 (4), A5 (8)
      [0, 50], [0, 74], [4, 65], [4, 69], [4, 77], [8, 65], [8, 69], [8, 81],
      // Bar 2: G5 (12), F5 (16), E5 (20) | C#4 bass
      [12, 49], [12, 79], [16, 64], [16, 69], [16, 77], [20, 64], [20, 69], [20, 76],
      // Bar 3: D5 (24), F5 (28), D5 (32) | D4 bass
      [24, 50], [24, 74], [28, 65], [28, 69], [28, 77], [32, 65], [32, 69], [32, 74],
      // Bar 4: Bb4 (36), D5 (40), G5 (44) | G3 bass
      [36, 55], [36, 70], [40, 58], [40, 62], [40, 74], [44, 58], [44, 62], [44, 79],
      // Bar 5: F5 (48), E5 (52), D5 (56) | A3 bass
      [48, 57], [48, 77], [52, 61], [52, 64], [52, 76], [56, 61], [56, 64], [56, 74],
      // Bar 6: C#5 (60), D5 (64), E5 (68) | A3 bass
      [60, 57], [60, 73], [64, 61], [64, 64], [64, 74], [68, 61], [68, 64], [68, 76],
      // Bar 7: D5 (72), A4 (80), F4 (88) with D3 bass
      [72, 50], [72, 74], [80, 69], [88, 65],
    ]),
  },
  {
    id: 'twinkle',
    title: '小星星变奏曲 (Twinkle Twinkle)',
    titleEn: 'Twinkle Twinkle Little Star',
    composer: '莫扎特 / 民谣 (Mozart)',
    bpm: 96,
    timeSignature: [4, 4],
    totalSteps: 96,
    holes: createHoles([
      // C - C - G - G - A - A - G
      [0, 48], [0, 60], [4, 60], [8, 55], [8, 67], [12, 67],
      [16, 57], [16, 69], [20, 69], [24, 55], [24, 67],
      // F - F - E - E - D - D - C
      [32, 53], [32, 65], [36, 65], [40, 52], [40, 64], [44, 64],
      [48, 50], [48, 62], [52, 62], [56, 48], [56, 60],
      // G - G - F - F - E - E - D
      [64, 55], [64, 67], [68, 67], [72, 53], [72, 65], [76, 65],
      [80, 52], [80, 64], [84, 64], [88, 50], [88, 62],
    ]),
  },
];
