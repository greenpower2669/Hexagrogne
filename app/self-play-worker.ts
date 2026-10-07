import {
  SelfPlayLeague,
  runSelfPlayDuel,
  validateSelfPlayLeague,
} from "./self-play";
import {
  createDefaultHybridHexBrain,
  parseHybridHexBrain,
  trainHybridHexBrainOnPreparedSample,
  type HybridHexBrain,
  type HybridTrainingSession,
} from "./hexconv-brain";
import type { PreparedTrainingSample } from "./training-dataset";

type WorkerMessage =
  | { type: "start"; league: SelfPlayLeague; brain?: HybridHexBrain }
  | { type: "sync"; league: SelfPlayLeague }
  | { type: "set-brain"; brain: HybridHexBrain }
  | { type: "set-brain-budget"; updates: number }
  | { type: "train-corpus"; samples: PreparedTrainingSample[] }
  | { type: "set-enabled"; enabled: boolean }
  | { type: "set-pace"; delayMs: number }
  | { type: "ping" }
  | { type: "stop" };

type WorkerEvent =
  | {
      type: "ready" | "progress";
      league: SelfPlayLeague;
      brain: HybridHexBrain;
    }
  | { type: "brain-progress"; brain: HybridHexBrain; trained: number }
  | { type: "heartbeat"; duels: number; trainingEnabled: boolean }
  | { type: "recoverable-error"; message: string };

let league: SelfPlayLeague | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
let duelDelayMs = 900;
let brain = createDefaultHybridHexBrain();
let brainUpdatesPerDuel = 3;

function clearScheduledDuel() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function scheduleDuel(delay = 180) {
  clearScheduledDuel();
  if (stopped || !league?.trainingEnabled) return;
  timer = setTimeout(runDuel, delay);
}

function postWorkerEvent(event: WorkerEvent) {
  self.postMessage(event);
}

function postHeartbeat() {
  if (!league) return;
  postWorkerEvent({
    type: "heartbeat",
    duels: league.duels,
    trainingEnabled: league.trainingEnabled,
  });
}

function runDuel() {
  if (stopped || !league?.trainingEnabled) return;
  try {
    const hybridTraining: HybridTrainingSession = {
      brain,
      maxUpdates: brainUpdatesPerDuel,
      updates: 0,
    };
    league = runSelfPlayDuel(league, 140, hybridTraining);
    brain = hybridTraining.brain;
    if (league.duels % 3 === 0) {
      postWorkerEvent({ type: "progress", league, brain });
    } else {
      postHeartbeat();
    }
  } catch (error) {
    postWorkerEvent({
      type: "recoverable-error",
      message: error instanceof Error ? error.message : "Duel interrompu",
    });
  }
  scheduleDuel(Math.max(duelDelayMs, 320));
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === "stop") {
    stopped = true;
    clearScheduledDuel();
    return;
  }
  if (message.type === "set-brain") {
    const parsed = parseHybridHexBrain(message.brain);
    if (parsed) brain = parsed;
    else {
      postWorkerEvent({
        type: "recoverable-error",
        message: "Cerveau HexConv T3 incompatible",
      });
    }
    return;
  }
  if (message.type === "set-brain-budget") {
    brainUpdatesPerDuel = Math.max(1, Math.min(4, Math.floor(message.updates)));
    return;
  }
  if (message.type === "train-corpus") {
    try {
      const samples = Array.isArray(message.samples)
        ? message.samples.slice(0, 24)
        : [];
      samples.forEach((sample) => {
        brain = trainHybridHexBrainOnPreparedSample(brain, sample);
      });
      postWorkerEvent({
        type: "brain-progress",
        brain,
        trained: samples.length,
      });
    } catch (error) {
      postWorkerEvent({
        type: "recoverable-error",
        message:
          error instanceof Error
            ? error.message
            : "Lot d'entraînement T3 interrompu",
      });
    }
    return;
  }
  if (message.type === "set-enabled") {
    if (!league) return;
    league = { ...league, trainingEnabled: message.enabled };
    if (message.enabled) scheduleDuel(20);
    else clearScheduledDuel();
    postHeartbeat();
    return;
  }
  if (message.type === "set-pace") {
    duelDelayMs = Math.max(220, Math.min(2400, message.delayMs));
    if (league?.trainingEnabled) scheduleDuel(duelDelayMs);
    postHeartbeat();
    return;
  }
  if (message.type === "ping") {
    postHeartbeat();
    return;
  }
  stopped = false;
  league = validateSelfPlayLeague(message.league);
  if (message.type === "start" && message.brain) {
    brain = parseHybridHexBrain(message.brain) ?? brain;
  }
  postWorkerEvent({ type: "ready", league, brain });
  scheduleDuel(message.type === "start" ? 120 : 20);
};
