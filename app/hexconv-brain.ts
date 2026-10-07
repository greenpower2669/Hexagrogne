import {
  BOARD_RADIUS,
  canonicalMoveForPlayer,
  canonicalStateForPlayer,
  type AIMoveScoreAugmenter,
  type GameState,
  type Move,
  type PlayerId,
} from "./game-engine";
import {
  tensorizeTrainingSample,
  type PreparedTrainingSample,
} from "./training-dataset";

export const HYBRID_HEX_BRAIN_ARCHITECTURE_ID =
  "fabhexabrain-v3-hybrid-r15-hexconv32-32-48";
export const HYBRID_HEX_FILTERS = [32, 32, 48] as const;
export const HYBRID_HEX_RECEPTIVE_RADIUS = 3;
export const HYBRID_HEX_PARAMETER_COUNT = 29_765;

const BOARD_SIZE = BOARD_RADIUS * 2 + 1;
const BOARD_CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const BOARD_CHANNELS = 30;
const GLOBAL_FEATURES = 32;
const LEGACY_FEATURES = 14;
const HEX_TAPS = 7;
const FUSION_FEATURES = 48 + GLOBAL_FEATURES + LEGACY_FEATURES;
const POLICY_FEATURES = 48 + 48 + 48 + LEGACY_FEATURES;
const VALUE_HEADS = 6;
const DEFAULT_LEARNING_RATE = 0.0012;
const MODEL_DATABASE = "fabhexagrogne-v3-t3-brain";
const MODEL_DATABASE_VERSION = 1;
const MODEL_STORE = "models";
const MODEL_KEY = HYBRID_HEX_BRAIN_ARCHITECTURE_ID;
const PIECE_TYPES = ["king", "queen", "pawn", "egg"] as const;
const PLAYER_IDS = [0, 1, 2, 3, 4, 5] as const;
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

export const HYBRID_HEX_BRAIN_ARCHITECTURE = {
  id: HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
  family: "legacy-residual-hexconv-policy-value",
  parameters: HYBRID_HEX_PARAMETER_COUNT,
  input: {
    boardShape: [BOARD_CHANNELS, BOARD_SIZE, BOARD_SIZE],
    globalShape: [GLOBAL_FEATURES],
    legacyFeatures: LEGACY_FEATURES,
    coordinates: "native-axial-hex-neighborhood",
  },
  trunk: {
    filters: HYBRID_HEX_FILTERS,
    kernel: "center-plus-six-neighbors",
    receptiveRadius: HYBRID_HEX_RECEPTIVE_RADIUS,
    activation: "leaky-relu",
  },
  fusion: {
    spatial: 48,
    global: GLOBAL_FEATURES,
    legacy: LEGACY_FEATURES,
    hidden: 48,
  },
  output: {
    policy: "legal-moves-only-residual",
    valueHeads: VALUE_HEADS,
  },
  runtime: "float32-worker-mobile",
} as const;

export interface HybridHexBrainParameters {
  conv1Kernel: Float32Array;
  conv1Bias: Float32Array;
  conv2Kernel: Float32Array;
  conv2Bias: Float32Array;
  conv3Kernel: Float32Array;
  conv3Bias: Float32Array;
  fusionKernel: Float32Array;
  fusionBias: Float32Array;
  policyKernel: Float32Array;
  policyBias: Float32Array;
  valueKernel: Float32Array;
  valueBias: Float32Array;
}

export interface HybridHexBrain {
  schema: "fabhexagrogne-hybrid-brain";
  version: 3;
  architectureId: typeof HYBRID_HEX_BRAIN_ARCHITECTURE_ID;
  createdAt: string;
  updatedAt: string;
  generation: number;
  trainedSamples: number;
  selfPlaySamples: number;
  corpusSamples: number;
  learningRate: number;
  parameters: HybridHexBrainParameters;
}

export interface SerializedHybridHexBrain
  extends Omit<HybridHexBrain, "parameters"> {
  parameters: {
    [Key in keyof HybridHexBrainParameters]: number[];
  };
}

export interface HybridTrainingSession {
  brain: HybridHexBrain;
  maxUpdates: number;
  updates: number;
}

interface EncodedPosition {
  board: Float32Array;
  globals: Float32Array;
}

interface ConvLayerCache {
  input: Float32Array;
  output: Float32Array;
  preActivation: Float32Array;
  inChannels: number;
  outChannels: number;
}

interface BrainForwardCache {
  encoded: EncodedPosition;
  conv1: ConvLayerCache;
  conv2: ConvLayerCache;
  conv3: ConvLayerCache;
  pooled: Float32Array;
}

interface DecisionForwardCache {
  brain: BrainForwardCache;
  fusionInput: Float32Array;
  fusionPreActivation: Float32Array;
  fusion: Float32Array;
  policyInput: Float32Array;
  policyLogit: number;
  valueLogits: Float32Array;
  fromCell: number;
  toCell: number;
}

const VALID_CELLS: number[] = [];
const HEX_NEIGHBORS = new Int16Array(BOARD_CELL_COUNT * HEX_TAPS).fill(-1);

function isValidCoord(q: number, r: number): boolean {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= BOARD_RADIUS;
}

function coordToCell(coord: { q: number; r: number }): number | undefined {
  if (!isValidCoord(coord.q, coord.r)) return undefined;
  return (coord.r + BOARD_RADIUS) * BOARD_SIZE + coord.q + BOARD_RADIUS;
}

for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r += 1) {
  for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q += 1) {
    const cell = coordToCell({ q, r });
    if (cell === undefined) continue;
    VALID_CELLS.push(cell);
    HEX_NEIGHBORS[cell * HEX_TAPS] = cell;
    HEX_DIRECTIONS.forEach((direction, index) => {
      const neighbor = coordToCell({
        q: q + direction.q,
        r: r + direction.r,
      });
      HEX_NEIGHBORS[cell * HEX_TAPS + index + 1] = neighbor ?? -1;
    });
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createKernel(
  length: number,
  fanIn: number,
  fanOut: number,
  random: () => number,
): Float32Array {
  const values = new Float32Array(length);
  const limit = Math.sqrt(6 / Math.max(1, fanIn + fanOut));
  for (let index = 0; index < values.length; index += 1) {
    values[index] = (random() * 2 - 1) * limit;
  }
  return values;
}

function createParameters(): HybridHexBrainParameters {
  const random = mulberry32(0xfab3c0de);
  return {
    conv1Kernel: createKernel(
      HEX_TAPS * BOARD_CHANNELS * HYBRID_HEX_FILTERS[0],
      HEX_TAPS * BOARD_CHANNELS,
      HYBRID_HEX_FILTERS[0],
      random,
    ),
    conv1Bias: new Float32Array(HYBRID_HEX_FILTERS[0]),
    conv2Kernel: createKernel(
      HEX_TAPS * HYBRID_HEX_FILTERS[0] * HYBRID_HEX_FILTERS[1],
      HEX_TAPS * HYBRID_HEX_FILTERS[0],
      HYBRID_HEX_FILTERS[1],
      random,
    ),
    conv2Bias: new Float32Array(HYBRID_HEX_FILTERS[1]),
    conv3Kernel: createKernel(
      HEX_TAPS * HYBRID_HEX_FILTERS[1] * HYBRID_HEX_FILTERS[2],
      HEX_TAPS * HYBRID_HEX_FILTERS[1],
      HYBRID_HEX_FILTERS[2],
      random,
    ),
    conv3Bias: new Float32Array(HYBRID_HEX_FILTERS[2]),
    fusionKernel: createKernel(
      FUSION_FEATURES * 48,
      FUSION_FEATURES,
      48,
      random,
    ),
    fusionBias: new Float32Array(48),
    // A zero residual guarantees bit-for-bit legacy scoring until T3 has
    // actually learned from local examples.
    policyKernel: new Float32Array(POLICY_FEATURES),
    policyBias: new Float32Array(1),
    valueKernel: new Float32Array(48 * VALUE_HEADS),
    valueBias: new Float32Array(VALUE_HEADS),
  };
}

export function createDefaultHybridHexBrain(
  now = new Date(),
): HybridHexBrain {
  const timestamp = now.toISOString();
  return {
    schema: "fabhexagrogne-hybrid-brain",
    version: 3,
    architectureId: HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    generation: 0,
    trainedSamples: 0,
    selfPlaySamples: 0,
    corpusSamples: 0,
    learningRate: DEFAULT_LEARNING_RATE,
    parameters: createParameters(),
  };
}

const PARAMETER_LENGTHS: Record<keyof HybridHexBrainParameters, number> = {
  conv1Kernel: HEX_TAPS * BOARD_CHANNELS * HYBRID_HEX_FILTERS[0],
  conv1Bias: HYBRID_HEX_FILTERS[0],
  conv2Kernel:
    HEX_TAPS * HYBRID_HEX_FILTERS[0] * HYBRID_HEX_FILTERS[1],
  conv2Bias: HYBRID_HEX_FILTERS[1],
  conv3Kernel:
    HEX_TAPS * HYBRID_HEX_FILTERS[1] * HYBRID_HEX_FILTERS[2],
  conv3Bias: HYBRID_HEX_FILTERS[2],
  fusionKernel: FUSION_FEATURES * 48,
  fusionBias: 48,
  policyKernel: POLICY_FEATURES,
  policyBias: 1,
  valueKernel: 48 * VALUE_HEADS,
  valueBias: VALUE_HEADS,
};

function readFloat32(value: unknown, length: number): Float32Array | undefined {
  let candidate: ArrayLike<number> | undefined;
  if (value instanceof Float32Array || Array.isArray(value)) {
    candidate = value;
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const numericValues = Array.from({ length }, (_, index) => record[index]);
    if (numericValues.every((entry) => typeof entry === "number")) {
      candidate = numericValues as number[];
    }
  }
  if (!candidate || candidate.length !== length) return undefined;
  const result = Float32Array.from(candidate);
  return result.every(Number.isFinite) ? result : undefined;
}

export function parseHybridHexBrain(value: unknown): HybridHexBrain | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<HybridHexBrain> & {
    parameters?: Partial<Record<keyof HybridHexBrainParameters, unknown>>;
  };
  if (
    candidate.schema !== "fabhexagrogne-hybrid-brain" ||
    candidate.version !== 3 ||
    candidate.architectureId !== HYBRID_HEX_BRAIN_ARCHITECTURE_ID ||
    !candidate.parameters
  ) {
    return undefined;
  }
  const parameters = {} as HybridHexBrainParameters;
  for (const key of Object.keys(PARAMETER_LENGTHS) as Array<
    keyof HybridHexBrainParameters
  >) {
    const parsed = readFloat32(candidate.parameters[key], PARAMETER_LENGTHS[key]);
    if (!parsed) return undefined;
    parameters[key] = parsed;
  }
  const trainedSamples = Math.max(0, Math.floor(Number(candidate.trainedSamples) || 0));
  const selfPlaySamples = Math.max(
    0,
    Math.min(trainedSamples, Math.floor(Number(candidate.selfPlaySamples) || 0)),
  );
  const corpusSamples = Math.max(
    0,
    Math.min(trainedSamples, Math.floor(Number(candidate.corpusSamples) || 0)),
  );
  const learningRate = Number(candidate.learningRate);
  return {
    schema: "fabhexagrogne-hybrid-brain",
    version: 3,
    architectureId: HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
    generation: Math.max(
      Math.floor(trainedSamples / 64),
      Math.floor(Number(candidate.generation) || 0),
    ),
    trainedSamples,
    selfPlaySamples,
    corpusSamples,
    learningRate:
      Number.isFinite(learningRate) && learningRate > 0 && learningRate <= 0.02
        ? learningRate
        : DEFAULT_LEARNING_RATE,
    parameters,
  };
}

export function serializeHybridHexBrain(
  brain: HybridHexBrain,
): SerializedHybridHexBrain {
  const validated = parseHybridHexBrain(brain) ?? createDefaultHybridHexBrain();
  return {
    ...validated,
    parameters: Object.fromEntries(
      (Object.keys(PARAMETER_LENGTHS) as Array<keyof HybridHexBrainParameters>).map(
        (key) => [key, Array.from(validated.parameters[key])],
      ),
    ) as SerializedHybridHexBrain["parameters"],
  };
}

function leakyRelu(value: number): number {
  return value >= 0 ? value : value * 0.08;
}

function leakyDerivative(preActivation: number): number {
  return preActivation >= 0 ? 1 : 0.08;
}

function runConvLayer(
  input: Float32Array,
  inChannels: number,
  outChannels: number,
  kernel: Float32Array,
  bias: Float32Array,
): ConvLayerCache {
  const preActivation = new Float32Array(BOARD_CELL_COUNT * outChannels);
  const output = new Float32Array(BOARD_CELL_COUNT * outChannels);
  for (const cell of VALID_CELLS) {
    const outputOffset = cell * outChannels;
    for (let out = 0; out < outChannels; out += 1) {
      let sum = bias[out];
      for (let tap = 0; tap < HEX_TAPS; tap += 1) {
        const neighbor = HEX_NEIGHBORS[cell * HEX_TAPS + tap];
        if (neighbor < 0) continue;
        const inputOffset = neighbor * inChannels;
        const kernelOffset = tap * inChannels * outChannels + out;
        for (let inputChannel = 0; inputChannel < inChannels; inputChannel += 1) {
          sum +=
            input[inputOffset + inputChannel] *
            kernel[kernelOffset + inputChannel * outChannels];
        }
      }
      preActivation[outputOffset + out] = sum;
      output[outputOffset + out] = leakyRelu(sum);
    }
  }
  return { input, output, preActivation, inChannels, outChannels };
}

function channelMajorToCellMajor(board: Float32Array): Float32Array {
  const cellMajor = new Float32Array(BOARD_CELL_COUNT * BOARD_CHANNELS);
  for (const cell of VALID_CELLS) {
    for (let channel = 0; channel < BOARD_CHANNELS; channel += 1) {
      cellMajor[cell * BOARD_CHANNELS + channel] =
        board[channel * BOARD_CELL_COUNT + cell];
    }
  }
  return cellMajor;
}

function encodeCanonicalState(state: GameState): EncodedPosition {
  const board = new Float32Array(BOARD_CHANNELS * BOARD_CELL_COUNT);
  for (const cell of VALID_CELLS) board[cell] = 1;
  state.pieces.forEach((piece) => {
    const cell = coordToCell(piece);
    const pieceType = PIECE_TYPES.indexOf(piece.type);
    if (cell === undefined || pieceType < 0) return;
    const pieceChannel = 1 + piece.playerId * PIECE_TYPES.length + pieceType;
    board[pieceChannel * BOARD_CELL_COUNT + cell] = 1;
    board[25 * BOARD_CELL_COUNT + cell] = Math.max(
      0,
      Math.min(1, (piece.level ?? 0) / 4),
    );
    board[26 * BOARD_CELL_COUNT + cell] = Math.max(
      0,
      Math.min(1, (piece.breedingTurns ?? 0) / 3),
    );
    board[27 * BOARD_CELL_COUNT + cell] = Math.max(
      0,
      Math.min(1, (piece.hatchTurns ?? 0) / 3),
    );
    board[28 * BOARD_CELL_COUNT + cell] = piece.promoted ? 1 : 0;
    board[29 * BOARD_CELL_COUNT + cell] = piece.queenBonded ? 1 : 0;
  });
  const globals = new Float32Array(GLOBAL_FEATURES);
  state.players.forEach((player) => {
    const offset = player.id * 5;
    globals[offset] = player.alive ? 1 : 0;
    globals[offset + 1] = Math.max(0, Math.min(1, player.resources / 256));
    globals[offset + 2] = Math.max(
      0,
      Math.min(1, player.resourcesEarned / 256),
    );
    globals[offset + 3] = Math.max(
      0,
      Math.min(1, player.personalTurns / 200),
    );
    globals[offset + 4] = Math.max(
      0,
      Math.min(1, player.solitaryKingTurns / 10),
    );
  });
  globals[30] = Math.max(0, Math.min(1, state.round / 200));
  globals[31] = Math.max(0, Math.min(1, state.moveNumber / 600));
  return { board, globals };
}

function forwardBrain(
  brain: HybridHexBrain,
  encoded: EncodedPosition,
): BrainForwardCache {
  const parameters = brain.parameters;
  const conv1 = runConvLayer(
    channelMajorToCellMajor(encoded.board),
    BOARD_CHANNELS,
    HYBRID_HEX_FILTERS[0],
    parameters.conv1Kernel,
    parameters.conv1Bias,
  );
  const conv2 = runConvLayer(
    conv1.output,
    HYBRID_HEX_FILTERS[0],
    HYBRID_HEX_FILTERS[1],
    parameters.conv2Kernel,
    parameters.conv2Bias,
  );
  const conv3 = runConvLayer(
    conv2.output,
    HYBRID_HEX_FILTERS[1],
    HYBRID_HEX_FILTERS[2],
    parameters.conv3Kernel,
    parameters.conv3Bias,
  );
  const pooled = new Float32Array(HYBRID_HEX_FILTERS[2]);
  for (const cell of VALID_CELLS) {
    const offset = cell * HYBRID_HEX_FILTERS[2];
    for (let channel = 0; channel < pooled.length; channel += 1) {
      pooled[channel] += conv3.output[offset + channel] / VALID_CELLS.length;
    }
  }
  return { encoded, conv1, conv2, conv3, pooled };
}

function normalizedLegacyFeatures(features: number[]): Float32Array {
  const normalized = new Float32Array(LEGACY_FEATURES);
  for (let index = 0; index < normalized.length; index += 1) {
    const value = Number(features[index] ?? 0);
    normalized[index] = Number.isFinite(value)
      ? Math.max(-4, Math.min(4, value)) / 4
      : 0;
  }
  return normalized;
}

function forwardDecision(
  brain: HybridHexBrain,
  brainCache: BrainForwardCache,
  fromCell: number,
  toCell: number,
  legacyFeatures: number[],
): DecisionForwardCache {
  const legacy = normalizedLegacyFeatures(legacyFeatures);
  const fusionInput = new Float32Array(FUSION_FEATURES);
  fusionInput.set(brainCache.pooled, 0);
  fusionInput.set(brainCache.encoded.globals, 48);
  fusionInput.set(legacy, 48 + GLOBAL_FEATURES);
  const fusionPreActivation = new Float32Array(48);
  const fusion = new Float32Array(48);
  for (let out = 0; out < 48; out += 1) {
    let sum = brain.parameters.fusionBias[out];
    for (let input = 0; input < FUSION_FEATURES; input += 1) {
      sum +=
        fusionInput[input] *
        brain.parameters.fusionKernel[input * 48 + out];
    }
    fusionPreActivation[out] = sum;
    fusion[out] = leakyRelu(sum);
  }

  const policyInput = new Float32Array(POLICY_FEATURES);
  policyInput.set(
    brainCache.conv3.output.subarray(fromCell * 48, fromCell * 48 + 48),
    0,
  );
  policyInput.set(
    brainCache.conv3.output.subarray(toCell * 48, toCell * 48 + 48),
    48,
  );
  policyInput.set(fusion, 96);
  policyInput.set(legacy, 144);
  let policyLogit = brain.parameters.policyBias[0];
  for (let index = 0; index < policyInput.length; index += 1) {
    policyLogit += policyInput[index] * brain.parameters.policyKernel[index];
  }
  const valueLogits = new Float32Array(VALUE_HEADS);
  for (let valueHead = 0; valueHead < VALUE_HEADS; valueHead += 1) {
    let sum = brain.parameters.valueBias[valueHead];
    for (let hidden = 0; hidden < 48; hidden += 1) {
      sum +=
        fusion[hidden] *
        brain.parameters.valueKernel[hidden * VALUE_HEADS + valueHead];
    }
    valueLogits[valueHead] = sum;
  }
  return {
    brain: brainCache,
    fusionInput,
    fusionPreActivation,
    fusion,
    policyInput,
    policyLogit,
    valueLogits,
    fromCell,
    toCell,
  };
}

function cloneParameters(
  parameters: HybridHexBrainParameters,
): HybridHexBrainParameters {
  return Object.fromEntries(
    (Object.keys(PARAMETER_LENGTHS) as Array<keyof HybridHexBrainParameters>).map(
      (key) => [key, parameters[key].slice()],
    ),
  ) as unknown as HybridHexBrainParameters;
}

function clampGradient(value: number): number {
  return Math.max(-0.12, Math.min(0.12, value));
}

function applyGradient(
  target: Float32Array,
  gradient: Float32Array,
  learningRate: number,
  limit: number,
) {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = Math.max(
      -limit,
      Math.min(limit, target[index] - learningRate * clampGradient(gradient[index])),
    );
  }
}

function backwardConvLayer(
  cache: ConvLayerCache,
  gradOutput: Float32Array,
  kernel: Float32Array,
): {
  gradInput: Float32Array;
  gradKernel: Float32Array;
  gradBias: Float32Array;
} {
  const gradInput = new Float32Array(cache.input.length);
  const gradKernel = new Float32Array(kernel.length);
  const gradBias = new Float32Array(cache.outChannels);
  for (const cell of VALID_CELLS) {
    const outputOffset = cell * cache.outChannels;
    for (let out = 0; out < cache.outChannels; out += 1) {
      const dz =
        gradOutput[outputOffset + out] *
        leakyDerivative(cache.preActivation[outputOffset + out]);
      if (dz === 0) continue;
      gradBias[out] += dz;
      for (let tap = 0; tap < HEX_TAPS; tap += 1) {
        const neighbor = HEX_NEIGHBORS[cell * HEX_TAPS + tap];
        if (neighbor < 0) continue;
        const inputOffset = neighbor * cache.inChannels;
        const kernelOffset = tap * cache.inChannels * cache.outChannels + out;
        for (let inputChannel = 0; inputChannel < cache.inChannels; inputChannel += 1) {
          const kernelIndex = kernelOffset + inputChannel * cache.outChannels;
          gradKernel[kernelIndex] += cache.input[inputOffset + inputChannel] * dz;
          gradInput[inputOffset + inputChannel] += kernel[kernelIndex] * dz;
        }
      }
    }
  }
  return { gradInput, gradKernel, gradBias };
}

function trainEncodedDecision(
  sourceBrain: HybridHexBrain,
  encoded: EncodedPosition,
  fromCell: number,
  toCell: number,
  legacyFeatures: number[],
  policyTarget: number,
  valueTarget: ArrayLike<number>,
  source: "self-play" | "corpus",
  now = new Date(),
): HybridHexBrain {
  const brain: HybridHexBrain = {
    ...sourceBrain,
    parameters: cloneParameters(sourceBrain.parameters),
  };
  const forward = forwardDecision(
    brain,
    forwardBrain(brain, encoded),
    fromCell,
    toCell,
    legacyFeatures,
  );
  const parameters = brain.parameters;
  const target = Math.max(-1, Math.min(1, policyTarget));
  const policyPrediction = Math.tanh(forward.policyLogit);
  const policyDerivative = clampGradient(
    2 * (policyPrediction - target) * (1 - policyPrediction * policyPrediction),
  );
  const gradPolicyKernel = new Float32Array(parameters.policyKernel.length);
  const gradPolicyInput = new Float32Array(POLICY_FEATURES);
  for (let index = 0; index < POLICY_FEATURES; index += 1) {
    gradPolicyKernel[index] = forward.policyInput[index] * policyDerivative;
    gradPolicyInput[index] = parameters.policyKernel[index] * policyDerivative;
  }
  const gradPolicyBias = Float32Array.of(policyDerivative);

  const gradValueKernel = new Float32Array(parameters.valueKernel.length);
  const gradValueBias = new Float32Array(VALUE_HEADS);
  const gradFusion = gradPolicyInput.slice(96, 144);
  for (let head = 0; head < VALUE_HEADS; head += 1) {
    const prediction = Math.tanh(forward.valueLogits[head]);
    const expected = Math.max(-1, Math.min(1, Number(valueTarget[head] ?? 0)));
    const derivative = clampGradient(
      0.35 * 2 * (prediction - expected) * (1 - prediction * prediction),
    );
    gradValueBias[head] = derivative;
    for (let hidden = 0; hidden < 48; hidden += 1) {
      const index = hidden * VALUE_HEADS + head;
      gradValueKernel[index] = forward.fusion[hidden] * derivative;
      gradFusion[hidden] += parameters.valueKernel[index] * derivative;
    }
  }

  const gradFusionKernel = new Float32Array(parameters.fusionKernel.length);
  const gradFusionBias = new Float32Array(48);
  const gradFusionInput = new Float32Array(FUSION_FEATURES);
  for (let hidden = 0; hidden < 48; hidden += 1) {
    const dz =
      gradFusion[hidden] *
      leakyDerivative(forward.fusionPreActivation[hidden]);
    gradFusionBias[hidden] = dz;
    for (let input = 0; input < FUSION_FEATURES; input += 1) {
      const index = input * 48 + hidden;
      gradFusionKernel[index] = forward.fusionInput[input] * dz;
      gradFusionInput[input] += parameters.fusionKernel[index] * dz;
    }
  }

  const gradConv3Output = new Float32Array(
    BOARD_CELL_COUNT * HYBRID_HEX_FILTERS[2],
  );
  for (let channel = 0; channel < 48; channel += 1) {
    const pooledGradient = gradFusionInput[channel] / VALID_CELLS.length;
    for (const cell of VALID_CELLS) {
      gradConv3Output[cell * 48 + channel] += pooledGradient;
    }
    gradConv3Output[fromCell * 48 + channel] += gradPolicyInput[channel];
    gradConv3Output[toCell * 48 + channel] += gradPolicyInput[48 + channel];
  }

  const conv3Gradient = backwardConvLayer(
    forward.brain.conv3,
    gradConv3Output,
    parameters.conv3Kernel,
  );
  const conv2Gradient = backwardConvLayer(
    forward.brain.conv2,
    conv3Gradient.gradInput,
    parameters.conv2Kernel,
  );
  const conv1Gradient = backwardConvLayer(
    forward.brain.conv1,
    conv2Gradient.gradInput,
    parameters.conv1Kernel,
  );

  const learningRate = brain.learningRate;
  applyGradient(parameters.policyKernel, gradPolicyKernel, learningRate, 3);
  applyGradient(parameters.policyBias, gradPolicyBias, learningRate, 3);
  applyGradient(parameters.valueKernel, gradValueKernel, learningRate * 0.55, 3);
  applyGradient(parameters.valueBias, gradValueBias, learningRate * 0.55, 3);
  applyGradient(parameters.fusionKernel, gradFusionKernel, learningRate * 0.3, 1.5);
  applyGradient(parameters.fusionBias, gradFusionBias, learningRate * 0.3, 1.5);
  applyGradient(parameters.conv3Kernel, conv3Gradient.gradKernel, learningRate * 0.08, 1.5);
  applyGradient(parameters.conv3Bias, conv3Gradient.gradBias, learningRate * 0.08, 1.5);
  applyGradient(parameters.conv2Kernel, conv2Gradient.gradKernel, learningRate * 0.06, 1.5);
  applyGradient(parameters.conv2Bias, conv2Gradient.gradBias, learningRate * 0.06, 1.5);
  applyGradient(parameters.conv1Kernel, conv1Gradient.gradKernel, learningRate * 0.04, 1.5);
  applyGradient(parameters.conv1Bias, conv1Gradient.gradBias, learningRate * 0.04, 1.5);

  const trainedSamples = brain.trainedSamples + 1;
  return {
    ...brain,
    updatedAt: now.toISOString(),
    trainedSamples,
    generation: Math.floor(trainedSamples / 64),
    selfPlaySamples:
      brain.selfPlaySamples + Number(source === "self-play"),
    corpusSamples: brain.corpusSamples + Number(source === "corpus"),
  };
}

export function trainHybridHexBrainOnDecision(
  brain: HybridHexBrain,
  state: GameState,
  playerId: PlayerId,
  move: Move,
  legacyFeatures: number[],
  policyTarget: number,
  now = new Date(),
): HybridHexBrain {
  const canonicalState = canonicalStateForPlayer(state, playerId);
  const canonicalMove = canonicalMoveForPlayer(move, playerId);
  const movingPiece = canonicalState.pieces.find(
    (piece) => piece.id === canonicalMove.pieceId,
  );
  const fromCell = movingPiece ? coordToCell(movingPiece) : undefined;
  const toCell = coordToCell(canonicalMove.to);
  if (fromCell === undefined || toCell === undefined) return brain;
  const target = Math.max(-1, Math.min(1, policyTarget));
  const valueTarget = Float32Array.from(
    PLAYER_IDS.map((playerIdValue) =>
      playerIdValue === 0 ? target : -target / 5,
    ),
  );
  return trainEncodedDecision(
    brain,
    encodeCanonicalState(canonicalState),
    fromCell,
    toCell,
    legacyFeatures,
    target,
    valueTarget,
    "self-play",
    now,
  );
}

export function trainHybridHexBrainOnPreparedSample(
  brain: HybridHexBrain,
  sample: PreparedTrainingSample,
  now = new Date(),
): HybridHexBrain {
  const fromCell = coordToCell(sample.action.from);
  const toCell = coordToCell(sample.action.to);
  if (fromCell === undefined || toCell === undefined) return brain;
  const tensor = tensorizeTrainingSample(sample);
  return trainEncodedDecision(
    brain,
    { board: tensor.board, globals: tensor.globals },
    fromCell,
    toCell,
    sample.legacyFeatures,
    sample.valueTarget[0],
    tensor.valueTarget,
    "corpus",
    now,
  );
}

export function createHybridMoveScoreAugmenter(
  brain: HybridHexBrain,
  influence = 1,
): AIMoveScoreAugmenter {
  let cachedState: GameState | undefined;
  let cachedForward: BrainForwardCache | undefined;
  const confidence = Math.min(1, brain.trainedSamples / 192);
  return ({ state, move, features }) => {
    if (confidence <= 0 || influence <= 0) return 0;
    try {
      if (cachedState !== state || !cachedForward) {
        cachedState = state;
        cachedForward = forwardBrain(brain, encodeCanonicalState(state));
      }
      const movingPiece = state.pieces.find((piece) => piece.id === move.pieceId);
      const fromCell = movingPiece ? coordToCell(movingPiece) : undefined;
      const toCell = coordToCell(move.to);
      if (fromCell === undefined || toCell === undefined) return 0;
      const decision = forwardDecision(
        brain,
        cachedForward,
        fromCell,
        toCell,
        features,
      );
      const residual = Math.tanh(decision.policyLogit) * confidence * influence;
      return Number.isFinite(residual) ? Math.max(-1.25, Math.min(1.25, residual)) : 0;
    } catch {
      return 0;
    }
  };
}

function openModelDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB indisponible."));
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(
      MODEL_DATABASE,
      MODEL_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MODEL_STORE)) {
        request.result.createObjectStore(MODEL_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ouverture T3 impossible."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Lecture T3 impossible."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Écriture T3 impossible."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Écriture T3 annulée."));
  });
}

export async function loadHybridHexBrain(): Promise<HybridHexBrain> {
  const database = await openModelDatabase();
  try {
    const transaction = database.transaction(MODEL_STORE, "readonly");
    const stored = await requestResult(
      transaction.objectStore(MODEL_STORE).get(MODEL_KEY),
    );
    return parseHybridHexBrain(stored) ?? createDefaultHybridHexBrain();
  } finally {
    database.close();
  }
}

export async function saveHybridHexBrain(brain: HybridHexBrain): Promise<void> {
  const validated = parseHybridHexBrain(brain);
  if (!validated) throw new Error("Cerveau T3 invalide.");
  const database = await openModelDatabase();
  try {
    const transaction = database.transaction(MODEL_STORE, "readwrite");
    transaction.objectStore(MODEL_STORE).put(validated, MODEL_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearHybridHexBrain(): Promise<void> {
  const database = await openModelDatabase();
  try {
    const transaction = database.transaction(MODEL_STORE, "readwrite");
    transaction.objectStore(MODEL_STORE).delete(MODEL_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
