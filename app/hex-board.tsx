"use client";

import { useEffect, useRef, useState } from "react";
import type { ColonySignal } from "./audio-system";
import {
  ROYAL_COCOON_DURATION_MS,
  ROYAL_ESCAPE_DURATION_MS,
  ROYAL_FIREWORKS_DURATION_MS,
  ROYAL_SACRIFICE_DURATION_MS,
} from "./game-effects";
import {
  BOARD_CELLS,
  Coord,
  EGG_HATCH_TURNS,
  EGG_RESOURCE_COST,
  GameState,
  MAX_CELL_RICHNESS,
  ROYAL_COCOON_RADIUS,
  ROYAL_COCOON_TURNS,
  PLAYER_META,
  Piece,
  PlayerId,
  Territory,
  activeRoyalCocoons,
  cellRichness,
  coordKey,
  hexDistance,
  isInCheck,
  isZombieTermite,
  neighbors,
  queenSpawnCells,
} from "./game-engine";

type RGBA = [number, number, number, number];

interface HexBoardProps {
  state: GameState;
  selectedPieceId?: string;
  legalTargets: Coord[];
  checkingPieceIds: string[];
  territories: Partial<Record<PlayerId, Territory>>;
  colonySignal?: ColonySignal;
  onCellClick: (coord: Coord) => void;
  onRendererMode?: (mode: "WebGL 2" | "Canvas") => void;
}

interface Layout {
  width: number;
  height: number;
  size: number;
  centers: Map<string, { x: number; y: number; coord: Coord }>;
}

interface SceneProps extends HexBoardProps {
  animationStart: number;
}

const SQRT_3 = Math.sqrt(3);

function hexToColor(hex: string, alpha = 1): RGBA {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    alpha,
  ];
}

function playerColor(state: GameState, playerId: PlayerId): string {
  return state.players.find((player) => player.id === playerId)?.color ??
    PLAYER_META[playerId].color;
}

function lighten(color: RGBA, amount: number, alpha = color[3]): RGBA {
  return [
    Math.min(1, color[0] + amount),
    Math.min(1, color[1] + amount),
    Math.min(1, color[2] + amount),
    alpha,
  ];
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function phaseBetween(elapsed: number, start: number, duration: number): number {
  return Math.max(0, Math.min(1, (elapsed - start) / duration));
}

function signalEnvelope(elapsed: number, start: number, duration: number): number {
  const phase = (elapsed - start) / duration;
  if (phase <= 0 || phase >= 1) return 0;
  return Math.sin(phase * Math.PI);
}

function pieceVibrationOffset(
  piece: Piece,
  signal: ColonySignal | undefined,
  time: number,
  size: number,
): { x: number; y: number; intensity: number } {
  if (!signal || piece.playerId !== signal.playerId) {
    return { x: 0, y: 0, intensity: 0 };
  }
  const elapsed = time - signal.startedAt;
  if (piece.id === signal.sourcePieceId) {
    const intensity = signalEnvelope(elapsed, 0, 760);
    return {
      x: Math.sin(elapsed * 0.105) * size * 0.055 * intensity,
      y: Math.sin(elapsed * 0.163) * size * 0.03 * intensity,
      intensity,
    };
  }
  if (signal.kind === "egg" && piece.type === "egg") {
    const relayIndex = signal.relayPieceIds?.indexOf(piece.id) ?? -1;
    if (relayIndex >= 0) {
      const delay = 280 + relayIndex * 245;
      const intensity = signalEnvelope(elapsed, delay, 720);
      return {
        x: Math.sin((elapsed - delay) * 0.083) * size * 0.045 * intensity,
        y: Math.cos((elapsed - delay) * 0.061) * size * 0.025 * intensity,
        intensity,
      };
    }
  }
  if (piece.type === "king") {
    const intensity = signalEnvelope(elapsed, 560, 1040);
    return {
      x: Math.sin((elapsed - 560) * 0.026) * size * 0.055 * intensity,
      y: Math.sin((elapsed - 560) * 0.013) * size * 0.018 * intensity,
      intensity,
    };
  }
  if (piece.type === "queen") {
    const intensity = signalEnvelope(elapsed, 940, 1380);
    return {
      x: Math.sin((elapsed - 940) * 0.063) * size * 0.033 * intensity,
      y: Math.cos((elapsed - 940) * 0.041) * size * 0.052 * intensity,
      intensity,
    };
  }
  return { x: 0, y: 0, intensity: 0 };
}

function localPoint(
  x: number,
  y: number,
  angle: number,
  forward: number,
  lateral: number,
): { x: number; y: number } {
  return {
    x: x + Math.cos(angle) * forward - Math.sin(angle) * lateral,
    y: y + Math.sin(angle) * forward + Math.cos(angle) * lateral,
  };
}

function pieceHeading(piece: Piece, time: number): number {
  const home = axialRaw(PLAYER_META[piece.playerId].home);
  const towardCenter = Math.atan2(-home.y, -home.x);
  const seed = hashUnit(piece.id);
  if (piece.type === "egg") {
    const period = 4300 + seed * 5200;
    const phase = ((time + seed * period) % period) / period;
    const wobble = phase < 0.16
      ? Math.sin((phase / 0.16) * Math.PI * 5) * 0.16 * Math.sin((phase / 0.16) * Math.PI)
      : 0;
    return towardCenter + wobble;
  }
  if (piece.type !== "pawn") {
    return towardCenter + Math.sin(time * 0.00042 + seed * 8) * 0.055;
  }
  const period = 5600 + seed * 5200;
  const cycle = Math.floor((time + seed * period) / period);
  const phase = ((time + seed * period) % period) / period;
  const previousTurn =
    (hashUnit(`${piece.id}-turn-${Math.max(0, cycle - 1)}`) - 0.5) * Math.PI * 1.7;
  const nextTurn =
    (hashUnit(`${piece.id}-turn-${cycle}`) - 0.5) * Math.PI * 1.7;
  const turnProgress = phase < 0.16 ? smoothstep(phase / 0.16) : 1;
  return towardCenter + previousTurn + (nextTurn - previousTurn) * turnProgress;
}

function axialRaw(coord: Coord): { x: number; y: number } {
  return {
    x: SQRT_3 * (coord.q + coord.r / 2),
    y: 1.5 * coord.r,
  };
}

function createLayout(width: number, height: number): Layout {
  const rawCenters = BOARD_CELLS.map((coord) => ({ coord, ...axialRaw(coord) }));
  const minX = Math.min(...rawCenters.map((point) => point.x)) - SQRT_3 / 2;
  const maxX = Math.max(...rawCenters.map((point) => point.x)) + SQRT_3 / 2;
  const minY = Math.min(...rawCenters.map((point) => point.y)) - 1;
  const maxY = Math.max(...rawCenters.map((point) => point.y)) + 1;
  const padding = Math.max(22, Math.min(width, height) * 0.078);
  const size = Math.min(
    (width - padding * 2) / (maxX - minX),
    (height - padding * 2) / (maxY - minY),
  );
  const boardWidth = (maxX - minX) * size;
  const boardHeight = (maxY - minY) * size;
  const offsetX = (width - boardWidth) / 2 - minX * size;
  const offsetY = (height - boardHeight) / 2 - minY * size;
  const centers = new Map<string, { x: number; y: number; coord: Coord }>();
  rawCenters.forEach((point) => {
    centers.set(coordKey(point.coord), {
      coord: point.coord,
      x: point.x * size + offsetX,
      y: point.y * size + offsetY,
    });
  });
  return { width, height, size, centers };
}

class VertexBuilder {
  data: number[] = [];

  constructor(
    private width: number,
    private height: number,
  ) {}

  reset(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data.length = 0;
  }

  private vertex(x: number, y: number, color: RGBA) {
    this.data.push(
      (x / this.width) * 2 - 1,
      1 - (y / this.height) * 2,
      color[0],
      color[1],
      color[2],
      color[3],
    );
  }

  triangle(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    color: RGBA,
  ) {
    this.vertex(a.x, a.y, color);
    this.vertex(b.x, b.y, color);
    this.vertex(c.x, c.y, color);
  }

  polygon(points: { x: number; y: number }[], color: RGBA) {
    if (points.length < 3) return;
    for (let index = 1; index < points.length - 1; index += 1) {
      this.triangle(points[0], points[index], points[index + 1], color);
    }
  }

  line(
    a: { x: number; y: number },
    b: { x: number; y: number },
    thickness: number,
    color: RGBA,
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ox = (-dy / length) * (thickness / 2);
    const oy = (dx / length) * (thickness / 2);
    const p1 = { x: a.x + ox, y: a.y + oy };
    const p2 = { x: b.x + ox, y: b.y + oy };
    const p3 = { x: b.x - ox, y: b.y - oy };
    const p4 = { x: a.x - ox, y: a.y - oy };
    this.triangle(p1, p2, p3, color);
    this.triangle(p1, p3, p4, color);
  }

  circle(x: number, y: number, radius: number, color: RGBA, segments = 20) {
    const center = { x, y };
    for (let index = 0; index < segments; index += 1) {
      const angleA = (index / segments) * Math.PI * 2;
      const angleB = ((index + 1) / segments) * Math.PI * 2;
      this.triangle(
        center,
        { x: x + Math.cos(angleA) * radius, y: y + Math.sin(angleA) * radius },
        { x: x + Math.cos(angleB) * radius, y: y + Math.sin(angleB) * radius },
        color,
      );
    }
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    angle: number,
    color: RGBA,
    segments = 22,
  ) {
    const center = { x, y };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const point = (phase: number) => ({
      x: x + Math.cos(phase) * radiusX * cos - Math.sin(phase) * radiusY * sin,
      y: y + Math.cos(phase) * radiusX * sin + Math.sin(phase) * radiusY * cos,
    });
    for (let index = 0; index < segments; index += 1) {
      this.triangle(
        center,
        point((index / segments) * Math.PI * 2),
        point(((index + 1) / segments) * Math.PI * 2),
        color,
      );
    }
  }

  ring(x: number, y: number, radius: number, thickness: number, color: RGBA) {
    const segments = 28;
    for (let index = 0; index < segments; index += 1) {
      const angleA = (index / segments) * Math.PI * 2;
      const angleB = ((index + 1) / segments) * Math.PI * 2;
      const outerA = {
        x: x + Math.cos(angleA) * radius,
        y: y + Math.sin(angleA) * radius,
      };
      const outerB = {
        x: x + Math.cos(angleB) * radius,
        y: y + Math.sin(angleB) * radius,
      };
      const innerB = {
        x: x + Math.cos(angleB) * (radius - thickness),
        y: y + Math.sin(angleB) * (radius - thickness),
      };
      const innerA = {
        x: x + Math.cos(angleA) * (radius - thickness),
        y: y + Math.sin(angleA) * (radius - thickness),
      };
      this.triangle(outerA, outerB, innerB, color);
      this.triangle(outerA, innerB, innerA, color);
    }
  }

  hexRing(
    x: number,
    y: number,
    radius: number,
    thickness: number,
    color: RGBA,
  ) {
    const innerRadius = Math.max(0, radius - thickness);
    const outer = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
    });
    const inner = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      return {
        x: x + Math.cos(angle) * innerRadius,
        y: y + Math.sin(angle) * innerRadius,
      };
    });
    for (let index = 0; index < 6; index += 1) {
      const next = (index + 1) % 6;
      this.triangle(outer[index], outer[next], inner[next], color);
      this.triangle(outer[index], inner[next], inner[index], color);
    }
  }

  hex(x: number, y: number, radius: number, fill: RGBA, border?: RGBA) {
    const corners = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
    });
    for (let index = 0; index < 6; index += 1) {
      this.triangle(
        { x, y },
        corners[index],
        corners[(index + 1) % 6],
        fill,
      );
    }
    if (border) {
      for (let index = 0; index < 6; index += 1) {
        this.line(
          corners[index],
          corners[(index + 1) % 6],
          Math.max(1, radius * 0.035),
          border,
        );
      }
    }
  }
}

function drawPiece(
  builder: VertexBuilder,
  piece: Piece,
  x: number,
  y: number,
  radius: number,
  selected: boolean,
  checked: boolean,
  checking: boolean,
  time: number,
  spawnCapable: boolean,
  colorHex: string,
) {
  const baseColor = hexToColor(colorHex);
  const bright = lighten(baseColor, 0.24);
  const pale = lighten(baseColor, 0.38);
  const ink: RGBA = [0.025, 0.04, 0.045, 0.98];
  const eyeWhite: RGBA = [0.92, 0.99, 0.91, 1];
  const seed = hashUnit(piece.id);
  const heading = pieceHeading(piece, time);
  const pulse = 1 + Math.sin(time * 0.0032 + seed * 11) * 0.018;
  const scale = radius * pulse;
  if (checked) {
    builder.ring(
      x,
      y,
      scale * (0.68 + Math.sin(time * 0.008) * 0.05),
      scale * 0.1,
      [1, 0.19, 0.14, 0.7],
    );
  }
  if (checking) {
    builder.ring(
      x,
      y,
      scale * (0.72 + Math.sin(time * 0.009) * 0.045),
      scale * 0.085,
      [1, 0.35, 0.18, 0.9],
    );
  }
  if (selected) {
    builder.ring(x, y, scale * 0.67, scale * 0.075, [1, 1, 0.85, 0.92]);
  }

  const shadow = localPoint(x, y, heading, -scale * 0.08, scale * 0.08);
  builder.ellipse(
    shadow.x,
    shadow.y,
    scale * 0.5,
    scale * 0.27,
    heading,
    [0, 0, 0, 0.44],
  );

  if (piece.type === "egg") {
    const remaining = Math.max(
      1,
      Math.min(EGG_HATCH_TURNS, piece.hatchTurns ?? EGG_HATCH_TURNS),
    );
    const breathe = 0.94 + Math.sin(time * 0.006 + seed * 9) * 0.06;
    builder.circle(
      x,
      y,
      scale * (0.43 + (EGG_HATCH_TURNS - remaining) * 0.035),
      [bright[0], bright[1], bright[2], 0.08 + (EGG_HATCH_TURNS - remaining) * 0.035],
      24,
    );
    builder.ellipse(
      x,
      y,
      scale * 0.31 * breathe,
      scale * 0.4 * breathe,
      heading + Math.sin(time * 0.002 + seed * 4) * 0.05,
      pale,
      28,
    );
    builder.ellipse(
      x - scale * 0.07,
      y - scale * 0.1,
      scale * 0.09,
      scale * 0.14,
      heading,
      [1, 1, 1, 0.34],
      16,
    );
    builder.ring(
      x,
      y,
      scale * (0.31 + Math.sin(time * 0.004 + seed * 5) * 0.018),
      Math.max(1, scale * 0.02),
      [baseColor[0], baseColor[1], baseColor[2], 0.78],
    );
    for (let index = 0; index < EGG_HATCH_TURNS; index += 1) {
      builder.circle(
        x + (index - 1) * scale * 0.13,
        y + scale * 0.5,
        scale * 0.04,
        index < remaining
          ? [1, 0.9, 0.44, 0.98]
          : [0.22, 0.25, 0.32, 0.72],
        10,
      );
    }
    return;
  }

  const drawLegs = (bodyScale: number, walking: number) => {
    [-0.15, 0, 0.15].forEach((forwardOffset, index) => {
      ([-1, 1] as const).forEach((side) => {
        const swing =
          Math.sin(walking + index * 2.1 + (side > 0 ? Math.PI : 0)) *
          scale *
          0.075;
        const hip = localPoint(
          x,
          y,
          heading,
          scale * forwardOffset,
          scale * bodyScale * 0.65 * side,
        );
        const knee = localPoint(
          x,
          y,
          heading,
          scale * (forwardOffset + 0.025) + swing,
          scale * bodyScale * 0.92 * side,
        );
        const foot = localPoint(
          x,
          y,
          heading,
          scale * (forwardOffset - 0.025) - swing * 0.45,
          scale * bodyScale * 1.2 * side,
        );
        builder.line(hip, knee, Math.max(1, scale * 0.034), ink);
        builder.line(knee, foot, Math.max(1, scale * 0.028), bright);
      });
    });
  };

  const drawEyes = (
    head: { x: number; y: number },
    eyeSpacing: number,
    eyeRadius: number,
  ) => {
    const blinkPeriod = 2500 + seed * 3900;
    const blinkPhase = ((time + seed * 1900) % blinkPeriod) / blinkPeriod;
    const blinking = blinkPhase > 0.935;
    ([-1, 1] as const).forEach((side) => {
      const eye = localPoint(
        head.x,
        head.y,
        heading,
        eyeRadius * 0.36,
        eyeSpacing * side,
      );
      if (blinking) {
        const a = localPoint(eye.x, eye.y, heading, 0, -eyeRadius * 0.8);
        const b = localPoint(eye.x, eye.y, heading, 0, eyeRadius * 0.8);
        builder.line(a, b, Math.max(1, eyeRadius * 0.34), ink);
      } else {
        builder.circle(eye.x, eye.y, eyeRadius, eyeWhite, 16);
        const pupil = localPoint(
          eye.x,
          eye.y,
          heading,
          eyeRadius * 0.28,
          -side * eyeRadius * 0.08,
        );
        builder.circle(pupil.x, pupil.y, eyeRadius * 0.48, ink, 14);
        builder.circle(
          pupil.x + eyeRadius * 0.15,
          pupil.y - eyeRadius * 0.16,
          eyeRadius * 0.13,
          [1, 1, 1, 0.96],
          9,
        );
      }
    });
  };

  if (isZombieTermite(piece)) {
    const remaining = Math.max(1, Math.min(10, piece.zombieActivationsRemaining));
    const jerk = Math.sin(time * 0.031 + seed * 23) * scale * 0.035;
    const rotten: RGBA = [
      baseColor[0] * 0.38 + 0.08,
      baseColor[1] * 0.38 + 0.12,
      baseColor[2] * 0.38 + 0.06,
      1,
    ];
    builder.ring(
      x,
      y,
      scale * (0.48 + Math.sin(time * 0.012 + seed) * 0.045),
      Math.max(1, scale * 0.045),
      [0.55, 1, 0.18, 0.34],
    );
    drawLegs(0.42, time * 0.026 + seed * 17);
    const abdomen = localPoint(x + jerk, y, heading, -scale * 0.2, 0);
    const thorax = localPoint(x, y - jerk, heading, scale * 0.03, 0);
    const head = localPoint(x - jerk, y, heading, scale * 0.27, 0);
    builder.ellipse(abdomen.x, abdomen.y, scale * 0.31, scale * 0.23, heading, rotten, 22);
    builder.ellipse(thorax.x, thorax.y, scale * 0.23, scale * 0.19, heading, [0.12, 0.18, 0.1, 1], 20);
    builder.ellipse(head.x, head.y, scale * 0.2, scale * 0.19, heading, [0.2, 0.28, 0.13, 1], 20);
    [-0.12, 0.03, 0.15].forEach((offset, index) => {
      const crack = localPoint(abdomen.x, abdomen.y, heading, scale * offset, -scale * 0.17);
      const crackEnd = localPoint(abdomen.x, abdomen.y, heading, scale * (offset + 0.06), scale * 0.17);
      builder.line(crack, crackEnd, Math.max(1, scale * 0.018), [0.72, 1, 0.25, 0.8 - index * 0.14]);
    });
    ([-1, 1] as const).forEach((side) => {
      const eye = localPoint(head.x, head.y, heading, scale * 0.07, scale * 0.09 * side);
      builder.circle(eye.x, eye.y, scale * 0.057, [1, 0.18, 0.28, 1], 12);
      builder.circle(eye.x, eye.y, scale * 0.024, [0.02, 0.01, 0.02, 1], 9);
    });
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
      builder.circle(
        x + Math.cos(angle) * scale * 0.59,
        y + Math.sin(angle) * scale * 0.59,
        scale * 0.027,
        index < remaining ? [0.68, 1, 0.22, 0.95] : [0.18, 0.2, 0.18, 0.55],
        8,
      );
    }
    return;
  }

  if (piece.type === "pawn") {
    const walkPeriod = 5100 + seed * 4200;
    const walkPhase = ((time + seed * 2600) % walkPeriod) / walkPeriod;
    const walkingStrength =
      walkPhase < 0.22 ? Math.sin((walkPhase / 0.22) * Math.PI) : 0;
    const walking = time * 0.018 * walkingStrength + seed * 9;
    drawLegs(0.38, walking);
    const abdomen = localPoint(x, y, heading, -scale * 0.2, 0);
    const thorax = localPoint(x, y, heading, scale * 0.02, 0);
    const head = localPoint(x, y, heading, scale * 0.25, 0);
    builder.ellipse(
      abdomen.x,
      abdomen.y,
      scale * 0.29,
      scale * 0.22,
      heading,
      baseColor,
    );
    builder.ellipse(
      thorax.x,
      thorax.y,
      scale * 0.22,
      scale * 0.19,
      heading,
      bright,
    );
    builder.ellipse(
      head.x,
      head.y,
      scale * 0.2,
      scale * 0.2,
      heading,
      pale,
    );
    const antennaWave = Math.sin(time * 0.005 + seed * 13) * scale * 0.04;
    ([-1, 1] as const).forEach((side) => {
      const root = localPoint(head.x, head.y, heading, scale * 0.11, scale * 0.1 * side);
      const tip = localPoint(
        head.x,
        head.y,
        heading,
        scale * 0.31,
        scale * 0.19 * side + antennaWave * side,
      );
      builder.line(root, tip, Math.max(1, scale * 0.022), bright);
    });
    drawEyes(head, scale * 0.095, scale * 0.088);
  } else if (piece.type === "queen") {
    const fertilityWave = spawnCapable
      ? 1 + Math.sin(time * 0.006 + seed * 7) * 0.11
      : 1 + Math.sin(time * 0.002 + seed * 7) * 0.025;
    drawLegs(0.33, time * 0.002 + seed * 8);
    const abdomen = localPoint(x, y, heading, -scale * 0.22, 0);
    const thorax = localPoint(x, y, heading, scale * 0.13, 0);
    const head = localPoint(x, y, heading, scale * 0.34, 0);
    if (spawnCapable) {
      const auraPulse = 0.82 + Math.sin(time * 0.007 + seed * 9) * 0.18;
      builder.circle(
        abdomen.x,
        abdomen.y,
        scale * (0.2 + auraPulse * 0.045),
        [0.58, 1, 0.48, 0.1 + auraPulse * 0.09],
        24,
      );
      builder.ellipse(
        abdomen.x,
        abdomen.y,
        scale * 0.48 * fertilityWave,
        scale * 0.28,
        heading,
        [bright[0], bright[1], bright[2], 0.22],
        26,
      );
    }
    builder.ellipse(
      abdomen.x,
      abdomen.y,
      scale * 0.43 * fertilityWave,
      scale * 0.25,
      heading,
      baseColor,
      28,
    );
    [-0.35, -0.1, 0.15].forEach((offset) => {
      const stripe = localPoint(
        abdomen.x,
        abdomen.y,
        heading,
        scale * offset,
        0,
      );
      const top = localPoint(stripe.x, stripe.y, heading, 0, -scale * 0.2);
      const bottom = localPoint(stripe.x, stripe.y, heading, 0, scale * 0.2);
      builder.line(top, bottom, Math.max(1, scale * 0.018), [0.04, 0.06, 0.07, 0.46]);
    });
    if (spawnCapable) {
      const glow = 0.84 + Math.sin(time * 0.009 + seed * 12) * 0.16;
      builder.ring(
        abdomen.x,
        abdomen.y,
        scale * (0.105 + glow * 0.018),
        Math.max(1, scale * 0.025),
        [0.66, 1, 0.48, 0.48 + glow * 0.34],
      );
      builder.circle(
        abdomen.x,
        abdomen.y,
        scale * 0.052,
        [0.91, 1, 0.7, 0.98],
        16,
      );
      builder.circle(
        abdomen.x - scale * 0.012,
        abdomen.y - scale * 0.018,
        scale * 0.017,
        [1, 1, 1, 1],
        10,
      );
    }
    builder.ellipse(
      thorax.x,
      thorax.y,
      scale * 0.2,
      scale * 0.15,
      heading,
      bright,
    );
    builder.ellipse(
      head.x,
      head.y,
      scale * 0.15,
      scale * 0.14,
      heading,
      pale,
    );
    ([-1, 1] as const).forEach((side) => {
      const root = localPoint(head.x, head.y, heading, scale * 0.08, scale * 0.07 * side);
      const tip = localPoint(
        head.x,
        head.y,
        heading,
        scale * 0.26,
        scale * (0.12 + Math.sin(time * 0.003 + seed * 5) * 0.025) * side,
      );
      builder.line(root, tip, Math.max(1, scale * 0.02), pale);
      builder.circle(tip.x, tip.y, scale * 0.025, pale, 9);
    });
    drawEyes(head, scale * 0.067, scale * 0.056);
  } else {
    const antennaSwing = Math.sin(time * 0.0044 + seed * 9);
    drawLegs(0.42, time * 0.0015 + seed * 7);
    const abdomen = localPoint(x, y, heading, -scale * 0.16, 0);
    const thorax = localPoint(x, y, heading, scale * 0.09, 0);
    const head = localPoint(x, y, heading, scale * 0.31, 0);
    builder.ellipse(
      abdomen.x,
      abdomen.y,
      scale * 0.34,
      scale * 0.28,
      heading,
      baseColor,
      24,
    );
    builder.ellipse(
      thorax.x,
      thorax.y,
      scale * 0.25,
      scale * 0.22,
      heading,
      bright,
    );
    builder.ellipse(
      head.x,
      head.y,
      scale * 0.22,
      scale * 0.2,
      heading,
      pale,
    );
    ([-1, 1] as const).forEach((side) => {
      const root = localPoint(head.x, head.y, heading, scale * 0.12, scale * 0.11 * side);
      const joint = localPoint(
        head.x,
        head.y,
        heading,
        scale * 0.38,
        scale * (0.2 + antennaSwing * 0.05) * side,
      );
      const tip = localPoint(
        head.x,
        head.y,
        heading,
        scale * 0.62,
        scale * (0.33 - antennaSwing * 0.08) * side,
      );
      builder.line(root, joint, Math.max(1.2, scale * 0.035), bright);
      builder.line(joint, tip, Math.max(1, scale * 0.026), pale);
      builder.circle(tip.x, tip.y, scale * 0.045, [1, 0.94, 0.62, 0.96], 12);
    });
    drawEyes(head, scale * 0.11, scale * 0.082);
  }

  const levelSpread = scale * 0.13;
  for (let index = 0; index < piece.level; index += 1) {
    builder.circle(
      x + (index - (piece.level - 1) / 2) * levelSpread,
      y + scale * 0.41,
      scale * 0.034,
      [1, 0.96, 0.75, 0.95],
      10,
    );
  }
}

function drawWaterAndCliffs(
  builder: VertexBuilder,
  layout: Layout,
  time: number,
) {
  builder.polygon(
    [
      { x: 0, y: 0 },
      { x: layout.width, y: 0 },
      { x: layout.width, y: layout.height },
      { x: 0, y: layout.height },
    ],
    [0.018, 0.105, 0.15, 1],
  );

  const bandCount = 15;
  const segmentCount = 18;
  for (let band = 0; band < bandCount; band += 1) {
    const baseY = ((band + 0.5) / bandCount) * layout.height;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const x1 = (segment / segmentCount) * layout.width;
      const x2 = ((segment + 1) / segmentCount) * layout.width;
      const waveA =
        Math.sin(segment * 0.72 + band * 1.31 + time * 0.0012) *
        layout.size *
        0.075;
      const waveB =
        Math.sin((segment + 1) * 0.72 + band * 1.31 + time * 0.0012) *
        layout.size *
        0.075;
      builder.line(
        { x: x1, y: baseY + waveA },
        { x: x2, y: baseY + waveB },
        Math.max(0.7, layout.size * 0.018),
        [0.15, 0.45, 0.55, 0.11 + (band % 3) * 0.025],
      );
    }
  }

  const boardCenter = layout.centers.get("0,0")!;
  BOARD_CELLS.filter(
    (cell) => hexDistance(cell, { q: 0, r: 0 }) === 5,
  ).forEach((cell, index) => {
    const center = layout.centers.get(coordKey(cell))!;
    builder.hex(
      center.x,
      center.y + layout.size * 0.18,
      layout.size * 1.035,
      [0.105, 0.09, 0.075, 1],
      [0.25, 0.2, 0.14, 0.9],
    );
    builder.hexRing(
      center.x,
      center.y + layout.size * 0.08,
      layout.size * 1.015,
      layout.size * 0.095,
      [0.36, 0.3, 0.2, 0.74],
    );
    const dx = center.x - boardCenter.x;
    const dy = center.y - boardCenter.y;
    const length = Math.hypot(dx, dy) || 1;
    const foamX = center.x + (dx / length) * layout.size * 0.98;
    const foamY = center.y + (dy / length) * layout.size * 0.98;
    const foamPulse =
      0.78 + Math.sin(time * 0.0022 + index * 0.83) * 0.18;
    builder.ring(
      foamX,
      foamY,
      layout.size * (0.12 + foamPulse * 0.055),
      Math.max(0.8, layout.size * 0.022),
      [0.62, 0.9, 0.92, 0.2 + foamPulse * 0.22],
    );
    if (index % 2 === 0) {
      const rockA = localPoint(
        center.x,
        center.y + layout.size * 0.08,
        Math.atan2(dy, dx),
        layout.size * 0.62,
        -layout.size * 0.16,
      );
      const rockB = localPoint(
        center.x,
        center.y + layout.size * 0.08,
        Math.atan2(dy, dx),
        layout.size * 0.84,
        layout.size * 0.12,
      );
      builder.line(
        rockA,
        rockB,
        Math.max(1, layout.size * 0.035),
        [0.5, 0.4, 0.25, 0.45],
      );
    }
  });
}

function drawKingTerritorySignals(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  props.state.pieces
    .filter((piece) => piece.type === "king")
    .forEach((king) => {
      const territory = props.territories[king.playerId];
      if (!territory?.cells.length) return;
      const maximumDistance = Math.max(
        1,
        ...territory.cells.map((cell) => hexDistance(king, cell)),
      );
      const waveDistance =
        ((time * 0.00105 + hashUnit(king.id) * 2.7) %
          (maximumDistance + 1.7));
      const color = lighten(hexToColor(playerColor(props.state, king.playerId)), 0.22);
      territory.cells.forEach((cell) => {
        const distance = hexDistance(king, cell);
        const proximity = Math.max(0, 1 - Math.abs(distance - waveDistance) / 0.82);
        if (proximity <= 0) return;
        const center = layout.centers.get(coordKey(cell));
        if (!center) return;
        builder.hexRing(
          center.x,
          center.y,
          layout.size * (0.62 + proximity * 0.16),
          Math.max(0.8, layout.size * 0.025),
          [color[0], color[1], color[2], proximity * 0.34],
        );
        builder.circle(
          center.x,
          center.y,
          layout.size * 0.08,
          [color[0], color[1], color[2], proximity * 0.16],
          14,
        );
      });
    });
}

function drawQueenSpawnZones(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  props.state.pieces
    .filter((piece) => piece.type === "queen" && piece.queenBonded)
    .forEach((queen) => {
      const kingAlive = props.state.pieces.some(
        (piece) =>
          piece.playerId === queen.playerId && piece.type === "king",
      );
      if (!kingAlive) return;
      const player = props.state.players.find(
        (candidate) => candidate.id === queen.playerId,
      );
      const ready =
        (player?.resources ?? 0) >= EGG_RESOURCE_COST;
      const color = lighten(hexToColor(playerColor(props.state, queen.playerId)), 0.25);
      queenSpawnCells(props.state.pieces, queen).forEach((cell, cellIndex) => {
        const center = layout.centers.get(coordKey(cell));
        if (!center) return;
        const orbit = time * 0.0014 + cellIndex * 0.8 + hashUnit(queen.id) * 4;
        for (let dot = 0; dot < 6; dot += 1) {
          const angle = orbit + (dot / 6) * Math.PI * 2;
          builder.circle(
            center.x + Math.cos(angle) * layout.size * 0.39,
            center.y + Math.sin(angle) * layout.size * 0.39,
            layout.size * (ready ? 0.035 : 0.026),
            [color[0], color[1], color[2], ready ? 0.78 : 0.34],
            10,
          );
        }
        builder.ellipse(
          center.x,
          center.y,
          layout.size * 0.095,
          layout.size * 0.13,
          -0.25 + Math.sin(time * 0.0018 + cellIndex) * 0.08,
          [color[0], color[1], color[2], ready ? 0.32 : 0.12],
          16,
        );
      });
    });
}

function drawPawnSignals(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const kings = new Map<PlayerId, Piece>();
  props.state.pieces.forEach((piece) => {
    if (piece.type === "king") kings.set(piece.playerId, piece);
  });
  props.state.pieces
    .filter((piece) => piece.type === "pawn")
    .forEach((pawn) => {
      const king = kings.get(pawn.playerId);
      if (!king) return;
      const seed = hashUnit(`${pawn.id}-signal`);
      const period = 7600 + seed * 5600;
      const phase = ((time + seed * period * 0.83) % period) / period;
      if (phase > 0.13) return;
      const progress = phase / 0.13;
      const start = layout.centers.get(coordKey(pawn));
      const end = layout.centers.get(coordKey(king));
      if (!start || !end) return;
      const color = lighten(hexToColor(playerColor(props.state, pawn.playerId)), 0.28);
      const envelope = Math.sin(progress * Math.PI);
      builder.line(
        start,
        end,
        Math.max(0.7, layout.size * 0.014),
        [color[0], color[1], color[2], envelope * 0.2],
      );
      [0, 0.18, 0.36].forEach((trail) => {
        const localProgress = Math.max(0, progress - trail);
        const signalX = start.x + (end.x - start.x) * localProgress;
        const signalY = start.y + (end.y - start.y) * localProgress;
        builder.ring(
          signalX,
          signalY,
          layout.size * (0.045 + localProgress * 0.07),
          Math.max(0.7, layout.size * 0.015),
          [color[0], color[1], color[2], envelope * (0.55 - trail * 0.6)],
        );
      });
    });
}

function drawColonyVibration(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const signal = props.colonySignal;
  if (!signal) return;
  const elapsed = time - signal.startedAt;
  if (elapsed < 0 || elapsed > 2900) return;
  const sourcePiece = props.state.pieces.find(
    (piece) => piece.id === signal.sourcePieceId,
  );
  if (!sourcePiece) return;
  const source = layout.centers.get(coordKey(sourcePiece));
  if (!source) return;
  const color = lighten(hexToColor(playerColor(props.state, signal.playerId)), 0.34);
  if (signal.kind === "egg") {
    const relayPieces = (signal.relayPieceIds ?? [])
      .map((pieceId) => props.state.pieces.find((piece) => piece.id === pieceId))
      .filter((piece): piece is Piece => Boolean(piece));
    const chain = [sourcePiece, ...relayPieces];
    const sourcePulse = signalEnvelope(elapsed, 0, 760);
    builder.ring(
      source.x,
      source.y,
      layout.size * (0.34 + sourcePulse * 0.3),
      Math.max(0.8, layout.size * 0.022),
      [color[0], color[1], color[2], sourcePulse * 0.62],
    );
    for (let index = 0; index < chain.length - 1; index += 1) {
      const from = layout.centers.get(coordKey(chain[index]));
      const to = layout.centers.get(coordKey(chain[index + 1]));
      if (!from || !to) continue;
      const delay = 170 + index * 245;
      const progress = Math.max(0, Math.min(1, (elapsed - delay) / 330));
      if (progress <= 0) continue;
      const head = {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
      builder.line(
        from,
        head,
        Math.max(1, layout.size * 0.025),
        [color[0], color[1], color[2], (1 - progress * 0.35) * 0.54],
      );
      builder.ring(
        head.x,
        head.y,
        layout.size * 0.12,
        Math.max(0.8, layout.size * 0.018),
        [1, 0.92, 0.55, 0.7],
      );
      if (progress === 1) {
        const relayPulse = signalEnvelope(elapsed, delay + 250, 650);
        builder.ring(
          to.x,
          to.y,
          layout.size * (0.28 + relayPulse * 0.26),
          Math.max(0.8, layout.size * 0.02),
          [color[0], color[1], color[2], relayPulse * 0.58],
        );
      }
    }
    return;
  }
  const sourceEnvelope = signalEnvelope(elapsed, 0, 820);
  if (sourceEnvelope > 0) {
    [0, 0.13, 0.26].forEach((echo, index) => {
      const echoProgress = Math.max(0, sourceEnvelope - echo);
      builder.ring(
        source.x,
        source.y,
        layout.size * (0.34 + echoProgress * (0.28 + index * 0.08)),
        Math.max(0.8, layout.size * 0.022),
        [color[0], color[1], color[2], echoProgress * (0.5 - index * 0.09)],
      );
    });
  }

  const targets = props.state.pieces.filter(
    (piece) =>
      piece.playerId === signal.playerId &&
      (piece.type === "king" || piece.type === "queen"),
  );
  targets.forEach((target) => {
    const destination = layout.centers.get(coordKey(target));
    if (!destination) return;
    const delay = target.type === "king" ? 260 : 590;
    const travelDuration = target.type === "king" ? 650 : 820;
    const progress = Math.max(
      0,
      Math.min(1, (elapsed - delay) / travelDuration),
    );
    if (progress > 0 && progress < 1) {
      builder.line(
        source,
        destination,
        Math.max(0.7, layout.size * 0.012),
        [color[0], color[1], color[2], 0.12],
      );
      [0, 0.13, 0.26, 0.39].forEach((trail, index) => {
        const localProgress = Math.max(0, progress - trail);
        if (!localProgress) return;
        const x = source.x + (destination.x - source.x) * localProgress;
        const y = source.y + (destination.y - source.y) * localProgress;
        builder.ring(
          x,
          y,
          layout.size * (0.055 + index * 0.014),
          Math.max(0.7, layout.size * 0.016),
          [
            color[0],
            color[1],
            color[2],
            (0.62 - index * 0.11) * Math.sin(localProgress * Math.PI),
          ],
        );
      });
    }
    const responseStart = delay + travelDuration - 80;
    const responseDuration = target.type === "king" ? 1020 : 1380;
    const response = signalEnvelope(
      elapsed,
      responseStart,
      responseDuration,
    );
    if (response <= 0) return;
    const ringCount = target.type === "king" ? 2 : 3;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const phase =
        target.type === "king"
          ? Math.sin((elapsed - responseStart) * 0.018 + ring * 1.7)
          : Math.sin((elapsed - responseStart) * 0.041 + ring * 2.2);
      builder.ring(
        destination.x,
        destination.y,
        layout.size *
          (target.type === "king"
            ? 0.52 + ring * 0.15 + phase * 0.055
            : 0.46 + ring * 0.11 + phase * 0.035),
        Math.max(0.8, layout.size * (target.type === "king" ? 0.025 : 0.017)),
        [color[0], color[1], color[2], response * (0.38 - ring * 0.07)],
      );
    }
  });
}

function drawAcidDuel(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const lastMove = props.state.lastMove;
  if (!lastMove?.acidVictimCoord) return;
  const elapsed = time - props.animationStart;
  if (elapsed < 80 || elapsed > 980) return;
  const progress = Math.max(0, Math.min(1, (elapsed - 80) / 900));
  const envelope = Math.sin(progress * Math.PI);
  const source = layout.centers.get(coordKey(lastMove.to));
  const victim = layout.centers.get(coordKey(lastMove.acidVictimCoord));
  if (!source || !victim) return;
  builder.line(
    source,
    victim,
    Math.max(2, layout.size * (0.035 + envelope * 0.09)),
    [0.55, 1, 0.16, 0.22 + envelope * 0.76],
  );
  [0, 0.14, 0.28, 0.42].forEach((trail, index) => {
    const local = Math.max(0, Math.min(1, progress * 1.45 - trail));
    if (!local) return;
    const wobble = Math.sin(time * 0.035 + index * 1.7) * layout.size * 0.07;
    const dx = victim.x - source.x;
    const dy = victim.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    builder.circle(
      source.x + dx * local - (dy / length) * wobble,
      source.y + dy * local + (dx / length) * wobble,
      layout.size * (0.045 + (3 - index) * 0.014),
      [0.68, 1, 0.25, envelope * (0.86 - index * 0.12)],
      14,
    );
  });
  for (let ring = 0; ring < 3; ring += 1) {
    const burst = Math.max(0, Math.min(1, progress * 1.7 - ring * 0.16));
    if (!burst || burst >= 1) continue;
    builder.ring(
      victim.x,
      victim.y,
      layout.size * (0.12 + burst * (0.34 + ring * 0.08)),
      Math.max(1, layout.size * 0.025),
      [0.62, 1, 0.2, (1 - burst) * 0.72],
    );
  }
}

function drawHatchBursts(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const coords = props.state.lastMove?.hatchedCoords ?? [];
  if (!coords.length) return;
  const elapsed = time - props.animationStart;
  if (elapsed < 40 || elapsed > 920) return;
  const progress = Math.max(0, Math.min(1, (elapsed - 40) / 880));
  const fade = 1 - progress;
  coords.forEach((coord, coordIndex) => {
    const center = layout.centers.get(coordKey(coord));
    if (!center) return;
    const color = hexToColor(
      playerColor(props.state, props.state.lastMove!.playerId),
    );
    builder.ring(
      center.x,
      center.y,
      layout.size * (0.16 + progress * 0.48),
      Math.max(1, layout.size * 0.032),
      [color[0], color[1], color[2], fade * 0.72],
    );
    for (let particle = 0; particle < 7; particle += 1) {
      const angle = (particle / 7) * Math.PI * 2 + coordIndex * 0.37;
      builder.circle(
        center.x + Math.cos(angle) * layout.size * progress * 0.52,
        center.y + Math.sin(angle) * layout.size * progress * 0.52,
        layout.size * (0.035 + fade * 0.018),
        [1, 0.92, 0.5, fade * 0.86],
        10,
      );
    }
  });
}

function drawMoveOutcomeEffects(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const move = props.state.lastMove;
  if (!move) return;
  const elapsed = time - props.animationStart;
  const center = layout.centers.get(coordKey(move.to));
  if (!center) return;
  const own = hexToColor(playerColor(props.state, move.playerId));

  if (move.capturedType && elapsed >= 150 && elapsed <= 1_650) {
    const progress = phaseBetween(elapsed, 150, 1_500);
    const fade = 1 - progress;
    const shell = move.capturedType === "egg";
    builder.ring(
      center.x,
      center.y,
      layout.size * (0.1 + progress * (shell ? 0.7 : 0.46)),
      Math.max(1, layout.size * 0.045 * fade),
      shell ? [1, 0.9, 0.62, fade * 0.92] : [1, 0.3, 0.22, fade * 0.78],
    );
    for (let particle = 0; particle < (shell ? 22 : 14); particle += 1) {
      const angle = (particle / (shell ? 22 : 14)) * Math.PI * 2 + hashUnit(`${move.pieceId}-impact-${particle}`);
      const distance = layout.size * progress * (0.2 + (particle % 6) * 0.11);
      builder.circle(
        center.x + Math.cos(angle) * distance,
        center.y + Math.sin(angle) * distance + layout.size * progress * progress * 0.16,
        layout.size * (0.018 + (particle % 4) * 0.01) * fade,
        shell
          ? particle % 3 === 0
            ? [0.68, 1, 0.43, fade]
            : [1, 0.94, 0.7, fade]
          : [1, 0.35, 0.22, fade],
        8,
      );
    }
  }

  if (move.eggBlast && elapsed >= 80 && elapsed <= 2_350) {
    const progress = phaseBetween(elapsed, 80, 2_270);
    const pressure = Math.sin(Math.min(1, progress * 1.35) * Math.PI);
    const fade = Math.max(0, 1 - progress);
    for (let ring = 0; ring < 3; ring += 1) {
      const ringProgress = Math.max(
        0,
        Math.min(1, progress * 1.35 - ring * 0.12),
      );
      builder.ring(
        center.x,
        center.y,
        layout.size * (0.18 + ringProgress * 1.92),
        Math.max(1, layout.size * (0.07 - ring * 0.014) * (1 - ringProgress)),
        [1, 0.48 + ring * 0.12, 0.12, (1 - ringProgress) * 0.84],
      );
    }
    neighbors(move.eggBlast.center).forEach((coord, index) => {
      const adjacent = layout.centers.get(coordKey(coord));
      if (!adjacent) return;
      const arrival = Math.max(0, Math.min(1, progress * 1.8 - index * 0.025));
      const pulse = Math.sin(arrival * Math.PI);
      builder.ring(
        adjacent.x,
        adjacent.y,
        layout.size * (0.12 + arrival * 0.54),
        Math.max(1, layout.size * 0.035 * pulse),
        [1, 0.82, 0.28, pulse * fade * 0.92],
      );
      builder.circle(
        adjacent.x,
        adjacent.y,
        layout.size * (0.04 + pulse * 0.19),
        [1, 0.24, 0.08, pulse * fade * 0.42],
        14,
      );
    });
    move.eggBlast.victims.forEach((victim, victimIndex) => {
      const victimCenter = layout.centers.get(coordKey(victim.coord));
      if (!victimCenter) return;
      for (let particle = 0; particle < 18; particle += 1) {
        const angle =
          (particle / 18) * Math.PI * 2 +
          hashUnit(`${victim.pieceId}-blast-${particle}`) * 0.8;
        const distance =
          layout.size * progress * (0.18 + (particle % 6) * 0.12);
        builder.circle(
          victimCenter.x + Math.cos(angle) * distance,
          victimCenter.y + Math.sin(angle) * distance,
          layout.size * (0.016 + (particle % 4) * 0.009) * fade,
          victimIndex % 2 === 0
            ? [1, 0.76, 0.2, fade * pressure]
            : [1, 0.28, 0.08, fade * pressure],
          7,
        );
      }
    });
  }

  if (move.spawned && elapsed >= 0 && elapsed <= 1_900) {
    const progress = phaseBetween(elapsed, 0, 1_900);
    const pulse = Math.sin(progress * Math.PI);
    for (let ring = 0; ring < 4; ring += 1) {
      const ringPhase = (progress * 1.5 + ring * 0.2) % 1;
      builder.ring(
        center.x,
        center.y,
        layout.size * (0.14 + ringPhase * 0.62),
        Math.max(1, layout.size * 0.028),
        [own[0], own[1], own[2], (1 - ringPhase) * pulse * 0.7],
      );
    }
    builder.circle(center.x, center.y, layout.size * (0.08 + pulse * 0.26), [1, 0.94, 0.68, pulse * 0.42], 18);
  }

  if (move.promoted && elapsed >= 120 && elapsed <= 2_150) {
    const progress = phaseBetween(elapsed, 120, 2_030);
    const fade = Math.sin(progress * Math.PI);
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2 + progress * 0.9;
      builder.line(
        { x: center.x + Math.cos(angle) * layout.size * 0.18, y: center.y + Math.sin(angle) * layout.size * 0.18 },
        { x: center.x + Math.cos(angle) * layout.size * (0.5 + progress * 0.42), y: center.y + Math.sin(angle) * layout.size * (0.5 + progress * 0.42) },
        Math.max(1, layout.size * 0.022),
        [1, 0.84, 0.28, fade * 0.76],
      );
    }
    builder.ring(center.x, center.y, layout.size * (0.22 + progress * 0.54), Math.max(1, layout.size * 0.035), [own[0], own[1], own[2], fade * 0.88]);
  }
}

function drawZombieEffects(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const effects = props.state.lastMove?.zombieEffects ?? [];
  const elapsed = time - props.animationStart;
  if (!effects.length || elapsed < 0 || elapsed > 2_100) return;
  const progress = phaseBetween(elapsed, 0, 2_100);
  const fade = Math.max(0, 1 - progress);
  effects.forEach((effect, effectIndex) => {
    const from = layout.centers.get(coordKey(effect.from));
    const to = layout.centers.get(coordKey(effect.to));
    if (!from || !to) return;
    const colony = hexToColor(playerColor(props.state, effect.playerId));
    if (effect.kind === "move" || effect.kind === "bite") {
      const travel = smoothstep(Math.min(1, progress * 2.6));
      const x = from.x + (to.x - from.x) * travel;
      const y = from.y + (to.y - from.y) * travel;
      builder.line(
        from,
        { x, y },
        Math.max(1, layout.size * 0.07 * fade),
        [0.58, 1, 0.16, fade * 0.76],
      );
      builder.circle(x, y, layout.size * (0.05 + fade * 0.08), [colony[0], colony[1], colony[2], fade * 0.58], 14);
      if (effect.kind === "bite") {
        for (let tooth = 0; tooth < 8; tooth += 1) {
          const angle = (tooth / 8) * Math.PI * 2 + effectIndex * 0.31;
          builder.line(
            { x: to.x + Math.cos(angle) * layout.size * 0.08, y: to.y + Math.sin(angle) * layout.size * 0.08 },
            { x: to.x + Math.cos(angle) * layout.size * (0.18 + progress * 0.22), y: to.y + Math.sin(angle) * layout.size * (0.18 + progress * 0.22) },
            Math.max(1, layout.size * 0.025),
            [1, 0.18, 0.25, fade * 0.9],
          );
        }
      }
      return;
    }
    const tightRadius =
      effect.kind === "spawn"
        ? layout.size * (0.12 + progress * 0.62)
        : layout.size * (0.62 - progress * 0.48);
    builder.ring(
      to.x,
      to.y,
      Math.max(layout.size * 0.08, tightRadius),
      Math.max(1, layout.size * (0.06 - progress * 0.035)),
      effect.kind === "spawn"
        ? [0.55, 1, 0.18, fade * 0.88]
        : [1, 0.12, 0.3, fade * 0.92],
    );
    for (let particle = 0; particle < 12; particle += 1) {
      const angle = (particle / 12) * Math.PI * 2 + effectIndex * 0.47;
      const distance = layout.size * progress * (0.12 + (particle % 4) * 0.1);
      builder.circle(
        to.x + Math.cos(angle) * distance,
        to.y + Math.sin(angle) * distance,
        layout.size * 0.025 * fade,
        effect.kind === "spawn" ? [0.65, 1, 0.2, fade] : [1, 0.22, 0.38, fade],
        8,
      );
    }
  });
}

function drawRoyalCocoonEffects(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const pairs = activeRoyalCocoons(props.state.pieces);
  if (!pairs.length) return;
  const elapsed = time - props.animationStart;
  pairs.forEach((pair) => {
    const kingCenter = layout.centers.get(coordKey(pair.king));
    const queenCenter = layout.centers.get(coordKey(pair.queen));
    if (!kingCenter || !queenCenter) return;
    const color = hexToColor(playerColor(props.state, pair.playerId));
    const pulse = 0.78 + Math.sin(time * 0.0042 + pair.playerId) * 0.16;
    const midpoint = {
      x: (kingCenter.x + queenCenter.x) / 2,
      y: (kingCenter.y + queenCenter.y) / 2,
    };

    BOARD_CELLS.forEach((cell) => {
      const distance = Math.min(
        hexDistance(cell, pair.king),
        hexDistance(cell, pair.queen),
      );
      if (distance > ROYAL_COCOON_RADIUS) return;
      const center = layout.centers.get(coordKey(cell));
      if (!center) return;
      builder.hex(
        center.x,
        center.y,
        layout.size * 0.9,
        [color[0], color[1], color[2], 0.72 + pulse * 0.06],
      );
      builder.hexRing(
        center.x,
        center.y,
        layout.size * 0.9,
        Math.max(0.7, layout.size * 0.014),
        [0.025, 0.04, 0.075, 0.44],
      );
      if (distance === ROYAL_COCOON_RADIUS) {
        builder.hexRing(
          center.x,
          center.y,
          layout.size * 0.9,
          Math.max(1.8, layout.size * 0.06),
          [1, 0.87, 0.48, 0.9 + pulse * 0.08],
        );
      }
    });

    const pairDistance = Math.hypot(
      kingCenter.x - queenCenter.x,
      kingCenter.y - queenCenter.y,
    );
    const shellRadiusX = pairDistance * 0.56 + layout.size * 0.64;
    const shellRadiusY = layout.size * (0.7 + pulse * 0.04);
    builder.ellipse(
      midpoint.x,
      midpoint.y,
      shellRadiusX,
      shellRadiusY,
      Math.atan2(
        queenCenter.y - kingCenter.y,
        queenCenter.x - kingCenter.x,
      ),
      [color[0], color[1], color[2], 0.98],
      34,
    );
    builder.ellipse(
      midpoint.x,
      midpoint.y,
      shellRadiusX * 0.84,
      shellRadiusY * 0.8,
      Math.atan2(
        queenCenter.y - kingCenter.y,
        queenCenter.x - kingCenter.x,
      ),
      [0.018, 0.03, 0.065, 0.9],
      34,
    );
    for (let thread = 0; thread < 22; thread += 1) {
      const startPhase =
        (thread / 22) * Math.PI * 2 + Math.sin(time * 0.0016 + thread) * 0.16;
      const endPhase = startPhase + Math.PI * (0.82 + (thread % 5) * 0.09);
      const start = {
        x: midpoint.x + Math.cos(startPhase) * shellRadiusX,
        y: midpoint.y + Math.sin(startPhase) * shellRadiusY,
      };
      const end = {
        x: midpoint.x + Math.cos(endPhase) * shellRadiusX,
        y: midpoint.y + Math.sin(endPhase) * shellRadiusY,
      };
      builder.line(
        start,
        end,
        Math.max(0.65, layout.size * (0.009 + (thread % 3) * 0.004)),
        thread % 4 === 0
          ? [1, 0.95, 0.72, 0.86]
          : [color[0], color[1], color[2], 0.72],
      );
    }

    const startEffect = props.state.lastMove?.royalCocoonEffects?.find(
      (effect) =>
        effect.kind === "started" &&
        effect.kingId === pair.king.id &&
        effect.queenId === pair.queen.id,
    );
    const showcaseElapsed = startEffect
      ? Math.max(0, Math.min(ROYAL_COCOON_DURATION_MS, elapsed))
      : ROYAL_COCOON_DURATION_MS;
    if (startEffect && elapsed <= ROYAL_COCOON_DURATION_MS) {
      const cloudEnvelope = Math.max(0, 1 - elapsed / 3_400);
      for (let particle = 0; particle < 58; particle += 1) {
        const seed = hashUnit(`${startEffect.id}-dust-${particle}`);
        const angle = seed * Math.PI * 2 + elapsed * (0.0005 + (particle % 5) * 0.00012);
        const drift = layout.size * (0.3 + (particle % 11) * 0.075);
        const spread = Math.min(1, elapsed / 1_900);
        builder.circle(
          midpoint.x + Math.cos(angle) * drift * spread,
          midpoint.y + Math.sin(angle) * drift * 0.62 * spread -
            layout.size * spread * (particle % 4) * 0.025,
          layout.size * (0.015 + (particle % 4) * 0.009),
          particle % 5 === 0
            ? [1, 0.92, 0.48, cloudEnvelope * 0.9]
            : [0.72, 0.88, 1, cloudEnvelope * 0.64],
          8,
        );
      }
    }

    const bumpPhase = (showcaseElapsed % 1_250) / 1_250;
    const bumpOnQueen = Math.floor(showcaseElapsed / 1_250) % 2 === 1;
    const bumpBase = bumpOnQueen ? queenCenter : kingCenter;
    const bump = Math.sin(bumpPhase * Math.PI);
    builder.ellipse(
      bumpBase.x,
      bumpBase.y - layout.size * (0.54 + bump * 0.16),
      layout.size * (0.27 + bump * 0.18),
      layout.size * (0.16 + bump * 0.2),
      0,
      [1, 0.9, 0.55, 0.12 + bump * 0.42],
      24,
    );
    for (let marker = 0; marker < ROYAL_COCOON_TURNS; marker += 1) {
      builder.circle(
        midpoint.x + (marker - 1) * layout.size * 0.2,
        midpoint.y + layout.size * 0.72,
        layout.size * 0.055,
        marker < pair.turnsRemaining
          ? [1, 0.9, 0.44, 0.92]
          : [0.22, 0.28, 0.38, 0.5],
        10,
      );
    }
  });
}

function drawRoyalResolutionEffects(
  builder: VertexBuilder,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const elapsed = time - props.animationStart;
  const sacrifice = props.state.lastMove?.royalSacrifice;
  if (sacrifice && elapsed >= 0 && elapsed <= ROYAL_SACRIFICE_DURATION_MS) {
    const center = layout.centers.get(coordKey(sacrifice.coord));
    if (center) {
      const tension = phaseBetween(elapsed, 0, 1_050);
      const progress = phaseBetween(elapsed, 900, 2_100);
      const fade = 1 - progress;
      const color = hexToColor(
        playerColor(props.state, sacrifice.playerId),
      );
      if (elapsed < 1_260) {
        const victim: Piece = {
          id: sacrifice.pieceId,
          playerId: sacrifice.playerId,
          type: sacrifice.pieceType,
          level: sacrifice.pieceType === "queen" ? 3 : 1,
          queenBonded: sacrifice.pieceType === "queen",
          ...sacrifice.coord,
        };
        drawPiece(
          builder,
          victim,
          center.x + Math.sin(elapsed * 0.065) * layout.size * 0.045 * tension,
          center.y + Math.cos(elapsed * 0.079) * layout.size * 0.03 * tension,
          layout.size * (0.82 + tension * 0.08),
          false,
          false,
          false,
          time,
          false,
          playerColor(props.state, sacrifice.playerId),
        );
      }
      const flash = Math.max(0, 1 - Math.abs(elapsed - 1_050) / 220);
      builder.circle(center.x, center.y, layout.size * (0.08 + flash * 0.66), [1, 0.96, 0.78, flash * 0.92], 24);
      builder.ring(
        center.x,
        center.y,
        layout.size * (0.12 + progress * 0.92),
        Math.max(1, layout.size * 0.075 * fade),
        [color[0], color[1], color[2], fade * 0.9],
      );
      for (let particle = 0; particle < 34; particle += 1) {
        const angle =
          (particle / 34) * Math.PI * 2 + hashUnit(`${sacrifice.pieceId}-${particle}`);
        const distance = layout.size * progress * (0.32 + (particle % 7) * 0.11);
        builder.circle(
          center.x + Math.cos(angle) * distance,
          center.y + Math.sin(angle) * distance + layout.size * progress * progress * 0.13,
          layout.size * (0.025 + (particle % 4) * 0.012) * fade,
          particle % 2 === 0
            ? [color[0], color[1], color[2], fade]
            : [1, 0.78, 0.24, fade],
          9,
        );
      }
    }
  }

  (props.state.lastMove?.royalExitEffects ?? []).forEach((effect) => {
    const center = layout.centers.get(coordKey(effect.coord));
    const duration = effect.kind === "escape"
      ? ROYAL_ESCAPE_DURATION_MS
      : ROYAL_FIREWORKS_DURATION_MS;
    if (!center || elapsed < 0 || elapsed > duration) return;
    const own = hexToColor(playerColor(props.state, effect.playerId));
    if (effect.kind === "escape") {
      const progress = phaseBetween(elapsed, 0, 5_650);
      const opening = Math.sin(Math.min(1, progress * 1.25) * Math.PI * 0.5);
      const fade = Math.max(0, 1 - phaseBetween(elapsed, 5_250, 900));
      builder.ellipse(
        center.x,
        center.y + layout.size * 0.13,
        layout.size * (0.12 + opening * 0.62),
        layout.size * (0.05 + opening * 0.25),
        0,
        [0.005, 0.008, 0.015, 0.92 * fade],
        30,
      );
      for (let ring = 0; ring < 6; ring += 1) {
        const ringPhase = (progress * 3.2 + ring / 6) % 1;
        builder.ring(
          center.x,
          center.y + layout.size * 0.1,
          layout.size * (0.14 + ringPhase * 0.72),
          Math.max(1, layout.size * (0.018 + (ring % 2) * 0.012)),
          [own[0], own[1], own[2], (1 - ringPhase) * 0.7 * fade],
        );
      }
      for (let particle = 0; particle < 42; particle += 1) {
        const phase = (progress * 3.8 + particle / 42) % 1;
        const angle = time * 0.008 + particle * 2.17;
        const radius = layout.size * (0.78 * (1 - phase) + 0.04);
        builder.circle(
          center.x + Math.cos(angle) * radius,
          center.y + layout.size * 0.1 + Math.sin(angle) * radius * 0.42,
          layout.size * (0.018 + (particle % 4) * 0.009),
          particle % 5 === 0
            ? [1, 0.86, 0.34, phase * 0.85 * fade]
            : [own[0], own[1], own[2], phase * 0.8 * fade],
          8,
        );
      }
      if (elapsed < 5_250) {
        const kingProgress = phaseBetween(elapsed, 480, 4_770);
        const kingScale = Math.max(0.04, 1 - kingProgress * 0.94);
        const orbit = kingProgress * Math.PI * 12;
        const fakeKing: Piece = {
          id: `${effect.id}-king`,
          playerId: effect.playerId,
          type: "king",
          level: 4,
          ...effect.coord,
        };
        drawPiece(
          builder,
          fakeKing,
          center.x + Math.cos(orbit) * layout.size * (0.24 - kingProgress * 0.12),
          center.y - layout.size * kingProgress * 0.08,
          layout.size * 0.82 * kingScale,
          false,
          false,
          false,
          time + kingProgress * 4_600,
          false,
          playerColor(props.state, effect.playerId),
        );
      }
      return;
    }

    const opponent = hexToColor(
      playerColor(props.state, effect.opponentId ?? effect.playerId),
    );
    if (elapsed < 1_350) {
      const warning = phaseBetween(elapsed, 0, 1_350);
      const fakeKing: Piece = {
        id: `${effect.id}-doomed-king`,
        playerId: effect.playerId,
        type: "king",
        level: 4,
        ...effect.coord,
      };
      drawPiece(
        builder,
        fakeKing,
        center.x + Math.sin(elapsed * 0.09) * layout.size * 0.045 * warning,
        center.y + Math.cos(elapsed * 0.07) * layout.size * 0.03 * warning,
        layout.size * (0.82 + warning * 0.1),
        false,
        true,
        false,
        time,
        false,
        playerColor(props.state, effect.playerId),
      );
    }
    const centralFlash = Math.max(0, 1 - Math.abs(elapsed - 1_180) / 320);
    builder.circle(center.x, center.y, layout.size * (0.1 + centralFlash * 0.92), [1, 0.98, 0.84, centralFlash * 0.96], 30);
    for (let burst = 0; burst < 5; burst += 1) {
      const local = phaseBetween(elapsed, 1_050 + burst * 850, 2_600);
      if (local <= 0 || local >= 1) continue;
      const fade = 1 - local;
      const side = burst - 2;
      const originX = center.x + side * layout.size * 0.24;
      const originY = center.y - (burst % 3) * layout.size * 0.24;
      builder.ring(
        originX,
        originY,
        layout.size * (0.12 + local * (1.05 + burst * 0.08)),
        Math.max(1, layout.size * 0.055 * fade),
        burst % 2 === 0
          ? [own[0], own[1], own[2], fade * 0.9]
          : [opponent[0], opponent[1], opponent[2], fade * 0.9],
      );
      for (let particle = 0; particle < 46; particle += 1) {
        const angle =
          (particle / 46) * Math.PI * 2 + burst * 0.57 + hashUnit(`${effect.id}-${burst}-${particle}`) * 0.3;
        const distance =
          layout.size * local * (0.54 + (particle % 9) * 0.1 + burst * 0.05);
        const color = particle % 5 === 0 ? ([1, 0.9, 0.4, 1] as RGBA) : particle % 2 === 0 ? own : opponent;
        builder.circle(
          originX + Math.cos(angle) * distance,
          originY + Math.sin(angle) * distance + layout.size * local * local * 0.22,
          layout.size * (0.028 + (particle % 5) * 0.011) * fade,
          [color[0], color[1], color[2], fade],
          9,
        );
      }
    }
  });
}

function buildScene(
  props: SceneProps,
  layout: Layout,
  time: number,
  reusableBuilder?: VertexBuilder,
): VertexBuilder {
  const builder = reusableBuilder ?? new VertexBuilder(layout.width, layout.height);
  builder.reset(layout.width, layout.height);
  drawWaterAndCliffs(builder, layout, time);
  const legal = new Set(props.legalTargets.map(coordKey));
  const territoryOwners = new Map<string, PlayerId[]>();
  Object.entries(props.territories).forEach(([playerId, territory]) => {
    territory?.cells.forEach((cell) => {
      const key = coordKey(cell);
      territoryOwners.set(key, [
        ...(territoryOwners.get(key) ?? []),
        Number(playerId) as PlayerId,
      ]);
    });
  });

  BOARD_CELLS.forEach((cell) => {
    const center = layout.centers.get(coordKey(cell))!;
    const richness = cellRichness(cell);
    const warmth = richness / MAX_CELL_RICHNESS;
    const fill: RGBA = [
      0.045 + warmth * 0.055,
      0.065 + warmth * 0.04,
      0.11 + warmth * 0.02,
      1,
    ];
    builder.hex(
      center.x,
      center.y,
      layout.size * 0.965,
      fill,
      [0.19 + warmth * 0.1, 0.22 + warmth * 0.08, 0.31, 0.82],
    );
    const centerDistance = hexDistance(cell, { q: 0, r: 0 });
    if (centerDistance <= 1) {
      const corePulse = 0.72 + (Math.sin(time * 0.0023) + 1) * 0.14;
      builder.hexRing(
        center.x,
        center.y,
        layout.size * (centerDistance === 0 ? 0.88 : 0.82),
        layout.size * (centerDistance === 0 ? 0.085 : 0.045),
        [1, 0.78, 0.27, (centerDistance === 0 ? 0.9 : 0.48) * corePulse],
      );
    }
    const owners = territoryOwners.get(coordKey(cell)) ?? [];
    owners.forEach((owner) => {
      const strength = richness / MAX_CELL_RICHNESS;
      const sharedTerritory = owners.length > 1 ? 0.66 : 1;
      const wave =
        (Math.sin(
          time * (0.0015 + strength * 0.0008) +
            cell.q * 0.73 +
            cell.r * 0.41,
        ) +
          1) /
        2;
      const pulse = 0.82 + wave * (0.12 + strength * 0.24);
      const territoryColor = playerColor(props.state, owner);
      const auraColor = lighten(
        hexToColor(territoryColor),
        0.04 + strength * 0.18,
      );
      builder.hex(
        center.x,
        center.y,
        layout.size * 0.91,
        [
          auraColor[0],
          auraColor[1],
          auraColor[2],
          (0.05 + strength * 0.34) * sharedTerritory * pulse,
        ],
      );
      builder.hexRing(
        center.x,
        center.y,
        layout.size * 0.945,
        layout.size * (0.055 + strength * 0.055),
        [
          auraColor[0],
          auraColor[1],
          auraColor[2],
          (0.18 + strength * 0.68) * sharedTerritory * pulse,
        ],
      );
      builder.hexRing(
        center.x,
        center.y,
        layout.size * 0.76,
        layout.size * (0.012 + strength * 0.02),
        [
          auraColor[0],
          auraColor[1],
          auraColor[2],
          (0.08 + strength * 0.3) * sharedTerritory * pulse,
        ],
      );
      builder.circle(
        center.x,
        center.y,
        layout.size * (0.08 + strength * 0.08),
        [
          auraColor[0],
          auraColor[1],
          auraColor[2],
          (0.06 + strength * 0.2) * sharedTerritory * pulse,
        ],
        18,
      );
    });
    if (legal.has(coordKey(cell))) {
      const pulse = 0.12 + Math.sin(time * 0.008) * 0.025;
      builder.circle(
        center.x,
        center.y,
        layout.size * (0.13 + pulse),
        [0.93, 0.97, 1, 0.26],
      );
      builder.ring(
        center.x,
        center.y,
        layout.size * 0.47,
        layout.size * 0.04,
        [0.83, 0.94, 1, 0.78],
      );
    }
  });

  drawKingTerritorySignals(builder, props, layout, time);

  Object.entries(props.territories).forEach(([playerId, territory]) => {
    if (!territory || territory.hull.length < 3) return;
    const color = hexToColor(playerColor(props.state, Number(playerId) as PlayerId), 0.42);
    territory.hull.forEach((cell, index) => {
      const a = layout.centers.get(coordKey(cell));
      const b = layout.centers.get(
        coordKey(territory.hull[(index + 1) % territory.hull.length]),
      );
      if (a && b) builder.line(a, b, Math.max(1.3, layout.size * 0.026), color);
    });
  });

  const center = layout.centers.get("0,0")!;
  const crystalSize = layout.size * (0.34 + Math.sin(time * 0.003) * 0.025);
  builder.polygon(
    [
      { x: center.x, y: center.y - crystalSize },
      { x: center.x + crystalSize * 0.48, y: center.y },
      { x: center.x, y: center.y + crystalSize },
      { x: center.x - crystalSize * 0.48, y: center.y },
    ],
    [1, 0.78, 0.26, 0.88],
  );

  if (props.state.lastMove) {
    const start = layout.centers.get(coordKey(props.state.lastMove.from));
    const end = layout.centers.get(coordKey(props.state.lastMove.to));
    if (start && end) {
      builder.line(start, end, Math.max(2, layout.size * 0.05), [1, 1, 1, 0.15]);
    }
  }

  drawQueenSpawnZones(builder, props, layout, time);
  drawPawnSignals(builder, props, layout, time);
  drawColonyVibration(builder, props, layout, time);
  drawAcidDuel(builder, props, layout, time);
  drawHatchBursts(builder, props, layout, time);
  drawMoveOutcomeEffects(builder, props, layout, time);
  drawZombieEffects(builder, props, layout, time);

  props.state.pieces.forEach((piece, index) => {
    const target = layout.centers.get(coordKey(piece));
    if (!target) return;
    let x = target.x;
    let y = target.y;
    const sacrificeDelay = props.state.lastMove?.royalSacrifice &&
      props.state.lastMove.pieceId === piece.id
      ? 1_050
      : 0;
    const movementDuration =
      piece.type === "queen" ? 720 : piece.type === "pawn" ? 420 : 560;
    const progress = Math.min(
      1,
      Math.max(0, (time - props.animationStart - sacrificeDelay) / movementDuration),
    );
    const eased = 1 - Math.pow(1 - progress, 3);
    if (
      props.state.lastMove?.pieceId === piece.id &&
      progress < 1
    ) {
      const source = layout.centers.get(coordKey(props.state.lastMove.from));
      if (source) {
        x = source.x + (target.x - source.x) * eased;
        const jumpHeight =
          piece.type === "queen"
            ? 0.86
            : piece.type === "pawn"
              ? 0.09
              : 0.17;
        y =
          source.y +
          (target.y - source.y) * eased -
          Math.sin(progress * Math.PI) * layout.size * jumpHeight;
        if (piece.type === "pawn") {
          x += Math.sin(progress * Math.PI * 8) * layout.size * 0.025;
        }
      }
    }
    const vibration = pieceVibrationOffset(
      piece,
      props.colonySignal,
      time,
      layout.size,
    );
    x += vibration.x;
    y += vibration.y;
    const checked = piece.type === "king" && isInCheck(props.state.pieces, piece.playerId);
    const player = props.state.players.find(
      (candidate) => candidate.id === piece.playerId,
    );
    const ownKingAlive = props.state.pieces.some(
      (candidate) =>
        candidate.playerId === piece.playerId && candidate.type === "king",
    );
    const spawnCapable =
      piece.type === "queen" &&
      Boolean(piece.queenBonded) &&
      ownKingAlive &&
      queenSpawnCells(props.state.pieces, piece).length > 0 &&
      (player?.resources ?? 0) >= EGG_RESOURCE_COST;
    drawPiece(
      builder,
      piece,
      x,
      y,
      layout.size *
        (0.82 +
          Math.sin(time * 0.0018 + index) * 0.006 +
          vibration.intensity * (piece.type === "king" ? 0.018 : 0.01)),
      props.selectedPieceId === piece.id,
      checked,
      props.checkingPieceIds.includes(piece.id),
      time,
      spawnCapable,
      playerColor(props.state, piece.playerId),
    );
  });
  drawRoyalCocoonEffects(builder, props, layout, time);
  drawRoyalResolutionEffects(builder, props, layout, time);
  return builder;
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader indisponible");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Erreur shader");
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = createShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
      in vec2 a_position;
      in vec4 a_color;
      out vec4 v_color;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_color = a_color;
      }`,
  );
  const fragment = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
      precision mediump float;
      in vec4 v_color;
      out vec4 outColor;
      void main() { outColor = v_color; }`,
  );
  const program = gl.createProgram();
  if (!program) throw new Error("Programme WebGL indisponible");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Erreur de liaison WebGL");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function drawCanvasColonyVibration(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const signal = props.colonySignal;
  if (!signal) return;
  const elapsed = time - signal.startedAt;
  if (elapsed < 0 || elapsed > 2900) return;
  const sourcePiece = props.state.pieces.find(
    (piece) => piece.id === signal.sourcePieceId,
  );
  if (!sourcePiece) return;
  const source = layout.centers.get(coordKey(sourcePiece));
  if (!source) return;
  const color = playerColor(props.state, signal.playerId);
  if (signal.kind === "egg") {
    const relayPieces = (signal.relayPieceIds ?? [])
      .map((pieceId) => props.state.pieces.find((piece) => piece.id === pieceId))
      .filter((piece): piece is Piece => Boolean(piece));
    const chain = [sourcePiece, ...relayPieces];
    context.save();
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = layout.size * 0.16;
    context.lineCap = "round";
    for (let index = 0; index < chain.length - 1; index += 1) {
      const from = layout.centers.get(coordKey(chain[index]));
      const to = layout.centers.get(coordKey(chain[index + 1]));
      if (!from || !to) continue;
      const delay = 170 + index * 245;
      const progress = Math.max(0, Math.min(1, (elapsed - delay) / 330));
      if (progress <= 0) continue;
      const headX = from.x + (to.x - from.x) * progress;
      const headY = from.y + (to.y - from.y) * progress;
      context.globalAlpha = 0.58;
      context.lineWidth = Math.max(1, layout.size * 0.025);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(headX, headY);
      context.stroke();
      context.globalAlpha = 0.74;
      context.beginPath();
      context.arc(headX, headY, layout.size * 0.12, 0, Math.PI * 2);
      context.stroke();
      if (progress === 1) {
        const relayPulse = signalEnvelope(elapsed, delay + 250, 650);
        context.globalAlpha = relayPulse * 0.62;
        context.beginPath();
        context.arc(
          to.x,
          to.y,
          layout.size * (0.28 + relayPulse * 0.26),
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
    }
    context.restore();
    return;
  }
  const targets = props.state.pieces.filter(
    (piece) =>
      piece.playerId === signal.playerId &&
      (piece.type === "king" || piece.type === "queen"),
  );
  context.save();
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = layout.size * 0.18;
  const sourceEnvelope = signalEnvelope(elapsed, 0, 820);
  if (sourceEnvelope > 0) {
    context.globalAlpha = sourceEnvelope * 0.64;
    context.lineWidth = Math.max(1, layout.size * 0.022);
    context.beginPath();
    context.arc(
      source.x,
      source.y,
      layout.size * (0.36 + sourceEnvelope * 0.38),
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  targets.forEach((target) => {
    const destination = layout.centers.get(coordKey(target));
    if (!destination) return;
    const delay = target.type === "king" ? 260 : 590;
    const travelDuration = target.type === "king" ? 650 : 820;
    const progress = Math.max(
      0,
      Math.min(1, (elapsed - delay) / travelDuration),
    );
    if (progress > 0 && progress < 1) {
      context.globalAlpha = 0.15;
      context.lineWidth = Math.max(1, layout.size * 0.012);
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(destination.x, destination.y);
      context.stroke();
      context.globalAlpha = 0.66 * Math.sin(progress * Math.PI);
      context.beginPath();
      context.arc(
        source.x + (destination.x - source.x) * progress,
        source.y + (destination.y - source.y) * progress,
        layout.size * 0.075,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    const response = signalEnvelope(
      elapsed,
      delay + travelDuration - 80,
      target.type === "king" ? 1020 : 1380,
    );
    if (response > 0) {
      context.globalAlpha = response * 0.5;
      context.lineWidth = Math.max(
        1,
        layout.size * (target.type === "king" ? 0.028 : 0.018),
      );
      context.beginPath();
      context.arc(
        destination.x,
        destination.y,
        layout.size *
          (target.type === "king"
            ? 0.58 + Math.sin(elapsed * 0.018) * 0.07
            : 0.52 + Math.sin(elapsed * 0.041) * 0.045),
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  });
  context.restore();
}

function drawCanvasAcidDuel(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const lastMove = props.state.lastMove;
  if (!lastMove?.acidVictimCoord) return;
  const elapsed = time - props.animationStart;
  if (elapsed < 80 || elapsed > 980) return;
  const progress = Math.max(0, Math.min(1, (elapsed - 80) / 900));
  const envelope = Math.sin(progress * Math.PI);
  const source = layout.centers.get(coordKey(lastMove.to));
  const victim = layout.centers.get(coordKey(lastMove.acidVictimCoord));
  if (!source || !victim) return;
  context.save();
  context.strokeStyle = "#9dff3c";
  context.fillStyle = "#c8ff68";
  context.shadowColor = "#75ff2c";
  context.shadowBlur = layout.size * 0.24;
  context.globalAlpha = 0.25 + envelope * 0.72;
  context.lineWidth = Math.max(2, layout.size * (0.035 + envelope * 0.085));
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.lineTo(victim.x, victim.y);
  context.stroke();
  [0, 0.17, 0.34].forEach((trail, index) => {
    const local = Math.max(0, Math.min(1, progress * 1.4 - trail));
    if (!local) return;
    context.beginPath();
    context.arc(
      source.x + (victim.x - source.x) * local,
      source.y + (victim.y - source.y) * local,
      layout.size * (0.055 - index * 0.009),
      0,
      Math.PI * 2,
    );
    context.fill();
  });
  context.globalAlpha = Math.max(0, 1 - progress) * 0.86;
  context.lineWidth = Math.max(1, layout.size * 0.026);
  context.beginPath();
  context.arc(
    victim.x,
    victim.y,
    layout.size * (0.18 + progress * 0.38),
    0,
    Math.PI * 2,
  );
  context.stroke();
  context.restore();
}

function drawCanvasHatchBursts(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const coords = props.state.lastMove?.hatchedCoords ?? [];
  if (!coords.length) return;
  const elapsed = time - props.animationStart;
  if (elapsed < 40 || elapsed > 920) return;
  const progress = Math.max(0, Math.min(1, (elapsed - 40) / 880));
  context.save();
  context.globalAlpha = Math.max(0, 1 - progress);
  context.strokeStyle = playerColor(
    props.state,
    props.state.lastMove!.playerId,
  );
  context.fillStyle = "#ffe56c";
  context.shadowColor = "#ffe56c";
  context.shadowBlur = layout.size * 0.18;
  coords.forEach((coord, coordIndex) => {
    const center = layout.centers.get(coordKey(coord));
    if (!center) return;
    context.lineWidth = Math.max(1, layout.size * 0.032);
    context.beginPath();
    context.arc(
      center.x,
      center.y,
      layout.size * (0.16 + progress * 0.48),
      0,
      Math.PI * 2,
    );
    context.stroke();
    for (let particle = 0; particle < 7; particle += 1) {
      const angle = (particle / 7) * Math.PI * 2 + coordIndex * 0.37;
      context.beginPath();
      context.arc(
        center.x + Math.cos(angle) * layout.size * progress * 0.52,
        center.y + Math.sin(angle) * layout.size * progress * 0.52,
        layout.size * 0.04,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  });
  context.restore();
}

function drawCanvasMoveOutcomeEffects(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const move = props.state.lastMove;
  if (!move) return;
  const center = layout.centers.get(coordKey(move.to));
  if (!center) return;
  const elapsed = time - props.animationStart;
  const ownColor = playerColor(props.state, move.playerId);
  context.save();
  context.globalCompositeOperation = "lighter";

  if (move.capturedType && elapsed >= 150 && elapsed <= 1_650) {
    const progress = phaseBetween(elapsed, 150, 1_500);
    const fade = 1 - progress;
    const shell = move.capturedType === "egg";
    context.globalAlpha = fade;
    context.strokeStyle = shell ? "#fff0ad" : "#ff5c47";
    context.lineWidth = Math.max(1, layout.size * 0.05 * fade);
    context.beginPath();
    context.arc(center.x, center.y, layout.size * (0.1 + progress * (shell ? 0.7 : 0.46)), 0, Math.PI * 2);
    context.stroke();
    for (let particle = 0; particle < (shell ? 22 : 14); particle += 1) {
      const angle = (particle / (shell ? 22 : 14)) * Math.PI * 2 + hashUnit(`${move.pieceId}-canvas-impact-${particle}`);
      const distance = layout.size * progress * (0.2 + (particle % 6) * 0.11);
      context.fillStyle = shell
        ? particle % 3 === 0 ? "#a9ff68" : "#fff0ad"
        : "#ff5c47";
      context.beginPath();
      context.arc(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance + layout.size * progress * progress * 0.16, layout.size * (0.018 + (particle % 4) * 0.01) * fade, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (move.eggBlast && elapsed >= 80 && elapsed <= 2_350) {
    const progress = phaseBetween(elapsed, 80, 2_270);
    const fade = Math.max(0, 1 - progress);
    const pressure = Math.sin(Math.min(1, progress * 1.35) * Math.PI);
    context.shadowColor = "#ff8b24";
    context.shadowBlur = layout.size * 0.34;
    for (let ring = 0; ring < 3; ring += 1) {
      const ringProgress = Math.max(
        0,
        Math.min(1, progress * 1.35 - ring * 0.12),
      );
      context.globalAlpha = (1 - ringProgress) * 0.86;
      context.strokeStyle = ring % 2 === 0 ? "#ff7318" : "#ffd350";
      context.lineWidth = Math.max(
        1,
        layout.size * (0.07 - ring * 0.014) * (1 - ringProgress),
      );
      context.beginPath();
      context.arc(
        center.x,
        center.y,
        layout.size * (0.18 + ringProgress * 1.92),
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    neighbors(move.eggBlast.center).forEach((coord, index) => {
      const adjacent = layout.centers.get(coordKey(coord));
      if (!adjacent) return;
      const arrival = Math.max(0, Math.min(1, progress * 1.8 - index * 0.025));
      const pulse = Math.sin(arrival * Math.PI);
      context.globalAlpha = pulse * fade * 0.92;
      context.strokeStyle = "#ffd24a";
      context.lineWidth = Math.max(1, layout.size * 0.035 * pulse);
      context.beginPath();
      context.arc(
        adjacent.x,
        adjacent.y,
        layout.size * (0.12 + arrival * 0.54),
        0,
        Math.PI * 2,
      );
      context.stroke();
    });
    move.eggBlast.victims.forEach((victim) => {
      const victimCenter = layout.centers.get(coordKey(victim.coord));
      if (!victimCenter) return;
      for (let particle = 0; particle < 18; particle += 1) {
        const angle =
          (particle / 18) * Math.PI * 2 +
          hashUnit(`${victim.pieceId}-canvas-blast-${particle}`) * 0.8;
        const distance =
          layout.size * progress * (0.18 + (particle % 6) * 0.12);
        context.globalAlpha = fade * pressure;
        context.fillStyle = particle % 3 === 0 ? "#fff09b" : "#ff5a16";
        context.beginPath();
        context.arc(
          victimCenter.x + Math.cos(angle) * distance,
          victimCenter.y + Math.sin(angle) * distance,
          layout.size * (0.016 + (particle % 4) * 0.009) * fade,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    });
  }

  if (move.spawned && elapsed >= 0 && elapsed <= 1_900) {
    const progress = phaseBetween(elapsed, 0, 1_900);
    const pulse = Math.sin(progress * Math.PI);
    context.strokeStyle = ownColor;
    context.shadowColor = ownColor;
    context.shadowBlur = layout.size * 0.25;
    for (let ring = 0; ring < 4; ring += 1) {
      const ringPhase = (progress * 1.5 + ring * 0.2) % 1;
      context.globalAlpha = (1 - ringPhase) * pulse * 0.72;
      context.lineWidth = Math.max(1, layout.size * 0.028);
      context.beginPath();
      context.arc(center.x, center.y, layout.size * (0.14 + ringPhase * 0.62), 0, Math.PI * 2);
      context.stroke();
    }
  }

  if (move.promoted && elapsed >= 120 && elapsed <= 2_150) {
    const progress = phaseBetween(elapsed, 120, 2_030);
    context.globalAlpha = Math.sin(progress * Math.PI);
    context.strokeStyle = "#ffd64e";
    context.shadowColor = "#ffd64e";
    context.shadowBlur = layout.size * 0.28;
    context.lineWidth = Math.max(1, layout.size * 0.022);
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2 + progress * 0.9;
      context.beginPath();
      context.moveTo(center.x + Math.cos(angle) * layout.size * 0.18, center.y + Math.sin(angle) * layout.size * 0.18);
      context.lineTo(center.x + Math.cos(angle) * layout.size * (0.5 + progress * 0.42), center.y + Math.sin(angle) * layout.size * (0.5 + progress * 0.42));
      context.stroke();
    }
  }

  context.restore();
}

function drawCanvasZombieEffects(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const effects = props.state.lastMove?.zombieEffects ?? [];
  const elapsed = time - props.animationStart;
  if (!effects.length || elapsed < 0 || elapsed > 2_100) return;
  const progress = phaseBetween(elapsed, 0, 2_100);
  const fade = Math.max(0, 1 - progress);
  context.save();
  context.globalCompositeOperation = "lighter";
  effects.forEach((effect, effectIndex) => {
    const from = layout.centers.get(coordKey(effect.from));
    const to = layout.centers.get(coordKey(effect.to));
    if (!from || !to) return;
    if (effect.kind === "move" || effect.kind === "bite") {
      const travel = smoothstep(Math.min(1, progress * 2.6));
      const x = from.x + (to.x - from.x) * travel;
      const y = from.y + (to.y - from.y) * travel;
      context.globalAlpha = fade * 0.78;
      context.strokeStyle = "#9dff32";
      context.shadowColor = "#9dff32";
      context.shadowBlur = layout.size * 0.2;
      context.lineWidth = Math.max(1, layout.size * 0.07 * fade);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(x, y);
      context.stroke();
      context.globalAlpha = fade * 0.72;
      context.lineWidth = Math.max(1, layout.size * 0.035);
      context.beginPath();
      context.arc(
        x,
        y,
        layout.size * (0.1 + Math.sin(progress * Math.PI) * 0.16),
        0,
        Math.PI * 2,
      );
      context.stroke();
      if (effect.kind === "bite") {
        context.strokeStyle = "#ff304b";
        for (let tooth = 0; tooth < 8; tooth += 1) {
          const angle = (tooth / 8) * Math.PI * 2 + effectIndex * 0.31;
          context.beginPath();
          context.moveTo(to.x + Math.cos(angle) * layout.size * 0.08, to.y + Math.sin(angle) * layout.size * 0.08);
          context.lineTo(to.x + Math.cos(angle) * layout.size * (0.18 + progress * 0.22), to.y + Math.sin(angle) * layout.size * (0.18 + progress * 0.22));
          context.stroke();
        }
      }
      return;
    }
    const radius =
      effect.kind === "spawn"
        ? layout.size * (0.12 + progress * 0.62)
        : layout.size * (0.62 - progress * 0.48);
    context.globalAlpha = fade * 0.9;
    context.strokeStyle = effect.kind === "spawn" ? "#a6ff38" : "#ff3157";
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = layout.size * 0.24;
    context.lineWidth = Math.max(1, layout.size * (0.06 - progress * 0.035));
    context.beginPath();
    context.arc(to.x, to.y, Math.max(layout.size * 0.08, radius), 0, Math.PI * 2);
    context.stroke();
    for (let particle = 0; particle < 12; particle += 1) {
      const angle = (particle / 12) * Math.PI * 2 + effectIndex * 0.47;
      const distance = layout.size * progress * (0.12 + (particle % 4) * 0.1);
      context.fillStyle = effect.kind === "spawn" ? "#b7ff4c" : "#ff3a63";
      context.beginPath();
      context.arc(
        to.x + Math.cos(angle) * distance,
        to.y + Math.sin(angle) * distance,
        layout.size * 0.025 * fade,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  });
  context.restore();
}

function drawCanvasRoyalCocoonEffects(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const pairs = activeRoyalCocoons(props.state.pieces);
  if (!pairs.length) return;
  const elapsed = time - props.animationStart;
  pairs.forEach((pair) => {
    const kingCenter = layout.centers.get(coordKey(pair.king));
    const queenCenter = layout.centers.get(coordKey(pair.queen));
    if (!kingCenter || !queenCenter) return;
    const color = playerColor(props.state, pair.playerId);
    const pulse = 0.78 + Math.sin(time * 0.0042 + pair.playerId) * 0.16;
    const midpoint = {
      x: (kingCenter.x + queenCenter.x) / 2,
      y: (kingCenter.y + queenCenter.y) / 2,
    };
    context.save();
    context.globalCompositeOperation = "source-over";
    BOARD_CELLS.forEach((cell) => {
      const distance = Math.min(
        hexDistance(cell, pair.king),
        hexDistance(cell, pair.queen),
      );
      if (distance > ROYAL_COCOON_RADIUS) return;
      const center = layout.centers.get(coordKey(cell));
      if (!center) return;
      context.beginPath();
      for (let corner = 0; corner < 6; corner += 1) {
        const angle = -Math.PI / 2 + (corner * Math.PI) / 3;
        const x = center.x + Math.cos(angle) * layout.size * 0.9;
        const y = center.y + Math.sin(angle) * layout.size * 0.9;
        if (corner === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.globalAlpha = 0.72 + pulse * 0.06;
      context.fillStyle = color;
      context.fill();
      context.globalAlpha = 0.44;
      context.strokeStyle = "#07101d";
      context.lineWidth = Math.max(0.7, layout.size * 0.014);
      context.stroke();
      if (distance === ROYAL_COCOON_RADIUS) {
        context.globalAlpha = 0.9 + pulse * 0.08;
        context.strokeStyle = "#ffe08a";
        context.lineWidth = Math.max(1.8, layout.size * 0.06);
        context.stroke();
      }
    });

    const pairDistance = Math.hypot(
      kingCenter.x - queenCenter.x,
      kingCenter.y - queenCenter.y,
    );
    const shellRadiusX = pairDistance * 0.56 + layout.size * 0.64;
    const shellRadiusY = layout.size * (0.7 + pulse * 0.04);
    const shellAngle = Math.atan2(
      queenCenter.y - kingCenter.y,
      queenCenter.x - kingCenter.x,
    );
    context.globalAlpha = 0.98;
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = layout.size * 0.3;
    context.beginPath();
    context.ellipse(
      midpoint.x,
      midpoint.y,
      shellRadiusX,
      shellRadiusY,
      shellAngle,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 0.9;
    context.fillStyle = "#050b18";
    context.beginPath();
    context.ellipse(
      midpoint.x,
      midpoint.y,
      shellRadiusX * 0.84,
      shellRadiusY * 0.8,
      shellAngle,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.shadowBlur = 0;
    context.lineCap = "round";
    for (let thread = 0; thread < 22; thread += 1) {
      const startPhase =
        (thread / 22) * Math.PI * 2 + Math.sin(time * 0.0016 + thread) * 0.16;
      const endPhase = startPhase + Math.PI * (0.82 + (thread % 5) * 0.09);
      context.globalAlpha = thread % 4 === 0 ? 0.86 : 0.72;
      context.strokeStyle = thread % 4 === 0 ? "#fff1b5" : color;
      context.lineWidth = Math.max(
        0.65,
        layout.size * (0.009 + (thread % 3) * 0.004),
      );
      context.beginPath();
      context.moveTo(
        midpoint.x + Math.cos(startPhase) * shellRadiusX,
        midpoint.y + Math.sin(startPhase) * shellRadiusY,
      );
      context.lineTo(
        midpoint.x + Math.cos(endPhase) * shellRadiusX,
        midpoint.y + Math.sin(endPhase) * shellRadiusY,
      );
      context.stroke();
    }

    const startEffect = props.state.lastMove?.royalCocoonEffects?.find(
      (effect) =>
        effect.kind === "started" &&
        effect.kingId === pair.king.id &&
        effect.queenId === pair.queen.id,
    );
    const showcaseElapsed = startEffect
      ? Math.max(0, Math.min(ROYAL_COCOON_DURATION_MS, elapsed))
      : ROYAL_COCOON_DURATION_MS;
    if (startEffect && elapsed <= ROYAL_COCOON_DURATION_MS) {
      const cloudEnvelope = Math.max(0, 1 - elapsed / 3_400);
      for (let particle = 0; particle < 58; particle += 1) {
        const seed = hashUnit(`${startEffect.id}-dust-${particle}`);
        const angle = seed * Math.PI * 2 + elapsed * (0.0005 + (particle % 5) * 0.00012);
        const drift = layout.size * (0.3 + (particle % 11) * 0.075);
        const spread = Math.min(1, elapsed / 1_900);
        context.globalAlpha = cloudEnvelope * (particle % 5 === 0 ? 0.9 : 0.64);
        context.fillStyle = particle % 5 === 0 ? "#ffe97a" : "#b8dcff";
        context.beginPath();
        context.arc(
          midpoint.x + Math.cos(angle) * drift * spread,
          midpoint.y + Math.sin(angle) * drift * 0.62 * spread -
            layout.size * spread * (particle % 4) * 0.025,
          layout.size * (0.015 + (particle % 4) * 0.009),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }

    const bumpPhase = (showcaseElapsed % 1_250) / 1_250;
    const bumpOnQueen = Math.floor(showcaseElapsed / 1_250) % 2 === 1;
    const bumpBase = bumpOnQueen ? queenCenter : kingCenter;
    const bump = Math.sin(bumpPhase * Math.PI);
    context.globalAlpha = 0.18 + bump * 0.5;
    context.fillStyle = "#ffe38a";
    context.beginPath();
    context.ellipse(
      bumpBase.x,
      bumpBase.y - layout.size * (0.54 + bump * 0.16),
      layout.size * (0.27 + bump * 0.18),
      layout.size * (0.16 + bump * 0.2),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    for (let marker = 0; marker < 3; marker += 1) {
      context.globalAlpha = marker < pair.turnsRemaining ? 0.95 : 0.45;
      context.fillStyle = marker < pair.turnsRemaining ? "#ffe46f" : "#394455";
      context.beginPath();
      context.arc(
        midpoint.x + (marker - 1) * layout.size * 0.2,
        midpoint.y + layout.size * 0.72,
        layout.size * 0.055,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  });
}

function drawCanvasRoyalResolutionEffects(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  const elapsed = time - props.animationStart;
  const sacrifice = props.state.lastMove?.royalSacrifice;
  if (sacrifice && elapsed >= 0 && elapsed <= ROYAL_SACRIFICE_DURATION_MS) {
    const center = layout.centers.get(coordKey(sacrifice.coord));
    if (center) {
      const tension = phaseBetween(elapsed, 0, 1_050);
      const progress = phaseBetween(elapsed, 900, 2_100);
      const fade = 1 - progress;
      const color = playerColor(props.state, sacrifice.playerId);
      context.save();
      if (elapsed < 1_260) {
        const wobbleX = Math.sin(elapsed * 0.065) * layout.size * 0.045 * tension;
        const wobbleY = Math.cos(elapsed * 0.079) * layout.size * 0.03 * tension;
        context.globalAlpha = 1;
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = layout.size * 0.22;
        context.beginPath();
        context.ellipse(center.x + wobbleX, center.y + wobbleY, layout.size * (sacrifice.pieceType === "queen" ? 0.36 : 0.3), layout.size * 0.23, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#fff2b8";
        context.lineWidth = Math.max(1, layout.size * 0.035);
        context.beginPath();
        context.arc(center.x + wobbleX, center.y + wobbleY, layout.size * 0.42, 0, Math.PI * 2);
        context.stroke();
      }
      const flash = Math.max(0, 1 - Math.abs(elapsed - 1_050) / 220);
      context.globalAlpha = flash;
      context.fillStyle = "#fff8d8";
      context.beginPath();
      context.arc(center.x, center.y, layout.size * (0.08 + flash * 0.66), 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = fade;
      context.strokeStyle = color;
      context.fillStyle = "#ffd35a";
      context.shadowColor = color;
      context.shadowBlur = layout.size * 0.24;
      context.lineWidth = Math.max(1, layout.size * 0.055 * fade);
      context.beginPath();
      context.arc(
        center.x,
        center.y,
        layout.size * (0.12 + progress * 0.92),
        0,
        Math.PI * 2,
      );
      context.stroke();
      for (let particle = 0; particle < 34; particle += 1) {
        const angle =
          (particle / 34) * Math.PI * 2 + hashUnit(`${sacrifice.pieceId}-${particle}`);
        const distance = layout.size * progress * (0.32 + (particle % 7) * 0.11);
        context.fillStyle = particle % 2 === 0 ? color : "#ffd35a";
        context.beginPath();
        context.arc(
          center.x + Math.cos(angle) * distance,
          center.y + Math.sin(angle) * distance + layout.size * progress * progress * 0.13,
          layout.size * (0.025 + (particle % 4) * 0.012) * fade,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.restore();
    }
  }

  (props.state.lastMove?.royalExitEffects ?? []).forEach((effect) => {
    const center = layout.centers.get(coordKey(effect.coord));
    const duration = effect.kind === "escape"
      ? ROYAL_ESCAPE_DURATION_MS
      : ROYAL_FIREWORKS_DURATION_MS;
    if (!center || elapsed < 0 || elapsed > duration) return;
    const ownColor = playerColor(props.state, effect.playerId);
    if (effect.kind === "escape") {
      const progress = phaseBetween(elapsed, 0, 5_650);
      const fade = Math.max(0, 1 - phaseBetween(elapsed, 5_250, 900));
      const opening = Math.sin(Math.min(1, progress * 1.25) * Math.PI * 0.5);
      context.save();
      context.globalAlpha = fade;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#01030a";
      context.strokeStyle = ownColor;
      context.shadowColor = ownColor;
      context.shadowBlur = layout.size * 0.22;
      context.beginPath();
      context.ellipse(
        center.x,
        center.y + layout.size * 0.13,
        layout.size * (0.12 + opening * 0.62),
        layout.size * (0.05 + opening * 0.25),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.globalCompositeOperation = "lighter";
      for (let ring = 0; ring < 6; ring += 1) {
        const ringPhase = (progress * 3.2 + ring / 6) % 1;
        context.globalAlpha = (1 - ringPhase) * 0.58 * fade;
        context.lineWidth = Math.max(1, layout.size * 0.026);
        context.beginPath();
        context.arc(
          center.x,
          center.y + layout.size * 0.1,
          layout.size * (0.14 + ringPhase * 0.72),
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
      for (let particle = 0; particle < 42; particle += 1) {
        const phase = (progress * 3.8 + particle / 42) % 1;
        const angle = time * 0.008 + particle * 2.17;
        const radius = layout.size * (0.78 * (1 - phase) + 0.04);
        context.globalAlpha = phase * 0.82 * fade;
        context.fillStyle = particle % 5 === 0 ? "#ffe05f" : ownColor;
        context.beginPath();
        context.arc(center.x + Math.cos(angle) * radius, center.y + layout.size * 0.1 + Math.sin(angle) * radius * 0.42, layout.size * (0.018 + (particle % 4) * 0.009), 0, Math.PI * 2);
        context.fill();
      }
      if (elapsed < 5_250) {
        const kingProgress = phaseBetween(elapsed, 480, 4_770);
        const scale = layout.size * 0.82 * Math.max(0.04, 1 - kingProgress * 0.94);
        const orbit = kingProgress * Math.PI * 12;
        context.globalAlpha = 1;
        context.translate(
          center.x + Math.cos(orbit) * layout.size * (0.24 - kingProgress * 0.12),
          center.y - layout.size * kingProgress * 0.08,
        );
        context.rotate(orbit);
        context.fillStyle = ownColor;
        context.beginPath();
        context.ellipse(-scale * 0.1, 0, scale * 0.36, scale * 0.24, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#e8f7da";
        context.beginPath();
        context.arc(scale * 0.28, 0, scale * 0.18, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = ownColor;
        context.lineWidth = Math.max(1, scale * 0.035);
        ([-1, 1] as const).forEach((side) => {
          context.beginPath();
          context.moveTo(scale * 0.34, side * scale * 0.08);
          context.lineTo(scale * 0.88, side * scale * 0.34);
          context.stroke();
        });
      }
      context.restore();
      return;
    }

    const opponentColor = playerColor(
      props.state,
      effect.opponentId ?? effect.playerId,
    );
    if (elapsed < 1_350) {
      const warning = phaseBetween(elapsed, 0, 1_350);
      const wobbleX = Math.sin(elapsed * 0.09) * layout.size * 0.045 * warning;
      const wobbleY = Math.cos(elapsed * 0.07) * layout.size * 0.03 * warning;
      context.save();
      context.fillStyle = ownColor;
      context.strokeStyle = "#ff625d";
      context.shadowColor = "#ff342e";
      context.shadowBlur = layout.size * (0.18 + warning * 0.2);
      context.lineWidth = Math.max(2, layout.size * 0.045);
      context.beginPath();
      context.ellipse(center.x + wobbleX, center.y + wobbleY, layout.size * 0.34, layout.size * 0.24, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(center.x + wobbleX, center.y + wobbleY, layout.size * (0.45 + warning * 0.08), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.save();
    context.globalCompositeOperation = "lighter";
    const centralFlash = Math.max(0, 1 - Math.abs(elapsed - 1_180) / 320);
    context.globalAlpha = centralFlash;
    context.fillStyle = "#fff9d8";
    context.shadowColor = "#fff9d8";
    context.shadowBlur = layout.size * 0.7;
    context.beginPath();
    context.arc(center.x, center.y, layout.size * (0.1 + centralFlash * 0.92), 0, Math.PI * 2);
    context.fill();
    for (let burst = 0; burst < 5; burst += 1) {
      const local = phaseBetween(elapsed, 1_050 + burst * 850, 2_600);
      if (local <= 0 || local >= 1) continue;
      const fade = 1 - local;
      const originX = center.x + (burst - 2) * layout.size * 0.24;
      const originY = center.y - (burst % 3) * layout.size * 0.24;
      context.globalAlpha = fade;
      context.shadowBlur = layout.size * 0.34;
      for (let particle = 0; particle < 46; particle += 1) {
        const angle =
          (particle / 46) * Math.PI * 2 + burst * 0.57 + hashUnit(`${effect.id}-${burst}-${particle}`) * 0.3;
        const distance =
          layout.size * local * (0.54 + (particle % 9) * 0.1 + burst * 0.05);
        const color = particle % 5 === 0 ? "#ffe66b" : particle % 2 === 0 ? ownColor : opponentColor;
        context.fillStyle = color;
        context.shadowColor = color;
        context.beginPath();
        context.arc(
          originX + Math.cos(angle) * distance,
          originY + Math.sin(angle) * distance + layout.size * local * local * 0.22,
          layout.size * (0.028 + (particle % 5) * 0.011) * fade,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
    context.restore();
  });
}

function drawCanvasFallback(
  context: CanvasRenderingContext2D,
  props: SceneProps,
  layout: Layout,
  time: number,
) {
  context.clearRect(0, 0, layout.width, layout.height);
  const water = context.createLinearGradient(0, 0, 0, layout.height);
  water.addColorStop(0, "#0a3040");
  water.addColorStop(1, "#04131e");
  context.fillStyle = water;
  context.fillRect(0, 0, layout.width, layout.height);
  context.strokeStyle = "rgba(92, 192, 207, .16)";
  context.lineWidth = Math.max(1, layout.size * 0.018);
  for (let band = 0; band < 13; band += 1) {
    context.beginPath();
    for (let segment = 0; segment <= 18; segment += 1) {
      const x = (segment / 18) * layout.width;
      const y =
        ((band + 0.5) / 13) * layout.height +
        Math.sin(segment * 0.7 + band + time * 0.0012) * layout.size * 0.07;
      if (segment === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  const traceHex = (x: number, y: number, radius: number) => {
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  };

  BOARD_CELLS.filter(
    (cell) => hexDistance(cell, { q: 0, r: 0 }) === 5,
  ).forEach((cell) => {
    const center = layout.centers.get(coordKey(cell))!;
    traceHex(center.x, center.y + layout.size * 0.17, layout.size * 1.04);
    context.fillStyle = "#1d1914";
    context.fill();
    context.strokeStyle = "#5c4a2d";
    context.lineWidth = Math.max(1, layout.size * 0.065);
    context.stroke();
  });

  const territoryOwners = new Map<string, PlayerId[]>();
  Object.entries(props.territories).forEach(([playerId, territory]) => {
    territory?.cells.forEach((cell) => {
      const key = coordKey(cell);
      territoryOwners.set(key, [
        ...(territoryOwners.get(key) ?? []),
        Number(playerId) as PlayerId,
      ]);
    });
  });
  BOARD_CELLS.forEach((cell) => {
    const center = layout.centers.get(coordKey(cell))!;
    traceHex(center.x, center.y, layout.size * 0.95);
    context.fillStyle = cellRichness(cell) >= 4 ? "#17172b" : "#101522";
    context.fill();
    context.strokeStyle = "#374059";
    context.stroke();
    const richness = cellRichness(cell);
    const centerDistance = hexDistance(cell, { q: 0, r: 0 });
    if (centerDistance <= 1) {
      const corePulse = 0.72 + (Math.sin(time * 0.0023) + 1) * 0.14;
      context.save();
      context.globalAlpha =
        (centerDistance === 0 ? 0.92 : 0.5) * corePulse;
      context.strokeStyle = "#ffd164";
      context.shadowColor = "#ffc43d";
      context.shadowBlur =
        layout.size * (centerDistance === 0 ? 0.7 : 0.34);
      context.lineWidth =
        layout.size * (centerDistance === 0 ? 0.085 : 0.045);
      context.stroke();
      context.restore();
    }
    const owners = territoryOwners.get(coordKey(cell)) ?? [];
    owners.forEach((owner) => {
      const strength = richness / MAX_CELL_RICHNESS;
      const sharedTerritory = owners.length > 1 ? 0.66 : 1;
      const wave =
        (Math.sin(
          time * (0.0015 + strength * 0.0008) +
            cell.q * 0.73 +
            cell.r * 0.41,
        ) +
          1) /
        2;
      const pulse = 0.82 + wave * (0.12 + strength * 0.24);
      context.save();
      context.globalAlpha =
        (0.08 + strength * 0.36) * sharedTerritory * pulse;
      context.fillStyle = playerColor(props.state, owner);
      context.shadowColor = playerColor(props.state, owner);
      context.shadowBlur = layout.size * (0.12 + strength * 0.34);
      context.fill();
      context.globalAlpha =
        (0.22 + strength * 0.72) * sharedTerritory * pulse;
      context.lineWidth = layout.size * (0.045 + strength * 0.065);
      context.strokeStyle = playerColor(props.state, owner);
      context.stroke();
      context.restore();
    });
  });

  props.state.pieces
    .filter((piece) => piece.type === "queen" && piece.queenBonded)
    .forEach((queen) => {
      const color = playerColor(props.state, queen.playerId);
      queenSpawnCells(props.state.pieces, queen).forEach((cell, index) => {
        const center = layout.centers.get(coordKey(cell));
        if (!center) return;
        context.save();
        context.strokeStyle = color;
        context.globalAlpha = 0.38;
        context.lineWidth = Math.max(1, layout.size * 0.025);
        context.setLineDash([layout.size * 0.08, layout.size * 0.07]);
        context.lineDashOffset = -time * 0.012 - index * 4;
        context.beginPath();
        context.arc(center.x, center.y, layout.size * 0.39, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      });
    });

  drawCanvasColonyVibration(context, props, layout, time);
  drawCanvasAcidDuel(context, props, layout, time);
  drawCanvasHatchBursts(context, props, layout, time);
  drawCanvasMoveOutcomeEffects(context, props, layout, time);
  drawCanvasZombieEffects(context, props, layout, time);

  props.state.pieces.forEach((piece) => {
    const center = layout.centers.get(coordKey(piece))!;
    let animatedX = center.x;
    let animatedY = center.y;
    if (props.state.lastMove?.pieceId === piece.id) {
      const source = layout.centers.get(coordKey(props.state.lastMove.from));
      const sacrificeDelay = props.state.lastMove.royalSacrifice ? 1_050 : 0;
      const movementDuration = piece.type === "queen" ? 720 : piece.type === "pawn" ? 420 : 560;
      const movementProgress = phaseBetween(
        time - props.animationStart,
        sacrificeDelay,
        movementDuration,
      );
      const eased = 1 - Math.pow(1 - movementProgress, 3);
      if (source && movementProgress < 1) {
        animatedX = source.x + (center.x - source.x) * eased;
        animatedY = source.y + (center.y - source.y) * eased -
          Math.sin(movementProgress * Math.PI) * layout.size *
            (piece.type === "queen" ? 0.86 : piece.type === "pawn" ? 0.09 : 0.17);
      }
    }
    const vibration = pieceVibrationOffset(
      piece,
      props.colonySignal,
      time,
      layout.size,
    );
    const pieceX = animatedX + vibration.x;
    const pieceY = animatedY + vibration.y;
    const heading = pieceHeading(piece, time);
    const scale =
      layout.size *
      (0.82 + vibration.intensity * (piece.type === "king" ? 0.018 : 0.01));
    const seed = hashUnit(piece.id);
    const blinkPeriod = 2500 + seed * 3900;
    const blinking = ((time + seed * 1900) % blinkPeriod) / blinkPeriod > 0.935;
    context.save();
    context.translate(pieceX, pieceY);
    context.rotate(heading);
    if (piece.type === "egg") {
      const color = playerColor(props.state, piece.playerId);
      const remaining = Math.max(
        1,
        Math.min(EGG_HATCH_TURNS, piece.hatchTurns ?? EGG_HATCH_TURNS),
      );
      const breathe = 0.94 + Math.sin(time * 0.006 + seed * 9) * 0.06;
      context.shadowColor = color;
      context.shadowBlur = scale * (0.16 + (EGG_HATCH_TURNS - remaining) * 0.06);
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(0, 0, scale * 0.31 * breathe, scale * 0.4 * breathe, 0, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "rgba(255,255,255,.36)";
      context.beginPath();
      context.ellipse(-scale * 0.08, -scale * 0.11, scale * 0.08, scale * 0.13, -0.2, 0, Math.PI * 2);
      context.fill();
      for (let index = 0; index < EGG_HATCH_TURNS; index += 1) {
        context.fillStyle = index < remaining ? "#ffe56c" : "#343b49";
        context.beginPath();
        context.arc((index - 1) * scale * 0.13, scale * 0.5, scale * 0.04, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      return;
    }
    if (isZombieTermite(piece)) {
      const color = playerColor(props.state, piece.playerId);
      const remaining = Math.max(
        1,
        Math.min(10, piece.zombieActivationsRemaining),
      );
      context.save();
      context.globalCompositeOperation = "lighter";
      context.strokeStyle = "rgba(154, 255, 55, .7)";
      context.shadowColor = "#9aff36";
      context.shadowBlur = scale * 0.28;
      context.lineWidth = Math.max(1, scale * 0.04);
      context.beginPath();
      context.arc(0, 0, scale * (0.48 + Math.sin(time * 0.012 + seed) * 0.045), 0, Math.PI * 2);
      context.stroke();
      context.restore();
      context.strokeStyle = "#10170d";
      context.lineWidth = Math.max(1, scale * 0.04);
      [-0.14, 0, 0.14].forEach((forward, index) => {
        ([-1, 1] as const).forEach((side) => {
          const swing = Math.sin(time * 0.026 + index * 2.1 + side) * scale * 0.07;
          context.beginPath();
          context.moveTo(forward * scale, side * scale * 0.18);
          context.lineTo(forward * scale + swing, side * scale * 0.46);
          context.stroke();
        });
      });
      context.globalAlpha = 0.68;
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(-scale * 0.18, 0, scale * 0.31, scale * 0.23, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = "#263b1d";
      context.beginPath();
      context.ellipse(scale * 0.08, 0, scale * 0.23, scale * 0.19, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(scale * 0.31, 0, scale * 0.2, scale * 0.19, 0, 0, Math.PI * 2);
      context.fill();
      ([-1, 1] as const).forEach((side) => {
        context.fillStyle = "#ff3148";
        context.shadowColor = "#ff3148";
        context.shadowBlur = scale * 0.13;
        context.beginPath();
        context.arc(scale * 0.37, side * scale * 0.085, scale * 0.055, 0, Math.PI * 2);
        context.fill();
      });
      context.shadowBlur = 0;
      for (let index = 0; index < 10; index += 1) {
        const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
        context.fillStyle = index < remaining ? "#adff38" : "#30362e";
        context.beginPath();
        context.arc(
          Math.cos(angle) * scale * 0.59,
          Math.sin(angle) * scale * 0.59,
          scale * 0.027,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.restore();
      return;
    }
    context.strokeStyle = "#081013";
    context.lineCap = "round";
    context.lineWidth = Math.max(1, scale * 0.035);
    [-0.14, 0, 0.14].forEach((forward, index) => {
      ([-1, 1] as const).forEach((side) => {
        const swing = Math.sin(time * 0.012 + index * 2 + side) * scale * 0.04;
        context.beginPath();
        context.moveTo(forward * scale, side * scale * 0.19);
        context.lineTo(forward * scale + swing, side * scale * 0.42);
        context.stroke();
      });
    });
    context.fillStyle = playerColor(props.state, piece.playerId);
    if (piece.type === "queen") {
      const queenPlayer = props.state.players.find(
        (player) => player.id === piece.playerId,
      );
      const kingAlive = props.state.pieces.some(
        (candidate) =>
          candidate.playerId === piece.playerId && candidate.type === "king",
      );
      const fertile = Boolean(
        piece.queenBonded &&
          kingAlive &&
          queenSpawnCells(props.state.pieces, piece).length > 0 &&
          (queenPlayer?.resources ?? 0) >= EGG_RESOURCE_COST,
      );
      const swell = 1 + Math.sin(time * 0.006 + seed * 7) * (fertile ? 0.1 : 0.025);
      context.beginPath();
      context.ellipse(-scale * 0.22, 0, scale * 0.43 * swell, scale * 0.25, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(scale * 0.18, 0, scale * 0.19, scale * 0.15, 0, 0, Math.PI * 2);
      context.fill();
      if (fertile) {
        const glow = 0.86 + Math.sin(time * 0.009 + seed * 12) * 0.14;
        context.save();
        context.shadowColor = "#a8ff72";
        context.shadowBlur = scale * (0.22 + glow * 0.12);
        context.fillStyle = "rgba(225, 255, 155, .98)";
        context.beginPath();
        context.arc(-scale * 0.22, 0, scale * 0.052, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(151, 255, 102, .88)";
        context.lineWidth = Math.max(1, scale * 0.022);
        context.beginPath();
        context.arc(
          -scale * 0.22,
          0,
          scale * (0.105 + glow * 0.018),
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.restore();
      }
    } else {
      context.beginPath();
      context.ellipse(-scale * 0.14, 0, scale * 0.32, scale * 0.24, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(scale * 0.16, 0, scale * 0.22, scale * 0.19, 0, 0, Math.PI * 2);
      context.fill();
    }
    const headX = piece.type === "queen" ? scale * 0.36 : scale * 0.33;
    context.fillStyle = "#d9f2c2";
    context.beginPath();
    context.ellipse(headX, 0, scale * 0.17, scale * 0.16, 0, 0, Math.PI * 2);
    context.fill();
    const antennaLength = piece.type === "king" ? scale * 0.62 : scale * 0.3;
    ([-1, 1] as const).forEach((side) => {
      context.beginPath();
      context.moveTo(headX + scale * 0.08, side * scale * 0.08);
      context.quadraticCurveTo(
        headX + antennaLength * 0.55,
        side * scale * (0.22 + Math.sin(time * 0.004 + seed * 8) * 0.05),
        headX + antennaLength,
        side * scale * (piece.type === "king" ? 0.34 : 0.16),
      );
      context.strokeStyle = playerColor(props.state, piece.playerId);
      context.stroke();
      if (!blinking) {
        context.beginPath();
        context.arc(headX + scale * 0.08, side * scale * 0.08, scale * 0.065, 0, Math.PI * 2);
        context.fillStyle = "#f4fff1";
        context.fill();
        context.beginPath();
        context.arc(headX + scale * 0.1, side * scale * 0.08, scale * 0.03, 0, Math.PI * 2);
        context.fillStyle = "#071016";
        context.fill();
      }
    });
    context.restore();
    if (props.checkingPieceIds.includes(piece.id)) {
      context.beginPath();
      context.arc(pieceX, pieceY, layout.size * 0.54, 0, Math.PI * 2);
      context.strokeStyle = "#ff5a32";
      context.lineWidth = Math.max(3, layout.size * 0.07);
      context.stroke();
    }
  });
  drawCanvasRoyalCocoonEffects(context, props, layout, time);
  drawCanvasRoyalResolutionEffects(context, props, layout, time);
}

export default function HexBoard(props: HexBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestProps = useRef(props);
  const layoutRef = useRef<Layout | undefined>(undefined);
  const animationStart = useRef(0);
  const [forceCanvas, setForceCanvas] = useState(false);

  useEffect(() => {
    latestProps.current = props;
  }, [props]);

  useEffect(() => {
    animationStart.current = performance.now();
  }, [props.state.moveNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let stopped = false;
    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | undefined;
    let buffer: WebGLBuffer | undefined;
    let fallback: CanvasRenderingContext2D | null = null;
    let positionLocation = -1;
    let colorLocation = -1;
    let vertexCapacity = 0;
    let vertexScratch = new Float32Array(0);
    let lastPaint = 0;
    const reusableBuilder = new VertexBuilder(1, 1);
    const targetFrameDuration = 1000 / 30;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (!stopped) setForceCanvas(true);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    if (!forceCanvas) {
      gl = canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        premultipliedAlpha: false,
        powerPreference: "default",
      });
    }

    if (gl) {
      try {
        program = createProgram(gl);
        buffer = gl.createBuffer() ?? undefined;
        if (!buffer) throw new Error("Tampon WebGL indisponible");
        positionLocation = gl.getAttribLocation(program, "a_position");
        colorLocation = gl.getAttribLocation(program, "a_color");
        latestProps.current.onRendererMode?.("WebGL 2");
      } catch {
        setForceCanvas(true);
      }
    } else {
      fallback = canvas.getContext("2d");
      latestProps.current.onRendererMode?.("Canvas");
    }

    const render = (time: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(render);
      if (document.visibilityState !== "visible") return;
      if (time - lastPaint < targetFrameDuration) return;
      lastPaint = time;
      try {
        if (gl?.isContextLost()) {
          setForceCanvas(true);
          return;
        }
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, bounds.width);
        const height = Math.max(1, bounds.height);
        const dprLimit = width <= 900 ? 1.35 : 1.75;
        const dpr = Math.min(dprLimit, window.devicePixelRatio || 1);
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        const previousLayout = layoutRef.current;
        const layout =
          previousLayout &&
          Math.abs(previousLayout.width - width) < 0.5 &&
          Math.abs(previousLayout.height - height) < 0.5
            ? previousLayout
            : createLayout(width, height);
        layoutRef.current = layout;
        const sceneProps: SceneProps = {
          ...latestProps.current,
          animationStart: animationStart.current,
        };
        if (gl && program && buffer) {
          const builder = buildScene(
            sceneProps,
            layout,
            time,
            reusableBuilder,
          );
          const requiredFloats = builder.data.length;
          if (requiredFloats > vertexCapacity) {
            vertexCapacity = 1;
            while (vertexCapacity < requiredFloats) vertexCapacity *= 2;
            vertexScratch = new Float32Array(vertexCapacity);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(
              gl.ARRAY_BUFFER,
              vertexCapacity * Float32Array.BYTES_PER_ELEMENT,
              gl.STREAM_DRAW,
            );
          }
          vertexScratch.set(builder.data, 0);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0.022, 0.031, 0.061, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferSubData(
            gl.ARRAY_BUFFER,
            0,
            vertexScratch,
            0,
            requiredFloats,
          );
          const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
          gl.enableVertexAttribArray(positionLocation);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
          gl.enableVertexAttribArray(colorLocation);
          gl.vertexAttribPointer(
            colorLocation,
            4,
            gl.FLOAT,
            false,
            stride,
            2 * Float32Array.BYTES_PER_ELEMENT,
          );
          gl.drawArrays(gl.TRIANGLES, 0, requiredFloats / 6);
        } else if (fallback) {
          fallback.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawCanvasFallback(fallback, sceneProps, layout, time);
        }
      } catch {
        if (gl && !forceCanvas) setForceCanvas(true);
      }
    };
    frame = requestAnimationFrame(render);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      if (gl && program) gl.deleteProgram(program);
      if (gl && buffer) gl.deleteBuffer(buffer);
    };
  }, [forceCanvas]);

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let closest: { coord: Coord; distance: number } | undefined;
    layout.centers.forEach((center) => {
      const distance = Math.hypot(center.x - x, center.y - y);
      if (!closest || distance < closest.distance) {
        closest = { coord: center.coord, distance };
      }
    });
    if (closest && closest.distance <= layout.size * 0.94) {
      latestProps.current.onCellClick(closest.coord);
    }
  };

  return (
    <canvas
      key={forceCanvas ? "canvas-fallback" : "webgl-primary"}
      ref={canvasRef}
      className="hex-board-canvas"
      aria-label="Plateau hexagonal interactif de FabHexaGrogne"
      role="application"
      tabIndex={0}
      onPointerDown={handlePointer}
    />
  );
}
