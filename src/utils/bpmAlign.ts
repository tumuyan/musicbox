/**
 * BPM & Grid Alignment Utilities for Paper Strip Music Box (纸带打孔台网格与BPM对齐算法)
 *
 * Implements:
 * 1. 自动对齐：通过分析音符时间间隔，自动寻找最佳BPM，使所有孔/音符完美对齐格线
 * 2. 音符对齐格线吸附 (Quantize to Grid)
 * 3. 拍号与小节数转换计算
 */

import { SongData, PunchHole } from '../types/musicBox';

/**
 * Calculate steps per measure from time signature
 * Standard music box strip: 4 steps per quarter-note beat (16th-note resolution)
 */
export function getStepsPerMeasure(timeSignature: [number, number]): number {
  if (!timeSignature || !Array.isArray(timeSignature) || timeSignature.length < 2) {
    return 16;
  }
  const [numerator, denominator] = timeSignature;
  if (denominator === 8) {
    return Math.max(2, numerator * 2);
  }
  return Math.max(4, numerator * 4);
}

/**
 * Calculate total measures from total steps and steps per measure
 */
export function getTotalMeasures(totalSteps: number, stepsPerMeasure: number): number {
  return Math.max(1, Math.ceil(totalSteps / stepsPerMeasure));
}

export interface BpmAlignmentResult {
  optimalBpm: number;
  alignmentScore: number; // 0 to 100%, 100% means perfectly on grid lines
  improvedSong: SongData;
}

/**
 * Find the optimal BPM that aligns note onsets onto the integer 16th-note / beat grid lines
 * Formula: step = time / (60 / (bpm * 4)) = time * bpm * 4 / 60
 */
export function calculateOptimalBpm(
  song: SongData,
  minBpm: number = 50,
  maxBpm: number = 160
): { optimalBpm: number; alignmentScore: number } {
  if (song.holes.length === 0) {
    return { optimalBpm: song.bpm, alignmentScore: 100 };
  }

  // Convert current hole steps into approximate note onset times in seconds using current BPM
  const secondsPerStep = (60 / song.bpm) / 4;
  const noteTimes = song.holes.map(h => h.step * secondsPerStep);

  // Scan candidate BPMs around current BPM and standard musical tempos
  const candidateBpms: number[] = [];
  
  // Dense scan around current BPM (+/- 25 BPM)
  const currentBpmRounded = Math.round(song.bpm);
  for (let b = Math.max(minBpm, currentBpmRounded - 25); b <= Math.min(maxBpm, currentBpmRounded + 25); b += 1) {
    candidateBpms.push(b);
  }

  // Common standard music box tempos
  [60, 64, 68, 72, 76, 80, 84, 86, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 140].forEach(b => {
    if (!candidateBpms.includes(b)) candidateBpms.push(b);
  });

  let bestBpm = song.bpm;
  let minError = Infinity;

  candidateBpms.forEach(candidateBpm => {
    const candidateSecondsPerStep = (60 / candidateBpm) / 4;
    let totalResidual = 0;

    noteTimes.forEach(time => {
      const continuousStep = time / candidateSecondsPerStep;
      const nearestIntegerStep = Math.round(continuousStep);
      const residual = Math.abs(continuousStep - nearestIntegerStep);
      
      // Give higher weight if it aligns with quarter beat (multiple of 4) or eighth beat (multiple of 2)
      const beatBonus = (nearestIntegerStep % 4 === 0) ? 0.7 : (nearestIntegerStep % 2 === 0 ? 0.85 : 1.0);
      totalResidual += residual * beatBonus;
    });

    const avgResidual = totalResidual / noteTimes.length;
    // Prefer tempos close to current BPM if residuals are comparable
    const bpmDistancePenalty = Math.abs(candidateBpm - song.bpm) * 0.0008;
    const finalScore = avgResidual + bpmDistancePenalty;

    if (finalScore < minError) {
      minError = finalScore;
      bestBpm = candidateBpm;
    }
  });

  // Calculate alignment score as percentage (0 to 100%)
  const alignmentScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(0.5, minError) * 2) * 100)));

  return {
    optimalBpm: bestBpm,
    alignmentScore,
  };
}

/**
 * Automatically align a song's holes to the grid by adjusting BPM and snapping note positions
 */
export function autoAlignSongByBpm(song: SongData): SongData {
  const { optimalBpm } = calculateOptimalBpm(song);
  const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
  const currentMeasures = getTotalMeasures(song.totalSteps, stepsPerMeasure);

  // If BPM is adjusted, convert hole steps proportionally
  const scaleRatio = optimalBpm / song.bpm;

  // Deduplicate on quantized steps
  const holeMap = new Map<string, PunchHole>();
  let maxNewStep = 0;

  song.holes.forEach(hole => {
    const targetStep = Math.round(hole.step * scaleRatio);
    const key = `${targetStep}-${hole.tineIndex}`;
    if (!holeMap.has(key)) {
      holeMap.set(key, {
        ...hole,
        id: `punch-${targetStep}-${hole.tineIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        step: targetStep,
      });
    }
    if (targetStep > maxNewStep) {
      maxNewStep = targetStep;
    }
  });

  // Ensure total steps accommodates all holes and fits integer measures
  const neededMeasures = Math.max(currentMeasures, Math.ceil((maxNewStep + 8) / stepsPerMeasure));
  const newTotalSteps = neededMeasures * stepsPerMeasure;

  const updatedHoles = Array.from(holeMap.values()).sort((a, b) => a.step - b.step || a.tineIndex - b.tineIndex);

  return {
    ...song,
    bpm: optimalBpm,
    totalSteps: newTotalSteps,
    holes: updatedHoles,
  };
}

/**
 * Snap all current holes directly to the nearest grid step without changing BPM
 */
export function snapHolesToGrid(song: SongData, gridSnap: number = 1): SongData {
  const holeMap = new Map<string, PunchHole>();
  let maxStep = 0;

  song.holes.forEach(hole => {
    const snappedStep = Math.round(hole.step / gridSnap) * gridSnap;
    const key = `${snappedStep}-${hole.tineIndex}`;
    if (!holeMap.has(key)) {
      holeMap.set(key, {
        ...hole,
        step: snappedStep,
      });
    }
    if (snappedStep > maxStep) {
      maxStep = snappedStep;
    }
  });

  const stepsPerMeasure = getStepsPerMeasure(song.timeSignature);
  const totalMeasures = Math.max(
    getTotalMeasures(song.totalSteps, stepsPerMeasure),
    Math.ceil((maxStep + 4) / stepsPerMeasure)
  );

  return {
    ...song,
    totalSteps: totalMeasures * stepsPerMeasure,
    holes: Array.from(holeMap.values()).sort((a, b) => a.step - b.step || a.tineIndex - b.tineIndex),
  };
}
