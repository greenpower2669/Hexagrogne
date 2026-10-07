import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_CELLS,
  type GameState,
  type Piece,
  type PlayerId,
  createNewGame,
  evaluateQueenEscapeContext,
  hexDistance,
  synchronizePlayerResources,
} from "../app/game-engine";
import {
  DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS,
  scoreQueenEscapeContext,
} from "../app/queen-escape-context";

function piece(
  id: string,
  playerId: PlayerId,
  type: Piece["type"],
  q: number,
  r: number,
): Piece {
  return {
    id,
    playerId,
    type,
    q,
    r,
    level: type === "king" ? 4 : type === "queen" ? 3 : type === "pawn" ? 1 : 0,
    queenBonded: type === "queen",
    hatchTurns: type === "egg" ? 3 : 0,
  };
}

const queenTargets = BOARD_CELLS.filter(
  (coord) => hexDistance(coord, { q: 0, r: 0 }) === 2,
);

function contextState(openTargets: Set<string>, enemyPawn?: Piece): GameState {
  const blockers = queenTargets
    .filter((coord) => !openTargets.has(`${coord.q},${coord.r}`))
    .map((coord, index) =>
      piece(
        `blocker-${coord.q}-${coord.r}`,
        0,
        index % 3 === 0 ? "egg" : "pawn",
        coord.q,
        coord.r,
      ),
    );
  const pieces = [
    piece("king-0", 0, "king", -5, 0),
    piece("queen-0", 0, "queen", 0, 0),
    ...blockers,
    piece("king-2", 2, "king", 5, -5),
    ...(enemyPawn ? [enemyPawn] : []),
  ];
  const base = createNewGame(2, 0, 4);
  return {
    ...base,
    pieces,
    players: synchronizePlayerResources(base.players, pieces),
    turnOrder: [0, 2],
    turnIndex: 0,
    loopTrackers: {},
    strategicTrackers: {},
  };
}

function score(state: GameState, move = { pieceId: "king-0", to: { q: -4, r: 0 } }) {
  const vector = evaluateQueenEscapeContext(state, move, 0);
  return {
    vector,
    score: scoreQueenEscapeContext(
      DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS,
      vector.features,
    ),
  };
}

test("A — une reine entourée par ses pièces et ses œufs reçoit un contexte très défavorable", () => {
  const result = score(contextState(new Set()));
  assert.equal(result.vector.safeEscapeCount, 0);
  assert.equal(result.vector.friendlyBlockers, 12);
  assert.equal(result.vector.queenTrapRisk, 4);
  assert.ok(result.score < -0.9);
});

test("B — déplacer un pion qui libère une sortie améliore le score contextuel", () => {
  const state = contextState(new Set());
  const neutral = score(state);
  const opened = score(state, {
    pieceId: "blocker-2-0",
    to: { q: 3, r: 0 },
  });
  assert.equal(opened.vector.safeEscapeCount, 1);
  assert.equal(opened.vector.escapeCreatedByMove, 1);
  assert.ok(opened.score > neutral.score);
});

test("C — deux sorties directes restent préférables à une sortie avec continuation", () => {
  const oneExit = score(contextState(new Set(["2,0"])));
  const twoExits = score(contextState(new Set(["2,0", "0,2"])));
  assert.equal(oneExit.vector.safeEscapeCount, 1);
  assert.ok(oneExit.vector.secondLevelEscape > 0);
  assert.equal(twoExits.vector.safeEscapeCount, 2);
  assert.ok(twoExits.score > oneExit.score);
});

test("D — une destination contrôlée par l’adversaire n’est pas une sortie sûre", () => {
  const enemyPawn = piece("enemy-pawn", 2, "pawn", 3, 0);
  const result = score(contextState(new Set(["2,0"]), enemyPawn));
  assert.equal(result.vector.safeEscapeCount, 0);
  assert.equal(result.vector.queenTrapRisk, 4);
});
