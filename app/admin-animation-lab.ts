import type { ColonySignal } from "./audio-system";
import {
  type GameState,
  type Piece,
  type PieceType,
  type PlayerId,
  createNewGame,
  ROYAL_COCOON_TURNS,
} from "./game-engine";
import {
  type FxKind,
  ROYAL_COCOON_DURATION_MS,
  ROYAL_ESCAPE_DURATION_MS,
  ROYAL_FIREWORKS_DURATION_MS,
  ROYAL_SACRIFICE_DURATION_MS,
  ZOMBIE_EFFECT_DURATION_MS,
} from "./game-effects";

export const ADMIN_UNLOCK_TAPS = 48;
export const ADMIN_UNLOCK_RADIUS_PX = 64;
export const ADMIN_UNLOCK_WINDOW_MS = 16_000;

export type AdminAnimationKind =
  | "pawn-move"
  | "queen-jump"
  | "capture"
  | "check"
  | "acid-duel"
  | "egg-laying"
  | "hatch"
  | "egg-crush"
  | "promotion"
  | "soldier-signal"
  | "egg-signal"
  | "pawn-sacrifice"
  | "queen-sacrifice"
  | "royal-cocoon"
  | "royal-escape"
  | "royal-fireworks"
  | "zombie-spawn"
  | "zombie-bite"
  | "zombie-expire";

export interface AdminAnimationSpec {
  kind: AdminAnimationKind;
  label: string;
  description: string;
  durationMs: number;
  fx?: FxKind;
}

export const ADMIN_ANIMATIONS: AdminAnimationSpec[] = [
  { kind: "pawn-move", label: "Marche du pion", description: "Course, vibration et trace du déplacement.", durationMs: 1_400, fx: "move" },
  { kind: "queen-jump", label: "Bond de la reine", description: "Saut de deux cases au-dessus du plateau.", durationMs: 1_600, fx: "move" },
  { kind: "capture", label: "Capture", description: "Impact et disparition d’une pièce adverse.", durationMs: 1_700, fx: "capture" },
  { kind: "check", label: "Alerte échec", description: "Signal de danger autour du roi menacé.", durationMs: 2_300, fx: "check" },
  { kind: "acid-duel", label: "Acide entre reines", description: "Jet acide lorsqu’une reine adverse est survolée.", durationMs: 1_900, fx: "acid-duel" },
  { kind: "egg-laying", label: "Ponte d’un œuf", description: "Matérialisation et halo du nouvel œuf.", durationMs: 2_000, fx: "reproduction-success" },
  { kind: "hatch", label: "Éclosion", description: "Coquille, lumière et apparition du pion.", durationMs: 2_000, fx: "hatch" },
  { kind: "egg-crush", label: "Œuf explosif", description: "Coquille rompue, onde de pression sur les six voisines et désintégration des victimes.", durationMs: 2_350, fx: "egg-crush" },
  { kind: "promotion", label: "Promotion en reine", description: "Ascension d’un pion arrivé au coin opposé.", durationMs: 2_300, fx: "promotion" },
  { kind: "soldier-signal", label: "Signal d’un soldat", description: "Vibration transmise au roi et à la reine.", durationMs: 3_300 },
  { kind: "egg-signal", label: "Signal des œufs", description: "Craquement puis onde relayée dans le couvain.", durationMs: 3_600 },
  { kind: "pawn-sacrifice", label: "Sacrifice d’un pion", description: "Explosion alliée libérant la fuite du roi.", durationMs: ROYAL_SACRIFICE_DURATION_MS, fx: "royal-sacrifice" },
  { kind: "queen-sacrifice", label: "Sacrifice d’une reine", description: "Explosion royale prolongée avant le passage du roi.", durationMs: ROYAL_SACRIFICE_DURATION_MS, fx: "royal-sacrifice" },
  { kind: "royal-cocoon", label: "Forteresse-cocon opaque", description: "Dôme blindé opaque, zone immobilisée, poussière étoilée, fils tissés et bosses alternées.", durationMs: ROYAL_COCOON_DURATION_MS, fx: "royal-cocoon" },
  { kind: "royal-escape", label: "Évasion du roi", description: "Un roi seul tourne, creuse un vortex puis disparaît.", durationMs: ROYAL_ESCAPE_DURATION_MS, fx: "royal-escape" },
  { kind: "royal-fireworks", label: "Feu d’artifice royal", description: "Le roi menacé éclate en salves bicolores prolongées.", durationMs: ROYAL_FIREWORKS_DURATION_MS, fx: "royal-fireworks" },
  { kind: "zombie-spawn", label: "Naissance du zombie", description: "Le termite corrompu surgit sur la case libérée avec son compteur de dix activations.", durationMs: ZOMBIE_EFFECT_DURATION_MS, fx: "zombie-spawn" },
  { kind: "zombie-bite", label: "Morsure du zombie", description: "Traque autonome et morsure d’une unité de sa propre colonie.", durationMs: ZOMBIE_EFFECT_DURATION_MS, fx: "zombie-bite" },
  { kind: "zombie-expire", label: "Explosion finale du zombie", description: "Implosion spécifique limitée à sa seule case, sans onde voisine.", durationMs: ZOMBIE_EFFECT_DURATION_MS, fx: "zombie-expire" },
];

export const GAME_EVOLUTIONS = [
  { version: "Fondation", title: "Plateau hexagonal tactique", detail: "Roi, reine bondissante, pion, captures et échec." },
  { version: "Territoire", title: "Richesse et potentiel", detail: "Frontières, centre renforcé et capacité de population." },
  { version: "Couvain", title: "Ponte, œufs et éclosion", detail: "Cycle reproductif, nurserie et promotion en reine." },
  { version: "Perception", title: "Perspective canonique", detail: "Chaque IA lit le plateau depuis la même orientation relative." },
  { version: "Mémoire", title: "Apprentissage humain", detail: "Les victoires et décisions utiles nourrissent l’entraînement local." },
  { version: "Cerveau", title: "Super-modèle exportable", detail: "Le cerveau V2 reste exportable et remplaçable pendant la préparation du futur modèle." },
  { version: "Sécurité", title: "Garde-fous royaux", detail: "Survie des reines, protection du couvain et sorties du roi mieux pondérées." },
  { version: "Rois", title: "Évasion et mat spectaculaire", detail: "Vortex, sacrifice allié, compteur de dix tours et feu d’artifice bicolore." },
  { version: "V1.9", title: "Laboratoire d’animations", detail: "Scènes isolées, FX rejouables et diagnostic sans modifier la partie." },
  { version: "V2.0", title: "Instincts et cocon royal", detail: "Pions couverts en infériorité, retraite-leurre, préparation du vortex et fertilité protégée sur trois tours." },
  { version: "V2.1", title: "Forteresse opaque", detail: "Le roi, la reine et toute pièce sous le cocon sont immobilisés ; les tours scellés passent sans élimination." },
  { version: "V3 · T2", title: "Corpus FabHexaBrain V2", detail: "Ligue cycle 172 intégrée comme graine active, plus imports de replays, dédoublonnage, tenseurs hexagonaux et masques légaux." },
  { version: "V3 · T3", title: "Cerveau hybride HexConv", detail: "Le cerveau actuel et ses 14 caractéristiques fusionnent avec trois HexConv 32 → 32 → 48, Policy légale et Value(6), entraînées dans un Worker mobile." },
  { version: "V3 · T3.1", title: "Couvain à onde de pression", detail: "Les œufs non éclos sont sans menace ; leur écrasement déclenche une explosion locale sur les six voisines. Les sacrifices de reine exigent désormais une supériorité écrasante et une relève imminente." },
  { version: "V3 · T3.2", title: "Nurseries sûres", detail: "La ponte est suspendue si un adversaire peut écraser l’œuf avant le prochain tour ; le garde-fou protège toutes les reines, même lorsqu’une autre pièce déclencherait l’explosion." },
  { version: "V3 · T3.3", title: "Répétitions et termites zombies", detail: "Chaque colonie possède son détecteur de cycle et un zombie autonome pour dix activations en cas d’abus." },
  { version: "V3 · T3.4", title: "Analyse contextuelle et motifs courts", detail: "Après quatre tours sans progrès, l’IA choisit un objectif de trois tours. Les séquences courtes sont surveillées jusqu’au seuil 5 ; chaque activation du zombie devient visible et sonore." },
  { version: "V3 · T3.4.1", title: "Mémoire anti-oscillation", detail: "Les va-et-vient territoriaux ne peuvent plus effacer la mémoire anti-boucle ; une reprise persistante du même parcours finit donc par faire naître le zombie." },
  { version: "V3 · T3.4.2", title: "Mémoire des trajets exacts", detail: "Une avance vers une nouvelle case reste un progrès. Seule la reprise ordonnée des mêmes transitions par la même pièce alimente désormais le compteur zombie." },
  { version: "V3 · T3.5", title: "Queen Escape et poids modulaires", detail: "Six signaux apprenables mesurent les sorties sûres, leurs continuations, les passages ouverts ou fermés et le risque d’enfermement. Core, Queen Escape et HexConv s’importent désormais séparément sans effacer les modules absents." },
] as const;

export interface AdminAnimationPreview {
  state: GameState;
  colonySignal?: ColonySignal;
}

function piece(
  id: string,
  playerId: PlayerId,
  type: PieceType,
  q: number,
  r: number,
  extra: Partial<Piece> = {},
): Piece {
  return {
    id,
    playerId,
    type,
    q,
    r,
    level: type === "king" ? 4 : type === "queen" ? 3 : type === "pawn" ? 1 : 0,
    queenBonded: type === "queen",
    ...extra,
  };
}

export function createAdminAnimationPreview(
  kind: AdminAnimationKind,
  sequence: number,
  startedAt: number,
): AdminAnimationPreview {
  const base = createNewGame(2, 1);
  const state: GameState = {
    ...base,
    matchId: `admin-lab-${sequence}`,
    moveNumber: Math.max(1, sequence),
    event: "Scène d’essai administrative — la partie réelle reste intacte.",
    pieces: [
      piece("lab-king-0", 0, "king", -3, 1),
      piece("lab-queen-0", 0, "queen", -4, 1),
      piece("lab-king-2", 2, "king", 3, -1),
      piece("lab-queen-2", 2, "queen", 4, -1),
    ],
    lastMove: undefined,
  };

  const move = (
    mover: Piece,
    from: { q: number; r: number },
    extras: NonNullable<GameState["lastMove"]> extends infer T ? Partial<T> : never = {},
  ) => {
    state.pieces.push(mover);
    state.lastMove = {
      pieceId: mover.id,
      playerId: mover.playerId,
      pieceType: mover.type,
      from,
      to: { q: mover.q, r: mover.r },
      ...extras,
    };
  };

  if (kind === "pawn-move") move(piece("lab-mover", 0, "pawn", -1, 0), { q: -2, r: 0 });
  if (kind === "queen-jump") move(piece("lab-mover", 0, "queen", 1, 0), { q: -1, r: 0 });
  if (kind === "capture") move(piece("lab-mover", 0, "pawn", 0, 0), { q: -1, r: 0 }, { capturedType: "pawn" });
  if (kind === "check") {
    state.pieces = [piece("lab-checked-king", 0, "king", 0, 0)];
    move(piece("lab-checker", 2, "pawn", 0, 1), { q: 1, r: 0 });
  }
  if (kind === "acid-duel") {
    move(piece("lab-acid-queen", 0, "queen", 1, 0), { q: -1, r: 0 }, {
      acidVictimId: "lab-acid-victim",
      acidVictimPlayerId: 2,
      acidVictimCoord: { q: 0, r: 0 },
    });
  }
  if (kind === "egg-laying") {
    state.pieces.push(piece("lab-egg", 0, "egg", 0, 0, { hatchTurns: 3 }));
    state.lastMove = {
      pieceId: "lab-queen-0",
      playerId: 0,
      pieceType: "queen",
      from: { q: -1, r: 0 },
      to: { q: 0, r: 0 },
      spawned: true,
      spawnedCount: 1,
      spawnedCoords: [{ q: 0, r: 0 }],
    };
  }
  if (kind === "hatch") {
    state.pieces.push(piece("lab-hatchling", 0, "pawn", 0, 0));
    state.lastMove = {
      pieceId: "lab-hatchling",
      playerId: 0,
      pieceType: "pawn",
      from: { q: 0, r: 0 },
      to: { q: 0, r: 0 },
      hatchedCount: 1,
      hatchedCoords: [{ q: 0, r: 0 }],
    };
  }
  if (kind === "egg-crush") {
    move(piece("lab-crusher", 2, "pawn", 0, 0), { q: 1, r: 0 }, {
      capturedType: "egg",
      eggBlast: {
        center: { q: 0, r: 0 },
        victims: [
          { pieceId: "lab-blast-pawn", playerId: 0, pieceType: "pawn", coord: { q: 1, r: -1 } },
          { pieceId: "lab-blast-queen", playerId: 2, pieceType: "queen", coord: { q: -1, r: 1 } },
          { pieceId: "lab-blast-egg", playerId: 0, pieceType: "egg", coord: { q: 0, r: -1 } },
        ],
      },
    });
  }
  if (kind === "promotion") move(piece("lab-promoted", 0, "queen", 0, 4, { promoted: true }), { q: 0, r: 3 }, { promoted: true });

  if (
    kind === "zombie-spawn" ||
    kind === "zombie-bite" ||
    kind === "zombie-expire"
  ) {
    const zombieId = "lab-zombie";
    const effectKind =
      kind === "zombie-spawn"
        ? "spawn"
        : kind === "zombie-bite"
          ? "bite"
          : "expire";
    if (kind !== "zombie-expire") {
      state.pieces.push(
        piece(zombieId, 0, "pawn", 0, 0, {
          zombieActivationsRemaining: kind === "zombie-spawn" ? 10 : 9,
          zombieBornMoveNumber: sequence,
        }),
      );
    }
    state.lastMove = {
      pieceId: "lab-loop-trigger",
      playerId: 0,
      pieceType: "pawn",
      from: { q: -1, r: 0 },
      to: { q: 1, r: 0 },
      antiLoopEscape: true,
      antiLoopPenalty: kind === "zombie-spawn",
      zombieEffects: [
        {
          id: `lab-${effectKind}-${sequence}`,
          zombieId,
          playerId: 0,
          kind: effectKind,
          from:
            kind === "zombie-bite" ? { q: -1, r: 0 } : { q: 0, r: 0 },
          to: { q: 0, r: 0 },
          remainingActivations:
            kind === "zombie-spawn" ? 10 : kind === "zombie-bite" ? 9 : 0,
          victim:
            kind === "zombie-bite"
              ? {
                  pieceId: "lab-zombie-prey",
                  playerId: 0,
                  pieceType: "pawn",
                  coord: { q: 0, r: 0 },
                }
              : undefined,
        },
      ],
    };
  }

  if (kind === "soldier-signal" || kind === "egg-signal") {
    const sourceId = kind === "soldier-signal" ? "lab-signal-pawn" : "lab-signal-egg";
    state.pieces.push(
      piece(sourceId, 0, kind === "soldier-signal" ? "pawn" : "egg", -1, 0, { hatchTurns: 2 }),
      piece("lab-relay-egg-1", 0, "egg", 0, 0, { hatchTurns: 2 }),
      piece("lab-relay-egg-2", 0, "egg", 1, -1, { hatchTurns: 1 }),
    );
    return {
      state,
      colonySignal: {
        id: sequence,
        playerId: 0,
        sourcePieceId: sourceId,
        kind: kind === "soldier-signal" ? "soldier" : "egg",
        relayPieceIds: kind === "egg-signal" ? ["lab-relay-egg-1", "lab-relay-egg-2"] : undefined,
        startedAt,
      },
    };
  }

  if (kind === "pawn-sacrifice" || kind === "queen-sacrifice") {
    const pieceType = kind === "pawn-sacrifice" ? "pawn" : "queen";
    const victimId = `lab-${pieceType}-sacrifice`;
    state.pieces = [piece("lab-escaping-king", 0, "king", 0, 0)];
    state.lastMove = {
      pieceId: "lab-escaping-king",
      playerId: 0,
      pieceType: "king",
      from: { q: -1, r: 0 },
      to: { q: 0, r: 0 },
      royalSacrifice: {
        pieceId: victimId,
        pieceType,
        playerId: 0,
        coord: { q: 0, r: 0 },
      },
    };
  }

  if (kind === "royal-cocoon") {
    const king = piece("lab-cocoon-king", 0, "king", 0, 0, {
      breedingTurns: ROYAL_COCOON_TURNS,
      breedingPartnerId: "lab-cocoon-queen",
    });
    const queen = piece("lab-cocoon-queen", 0, "queen", 1, 0, {
      promoted: true,
      queenBonded: false,
      breedingTurns: ROYAL_COCOON_TURNS,
      breedingPartnerId: king.id,
    });
    state.pieces = [king, queen, piece("lab-cocoon-enemy-king", 2, "king", -5, 5)];
    state.lastMove = {
      pieceId: queen.id,
      playerId: 0,
      pieceType: "queen",
      from: { q: 2, r: 0 },
      to: { q: queen.q, r: queen.r },
      royalCocoonEffects: [{
        id: `lab-royal-cocoon-${sequence}`,
        kind: "started",
        playerId: 0,
        kingId: king.id,
        queenId: queen.id,
        kingCoord: { q: king.q, r: king.r },
        queenCoord: { q: queen.q, r: queen.r },
        turnsRemaining: ROYAL_COCOON_TURNS,
      }],
    };
  }

  if (kind === "royal-escape" || kind === "royal-fireworks") {
    state.pieces = [];
    state.lastMove = {
      pieceId: "lab-royal-resolution",
      playerId: 0,
      pieceType: "king",
      from: { q: 0, r: 0 },
      to: { q: 0, r: 0 },
      royalExitEffects: [{
        id: `lab-royal-${sequence}`,
        kind: kind === "royal-escape" ? "escape" : "checkmate",
        reason: kind === "royal-escape" ? "blocked" : "checkmate",
        playerId: 0,
        opponentId: kind === "royal-fireworks" ? 2 : undefined,
        coord: { q: 0, r: 0 },
      }],
    };
  }

  return { state };
}
