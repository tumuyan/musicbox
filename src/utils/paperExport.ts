/**
 * Export printable DIY Music Box paper strips as standard SVG files
 * Can be printed on cardstock at 100% scale (70mm width) and fed into physical music boxes!
 */

import { SongData, MUSIC_BOX_SCALE } from '../types/musicBox';

export function generatePrintablePaperStripSVG(song: SongData): string {
  // Physical DIY 30-note music box paper strip specs:
  // Strip width: 70mm
  // Top margin: 8mm
  // Bottom margin: 8mm
  // Pitch area: 54mm (divided across 29 intervals = ~1.86mm per pitch line)
  // Step spacing: 2mm per 16th-note step (8mm per beat)

  const stripWidthMm = 70;
  const topMarginMm = 8;
  const bottomMarginMm = 8;
  const usableHeightMm = stripWidthMm - topMarginMm - bottomMarginMm; // 54mm
  const numTines = MUSIC_BOX_SCALE.length;
  const tinePitchMm = usableHeightMm / (numTines - 1);

  const stepWidthMm = 2.0; // 2mm per step
  const leadInSteps = 16;  // blank lead-in for front feed into music box
  const trailSteps = 16;   // blank trail for rear exit
  const totalStepsWithMargins = leadInSteps + song.totalSteps + trailSteps;
  const stripLengthMm = totalStepsWithMargins * stepWidthMm;

  const holeRadiusMm = 1.25; // 2.5mm hole diameter

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${stripLengthMm}mm" height="${stripWidthMm}mm" viewBox="0 0 ${stripLengthMm} ${stripWidthMm}">
  <style>
    .paper-bg { fill: #fcfbf7; stroke: #94a3b8; stroke-width: 0.2; }
    .margin-line { stroke: #cbd5e1; stroke-width: 0.3; stroke-dasharray: 2,2; }
    .pitch-line { stroke: #e2e8f0; stroke-width: 0.15; }
    .beat-line { stroke: #e2e8f0; stroke-width: 0.15; }
    .bar-line { stroke: #94a3b8; stroke-width: 0.35; }
    .hole { fill: #1e293b; stroke: #0f172a; stroke-width: 0.1; }
    .text-note { font-family: monospace; font-size: 1.4px; fill: #64748b; }
    .text-title { font-family: sans-serif; font-size: 2.8px; font-weight: bold; fill: #334155; }
  </style>

  <!-- Paper background -->
  <rect class="paper-bg" x="0" y="0" width="${stripLengthMm}" height="${stripWidthMm}" />

  <!-- Top and bottom blank margins (留白边) -->
  <line class="margin-line" x1="0" y1="${topMarginMm}" x2="${stripLengthMm}" y2="${topMarginMm}" />
  <line class="margin-line" x1="0" y1="${stripWidthMm - bottomMarginMm}" x2="${stripLengthMm}" y2="${stripWidthMm - bottomMarginMm}" />

  <!-- Horizontal pitch lines (中间绘制格线) -->
`;

  // Draw pitch lines (from top = highest pitch to bottom = lowest pitch, or vice-versa)
  for (let i = 0; i < numTines; i++) {
    // Note index 0 (C3 bass) at bottom, note index 29 (E6 treble) at top
    const y = stripWidthMm - bottomMarginMm - (i * tinePitchMm);
    svg += `  <line class="pitch-line" x1="0" y1="${y}" x2="${stripLengthMm}" y2="${y}" />\n`;
    // Note label on left lead-in
    const noteName = MUSIC_BOX_SCALE[i].name;
    svg += `  <text class="text-note" x="2" y="${y + 0.5}">${noteName}</text>\n`;
  }

  // Draw vertical beat / measure lines
  for (let s = 0; s <= totalStepsWithMargins; s++) {
    const x = s * stepWidthMm;
    const songStep = s - leadInSteps;
    const isMeasure = songStep >= 0 && songStep % 16 === 0;
    const isBeat = songStep >= 0 && songStep % 4 === 0;

    if (isMeasure) {
      svg += `  <line class="bar-line" x1="${x}" y1="${topMarginMm}" x2="${x}" y2="${stripWidthMm - bottomMarginMm}" />\n`;
      const barNum = Math.floor(songStep / 16) + 1;
      svg += `  <text class="text-note" x="${x + 0.5}" y="${topMarginMm - 1.5}">M${barNum}</text>\n`;
    } else if (isBeat) {
      svg += `  <line class="beat-line" x1="${x}" y1="${topMarginMm}" x2="${x}" y2="${stripWidthMm - bottomMarginMm}" />\n`;
    }
  }

  // Title on the lead-in strip
  svg += `  <text class="text-title" x="${leadInSteps * stepWidthMm * 0.25}" y="${topMarginMm - 2.5}">${song.title} (${song.bpm} BPM) - 进纸方向 ➔</text>\n`;

  // Draw circular punched holes: "在midi note对应位置打圆孔，不管多长的音符都是一个圆孔"
  song.holes.forEach((hole) => {
    const x = (leadInSteps + hole.step) * stepWidthMm;
    const y = stripWidthMm - bottomMarginMm - (hole.tineIndex * tinePitchMm);
    svg += `  <circle class="hole" cx="${x}" cy="${y}" r="${holeRadiusMm}" />\n`;
  });

  svg += `</svg>`;
  return svg;
}
