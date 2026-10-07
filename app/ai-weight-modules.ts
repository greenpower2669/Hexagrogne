import {
  AI_CORE_FEATURE_ORDER,
  DEFAULT_WEIGHTS,
  type AIMemory,
  queenEscapeWeightsForMemory,
} from "./game-engine";
import {
  HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
  type HybridHexBrain,
  parseHybridHexBrain,
  serializeHybridHexBrain,
} from "./hexconv-brain";
import {
  DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS,
  QUEEN_ESCAPE_CONTEXT_FEATURE_ORDER,
  QUEEN_ESCAPE_CONTEXT_MODULE_NAME,
  QUEEN_ESCAPE_CONTEXT_VERSION,
} from "./queen-escape-context";

export const MODULAR_AI_PACK_VERSION = 9;
export const CORE_WEIGHT_MODULE_VERSION = 1;
export const CORE_WEIGHT_MODULE_NAME = "core";
export const HEXCONV_WEIGHT_MODULE_NAME = "hexConv";
export const HEXCONV_WEIGHT_MODULE_VERSION = 3;

export interface WeightModuleImportResult {
  memory: AIMemory;
  hybridBrain: HybridHexBrain;
  importedModules: string[];
  ignoredModules: string[];
  diagnostics: string[];
}

function finiteVector(value: unknown): number[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some(
      (entry) => typeof entry !== "number" || !Number.isFinite(entry),
    )
  ) {
    return undefined;
  }
  return value;
}

function mergeKnownPrefix(
  local: readonly number[],
  imported: number[],
  expectedLength: number,
  moduleName: string,
  diagnostics: string[],
): number[] {
  if (imported.length !== expectedLength) {
    diagnostics.push(
      `${moduleName}: ${imported.length} paramètres reçus ; ${Math.min(imported.length, expectedLength)} compatibles importés et le reste local conservé.`,
    );
  }
  return Array.from(
    { length: expectedLength },
    (_, index) => imported[index] ?? local[index] ?? 0,
  );
}

function moduleVersion(module: Record<string, unknown>): number {
  return Number(module.moduleVersion ?? module.version ?? 1);
}

export function serializeNamedWeightModules(
  memory: AIMemory,
  hybridBrain: HybridHexBrain,
): Record<string, unknown> {
  return {
    [CORE_WEIGHT_MODULE_NAME]: {
      moduleVersion: CORE_WEIGHT_MODULE_VERSION,
      parameterCount: DEFAULT_WEIGHTS.length,
      featureOrder: AI_CORE_FEATURE_ORDER,
      weights: [...memory.weights],
      championWeights: [...memory.championWeights],
    },
    [QUEEN_ESCAPE_CONTEXT_MODULE_NAME]: {
      moduleVersion: QUEEN_ESCAPE_CONTEXT_VERSION,
      parameterCount: DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.length,
      featureOrder: QUEEN_ESCAPE_CONTEXT_FEATURE_ORDER,
      weights: queenEscapeWeightsForMemory(memory),
      championWeights: queenEscapeWeightsForMemory(memory, true),
    },
    [HEXCONV_WEIGHT_MODULE_NAME]: {
      moduleVersion: HEXCONV_WEIGHT_MODULE_VERSION,
      architectureId: HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
      brain: serializeHybridHexBrain(hybridBrain),
    },
  };
}

export function importNamedWeightModules(
  value: unknown,
  localMemory: AIMemory,
  localHybridBrain: HybridHexBrain,
): WeightModuleImportResult {
  const importedModules: string[] = [];
  const ignoredModules: string[] = [];
  const diagnostics: string[] = [];
  let memory = localMemory;
  let hybridBrain = localHybridBrain;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      memory,
      hybridBrain,
      importedModules,
      ignoredModules,
      diagnostics,
    };
  }
  const modules = value as Record<string, unknown>;
  Object.keys(modules).forEach((name) => {
    if (
      name !== CORE_WEIGHT_MODULE_NAME &&
      name !== QUEEN_ESCAPE_CONTEXT_MODULE_NAME &&
      name !== HEXCONV_WEIGHT_MODULE_NAME
    ) {
      ignoredModules.push(name);
      diagnostics.push(`Unknown weight module ignored: ${name}`);
    }
  });

  const rawCore = modules[CORE_WEIGHT_MODULE_NAME];
  if (rawCore && typeof rawCore === "object" && !Array.isArray(rawCore)) {
    const core = rawCore as Record<string, unknown>;
    if (moduleVersion(core) !== CORE_WEIGHT_MODULE_VERSION) {
      diagnostics.push(
        `core: version ${moduleVersion(core)} incompatible, module local conservé.`,
      );
    } else {
      const weights = finiteVector(core.weights);
      if (!weights) {
        diagnostics.push("core: paramètres invalides, module local conservé.");
      } else {
        const champion = finiteVector(core.championWeights);
        memory = {
          ...memory,
          weights: mergeKnownPrefix(
            memory.weights,
            weights,
            DEFAULT_WEIGHTS.length,
            CORE_WEIGHT_MODULE_NAME,
            diagnostics,
          ),
          championWeights: champion
            ? mergeKnownPrefix(
                memory.championWeights,
                champion,
                DEFAULT_WEIGHTS.length,
                `${CORE_WEIGHT_MODULE_NAME}.championWeights`,
                diagnostics,
              )
            : [...memory.championWeights],
        };
        importedModules.push(CORE_WEIGHT_MODULE_NAME);
      }
    }
  }

  const rawQueen = modules[QUEEN_ESCAPE_CONTEXT_MODULE_NAME];
  if (rawQueen && typeof rawQueen === "object" && !Array.isArray(rawQueen)) {
    const queen = rawQueen as Record<string, unknown>;
    if (moduleVersion(queen) !== QUEEN_ESCAPE_CONTEXT_VERSION) {
      diagnostics.push(
        `${QUEEN_ESCAPE_CONTEXT_MODULE_NAME}: version ${moduleVersion(queen)} incompatible, module local conservé.`,
      );
    } else {
      const weights = finiteVector(queen.weights);
      if (!weights) {
        diagnostics.push(
          `${QUEEN_ESCAPE_CONTEXT_MODULE_NAME}: paramètres invalides, module local conservé.`,
        );
      } else {
        const champion = finiteVector(queen.championWeights);
        memory = {
          ...memory,
          modules: {
            ...memory.modules,
            queenEscapeContext: {
              version: QUEEN_ESCAPE_CONTEXT_VERSION,
              weights: mergeKnownPrefix(
                queenEscapeWeightsForMemory(memory),
                weights,
                DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.length,
                QUEEN_ESCAPE_CONTEXT_MODULE_NAME,
                diagnostics,
              ),
              championWeights: champion
                ? mergeKnownPrefix(
                    queenEscapeWeightsForMemory(memory, true),
                    champion,
                    DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.length,
                    `${QUEEN_ESCAPE_CONTEXT_MODULE_NAME}.championWeights`,
                    diagnostics,
                  )
                : queenEscapeWeightsForMemory(memory, true),
            },
          },
        };
        importedModules.push(QUEEN_ESCAPE_CONTEXT_MODULE_NAME);
      }
    }
  }

  const rawHexConv = modules[HEXCONV_WEIGHT_MODULE_NAME];
  if (
    rawHexConv &&
    typeof rawHexConv === "object" &&
    !Array.isArray(rawHexConv)
  ) {
    const hexConv = rawHexConv as Record<string, unknown>;
    if (moduleVersion(hexConv) !== HEXCONV_WEIGHT_MODULE_VERSION) {
      diagnostics.push(
        `${HEXCONV_WEIGHT_MODULE_NAME}: version ${moduleVersion(hexConv)} incompatible, module local conservé.`,
      );
    } else {
      const parsed = parseHybridHexBrain(hexConv.brain ?? hexConv);
      if (parsed) {
        hybridBrain = parsed;
        importedModules.push(HEXCONV_WEIGHT_MODULE_NAME);
      } else {
        diagnostics.push(
          `${HEXCONV_WEIGHT_MODULE_NAME}: dimensions ou architecture incompatibles, module local conservé.`,
        );
      }
    }
  }

  return {
    memory,
    hybridBrain,
    importedModules,
    ignoredModules,
    diagnostics,
  };
}
