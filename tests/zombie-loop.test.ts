import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WEIGHTS,
  GameState,
  LOOP_REPETITION_LIMIT,
  LOOP_WARNING_REPETITION,
  Piece,
  PlayerId,
  allLegalMoves,
  applyMove,
  chooseAiMove,
  createNewGame,
  eggBlastVictimsForMove,
  emptyLoopTracker,
  isZombieTermite,
  legalMovesForPiece,
  loopActionSignatureForMove,
  populationForPlayer,
  repeatedActionTail,
  strategicPositionSignature,
  synchronizePlayerResources,
  territoryForPlayer,
  usedResources,
} from "../app/game-engine";

function piece(
  id: string,
  playerId: PlayerId,
  type: Piece["type"],
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
    queenBonded: false,
    breedingTurns: 0,
    ...extra,
  };
}

function stateWithThreePlayers(pieces: Piece[]): GameState {
  const base = createNewGame(3, 0, 4);
  return {
    ...base,
    matchId: "zombie-loop-three-colonies",
    pieces,
    players: synchronizePlayerResources(base.players, pieces),
    turnOrder: [0, 4, 3],
    turnIndex: 0,
    moveNumber: 40,
    round: 14,
    loopTrackers: {},
    lastMove: undefined,
    winnerId: undefined,
    drawReason: undefined,
    outcome: undefined,
  };
}

function stateWithPieces(pieces: Piece[]): GameState {
  const base = createNewGame(2, 0, 4);
  return {
    ...base,
    matchId: "zombie-loop-seeded-match",
    pieces,
    players: synchronizePlayerResources(base.players, pieces),
    turnOrder: [0, 2],
    turnIndex: 0,
    moveNumber: 40,
    round: 21,
    loopTrackers: {},
    lastMove: undefined,
    winnerId: undefined,
    drawReason: undefined,
    outcome: undefined,
  };
}

test("la signature ignore l'habillage mais inclut le trait, l'incubation et le zombie", () => {
  const base = createNewGame(2, 0);
  const decorated = {
    ...base,
    event: "Animation sans effet tactique",
    log: ["son", "vibration"],
    moveNumber: 999,
    round: 444,
  };
  assert.equal(
    strategicPositionSignature(base),
    strategicPositionSignature(decorated),
  );
  assert.notEqual(
    strategicPositionSignature(base),
    strategicPositionSignature({ ...base, turnIndex: 1 }),
  );

  const egg = piece("signature-egg", 0, "egg", 0, 0, { hatchTurns: 3 });
  const withEgg = { ...base, pieces: [...base.pieces, egg] };
  assert.notEqual(
    strategicPositionSignature(withEgg),
    strategicPositionSignature({
      ...withEgg,
      pieces: withEgg.pieces.map((candidate) =>
        candidate.id === egg.id ? { ...candidate, hatchTurns: 2 } : candidate,
      ),
    }),
  );

  const zombie = piece("signature-zombie", 0, "pawn", 1, 0, {
    zombieActivationsRemaining: 10,
  });
  const withZombie = { ...base, pieces: [...base.pieces, zombie] };
  assert.notEqual(
    strategicPositionSignature(withZombie),
    strategicPositionSignature({
      ...withZombie,
      pieces: withZombie.pieces.map((candidate) =>
        candidate.id === zombie.id
          ? { ...candidate, zombieActivationsRemaining: 9 }
          : candidate,
      ),
    }),
  );
});

test("le zombie est invincible, incontrôlable et neutre pour population, ressources et territoire", () => {
  const base = createNewGame(2, 0);
  const zombie = piece("neutral-zombie", 0, "pawn", 0, 0, {
    zombieActivationsRemaining: 10,
  });
  const state = { ...base, pieces: [...base.pieces, zombie] };
  assert.equal(isZombieTermite(zombie), true);
  assert.deepEqual(legalMovesForPiece(state, zombie.id), []);
  assert.equal(populationForPlayer(state.pieces, 0), populationForPlayer(base.pieces, 0));
  assert.equal(usedResources(state.pieces, 0), usedResources(base.pieces, 0));
  assert.deepEqual(
    territoryForPlayer(state.pieces, 0).cells,
    territoryForPlayer(base.pieces, 0).cells,
  );

  const crusher = piece("crusher", 2, "pawn", -1, 0);
  const egg = piece("blast-egg", 0, "egg", 0, 0, { hatchTurns: 3 });
  const adjacentZombie = { ...zombie, q: 1, r: 0 };
  const victims = eggBlastVictimsForMove(
    [crusher, egg, adjacentZombie],
    { pieceId: crusher.id, to: egg },
  );
  assert.equal(victims.some((victim) => victim.id === adjacentZombie.id), false);
});

test("le zombie dévore uniquement l'allié non royal accessible puis perd une activation", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("mover-0", 0, "pawn", -3, 0),
    piece("prey-0", 0, "pawn", 1, 0),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 10,
      zombieBornMoveNumber: 39,
    }),
    piece("king-2", 2, "king", 5, 0),
    piece("pawn-2", 2, "pawn", 0, 1),
  ]);
  const move = allLegalMoves(state, 0).find(
    (candidate) => candidate.pieceId === "mover-0" && candidate.to.q === -2 && candidate.to.r === 0,
  );
  assert(move);
  const next = applyMove(state, move);
  assert.equal(next.pieces.some((candidate) => candidate.id === "prey-0"), false);
  assert.equal(next.pieces.some((candidate) => candidate.id === "pawn-2"), true);
  const zombie = next.pieces.find((candidate) => candidate.id === "zombie-0");
  assert(zombie && isZombieTermite(zombie));
  assert.equal(zombie.zombieActivationsRemaining, 9);
  assert.deepEqual({ q: zombie.q, r: zombie.r }, { q: 1, r: 0 });
  assert.equal(next.lastMove?.zombieEffects?.some((effect) => effect.kind === "bite"), true);
});

test("un zombie déjà présent s'active aussi après le tour d'une colonie humaine", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("mover-0", 0, "pawn", -3, 0),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 10,
      zombieBornMoveNumber: 39,
    }),
    piece("king-2", 2, "king", 5, 0),
  ]);
  state.players = state.players.map((player) =>
    player.id === 0 ? { ...player, role: "human" } : player,
  );
  const move = allLegalMoves(state, 0).find(
    (candidate) =>
      candidate.pieceId === "mover-0" &&
      candidate.to.q === -2 &&
      candidate.to.r === 0,
  );
  assert(move);
  const next = applyMove(state, move);
  const zombie = next.pieces.find((candidate) => candidate.id === "zombie-0");
  assert(zombie && isZombieTermite(zombie));
  assert.equal(zombie.zombieActivationsRemaining, 9);
  assert.equal(
    next.lastMove?.zombieEffects?.some((effect) => effect.kind === "move"),
    true,
  );
  assert.match(next.event, /termite zombie .* s’active/);
});

test("les trajets exacts distinguent une progression d’un véritable retour de cycle", () => {
  const route = (from: string, to: string) =>
    `route-v1|0|pawn-0|pawn|${from}>${to}`;
  const a = route("0,0", "1,0");
  const b = route("1,0", "2,0");
  const c = route("2,0", "1,0");
  const d = route("1,0", "0,0");

  const progression = [
    a,
    b,
    route("2,0", "3,0"),
    route("3,0", "4,0"),
    route("4,0", "5,0"),
  ];
  assert.equal(repeatedActionTail(progression).repeatCount, 0);

  const reprise = repeatedActionTail([a, b, c, d, a, b]);
  assert.equal(reprise.repeatCount, 2);
  assert.deepEqual(reprise.pattern, [a, b]);

  const seuil = repeatedActionTail([a, b, c, d, a, b, c, d, a]);
  assert.equal(seuil.patternLength, LOOP_REPETITION_LIMIT);
  assert.equal(seuil.repeatCount, LOOP_REPETITION_LIMIT);
  assert.deepEqual(seuil.pattern, [a, b, c, d, a]);

  const fragmentsDisperses = repeatedActionTail([
    a,
    route("3,0", "3,1"),
    b,
    route("3,1", "4,1"),
    c,
    route("4,1", "4,2"),
    d,
    route("4,2", "5,2"),
    route("5,2", "5,1"),
    a,
    b,
    c,
    d,
    route("5,2", "5,1"),
  ]);
  assert.equal(fragmentsDisperses.repeatCount, 1);
});

test("les égalités de cible sont reproductibles avec la graine de partie", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("mover-0", 0, "pawn", -3, 0),
    piece("prey-a", 0, "pawn", 1, 0),
    piece("prey-b", 0, "pawn", 0, 1),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 10,
    }),
    piece("king-2", 2, "king", 5, 0),
  ]);
  const move = allLegalMoves(state, 0).find(
    (candidate) => candidate.pieceId === "mover-0" && candidate.to.q === -2 && candidate.to.r === 0,
  );
  assert(move);
  const first = applyMove(state, move);
  const second = applyMove(state, move);
  assert.equal(
    first.lastMove?.zombieEffects?.find((effect) => effect.kind === "bite")
      ?.victim?.pieceId,
    second.lastMove?.zombieEffects?.find((effect) => effect.kind === "bite")
      ?.victim?.pieceId,
  );
});

test("un royal ennemi n'est jamais ciblé mais peut être mangé s'il est rencontré sur le trajet", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("prey-0", 0, "pawn", 2, 0),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 10,
    }),
    piece("king-2", 2, "king", 5, 0),
    piece("queen-2", 2, "queen", 1, 0),
  ]);
  const move = allLegalMoves(state, 0).find(
    (candidate) => candidate.pieceId === "king-0",
  );
  assert(move);
  const next = applyMove(state, move);
  assert.equal(next.pieces.some((candidate) => candidate.id === "queen-2"), false);
  assert.equal(next.pieces.some((candidate) => candidate.id === "prey-0"), true);
  assert.equal(
    next.lastMove?.zombieEffects?.find((effect) => effect.kind === "bite")
      ?.victim?.pieceId,
    "queen-2",
  );
});

test("un roi rencontré par le zombie est éliminé immédiatement en multijoueur", () => {
  const state = stateWithThreePlayers([
    piece("king-0", 0, "king", -4, 0),
    piece("mover-0", 0, "pawn", -3, 0),
    piece("prey-0", 0, "pawn", 2, 0),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 10,
    }),
    piece("king-4", 4, "king", 5, 0),
    piece("pawn-4", 4, "pawn", 4, 0),
    piece("king-3", 3, "king", 1, 0),
    piece("pawn-3", 3, "pawn", 0, 2),
  ]);
  const move = allLegalMoves(state, 0).find(
    (candidate) =>
      candidate.pieceId === "mover-0" &&
      candidate.to.q === -2 &&
      candidate.to.r === 0,
  );
  assert(move);
  const next = applyMove(state, move);
  assert.equal(next.players.find((player) => player.id === 3)?.alive, false);
  assert.equal(next.pieces.some((candidate) => candidate.playerId === 3), false);
  assert.equal(next.players.find((player) => player.id === 4)?.alive, true);
});

test("la dixième activation détruit seulement le zombie sur sa case", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("mover-0", 0, "pawn", -3, 0),
    piece("prey-0", 0, "pawn", 1, 0),
    piece("zombie-0", 0, "pawn", 0, 0, {
      zombieActivationsRemaining: 1,
      zombieBornMoveNumber: 30,
    }),
    piece("king-2", 2, "king", 5, 0),
    piece("neighbor-enemy", 2, "pawn", 0, 1),
  ]);
  const move = allLegalMoves(state, 0).find(
    (candidate) => candidate.pieceId === "mover-0" && candidate.to.q === -2 && candidate.to.r === 0,
  );
  assert(move);
  const next = applyMove(state, move);
  assert.equal(next.pieces.some((candidate) => candidate.id === "zombie-0"), false);
  assert.equal(next.pieces.some((candidate) => candidate.id === "neighbor-enemy"), true);
  assert.equal(next.lastMove?.zombieEffects?.some((effect) => effect.kind === "expire"), true);
});

test("l'évasion IA avant la cinquième répétition ne modifie ni les quatorze poids ni l'état", () => {
  const state = createNewGame(2, 0, 4);
  state.loopTrackers = {
    0: {
      ...emptyLoopTracker(),
      history: Array.from({ length: LOOP_WARNING_REPETITION }, () => ({
        signature: "cycle-test",
        hadSafeAlternative: true,
      })),
      repeatCount: LOOP_WARNING_REPETITION,
      cycleLength: 1,
      cycleSignatures: ["cycle-test"],
      escapeAttempted: false,
    },
  };
  const weights = [...DEFAULT_WEIGHTS];
  const snapshot = JSON.stringify(state);
  const choice = chooseAiMove(state, 0, weights, undefined, 0, 1, true, "balanced");
  assert(choice);
  assert.equal(choice.move.antiLoopEscape, true);
  assert.deepEqual(weights, DEFAULT_WEIGHTS);
  assert.equal(JSON.stringify(state), snapshot);
  const played = applyMove(state, choice.move);
  assert.equal(played.lastMove?.antiLoopEscape, true);
});

test("la cinquième répétition évitable fait naître le zombie sur la case libérée", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("hull-a", 0, "pawn", -2, -2),
    piece("hull-b", 0, "pawn", 0, -2),
    piece("hull-c", 0, "pawn", 0, 0),
    piece("inner", 0, "pawn", -1, -1),
    piece("king-2", 2, "king", 5, 0),
    piece("pawn-2", 2, "pawn", 4, 0),
  ]);
  const candidates = allLegalMoves(state, 0);
  const usable = candidates
    .map((move) => ({ move, projected: applyMove(state, move) }))
    .find(
      ({ projected }) =>
        (projected.loopTrackers?.[0]?.history.length ?? 0) === 1 &&
        (projected.loopTrackers?.[0]?.repeatCount ?? 0) === 1,
    );
  assert(usable, "un coup sans progrès et avec une alternative sûre doit exister");
  const signature = strategicPositionSignature(usable.projected);
  const forced: GameState = {
    ...state,
    loopTrackers: {
      0: {
        ...emptyLoopTracker(),
        history: Array.from({ length: LOOP_REPETITION_LIMIT - 1 }, () => ({
          signature,
          hadSafeAlternative: true,
        })),
        repeatCount: LOOP_REPETITION_LIMIT - 1,
        cycleLength: 1,
        cycleSignatures: [signature],
        escapeAttempted: true,
      },
    },
  };
  const mover = forced.pieces.find((candidate) => candidate.id === usable.move.pieceId);
  assert(mover);
  const punished = applyMove(forced, usable.move);
  const zombie = punished.pieces.find(
    (candidate) => isZombieTermite(candidate) && candidate.playerId === 0,
  );
  assert(zombie);
  assert.deepEqual({ q: zombie.q, r: zombie.r }, { q: mover.q, r: mover.r });
  assert.equal(zombie.zombieActivationsRemaining, 10);
  assert.equal(punished.lastMove?.antiLoopPenalty, true);
  assert.equal(punished.lastMove?.zombieEffects?.some((effect) => effect.kind === "spawn"), true);
  assert.equal(punished.loopTrackers?.[0]?.repeatCount, 0);
});

test("la cinquième réutilisation d’un trajet exact par un humain fait naître le zombie", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("hull-a", 0, "pawn", -2, -2),
    piece("hull-b", 0, "pawn", 0, -2),
    piece("hull-c", 0, "pawn", 0, 0),
    piece("inner", 0, "pawn", -1, -1),
    piece("king-2", 2, "king", 5, 0),
    piece("pawn-2", 2, "pawn", 4, 0),
  ]);
  state.players = state.players.map((player) =>
    player.id === 0 ? { ...player, role: "human" } : player,
  );
  const move = allLegalMoves(state, 0).find((candidate) => {
    const projected = applyMove(state, candidate);
    return (projected.loopTrackers?.[0]?.history.length ?? 0) === 1;
  });
  assert(move);
  const action = loopActionSignatureForMove(state, 0, move);
  state.loopTrackers = {
    0: {
      ...emptyLoopTracker(),
      actionHistory: Array.from({ length: LOOP_REPETITION_LIMIT }, () => action),
      actionRepeatCount: LOOP_REPETITION_LIMIT - 1,
      actionPatternLength: LOOP_REPETITION_LIMIT - 1,
      actionPattern: Array.from(
        { length: LOOP_REPETITION_LIMIT - 1 },
        () => action,
      ),
    },
  };
  const source = state.pieces.find((candidate) => candidate.id === move.pieceId);
  assert(source);
  const punished = applyMove(state, move);
  const zombie = punished.pieces.find(
    (candidate) => candidate.playerId === 0 && isZombieTermite(candidate),
  );
  assert(zombie);
  assert.deepEqual({ q: zombie.q, r: zombie.r }, { q: source.q, r: source.r });
  assert.equal(punished.lastMove?.antiLoopPenalty, true);
});

test("une oscillation territoriale naturelle fait naître le zombie sans compteur prérempli", () => {
  let state = createNewGame(2, 2, 4);
  const sequence = [
    { pieceId: "p0-pawn-2", to: { q: -2, r: -3 } },
    { pieceId: "p2-pawn-2", to: { q: 2, r: 3 } },
    { pieceId: "p0-pawn-2", to: { q: -1, r: -4 } },
    { pieceId: "p2-pawn-2", to: { q: 1, r: 4 } },
    { pieceId: "p0-pawn-2", to: { q: -2, r: -3 } },
    { pieceId: "p2-pawn-2", to: { q: 2, r: 3 } },
    { pieceId: "p0-pawn-2", to: { q: -1, r: -4 } },
    { pieceId: "p2-pawn-2", to: { q: 1, r: 4 } },
    { pieceId: "p0-pawn-2", to: { q: -2, r: -3 } },
    { pieceId: "p2-pawn-2", to: { q: 2, r: 3 } },
    { pieceId: "p0-pawn-2", to: { q: -1, r: -4 } },
    { pieceId: "p2-pawn-2", to: { q: 1, r: 4 } },
    { pieceId: "p0-pawn-2", to: { q: -2, r: -3 } },
  ];
  let territorialOscillations = 0;
  sequence.forEach((move, index) => {
    const playerId = index % 2 === 0 ? 0 : 2;
    const beforeTerritory = territoryForPlayer(state.pieces, playerId).cells
      .map((coord) => `${coord.q},${coord.r}`)
      .sort()
      .join(";");
    assert(
      allLegalMoves(state, playerId).some(
        (candidate) =>
          candidate.pieceId === move.pieceId &&
          candidate.to.q === move.to.q &&
          candidate.to.r === move.to.r,
      ),
    );
    state = applyMove(state, move);
    const afterTerritory = territoryForPlayer(state.pieces, playerId).cells
      .map((coord) => `${coord.q},${coord.r}`)
      .sort()
      .join(";");
    if (beforeTerritory !== afterTerritory) territorialOscillations += 1;
    if (index === 10) {
      assert.equal(state.loopTrackers?.[0]?.actionRepeatCount, 4);
    }
  });

  assert.equal(territorialOscillations, sequence.length);
  const zombie = state.pieces.find(
    (candidate) => candidate.playerId === 0 && isZombieTermite(candidate),
  );
  assert(zombie);
  assert.deepEqual({ q: zombie.q, r: zombie.r }, { q: -1, r: -4 });
  assert.equal(zombie.zombieActivationsRemaining, 10);
  assert.equal(state.lastMove?.antiLoopPenalty, true);
  assert.match(state.event, /Répétition abusive/);
});

test("un gain territorial réellement inédit remet bien le motif à zéro", () => {
  const state = stateWithPieces([
    piece("king-0", 0, "king", -4, 0),
    piece("advance-0", 0, "pawn", -3, 0),
    piece("hull-b", 0, "pawn", -4, 1),
    piece("hull-c", 0, "pawn", -3, -1),
    piece("king-2", 2, "king", 5, 0),
    piece("pawn-2", 2, "pawn", 4, 0),
  ]);
  const beforePotential = territoryForPlayer(state.pieces, 0).potential;
  const repeatedRoute = loopActionSignatureForMove(state, 0, {
    pieceId: "advance-0",
    to: { q: -2, r: 0 },
  });
  state.loopTrackers = {
    0: {
      ...emptyLoopTracker(beforePotential),
      actionHistory: Array.from({ length: 5 }, () => repeatedRoute),
      actionRepeatCount: 4,
      actionPatternLength: 4,
      actionPattern: Array.from({ length: 4 }, () => repeatedRoute),
    },
  };
  const next = applyMove(state, {
    pieceId: "advance-0",
    to: { q: -2, r: 0 },
  });
  const afterPotential = territoryForPlayer(next.pieces, 0).potential;
  assert(afterPotential > beforePotential);
  assert.equal(next.loopTrackers?.[0]?.actionHistory.length, 0);
  assert.equal(next.loopTrackers?.[0]?.bestTerritoryPotential, afterPotential);
  assert.equal(next.pieces.some(isZombieTermite), false);
});
