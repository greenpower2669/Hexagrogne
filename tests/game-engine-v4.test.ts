import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_MODE_ORDER,
  COLONY_AUDIO_SIGNATURES,
  DEFAULT_FX_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  GAME_SOUNDTRACK,
  audioModeHasFx,
  audioModeHasMusic,
  nextAudioMode,
  validateAudioMode,
  validateAudioVolume,
} from "../app/audio-system";
import {
  BOARD_CELLS,
  COLONY_NEST_RESOURCE_RESERVE,
  EGG_HATCH_TURNS,
  EGG_RESOURCE_COST,
  GameState,
  KING_SOLITUDE_ESCAPE_TURNS,
  KING_RESOURCE_COST,
  MAX_CELL_RICHNESS,
  PAWN_RESOURCE_COST,
  Piece,
  PLAYER_META,
  QUEEN_RESOURCE_BASE_COST,
  ROYAL_COCOON_RADIUS,
  ROYAL_COCOON_TURNS,
  TERRITORY_RESOURCE_DIVISOR,
  allLegalMoves,
  activeRoyalCocoons,
  applyMove,
  canonicalCoordForPlayer,
  canonicalPlayerIdForPerspective,
  checkingPieces,
  chooseAiMove,
  cellRichness,
  coordKey,
  createNewGame,
  currentPlayerId,
  eggBlastVictimsForMove,
  hasOverwhelmingArmyForQueenTrade,
  hexDistance,
  isInCheck,
  isCellProtectedByRoyalCocoon,
  isEggImmediatelyCrushable,
  isPieceFrozenByRoyalCocoon,
  isTurnBlockedByRoyalCocoon,
  isSeverelyOutnumbered,
  isVortexPreparationMode,
  isQueenTacticallyCapturable,
  isSquareAttacked,
  kingPawnShieldValue,
  kingSafetyValue,
  legalMovesForPiece,
  moveFeatures,
  ordinaryLegalMovesForPlayer,
  moveEnablesQueenReproduction,
  pawnHasForwardCover,
  passTurnBlockedByRoyalCocoon,
  populationForPlayer,
  queenCrossedByJump,
  queenDisciplineValue,
  queenHatchTrapRisk,
  queenPromotionCost,
  queenSpawnCells,
  queenSpawnReadiness,
  queenSpawnSpaceRatio,
  resourceStatusForPlayer,
  sameCoord,
  selectStrategicPhase,
  territoryForPlayer,
  usedResources,
  unstoppablePromotionPawn,
} from "../app/game-engine";
import {
  archiveHumanVictory,
  createEmptyHumanTrainingArchive,
  emergencyCompactHumanTrainingArchive,
} from "../app/human-training";
import {
  MATCH_REPLAY_FRAME_LIMIT,
  appendMatchFrame,
  createEmptyMatchHistory,
  emergencyCompactMatchHistoryArchive,
  replayFrameToGameState,
  validateMatchHistory,
} from "../app/match-history";
import {
  AI_DIFFICULTY_META,
  AI_STRATEGY_IDS,
  TRAINING_POWER_META,
  bestStrategyAgainstHuman,
  blendedSuperModelWeights,
  blendedStrategyWeights,
  buildSuperModelLayers,
  createDefaultSelfPlayLeague,
  difficultySnapshot,
  mergeAiMemories,
  mergeSelfPlayLeagues,
  runSelfPlayDuel,
  strategicScoreAverages,
  strategyForAiPlayer,
  trainingDelayMs,
  validateTrainingPower,
  validateSelfPlayLeague,
} from "../app/self-play";

test("l’audio propose quatre états, avec les sons seuls par défaut", () => {
  assert.deepEqual(AUDIO_MODE_ORDER, ["fx", "silent", "music", "both"]);
  assert.equal(validateAudioMode(undefined), "fx");
  assert.equal(validateAudioMode("inconnu"), "fx");
  assert.equal(audioModeHasFx("fx"), true);
  assert.equal(audioModeHasMusic("fx"), false);
  assert.equal(audioModeHasFx("both"), true);
  assert.equal(audioModeHasMusic("both"), true);
  assert.equal(nextAudioMode("both"), "fx");
  assert.equal(GAME_SOUNDTRACK.title, "Le Petit Robot Qui Dormait");
  assert.equal(GAME_SOUNDTRACK.durationSeconds, 330.048);
  assert.equal(DEFAULT_MUSIC_VOLUME, 0.8);
  assert.equal(DEFAULT_FX_VOLUME, 0.8);
  assert.equal(validateAudioVolume(null), 0.8);
  assert.equal(validateAudioVolume("0.35"), 0.35);
  assert.equal(validateAudioVolume(2), 1);
  assert.equal(validateAudioVolume(-1), 0);
  assert.equal(
    GAME_SOUNDTRACK.src,
    "/audio/le-petit-robot-qui-dormait.mp3",
  );
  assert.equal(
    new Set(Object.values(COLONY_AUDIO_SIGNATURES).map((item) => item.baseFrequency))
      .size,
    6,
  );
});

test("l’historique conserve les images et reconstruit une partie lisible", () => {
  const initial = createNewGame(2, 2);
  const firstMove = allLegalMoves(initial, currentPlayerId(initial))[0];
  assert(firstMove);
  const moved = applyMove(initial, firstMove);
  const started = appendMatchFrame(
    createEmptyMatchHistory(),
    initial,
    new Date("2026-08-24T08:00:00.000Z"),
  );
  const archived = appendMatchFrame(
    started,
    moved,
    new Date("2026-08-24T08:01:00.000Z"),
  );
  assert.equal(archived.matches.length, 1);
  assert.equal(archived.matches[0].frames.length, 2);
  assert.equal(appendMatchFrame(archived, moved), archived);
  const replay = replayFrameToGameState(archived.matches[0], 1);
  assert.equal(replay?.moveNumber, 1);
  assert.equal(replay?.lastMove?.pieceId, firstMove.pieceId);
  assert.equal(
    validateMatchHistory(JSON.parse(JSON.stringify(archived))).matches[0].frames
      .length,
    2,
  );
});

test("une très longue partie garde un historique borné et ses deux extrémités", () => {
  const base = createNewGame(2, 1);
  const crowdedPieces: Piece[] = BOARD_CELLS.map((cell, index) => ({
    id: `stress-${index}`,
    playerId: index % 2 === 0 ? 0 : 2,
    type: index < 2 ? "king" : "pawn",
    level: index < 2 ? 4 : 1,
    ...cell,
  }));
  const initial: GameState = { ...base, pieces: crowdedPieces };
  let archive = appendMatchFrame(createEmptyMatchHistory(), initial);
  for (let moveNumber = 1; moveNumber <= 420; moveNumber += 1) {
    archive = appendMatchFrame(archive, {
      ...initial,
      moveNumber,
      round: Math.floor(moveNumber / 2) + 1,
      event: `Coup simulé ${moveNumber}`,
    });
  }
  const frames = archive.matches[0].frames;
  assert(frames.length <= MATCH_REPLAY_FRAME_LIMIT);
  assert.equal(frames[0].moveNumber, 0);
  assert.equal(frames[frames.length - 1].moveNumber, 420);
  assert(JSON.stringify(archive).length < 1_500_000);
  const emergency = emergencyCompactMatchHistoryArchive(archive);
  assert(emergency.matches[0].frames.length <= 36);
  assert.equal(emergency.matches[0].frames[0].moveNumber, 0);
  assert.equal(
    emergency.matches[0].frames[emergency.matches[0].frames.length - 1]
      .moveNumber,
    420,
  );
});

test("l’IA valorise les gardes du roi et capture son attaquant", () => {
  const naked: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
  ];
  const guarded: Piece[] = [
    ...naked,
    { id: "guard-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
  ];
  assert(kingSafetyValue(guarded, 0) > kingSafetyValue(naked, 0));

  const base = createNewGame(2, 0, 4);
  const checkedState: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
      {
        id: "queen-0",
        playerId: 0,
        type: "queen",
        level: 3,
        q: -1,
        r: 0,
        queenBonded: true,
      },
      { id: "checker-2", playerId: 2, type: "pawn", level: 1, q: 1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
    ],
    turnIndex: 0,
  };
  const choice = chooseAiMove(
    checkedState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(choice);
  assert(sameCoord(choice.move.to, { q: 1, r: 0 }));
  assert(["king-0", "queen-0"].includes(choice.move.pieceId));
});

test("l’IA capture une reine disponible avant une cible mineure", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: -3,
      r: 1,
      queenBonded: true,
    },
    { id: "queen-hunter", playerId: 0, type: "pawn", level: 1, q: 0, r: 0 },
    { id: "minor-hunter", playerId: 0, type: "pawn", level: 1, q: 0, r: 2 },
    { id: "queen-2", playerId: 2, type: "queen", level: 3, q: 1, r: 0 },
    { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 1, r: 2 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
  ];
  const choice = chooseAiMove(
    { ...base, pieces, turnIndex: 0 },
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(choice);
  const captured = pieces.find((piece) => sameCoord(piece, choice.move.to));
  assert.equal(captured?.type, "queen");
  assert.equal(captured?.playerId, 2);
});

test("la reine détecte aussi une capture acide par traversée", () => {
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
    { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 0 },
    { id: "queen-2", playerId: 2, type: "queen", level: 3, q: -1, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
  ];
  assert.equal(isSquareAttacked(pieces, pieces[1], 0), false);
  assert.equal(isQueenTacticallyCapturable(pieces, pieces[1], 0), true);
});

test("un œuf non éclos ne menace ni roi ni reine et ne crée aucun échec", () => {
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
    { id: "queen-0", playerId: 0, type: "queen", level: 3, q: -1, r: 1 },
    {
      id: "egg-2",
      playerId: 2,
      type: "egg",
      level: 0,
      q: 1,
      r: 0,
      hatchTurns: 1,
    },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  assert.equal(isSquareAttacked(pieces, pieces[0], 0), false);
  assert.deepEqual(checkingPieces(pieces, 0), []);
  assert.equal(isInCheck(pieces, 0), false);
  assert.equal(queenHatchTrapRisk(pieces, 0, "queen-0"), 0);
});

test("le bouclier royal vise trois pions proches puis une seconde ligne", () => {
  const naked: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
  ];
  const oneGuard: Piece[] = [
    ...naked,
    { id: "guard-a", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
  ];
  const crown: Piece[] = [
    ...oneGuard,
    { id: "guard-b", playerId: 0, type: "pawn", level: 1, q: 0, r: 1 },
    { id: "guard-c", playerId: 0, type: "pawn", level: 1, q: -1, r: 1 },
    { id: "guard-d", playerId: 0, type: "pawn", level: 1, q: 2, r: 0 },
  ];
  assert.equal(kingPawnShieldValue(naked, 0), 0);
  assert(kingPawnShieldValue(oneGuard, 0) > 0);
  assert(kingPawnShieldValue(crown, 0) > 0.82);
  assert(kingSafetyValue(crown, 0) > kingSafetyValue(oneGuard, 0));
});

test("la formation v15 occupe jusqu’aux six coins et mobilise tout son potentiel", () => {
  ([2, 3, 4, 5, 6] as const).forEach((playerCount) => {
    const game = createNewGame(playerCount, playerCount);
    assert.equal(game.rulesVersion, 15);
    assert.equal(game.config.aiDifficulty, 3);
    assert.equal(game.players.length, playerCount);
    assert.match(game.matchId, /^match-/);
    game.players.forEach((player) => {
      const pieces = game.pieces.filter((piece) => piece.playerId === player.id);
      assert.equal(pieces.length, 7);
      assert.equal(pieces.filter((piece) => piece.type === "queen").length, 1);
      assert.equal(
        pieces.find((piece) => piece.type === "queen")?.queenBonded,
        true,
      );
      assert.equal(pieces.filter((piece) => piece.type === "king").length, 1);
      assert.equal(pieces.filter((piece) => piece.type === "pawn").length, 5);
      assert.deepEqual(resourceStatusForPlayer(game.pieces, player.id), {
        used: 35,
        capacity: 35,
        free: 0,
        overload: 0,
      });
    });
    assert.equal(
      new Set(game.pieces.map((piece) => coordKey(piece))).size,
      game.pieces.length,
    );
  });
});

test("les équipes humaines peuvent personnaliser leur nom et leur couleur", () => {
  const game = createNewGame(
    3,
    2,
    3,
    ["Termites Fab", "Les Lucioles", "Émeraude"],
    ["#12abef", "#ef1288", "#65d18c"],
  );
  assert.equal(game.players[0].name, "Termites Fab");
  assert.equal(game.players[0].color, "#12abef");
  assert.equal(game.players[1].name, "Les Lucioles");
  assert.equal(game.players[1].color, "#ef1288");
  assert.match(game.event, /Termites Fab/);
});

test("le potentiel augmente à chaque anneau vers le centre", () => {
  assert.deepEqual(
    [5, 4, 3, 2, 1, 0].map((distance) =>
      cellRichness({ q: distance, r: 0 }),
    ),
    [1, 2, 3, 4, 12, 30],
  );
  assert.equal(MAX_CELL_RICHNESS, 30);
  assert.equal(TERRITORY_RESOURCE_DIVISOR, 3);
  assert.equal(COLONY_NEST_RESOURCE_RESERVE, 31);
});

test("le coût des reines double et bloque une promotion sans potentiel", () => {
  const base = createNewGame(2, 1);
  assert.equal(PAWN_RESOURCE_COST, 1);
  assert.equal(EGG_RESOURCE_COST, 1);
  assert.equal(KING_RESOURCE_COST, 10);
  assert.equal(QUEEN_RESOURCE_BASE_COST, 20);
  assert.equal(queenPromotionCost(base.pieces, 0), 40);
  const twoQueens: Piece[] = [
    ...base.pieces,
    {
      id: "queen-extra-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: -2,
      r: 0,
    },
  ];
  assert.equal(queenPromotionCost(twoQueens, 0), 80);
  assert.equal(
    queenPromotionCost(
      [
        ...twoQueens,
        {
          id: "queen-extra-1",
          playerId: 0,
          type: "queen",
          level: 3,
          q: -3,
          r: 1,
        },
      ],
      0,
    ),
    160,
  );

  const promotionState: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 2 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 3 },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 4 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: -4, r: 0 },
    ],
  };
  assert.equal(
    legalMovesForPiece(promotionState, "pawn-0").some((move) =>
      sameCoord(move.to, { q: 0, r: 5 }),
    ),
    false,
  );
  const funded: GameState = {
    ...promotionState,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 4, r: -4, queenBonded: false },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 4 },
      { id: "support-0", playerId: 0, type: "pawn", level: 1, q: 0, r: -5 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
    ],
  };
  const promoted = applyMove(funded, {
    pieceId: "pawn-0",
    to: { q: 0, r: 5 },
  });
  assert.equal(
    promoted.pieces.find((piece) => piece.id === "pawn-0")?.type,
    "queen",
  );
  assert.match(promoted.event, /palier 40/);
  assert.equal(usedResources(promoted.pieces, 0), 71);
});

test("une reine dissout automatiquement la reine ennemie qu’elle croise", () => {
  const base = createNewGame(2, 1);
  const duel: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 0 },
      { id: "queen-2", playerId: 2, type: "queen", level: 3, q: 1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: -1 },
    ],
    turnIndex: 0,
  };
  const move = { pieceId: "queen-0", to: { q: 2, r: 0 } };
  assert.equal(queenCrossedByJump(duel.pieces, move)?.id, "queen-2");
  const result = applyMove(duel, move);
  assert.equal(result.moveNumber, 1);
  assert.equal(result.pieces.some((piece) => piece.id === "queen-2"), false);
  assert.equal(result.lastMove?.acidVictimId, "queen-2");
  assert.match(result.event, /Jet d’acide/);
  assert.equal(currentPlayerId(result), 2);
});

test("la reine saute une pièce et capture sur toute la couronne de rayon 2", () => {
  const game = createNewGame(2, 2);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
    { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 0 },
    { id: "blocker-0", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
    { id: "target-2", playerId: 2, type: "pawn", level: 1, q: 2, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
  ];
  const state: GameState = { ...game, pieces };
  const moves = legalMovesForPiece(state, "queen-0");

  assert.equal(moves.length, 12);
  assert(moves.some((move) => sameCoord(move.to, { q: 2, r: 0 })));
  assert(!moves.some((move) => sameCoord(move.to, { q: 0, r: 1 })));

  const moved = applyMove(state, {
    pieceId: "queen-0",
    to: { q: 2, r: 0 },
  });
  assert(!moved.pieces.some((piece) => piece.id === "target-2"));
  assert(moved.pieces.some((piece) => piece.id === "queen-0" && piece.q === 2 && piece.r === 0));
});

test("un royaume bloqué sans échec fait évader son roi sans fausse victoire", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 5 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: -3, r: 3, queenBonded: false },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -4, r: 4 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
      { id: "lock-a-0", playerId: 0, type: "queen", level: 3, q: 2, r: -5, queenBonded: false },
      { id: "lock-b-0", playerId: 0, type: "queen", level: 3, q: 3, r: -2, queenBonded: false },
    ],
    turnIndex: 0,
  };
  assert.equal(isInCheck(state.pieces, 2), false);
  assert.equal(allLegalMoves({ ...state, turnIndex: 1 }, 2).length, 0);
  const result = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: -4, r: 3 },
  });
  assert.equal(result.winnerId, undefined);
  assert.equal(result.outcome, "royal_escape");
  assert.match(result.drawReason ?? "", /Victoire reportée/);
  assert.equal(result.players.find((player) => player.id === 2)?.alive, false);
  assert.equal(
    result.players.find((player) => player.id === 2)?.exitReason,
    "escaped",
  );
  assert.equal(result.pieces.some((piece) => piece.id === "king-2"), false);
  assert.equal(result.lastMove?.royalExitEffects?.[0]?.kind, "escape");
  assert.equal(result.lastMove?.royalExitEffects?.[0]?.reason, "blocked");
});

test("le roi sacrifie un allié uniquement quand aucun coup ordinaire ne le sauve", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
      { id: "escape-pawn", playerId: 2, type: "pawn", level: 1, q: 5, r: -4 },
      {
        id: "block-queen",
        playerId: 2,
        type: "queen",
        level: 3,
        q: 4,
        r: -4,
      },
      { id: "checker", playerId: 0, type: "pawn", level: 1, q: 4, r: -5 },
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 3, r: -5 },
    ],
    turnIndex: 1,
  };
  assert.equal(isInCheck(state.pieces, 2), true);
  assert.equal(ordinaryLegalMovesForPlayer(state, 2).length, 0);
  const emergencyMoves = allLegalMoves(state, 2);
  assert.deepEqual(emergencyMoves, [
    { pieceId: "king-2", to: { q: 5, r: -4 } },
  ]);
  const escapedCheck = applyMove(state, emergencyMoves[0]);
  assert.equal(isInCheck(escapedCheck.pieces, 2), false);
  assert.equal(
    escapedCheck.pieces.some((piece) => piece.id === "escape-pawn"),
    false,
  );
  assert.equal(escapedCheck.lastMove?.royalSacrifice?.pieceType, "pawn");
  assert.match(escapedCheck.event, /sacrifié.*roi prend sa place/i);
});

test("dix tours sans reine ni pion font évader le roi, même avec un œuf", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    players: base.players.map((player) =>
      player.id === 0
        ? {
            ...player,
            solitaryKingTurns: KING_SOLITUDE_ESCAPE_TURNS - 1,
          }
        : player,
    ),
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      {
        id: "egg-0",
        playerId: 0,
        type: "egg",
        level: 0,
        q: -4,
        r: 1,
        hatchTurns: 3,
      },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: 0 },
      { id: "queen-2", playerId: 2, type: "queen", level: 3, q: 3, r: 1 },
    ],
    turnIndex: 0,
  };
  const result = applyMove(state, {
    pieceId: "king-0",
    to: { q: -3, r: 0 },
  });
  assert.equal(result.winnerId, undefined);
  assert.equal(result.outcome, "royal_escape");
  assert.equal(result.players.find((player) => player.id === 0)?.alive, false);
  assert.equal(result.lastMove?.royalExitEffects?.[0]?.reason, "solitude");
  assert.match(result.event, /dix tours sans reine ni pion/i);

  const hatchingState: GameState = {
    ...state,
    players: base.players.map((player) =>
      player.id === 0
        ? {
            ...player,
            solitaryKingTurns: KING_SOLITUDE_ESCAPE_TURNS - 1,
          }
        : player,
    ),
    pieces: state.pieces.map((piece) =>
      piece.id === "egg-0" ? { ...piece, hatchTurns: 1 } : piece,
    ),
  };
  const hatchReset = applyMove(hatchingState, {
    pieceId: "king-0",
    to: { q: -3, r: 0 },
  });
  assert.equal(hatchReset.players.find((player) => player.id === 0)?.alive, true);
  assert.equal(
    hatchReset.players.find((player) => player.id === 0)?.solitaryKingTurns,
    0,
  );
  assert.equal(
    hatchReset.pieces.find((piece) => piece.id === "egg-0")?.type,
    "pawn",
  );
});

test("un véritable échec et mat explique la victoire avant de retirer la colonie", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 5 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 3, r: -3, queenBonded: false },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -4, r: 4 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
      { id: "mate-a-0", playerId: 0, type: "queen", level: 3, q: 2, r: -4, queenBonded: false },
      { id: "mate-b-0", playerId: 0, type: "queen", level: 3, q: 3, r: -4, queenBonded: false },
    ],
    turnIndex: 0,
  };
  assert.equal(isInCheck(state.pieces, 2), true);
  const result = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: -4, r: 3 },
  });
  assert.equal(result.winnerId, 0);
  assert.equal(result.drawReason, undefined);
  assert.match(result.event, /Azur est échec et mat/);
  assert.match(result.event, /Aurore règne/);
  assert.equal(result.pieces.some((piece) => piece.playerId === 2), false);
  assert.equal(result.lastMove?.royalExitEffects?.[0]?.kind, "checkmate");
  assert.equal(result.lastMove?.royalExitEffects?.[0]?.opponentId, 0);
});

test("une reine liée pond plusieurs œufs selon les potentiels et les cases libres", () => {
  const base = createNewGame(2, 2);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 1,
      r: 0,
      queenBonded: true,
    },
    { id: "block-a", playerId: 0, type: "pawn", level: 1, q: 2, r: 0 },
    { id: "block-b", playerId: 0, type: "pawn", level: 1, q: 2, r: -1 },
    { id: "block-c", playerId: 0, type: "pawn", level: 1, q: 1, r: -1 },
    { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: -1 },
    { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 3, r: -1 },
  ];
  const state: GameState = {
    ...base,
    pieces,
  };
  const beforeZones = queenSpawnCells(pieces, pieces[1]).map(coordKey);
  const reproduced = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: -1, r: 1 },
  });
  const eggs = reproduced.pieces.filter(
    (piece) => piece.playerId === 0 && piece.type === "egg",
  );
  assert.equal(eggs.length, 2);
  assert.equal(reproduced.lastMove?.spawned, true);
  assert.equal(reproduced.lastMove?.spawnedCount, 2);
  assert(eggs.every((egg) => beforeZones.includes(coordKey(egg))));
  assert(eggs.every((egg) => egg.hatchTurns === EGG_HATCH_TURNS));
  assert.equal(usedResources(reproduced.pieces, 0), 36);
  assert.equal(
    reproduced.players.find((player) => player.id === 0)?.resources,
    resourceStatusForPlayer(reproduced.pieces, 0).free,
  );
  assert.match(reproduced.event, /2 œufs pondus/);
});

test("une reine suspend la ponte si l’œuf serait écrasable avant son prochain tour", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 0,
      r: 0,
      queenBonded: true,
    },
    { id: "block-a", playerId: 0, type: "pawn", level: 1, q: 1, r: -1 },
    { id: "block-b", playerId: 0, type: "pawn", level: 1, q: 0, r: -1 },
    { id: "block-c", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
    { id: "block-d", playerId: 0, type: "pawn", level: 1, q: -1, r: 1 },
    { id: "block-e", playerId: 0, type: "pawn", level: 1, q: 0, r: 1 },
    { id: "spare-0", playerId: 0, type: "pawn", level: 1, q: -4, r: 1 },
    { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 2, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  assert.equal(
    isEggImmediatelyCrushable(pieces, { q: 1, r: 0 }, 0),
    true,
  );
  assert.deepEqual(queenSpawnCells(pieces, pieces[1]), []);

  const result = applyMove(
    { ...base, pieces },
    { pieceId: "spare-0", to: { q: -4, r: 0 } },
  );
  assert.equal(
    result.pieces.some(
      (piece) => piece.playerId === 0 && piece.type === "egg",
    ),
    false,
  );
  assert(
    result.notices.some((notice) => /Ponte suspendue/.test(notice.message)),
  );
});

test("une reine promue accomplit trois tours de cocon avant de devenir fertile", () => {
  const base = createNewGame(2, 2);
  let state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
      {
        id: "queen-0",
        playerId: 0,
        type: "queen",
        level: 3,
        q: 2,
        r: 0,
        promoted: true,
        queenBonded: false,
      },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: -1 },
      { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 3, r: -1 },
    ],
  };

  state = applyMove(state, { pieceId: "queen-0", to: { q: 0, r: 1 } });
  let queen = state.pieces.find((piece) => piece.id === "queen-0");
  let king = state.pieces.find((piece) => piece.id === "king-0");
  assert.equal(queen?.queenBonded, false);
  assert.equal(queen?.breedingTurns, ROYAL_COCOON_TURNS);
  assert.equal(king?.breedingTurns, ROYAL_COCOON_TURNS);
  assert.equal(activeRoyalCocoons(state.pieces).length, 1);
  assert.equal(state.lastMove?.royalCocoonEffects?.[0]?.kind, "started");
  assert.equal(
    isCellProtectedByRoyalCocoon(state.pieces, { q: 3, r: 0 }, 0),
    true,
  );
  assert.equal(ROYAL_COCOON_RADIUS, 4);

  [0, 1, 2].forEach((index) => {
    state = passTurnBlockedByRoyalCocoon({
      ...state,
      turnIndex: 0,
      winnerId: undefined,
      drawReason: undefined,
    });
    queen = state.pieces.find((piece) => piece.id === "queen-0");
    assert.equal(queen?.breedingTurns, Math.max(0, 2 - index));
  });
  queen = state.pieces.find((piece) => piece.id === "queen-0");
  king = state.pieces.find((piece) => piece.id === "king-0");
  assert.equal(queen?.queenBonded, true);
  assert.equal(queen?.breedingPartnerId, undefined);
  assert.equal(king?.breedingPartnerId, undefined);
  assert.equal(state.lastMove?.royalCocoonEffects?.[0]?.kind, "completed");

  state = applyMove(
    { ...state, turnIndex: 0, winnerId: undefined },
    { pieceId: "queen-0", to: { q: 2, r: 1 } },
  );
  queen = state.pieces.find((piece) => piece.id === "queen-0");
  assert.equal(queen?.queenBonded, true);
});

test("le cocon rend toute sa zone de distance quatre imprenable", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    {
      id: "king-0",
      playerId: 0,
      type: "king",
      level: 4,
      q: 0,
      r: 0,
      breedingTurns: 3,
      breedingPartnerId: "queen-0",
    },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 1,
      r: 0,
      queenBonded: false,
      breedingTurns: 3,
      breedingPartnerId: "king-0",
    },
    { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 5, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -1 },
  ];
  const state: GameState = { ...base, pieces, turnIndex: 1 };
  assert.equal(activeRoyalCocoons(pieces).length, 1);
  assert.equal(isSquareAttacked(pieces, { q: 0, r: 0 }, 0), false);
  assert.equal(
    legalMovesForPiece(state, "pawn-2").some((move) =>
      sameCoord(move.to, { q: 4, r: 0 }),
    ),
    false,
  );
  assert.equal(
    legalMovesForPiece({ ...state, turnIndex: 0 }, "queen-0").length,
    0,
  );
});

test("la forteresse-cocon immobilise toutes les pièces placées sous son dôme", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    {
      id: "king-0",
      playerId: 0,
      type: "king",
      level: 4,
      q: 0,
      r: 0,
      breedingTurns: 3,
      breedingPartnerId: "queen-0",
    },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 1,
      r: 0,
      queenBonded: false,
      breedingTurns: 3,
      breedingPartnerId: "king-0",
    },
    { id: "ally-under", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
    { id: "enemy-under", playerId: 2, type: "pawn", level: 1, q: 4, r: 0 },
    { id: "enemy-outside", playerId: 2, type: "pawn", level: 1, q: -5, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: -5, r: 1 },
  ];
  const state: GameState = { ...base, pieces, turnIndex: 0 };

  ["king-0", "queen-0", "ally-under", "enemy-under"].forEach((pieceId) => {
    const piece = pieces.find((candidate) => candidate.id === pieceId)!;
    assert.equal(isPieceFrozenByRoyalCocoon(pieces, piece), true);
    assert.equal(legalMovesForPiece(state, pieceId).length, 0);
  });
  assert.equal(
    isPieceFrozenByRoyalCocoon(
      pieces,
      pieces.find((piece) => piece.id === "enemy-outside")!,
    ),
    false,
  );
  assert(legalMovesForPiece({ ...state, turnIndex: 1 }, "enemy-outside").length > 0);
});

test("un royaume entièrement scellé passe ses tours jusqu’à l’ouverture sans être éliminé", () => {
  const base = createNewGame(2, 0, 4);
  let state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 5 },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -4, r: 4 },
      {
        id: "king-2",
        playerId: 2,
        type: "king",
        level: 4,
        q: 3,
        r: -3,
        breedingTurns: 3,
        breedingPartnerId: "queen-2",
      },
      {
        id: "queen-2",
        playerId: 2,
        type: "queen",
        level: 3,
        q: 4,
        r: -4,
        promoted: true,
        queenBonded: false,
        breedingTurns: 3,
        breedingPartnerId: "king-2",
      },
    ],
    turnIndex: 0,
  };

  const pawnTargets = [
    { q: -3, r: 3 },
    { q: -4, r: 4 },
    { q: -3, r: 3 },
  ];
  pawnTargets.forEach((to, index) => {
    state = applyMove(state, { pieceId: "pawn-0", to });
    assert.equal(isTurnBlockedByRoyalCocoon(state, 2), true);
    state = passTurnBlockedByRoyalCocoon(state);
    const player = state.players.find((candidate) => candidate.id === 2)!;
    const queen = state.pieces.find((piece) => piece.id === "queen-2")!;
    assert.equal(player.alive, true);
    assert.equal(player.personalTurns, index + 1);
    assert.equal(state.turnIndex, 0);
    assert.equal(queen.breedingTurns ?? 0, Math.max(0, 2 - index));
  });

  const queen = state.pieces.find((piece) => piece.id === "queen-2")!;
  assert.equal(queen.queenBonded, true);
  assert.equal(queen.breedingPartnerId, undefined);
  assert.equal(
    state.lastMove?.royalCocoonEffects?.some(
      (effect) => effect.playerId === 2 && effect.kind === "completed",
    ),
    true,
  );
  assert.match(state.event, /forteresse s’ouvre/i);
});

test("les instincts de survie distinguent couverture, retraite et préparation du vortex", () => {
  const base = createNewGame(2, 0, 4);
  const coveredPieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
    { id: "rear-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 0 },
    { id: "front-0", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
    { id: "enemy-2", playerId: 2, type: "pawn", level: 1, q: 3, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  assert.equal(pawnHasForwardCover(coveredPieces, 0, "rear-0"), true);
  assert.equal(
    pawnHasForwardCover(
      coveredPieces.filter((piece) => piece.id !== "front-0"),
      0,
      "rear-0",
    ),
    false,
  );
  assert.equal(
    isSeverelyOutnumbered(
      [
        ...coveredPieces,
        { id: "enemy-extra-a", playerId: 2, type: "pawn", level: 1, q: 3, r: -1 },
        { id: "enemy-extra-b", playerId: 2, type: "pawn", level: 1, q: 4, r: -1 },
        { id: "enemy-extra-c", playerId: 2, type: "pawn", level: 1, q: 4, r: -2 },
        { id: "enemy-extra-d", playerId: 2, type: "pawn", level: 1, q: 5, r: -2 },
      ],
      0,
    ),
    true,
  );

  const retreatState: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      { id: "bait-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 0 },
      { id: "rear-0", playerId: 0, type: "pawn", level: 1, q: -2, r: 0 },
      { id: "enemy-2", playerId: 2, type: "pawn", level: 1, q: 2, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
    ],
    turnIndex: 0,
  };
  const retreat = chooseAiMove(
    retreatState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(retreat);
  const retreatMover = retreatState.pieces.find(
    (piece) => piece.id === retreat.move.pieceId,
  );
  assert.equal(retreatMover?.type, "pawn");
  assert(
    hexDistance(retreat.move.to, retreatState.pieces[3]) >
      hexDistance(retreatMover!, retreatState.pieces[3]),
  );

  const vortexState: GameState = {
    ...retreatState,
    pieces: retreatState.pieces.filter((piece) => piece.id !== "rear-0"),
  };
  assert.equal(isVortexPreparationMode(vortexState, 0), true);
  const attack = chooseAiMove(
    vortexState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(attack);
  assert.equal(attack.move.pieceId, "bait-0");
  assert(
    hexDistance(attack.move.to, vortexState.pieces[2]) <
      hexDistance(vortexState.pieces[1], vortexState.pieces[2]),
  );

  const reproductionState: GameState = {
    ...base,
    turnIndex: 0,
    pieces: [
      { id: "k0", playerId: 0, type: "king", level: 4, q: -4, r: 2 },
      { id: "q0", playerId: 0, type: "queen", level: 3, queenBonded: true, q: 4, r: 1 },
      { id: "p0", playerId: 0, type: "pawn", level: 1, q: 0, r: 3 },
      { id: "p1", playerId: 0, type: "pawn", level: 1, q: 2, r: 0 },
      { id: "p2", playerId: 0, type: "pawn", level: 1, q: 1, r: -3 },
      { id: "k2", playerId: 2, type: "king", level: 4, q: 2, r: -2 },
    ],
  };
  assert.equal(
    moveEnablesQueenReproduction(reproductionState, {
      pieceId: "p0",
      to: { q: -1, r: 4 },
    }),
    true,
  );
});

test("une nouvelle reine rejoint le roi avant toute stratégie secondaire", () => {
  const base = createNewGame(2, 0, 4);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      {
        id: "queen-0",
        playerId: 0,
        type: "queen",
        level: 3,
        q: 0,
        r: 0,
        promoted: true,
        queenBonded: false,
      },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -3, r: 1 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
      { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 4, r: 0 },
    ],
    turnIndex: 0,
  };
  const choice = chooseAiMove(
    state,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(choice);
  assert.equal(choice.move.pieceId, "queen-0");
  assert(
    hexDistance(choice.move.to, state.pieces[0]) <
      hexDistance(state.pieces[1], state.pieces[0]),
  );
});

test("une reine ne s’échange pas à perte sans promotion sûre en réserve", () => {
  const base = createNewGame(2, 0, 4);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 0, queenBonded: true },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -3, r: 0 },
      { id: "queen-2", playerId: 2, type: "queen", level: 3, q: 2, r: 0 },
      { id: "guard-2", playerId: 2, type: "pawn", level: 1, q: 3, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
    ],
    turnIndex: 0,
  };
  assert.equal(unstoppablePromotionPawn(state.pieces, 0), undefined);
  const choice = chooseAiMove(
    state,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(choice);
  assert.equal(
    choice.move.pieceId === "queen-0" &&
      sameCoord(choice.move.to, { q: 2, r: 0 }),
    false,
  );

  const promotionPieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -4, r: 0 },
    { id: "runner-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 4 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
  ];
  assert.equal(unstoppablePromotionPawn(promotionPieces, 0)?.id, "runner-0");
  assert.equal(hasOverwhelmingArmyForQueenTrade(promotionPieces, 0), false);

  const smallReserveState: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 0, r: 0, queenBonded: true },
      { id: "runner-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 4 },
      { id: "reserve-0", playerId: 0, type: "pawn", level: 1, q: -5, r: 2 },
      { id: "queen-2", playerId: 2, type: "queen", level: 3, q: 2, r: 0 },
      { id: "guard-2", playerId: 2, type: "pawn", level: 1, q: 3, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
    ],
    turnIndex: 0,
  };
  assert.equal(
    hasOverwhelmingArmyForQueenTrade(smallReserveState.pieces, 0),
    false,
  );
  assert.equal(
    unstoppablePromotionPawn(smallReserveState.pieces, 0)?.id,
    "runner-0",
  );
  const reservedChoice = chooseAiMove(
    smallReserveState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(reservedChoice);
  assert.equal(
    reservedChoice.move.pieceId === "queen-0" &&
      sameCoord(reservedChoice.move.to, { q: 2, r: 0 }),
    false,
  );
});

test("le garde-fou déplace la reine menacée malgré un score neuronal contraire", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -5, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 0,
      r: 0,
      queenBonded: true,
    },
    { id: "egg-0", playerId: 0, type: "egg", level: 0, q: 1, r: 0, hatchTurns: 2 },
    { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -4, r: 1 },
    { id: "pawn-2", playerId: 2, type: "pawn", level: 1, q: 2, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  assert.equal(isQueenTacticallyCapturable(pieces, pieces[1], 0), true);
  const choice = chooseAiMove(
    { ...base, pieces, turnIndex: 0 },
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
    "balanced",
    ({ move }) => (move.pieceId === "queen-0" ? -1.25 : 1.25),
  );
  assert(choice);
  assert.equal(choice.move.pieceId, "queen-0");
});

test("un œuf reste immobile puis éclot après trois tours de sa colonie", () => {
  const base = createNewGame(2, 2);
  let state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -2, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 2, r: 0, queenBonded: false },
      { id: "egg-0", playerId: 0, type: "egg", level: 0, q: 0, r: 0, hatchTurns: 3 },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: -1 },
    ],
  };
  assert.equal(legalMovesForPiece(state, "egg-0").length, 0);
  const destinations = [
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
  ];
  destinations.forEach((to, index) => {
    state = applyMove(
      { ...state, turnIndex: 0, winnerId: undefined },
      { pieceId: "pawn-0", to },
    );
    const eggOrPawn = state.pieces.find((piece) => piece.id === "egg-0");
    if (index < 2) {
      assert.equal(eggOrPawn?.type, "egg");
      assert.equal(eggOrPawn?.hatchTurns, 2 - index);
    } else {
      assert.equal(eggOrPawn?.type, "pawn");
      assert.equal(state.lastMove?.hatchedCount, 1);
    }
  });
});

test("un œuf est inerte et peut être écrasé même par sa propre colonie", () => {
  const base = createNewGame(2, 2);
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -2, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: -1,
      r: 1,
      queenBonded: false,
    },
    { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
    {
      id: "egg-0",
      playerId: 0,
      type: "egg",
      level: 0,
      q: 0,
      r: 0,
      hatchTurns: 3,
    },
    { id: "hull-a", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
    { id: "hull-b", playerId: 0, type: "pawn", level: 1, q: 0, r: 1 },
    { id: "blast-enemy", playerId: 2, type: "pawn", level: 1, q: 1, r: -1 },
    {
      id: "blast-egg",
      playerId: 2,
      type: "egg",
      level: 0,
      q: 0,
      r: -1,
      hatchTurns: 2,
    },
    { id: "chain-survivor", playerId: 2, type: "pawn", level: 1, q: 1, r: -2 },
    {
      id: "enemy-egg",
      playerId: 2,
      type: "egg",
      level: 0,
      q: 0,
      r: 0,
      hatchTurns: 2,
    },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  // Une partie valide ne superpose pas deux œufs : le second sert seulement à
  // vérifier séparément que les œufs ennemis ne bloquent pas un territoire.
  const movementPieces = pieces.filter((piece) => piece.id !== "enemy-egg");
  const state: GameState = { ...base, pieces: movementPieces, turnIndex: 0 };
  assert.equal(populationForPlayer(movementPieces, 0), 5);
  assert.equal(isInCheck(movementPieces, 0), false);
  assert(
    legalMovesForPiece(state, "pawn-0").some((move) =>
      sameCoord(move.to, { q: 0, r: 0 }),
    ),
  );
  const crushed = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: 0, r: 0 },
  });
  assert.equal(crushed.pieces.some((piece) => piece.id === "egg-0"), false);
  ["queen-0", "hull-a", "hull-b", "blast-enemy", "blast-egg"].forEach(
    (pieceId) =>
      assert.equal(
        crushed.pieces.some((piece) => piece.id === pieceId),
        false,
        `${pieceId} doit être détruit par l’onde`,
      ),
  );
  assert.equal(crushed.pieces.some((piece) => piece.id === "pawn-0"), true);
  assert.equal(
    crushed.pieces.some((piece) => piece.id === "chain-survivor"),
    true,
    "un œuf voisin détruit ne produit pas de seconde onde",
  );
  assert.equal(crushed.lastMove?.capturedType, "egg");
  assert.deepEqual(
    new Set(crushed.lastMove?.eggBlast?.victims.map((victim) => victim.pieceId)),
    new Set(["queen-0", "hull-a", "hull-b", "blast-enemy", "blast-egg"]),
  );
  assert.match(crushed.event, /œuf de la colonie est écrasé/i);
  assert.match(crushed.event, /six cases voisines/i);

  const territoryPieces = pieces.filter((piece) => piece.id !== "egg-0");
  assert(
    territoryForPlayer(territoryPieces, 0).cells.some((cell) =>
      sameCoord(cell, { q: 0, r: 0 }),
    ),
  );
});

test("une onde d’œuf ne peut jamais détruire le roi de la colonie qui joue", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    turnIndex: 0,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 1, r: 0 },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
      { id: "egg-2", playerId: 2, type: "egg", level: 0, q: 0, r: 0, hatchTurns: 2 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
    ],
  };
  assert.equal(
    legalMovesForPiece(state, "pawn-0").some((candidate) =>
      sameCoord(candidate.to, { q: 0, r: 0 }),
    ),
    false,
  );
  assert.equal(
    applyMove(state, { pieceId: "pawn-0", to: { q: 0, r: 0 } }),
    state,
  );
});

test("l’onde d’un œuf peut éliminer un roi adverse sur une case voisine", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    turnIndex: 0,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -3, r: 0 },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
      { id: "egg-2", playerId: 2, type: "egg", level: 0, q: 0, r: 0, hatchTurns: 2 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 1, r: 0 },
    ],
  };
  const exploded = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: 0, r: 0 },
  });
  assert.equal(exploded.pieces.some((piece) => piece.id === "king-2"), false);
  assert.equal(exploded.players.find((player) => player.id === 2)?.alive, false);
  assert.equal(exploded.winnerId, 0);
  assert.equal(exploded.lastMove?.royalExitEffects?.[0]?.reason, "egg-blast");
  assert.match(exploded.event, /roi dans l’onde de pression/i);
});

test("la forteresse-cocon protège aussi d’une onde de pression voisine", () => {
  const base = createNewGame(2, 0, 4);
  const pieces: Piece[] = [
    {
      id: "king-0",
      playerId: 0,
      type: "king",
      level: 4,
      q: -5,
      r: 0,
      breedingTurns: 3,
      breedingPartnerId: "queen-0",
    },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: -4,
      r: 0,
      queenBonded: false,
      breedingTurns: 3,
      breedingPartnerId: "king-0",
    },
    { id: "protected-0", playerId: 0, type: "pawn", level: 1, q: 0, r: 0 },
    { id: "egg-2", playerId: 2, type: "egg", level: 0, q: 1, r: 0, hatchTurns: 2 },
    { id: "crusher-2", playerId: 2, type: "pawn", level: 1, q: 2, r: 0 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: -5 },
  ];
  assert.equal(
    eggBlastVictimsForMove(pieces, {
      pieceId: "crusher-2",
      to: { q: 1, r: 0 },
    }).some((piece) => piece.id === "protected-0"),
    false,
  );
  const exploded = applyMove(
    { ...base, pieces, turnIndex: 1 },
    { pieceId: "crusher-2", to: { q: 1, r: 0 } },
  );
  assert.equal(
    exploded.pieces.some((piece) => piece.id === "protected-0"),
    true,
  );
});

test("une ancienne réserve cumulée est remplacée par la capacité du terrain", () => {
  const base = createNewGame(2, 2);
  const state: GameState = {
    ...base,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: 0, r: 0 },
      { id: "queen-0", playerId: 0, type: "queen", level: 3, q: 2, r: 0, queenBonded: false },
      { id: "pawn-0", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 4, r: -1 },
    ],
    players: base.players.map((player) =>
      player.id === 0
        ? { ...player, resources: 1576, resourcesEarned: 1644 }
        : player,
    ),
  };
  const result = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: -1, r: 1 },
  });
  const status = resourceStatusForPlayer(result.pieces, 0);
  const player = result.players.find((candidate) => candidate.id === 0);
  assert.equal(player?.resourcesEarned, status.capacity);
  assert.equal(player?.resources, status.free);
  assert(status.capacity < 300);
  assert.equal(usedResources(result.pieces, 0), 31);
});

test("chaque reine liée expose ses cases de ponte libres", () => {
  const pieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -2, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 0,
      r: 0,
      queenBonded: true,
      breedingTurns: 2,
    },
    { id: "block-a", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
    { id: "block-b", playerId: 2, type: "pawn", level: 1, q: 0, r: 1 },
  ];
  assert.equal(queenSpawnCells(pieces, pieces[1]).length, 4);
  assert.equal(queenSpawnSpaceRatio(pieces, 0), 4 / 6);
  assert(queenSpawnReadiness(pieces, 0) > 0.6);
  const unbonded = pieces.map((piece) =>
    piece.id === "queen-0" ? { ...piece, queenBonded: false } : piece,
  );
  assert.equal(queenSpawnSpaceRatio(unbonded, 0), 0);
});

test("l’IA protège sa reine et libère une nurserie par un saut ouvert", () => {
  const game = createNewGame(2, 0, 4);
  const crowdedPieces: Piece[] = [
    { id: "king-0", playerId: 0, type: "king", level: 4, q: -2, r: 0 },
    {
      id: "queen-0",
      playerId: 0,
      type: "queen",
      level: 3,
      q: 0,
      r: 0,
      queenBonded: true,
    },
    { id: "pawn-a", playerId: 0, type: "pawn", level: 1, q: 1, r: 0 },
    { id: "pawn-b", playerId: 0, type: "pawn", level: 1, q: 1, r: -1 },
    { id: "pawn-c", playerId: 0, type: "pawn", level: 1, q: 0, r: -1 },
    { id: "pawn-d", playerId: 0, type: "pawn", level: 1, q: -1, r: 0 },
    { id: "pawn-e", playerId: 0, type: "pawn", level: 1, q: -1, r: 1 },
    { id: "pawn-f", playerId: 0, type: "pawn", level: 1, q: 0, r: 1 },
    { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
  ];
  const crowdedState: GameState = { ...game, pieces: crowdedPieces };
  const nurseryChoice = chooseAiMove(
    crowdedState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(nurseryChoice);
  assert(nurseryChoice.features[13] > 0);
  const nurseryMover = crowdedPieces.find(
    (piece) => piece.id === nurseryChoice.move.pieceId,
  );
  assert(nurseryMover);
  assert(
    nurseryMover.type === "queen" ||
      (nurseryMover.type === "pawn" &&
        hexDistance(nurseryMover, { q: 0, r: 0 }) === 1 &&
        hexDistance(nurseryChoice.move.to, { q: 0, r: 0 }) > 1),
  );

  const threatenedState: GameState = {
    ...game,
    pieces: [
      { id: "king-0", playerId: 0, type: "king", level: 4, q: -2, r: 0 },
      {
        id: "queen-0",
        playerId: 0,
        type: "queen",
        level: 3,
        q: 0,
        r: 0,
        queenBonded: true,
      },
      { id: "enemy-pawn", playerId: 2, type: "pawn", level: 1, q: 1, r: 0 },
      { id: "king-2", playerId: 2, type: "king", level: 4, q: 5, r: 0 },
    ],
  };
  assert(queenDisciplineValue(threatenedState.pieces, 0) < 0);
  const rescueChoice = chooseAiMove(
    threatenedState,
    0,
    Array(14).fill(0),
    undefined,
    0,
    1,
    true,
  );
  assert(rescueChoice);
  assert.equal(rescueChoice.move.pieceId, "queen-0");
  assert(rescueChoice.features[12] > 0);
});

test("les positions sont enregistrées uniquement avant les coups humains", () => {
  const game = createNewGame(2, 1);
  const humanMove = allLegalMoves(game, 0).find(
    (move) => game.pieces.find((piece) => piece.id === move.pieceId)?.type === "pawn",
  );
  assert(humanMove);
  const afterHuman = applyMove(game, humanMove);
  assert.equal(afterHuman.humanMoveTrace.length, 1);
  assert.equal(afterHuman.humanMoveTrace[0].playerId, 0);
  assert.equal(afterHuman.humanMoveTrace[0].position.pieces.length, 14);
  assert.equal(
    typeof afterHuman.humanMoveTrace[0].position.pieces[0].queenBonded,
    "boolean",
  );
  assert.deepEqual(afterHuman.humanMoveTrace[0].action.to, humanMove.to);

  const aiId = currentPlayerId(afterHuman);
  assert.equal(afterHuman.players.find((player) => player.id === aiId)?.role, "ai");
  const aiMove = allLegalMoves(afterHuman, aiId)[0];
  assert(aiMove);
  const afterAi = applyMove(afterHuman, aiMove);
  assert.equal(afterAi.humanMoveTrace.length, 1);
});

test("les exemples humains des autres côtés sont enregistrés face au nord", () => {
  let game = createNewGame(2, 2);
  const firstMove = allLegalMoves(game, 0)[0];
  assert(firstMove);
  game = applyMove(game, firstMove);
  const secondMove = allLegalMoves(game, 2)[0];
  assert(secondMove);
  game = applyMove(game, secondMove);
  const frame = game.humanMoveTrace[1];
  assert(frame);
  assert.equal(frame.playerId, 2);
  assert.equal(frame.canonicalPlayerId, 0);
  assert.equal(frame.perspectiveRotationSteps, 3);
  const canonicalQueen = frame.position.pieces.find(
    (piece) => piece.id.startsWith("p2-queen"),
  );
  assert(canonicalQueen);
  assert.equal(canonicalQueen.playerId, 0);
  assert.deepEqual(
    { q: canonicalQueen.q, r: canonicalQueen.r },
    PLAYER_META[0].home,
  );
});

test("une victoire humaine est archivée une seule fois, contrairement à une victoire IA", () => {
  const game = createNewGame(2, 1);
  const move = allLegalMoves(game, 0)[0];
  assert(move);
  const played = applyMove(game, move);
  const humanVictory: GameState = { ...played, winnerId: 0 };
  const initial = createEmptyHumanTrainingArchive();
  const first = archiveHumanVictory(initial, humanVictory);

  assert.equal(first.added, true);
  assert.equal(first.frameCount, 1);
  assert.equal(first.archive.games.length, 1);
  assert.equal(first.archive.encoding.tensorHint.width, 11);

  const duplicate = archiveHumanVictory(first.archive, humanVictory);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.archive.games.length, 1);

  const aiVictory: GameState = {
    ...played,
    matchId: `${played.matchId}-ai`,
    winnerId: 2,
  };
  const rejected = archiveHumanVictory(first.archive, aiVictory);
  assert.equal(rejected.added, false);
});

test("les victoires humaines trop lourdes sont échantillonnées sans perdre la plus récente", () => {
  const game = createNewGame(2, 1);
  const move = allLegalMoves(game, 0)[0];
  assert(move);
  const played = applyMove(game, move);
  const archived = archiveHumanVictory(
    createEmptyHumanTrainingArchive(),
    { ...played, winnerId: 0 },
  ).archive;
  const seed = archived.games[0];
  assert(seed);
  const bloated = {
    ...archived,
    games: Array.from({ length: 9 }, (_, gameIndex) => ({
      ...seed,
      id: `heavy-${gameIndex}`,
      matchId: `heavy-match-${gameIndex}`,
      frames: Array.from({ length: 100 }, (_, frameIndex) => ({
        ...seed.frames[0],
        ply: frameIndex,
      })),
    })),
  };
  const compacted = emergencyCompactHumanTrainingArchive(bloated);
  assert.equal(compacted.games.length, 4);
  assert(compacted.games.every((record) => record.frames.length <= 24));
  assert.equal(compacted.games[0].id, "heavy-0");
  assert.equal(compacted.games[0].frames[0].ply, 0);
  assert.equal(compacted.games[0].frames.at(-1)?.ply, 99);
});

test("les quatre tendances possèdent des génomes distincts", () => {
  const league = createDefaultSelfPlayLeague();
  assert.deepEqual(Object.keys(league.profiles), [...AI_STRATEGY_IDS]);
  const signatures = AI_STRATEGY_IDS.map((id) =>
    league.profiles[id].memory.weights.join(","),
  );
  assert.equal(new Set(signatures).size, 4);
  assert.equal(strategyForAiPlayer(createNewGame(2, 1), 2), "balanced");
});

test("la perspective canonique replace chaque royaume dans la même orientation", () => {
  ([0, 1, 2, 3, 4, 5] as const).forEach((playerId) => {
    assert.deepEqual(
      canonicalCoordForPlayer(PLAYER_META[playerId].home, playerId),
      PLAYER_META[0].home,
    );
    assert.deepEqual(
      canonicalCoordForPlayer(PLAYER_META[playerId].opposite, playerId),
      PLAYER_META[0].opposite,
    );
    assert.equal(canonicalPlayerIdForPerspective(playerId, playerId), 0);
  });

  const game = createNewGame(2, 0, 4);
  const movesByPlayer = ([0, 2] as const).map((playerId) =>
    allLegalMoves(game, playerId).map((move) => {
      const mover = game.pieces.find((piece) => piece.id === move.pieceId)!;
      return {
        move,
        signature: JSON.stringify({
          type: mover.type,
          from: canonicalCoordForPlayer(mover, playerId),
          to: canonicalCoordForPlayer(move.to, playerId),
        }),
      };
    }),
  );
  const mirrored = movesByPlayer[0].find((first) =>
    movesByPlayer[1].some((second) => second.signature === first.signature),
  );
  assert(mirrored);
  const opposite = movesByPlayer[1].find(
    (candidate) => candidate.signature === mirrored.signature,
  );
  assert(opposite);
  assert.deepEqual(
    moveFeatures(game, mirrored.move),
    moveFeatures(game, opposite.move),
  );
});

test("le sélecteur passe de l’expansion à la protection du premier couvain", () => {
  const game = createNewGame(2, 0, 4);
  assert.equal(selectStrategicPhase(game, 0, "balanced"), "expansion");
  const emptyCell = BOARD_CELLS.find(
    (cell) => !game.pieces.some((piece) => sameCoord(piece, cell)),
  );
  assert(emptyCell);
  const afterFirstTurn: GameState = {
    ...game,
    pieces: [
      ...game.pieces,
      {
        id: "first-brood",
        playerId: 0,
        type: "egg",
        level: 0,
        hatchTurns: EGG_HATCH_TURNS,
        ...emptyCell,
      },
    ],
    players: game.players.map((player) =>
      player.id === 0 ? { ...player, personalTurns: 1 } : player,
    ),
  };
  assert.equal(
    selectStrategicPhase(afterFirstTurn, 0, "balanced"),
    "brood_protection",
  );
});

test("le super-modèle partage un tronc commun tout en gardant les caractères", () => {
  const league = createDefaultSelfPlayLeague();
  const live = league.profiles.balanced.memory;
  const aggressive = blendedSuperModelWeights(
    league,
    "aggressive",
    live,
    4,
  );
  const expansionist = blendedSuperModelWeights(
    league,
    "expansionist",
    live,
    4,
  );
  assert.equal(aggressive.length, 14);
  assert.equal(expansionist.length, 14);
  assert.notDeepEqual(aggressive, expansionist);
  assert.notDeepEqual(
    aggressive,
    league.profiles.aggressive.memory.championWeights,
  );
  const layers = buildSuperModelLayers(league, "aggressive", live, 4);
  assert.equal(layers.sharedWeights.length, 14);
  assert.equal(layers.personalityWeights.length, 14);
  assert.equal(layers.liveWeights.length, 14);
  assert.deepEqual(layers.blendedWeights, aggressive);
  assert.equal(
    Math.round(
      (layers.shares.shared + layers.shares.personality + layers.shares.live) *
        100,
    ),
    100,
  );
});

test("la puissance d’entraînement règle le Worker sans dépasser ses bornes", () => {
  assert.equal(validateTrainingPower(undefined), 3);
  assert.equal(validateTrainingPower("4"), 4);
  assert.equal(validateTrainingPower("99"), 3);
  assert.equal(TRAINING_POWER_META[3].percent, 75);
  assert.equal(trainingDelayMs(3, true), 900);
  assert.equal(trainingDelayMs(3, false), 320);
  assert.equal(trainingDelayMs(4, false), 220);
  assert(trainingDelayMs(1, true) > trainingDelayMs(4, true));
});

test("chaque profil conserve quatre difficultés de poids distinctes", () => {
  const league = createDefaultSelfPlayLeague();
  AI_STRATEGY_IDS.forEach((id) => {
    const signatures = ([1, 2, 3, 4] as const).map((difficulty) =>
      difficultySnapshot(league.profiles[id], difficulty).weights.join(","),
    );
    assert.equal(new Set(signatures).size, 4);
    assert.equal(league.profiles[id].championHistory.length, 4);
  });
  assert(
    AI_DIFFICULTY_META[1].explorationRate >
      AI_DIFFICULTY_META[4].explorationRate,
  );
  assert.equal(createNewGame(2, 1, 4).config.aiDifficulty, 4);
});

test("les anciens poids à 12 entrées sont conservés et enrichis", () => {
  const legacy = createDefaultSelfPlayLeague();
  AI_STRATEGY_IDS.forEach((id) => {
    legacy.profiles[id].memory.weights =
      legacy.profiles[id].memory.weights.slice(0, 12);
    legacy.profiles[id].memory.championWeights =
      legacy.profiles[id].memory.championWeights.slice(0, 12);
    legacy.profiles[id].championHistory = legacy.profiles[
      id
    ].championHistory.map((snapshot) => ({
      ...snapshot,
      weights: snapshot.weights.slice(0, 12),
    }));
  });
  const migrated = validateSelfPlayLeague(legacy);
  AI_STRATEGY_IDS.forEach((id) => {
    assert.equal(migrated.profiles[id].memory.weights.length, 14);
    assert.equal(migrated.profiles[id].championHistory[0].weights.length, 14);
  });
});

test("les minima stratégiques disparaissent quand les garde-fous sont coupés", () => {
  const league = createDefaultSelfPlayLeague();
  league.guardrailsEnabled = false;
  AI_STRATEGY_IDS.forEach((id) => {
    [10, 12, 13].forEach((index) => {
      league.profiles[id].memory.weights[index] = -4;
      league.profiles[id].memory.championWeights[index] = -4;
      league.profiles[id].championHistory.forEach((snapshot) => {
        snapshot.weights[index] = -4;
      });
    });
  });
  const imported = validateSelfPlayLeague(league);
  assert.equal(imported.guardrailsEnabled, false);
  AI_STRATEGY_IDS.forEach((id) => {
    [10, 12, 13].forEach((index) => {
      assert.equal(imported.profiles[id].memory.weights[index], -4);
      assert.equal(imported.profiles[id].championHistory[0].weights[index], -4);
    });
    const raw = blendedStrategyWeights(
      imported.profiles[id],
      imported.profiles[id].memory,
      4,
      false,
    );
    const guarded = blendedStrategyWeights(
      imported.profiles[id],
      imported.profiles[id].memory,
      4,
      true,
    );
    assert.equal(raw[10], -4);
    assert(guarded[10] > 0);
    assert(guarded[12] > 0);
    assert(guarded[13] > 0);
  });
});

test("deux ligues compatibles fusionnent leurs quatre profils et difficultés à 50/50", () => {
  const local = createDefaultSelfPlayLeague();
  const imported = createDefaultSelfPlayLeague();
  local.trainingEnabled = false;
  local.guardrailsEnabled = false;
  local.duels = 7;
  imported.duels = 11;

  AI_STRATEGY_IDS.forEach((id) => {
    local.profiles[id].memory.weights = Array(14).fill(0);
    local.profiles[id].memory.championWeights = Array(14).fill(0);
    imported.profiles[id].memory.weights = Array(14).fill(2);
    imported.profiles[id].memory.championWeights = Array(14).fill(2);
    local.profiles[id].wins = 2;
    imported.profiles[id].wins = 3;
    local.profiles[id].championHistory.forEach((snapshot, index) => {
      snapshot.weights = Array(14).fill(index);
    });
    imported.profiles[id].championHistory.forEach((snapshot, index) => {
      snapshot.weights = Array(14).fill(index + 4);
    });
  });
  local.matchups.aggressive.balanced.wins = 2;
  imported.matchups.aggressive.balanced.wins = 5;

  const mergedLive = mergeAiMemories(
    local.profiles.balanced.memory,
    imported.profiles.balanced.memory,
  );
  assert.equal(mergedLive.weights[0], 1);
  assert.equal(mergedLive.championWeights[0], 1);

  const merged = mergeSelfPlayLeagues(local, imported);
  assert.equal(merged.trainingEnabled, false);
  assert.equal(merged.guardrailsEnabled, false);
  assert.equal(merged.duels, 18);
  assert.equal(merged.mergeCount, 1);
  assert.equal(merged.matchups.aggressive.balanced.wins, 7);
  AI_STRATEGY_IDS.forEach((id) => {
    const profile = merged.profiles[id];
    assert.equal(profile.memory.weights[0], 1);
    assert.equal(profile.wins, 5);
    assert.equal(profile.championHistory.length, 4);
    assert.equal(difficultySnapshot(profile, 1).weights[0], 2);
    assert.equal(difficultySnapshot(profile, 4).weights[0], 4);
    assert.equal(profile.memory.championWeights[0], 4);
  });
  assert.equal(local.profiles.balanced.memory.weights[0], 0);
  assert.equal(imported.profiles.balanced.memory.weights[0], 2);
  assert.equal(validateSelfPlayLeague(merged).mergeCount, 1);
});

test("la ligue joue en autonomie et ne remplace un champion que sur amélioration", () => {
  const initial = createDefaultSelfPlayLeague();
  const trained = Array.from({ length: 6 }).reduce(
    (league) => runSelfPlayDuel(league, 24),
    initial,
  );

  assert.equal(trained.duels, 6);
  assert(trained.positionsEvaluated > 0);
  AI_STRATEGY_IDS.forEach((id) => {
    const before = initial.profiles[id].memory;
    const after = trained.profiles[id].memory;
    assert(after.games > 0);
    assert(after.generation > before.generation);
    assert(after.bestFitness >= before.bestFitness);
    assert.equal(after.championWeights.length, 14);
    assert(trained.profiles[id].championHistory.length >= 5);
    const scores = strategicScoreAverages(trained.profiles[id]);
    assert(scores.queenSurvival >= 0 && scores.queenSurvival <= 100);
    assert(scores.spawnSpace >= 0 && scores.spawnSpace <= 100);
  });
});

test("l’IA détecte le style humain puis choisit son meilleur contre-profil", () => {
  const game = createNewGame(2, 1, 4);
  const move = allLegalMoves(game, 0)[0];
  assert(move);
  const observed = applyMove(game, move);
  const frame = observed.humanMoveTrace[0];
  observed.humanMoveTrace = Array.from({ length: 8 }, (_, index) => ({
    ...frame,
    ply: index + 1,
    features: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 1],
  }));
  const league = createDefaultSelfPlayLeague();
  const initialChoice = bestStrategyAgainstHuman(league, observed);
  assert.equal(initialChoice.humanStrategy, "aggressive");
  assert.equal(initialChoice.strategy, "balanced");

  league.matchups.reproduction.aggressive = {
    wins: 24,
    losses: 1,
    draws: 0,
  };
  const learnedChoice = bestStrategyAgainstHuman(league, observed);
  assert.equal(learnedChoice.strategy, "reproduction");
});
