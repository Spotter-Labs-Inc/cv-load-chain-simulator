const bucketThresholds = {
  "0-20": 5,
  "20-40": 65,
  "40-60": 75,
  "60-80": 80,
  "80-100": 85,
};

const bucketProfiles = {
  "0-20": { rateRange: [0.05, 0.2] },
  "20-40": { rateRange: [0.3, 0.8] },
  "40-60": { rateRange: [1, 3] },
  "60-80": { rateRange: [4, 10] },
  "80-100": { rateRange: [15, 40] },
};

const modelCatalog = {
  current: {
    label: "Current Model",
    shortLabel: "Local thresholds only",
  },
  layered: {
    label: "Proposed Model",
    shortLabel: "Local threshold + global top-K",
  },
  dynamic: {
    label: "Dynamic Model",
    shortLabel: "Adaptive threshold feedback",
  },
};

const lanePresets = {
  balanced: {
    lanes: [
      { name: "T1", profileBucket: "0-20" },
      { name: "T2", profileBucket: "0-20" },
      { name: "T3", profileBucket: "20-40" },
      { name: "T4", profileBucket: "20-40" },
      { name: "T5", profileBucket: "40-60" },
      { name: "T6", profileBucket: "40-60" },
      { name: "T7", profileBucket: "60-80" },
      { name: "T8", profileBucket: "60-80" },
      { name: "T9", profileBucket: "80-100" },
      { name: "T10", profileBucket: "80-100" },
    ],
  },
  surge: {
    lanes: [
      { name: "T1", profileBucket: "0-20", thresholdPct: 5 },
      { name: "T2", profileBucket: "20-40", thresholdPct: 65 },
      { name: "T3", profileBucket: "40-60", thresholdPct: 75 },
      { name: "T4", profileBucket: "40-60", thresholdPct: 75 },
      { name: "T5", profileBucket: "60-80", thresholdPct: 80 },
      { name: "T6", profileBucket: "60-80", thresholdPct: 80 },
      { name: "T7", profileBucket: "80-100", thresholdPct: 85 },
      { name: "T8", profileBucket: "80-100", thresholdPct: 85 },
      { name: "T9", profileBucket: "80-100", thresholdPct: 85 },
      { name: "T10", profileBucket: "80-100", thresholdPct: 85 },
    ],
  },
  provided: {
    config: {
      agents: 7,
      handleTimeSec: 120,
      selectedModel: "dynamic",
      dynamic: {
        safetyFactor: 0.8,
        allocationGamma: 0.25,
        maxLaneShare: 0.4,
        smoothing: 0.5,
      },
    },
    lanes: [
      { name: "831353", profileBucket: "custom", loadsPerMin: 21.6, thresholdPct: 98.97 },
      { name: "831342", profileBucket: "custom", loadsPerMin: 14.7, thresholdPct: 98.62 },
      { name: "831303", profileBucket: "custom", loadsPerMin: 13.8, thresholdPct: 98.56 },
      { name: "828907", profileBucket: "custom", loadsPerMin: 13.3, thresholdPct: 98.52 },
      { name: "831364", profileBucket: "custom", loadsPerMin: 12.0, thresholdPct: 98.4 },
      { name: "831362", profileBucket: "custom", loadsPerMin: 10.0, thresholdPct: 98.16 },
      { name: "830985", profileBucket: "custom", loadsPerMin: 9.3, thresholdPct: 98.06 },
      { name: "831359", profileBucket: "custom", loadsPerMin: 8.5, thresholdPct: 97.93 },
      { name: "831332", profileBucket: "custom", loadsPerMin: 6.6, thresholdPct: 97.49 },
      { name: "831358", profileBucket: "custom", loadsPerMin: 4.6, thresholdPct: 96.71 },
      { name: "828912", profileBucket: "custom", loadsPerMin: 4.1, thresholdPct: 96.42 },
      { name: "831356", profileBucket: "custom", loadsPerMin: 3.4, thresholdPct: 95.88 },
      { name: "831360", profileBucket: "custom", loadsPerMin: 3.2, thresholdPct: 95.68 },
      { name: "831343", profileBucket: "custom", loadsPerMin: 3.1, thresholdPct: 95.58 },
      { name: "831365", profileBucket: "custom", loadsPerMin: 1.8, thresholdPct: 93.36 },
      { name: "831347", profileBucket: "custom", loadsPerMin: 1.2, thresholdPct: 90.99 },
      { name: "831361", profileBucket: "custom", loadsPerMin: 0.4, thresholdPct: 79.47 },
      { name: "831350", profileBucket: "custom", loadsPerMin: 0.1, thresholdPct: 41.94 },
    ],
  },
};

const GLOBAL_BUFFER_SLOTS = 1;
const DEFAULT_SELECTED_MODEL = "current";
const DEFAULT_PRESET = "provided";

const uiState = {
  config: {
    agents: 6,
    handleTimeSec: 120,
    staleWindowSec: 20,
    speed: 18,
    selectedModel: DEFAULT_SELECTED_MODEL,
    dynamic: {
      safetyFactor: 0.8,
      allocationGamma: 0.5,
      maxLaneShare: 0.35,
      smoothing: 0.18,
    },
  },
  running: false,
  laneConfigs: [],
};

const runtime = {
  sims: {},
};

const refs = {};

function averageRange([min, max]) {
  return (min + max) / 2;
}

function representativeRate(bucket) {
  if (!bucketProfiles[bucket]) {
    return 0;
  }
  return averageRange(bucketProfiles[bucket].rateRange);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function stringHash(value) {
  return Array.from(String(value)).reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7);
}

function pseudoRandom(seed, a, b) {
  return clamp(
    fract(Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453),
    0.000001,
    0.999999,
  );
}

function deterministicScorePercentile(lane, arrivalIndex) {
  return clamp(
    pseudoRandom(arrivalIndex + 1, lane.loadsPerMin * 3.1, lane.randomSeed * 0.017) * 100,
    1,
    99,
  );
}

function passRateForThreshold(threshold) {
  return clamp((100 - threshold) / 100, 0, 1);
}

function serviceCapacityPerMin() {
  return (uiState.config.agents * 60) / uiState.config.handleTimeSec;
}

function safeCapacityPerMin() {
  return serviceCapacityPerMin() * uiState.config.dynamic.safetyFactor;
}

function laneThresholdRatio(thresholdPct) {
  return thresholdPct / 100;
}

function formatThresholdRatio(thresholdPct) {
  return laneThresholdRatio(thresholdPct).toFixed(4);
}

function formatLoadsPerMin(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function resolveProfileLabel(profileBucket) {
  return profileBucket === "custom" ? "custom" : profileBucket;
}

function makeLaneConfig(config) {
  const profileBucket = config.profileBucket ?? "custom";
  const thresholdPct = config.thresholdPct ?? bucketThresholds[profileBucket] ?? 50;
  const loadsPerMin = config.loadsPerMin ?? representativeRate(profileBucket);
  return {
    name: config.name,
    profileBucket,
    thresholdPct,
    loadsPerMin,
  };
}

function createLaneState(config, index) {
  return {
    id: `L${index + 1}`,
    name: config.name,
    profileBucket: config.profileBucket,
    thresholdPct: config.thresholdPct,
    dynamicThresholdPct: config.thresholdPct,
    dynamicTargetThresholdPct: config.thresholdPct,
    dynamicBudgetPerMin: 0,
    dynamicExpectedPassingPerMin: 0,
    dynamicWeight: 0,
    dynamicTargetPassRate: 0,
    loadsPerMin: config.loadsPerMin,
    randomSeed: stringHash(config.name || index + 1),
    nextArrivalAt: 0,
    arrivalCount: 0,
    counts: {
      arrived: 0,
      localFiltered: 0,
      globalFiltered: 0,
      queued: 0,
      grabbed: 0,
      expired: 0,
    },
  };
}

function createAgentState(index) {
  return {
    id: `A${index + 1}`,
    busyUntil: 0,
    currentLoad: null,
    startedAt: 0,
  };
}

function createSimulation(policyId) {
  return {
    policyId,
    time: 0,
    lanes: uiState.laneConfigs.map(createLaneState),
    agents: Array.from({ length: uiState.config.agents }, (_, index) => createAgentState(index)),
    queue: [],
    loads: [],
    nextLoadId: 1,
    stats: {
      arrived: 0,
      localFiltered: 0,
      globalFiltered: 0,
      queued: 0,
      grabbed: 0,
      expired: 0,
      completed: 0,
    },
    history: {
      queue: [],
      capture: [],
    },
    metricsWindow: [],
  };
}

function initializeLaneConfigs(preset = "balanced") {
  const scenario = lanePresets[preset] ?? lanePresets[DEFAULT_PRESET];
  uiState.laneConfigs = scenario.lanes.map(makeLaneConfig);
}

function applyPresetConfig(preset = DEFAULT_PRESET) {
  const scenario = lanePresets[preset] ?? lanePresets[DEFAULT_PRESET];
  const config = scenario.config ?? {};
  const dynamicConfig = config.dynamic ?? {};

  uiState.config.agents = config.agents ?? 6;
  uiState.config.handleTimeSec = config.handleTimeSec ?? 120;
  uiState.config.staleWindowSec = config.staleWindowSec ?? 20;
  uiState.config.speed = config.speed ?? 18;
  uiState.config.selectedModel = config.selectedModel ?? DEFAULT_SELECTED_MODEL;
  uiState.config.dynamic = {
    safetyFactor: dynamicConfig.safetyFactor ?? 0.8,
    allocationGamma: dynamicConfig.allocationGamma ?? 0.5,
    maxLaneShare: dynamicConfig.maxLaneShare ?? 0.35,
    smoothing: dynamicConfig.smoothing ?? 0.18,
  };
}

function applyScenarioPreset(preset = DEFAULT_PRESET) {
  applyPresetConfig(preset);
  initializeLaneConfigs(preset);
  syncInputs();
  resetSimulations();
}

function resetSimulations() {
  runtime.sims = {
    current: createSimulation("current"),
    layered: createSimulation("layered"),
    dynamic: createSimulation("dynamic"),
  };
  uiState.running = false;
  syncHeader();
  syncSimulationButton();
  renderAll();
}

function syncSimulationButton() {
  if (!refs.toggleSimButton) {
    return;
  }

  const label = uiState.running ? "Pause" : selectedSim().time > 0 ? "Resume" : "Play";
  refs.toggleSimButton.textContent = label;
}

function selectedSim() {
  return runtime.sims[uiState.config.selectedModel];
}

function syncHeader() {
  if (refs.heroPosts) refs.heroPosts.textContent = String(uiState.laneConfigs.length);
  if (refs.heroAgents) refs.heroAgents.textContent = String(uiState.config.agents);
  if (refs.heroStale) refs.heroStale.textContent = `${uiState.config.staleWindowSec}s`;
}

function thresholdForLane(sim, lane) {
  if (sim.policyId === "dynamic") {
    return clamp(lane.dynamicThresholdPct ?? lane.thresholdPct, 0, 99);
  }
  return clamp(lane.thresholdPct, 0, 99);
}

function lanePriority(load, simTime) {
  return load.score + clamp((simTime - load.queueEnteredAt) * 0.25, 0, 8);
}

function actionableLimit(sim) {
  if (sim.policyId !== "layered") {
    return Number.POSITIVE_INFINITY;
  }

  const idleAgents = sim.agents.filter((agent) => !agent.currentLoad).length;
  const freeingSoon = sim.agents.filter(
    (agent) => agent.currentLoad && agent.busyUntil - sim.time <= uiState.config.staleWindowSec,
  ).length;

  return Math.max(1, idleAgents + freeingSoon + GLOBAL_BUFFER_SLOTS);
}

function totalLoadRate(sim) {
  return sim.lanes.reduce((sum, lane) => sum + lane.loadsPerMin, 0);
}

function totalWeight(sim) {
  const gamma = uiState.config.dynamic.allocationGamma;
  return sim.lanes.reduce((sum, lane) => sum + Math.pow(Math.max(lane.loadsPerMin, 0.0001), gamma), 0);
}

function computeCappedBudgets(sim) {
  const safeCap = safeCapacityPerMin();
  const gamma = uiState.config.dynamic.allocationGamma;
  const laneCap = safeCap * uiState.config.dynamic.maxLaneShare;
  const budgets = new Map();
  let remainingCap = safeCap;
  let remaining = sim.lanes.map((lane) => ({
    lane,
    weight: Math.pow(Math.max(lane.loadsPerMin, 0.0001), gamma),
  }));

  while (remaining.length) {
    const weightSum = remaining.reduce((sum, item) => sum + item.weight, 0);
    const divisor = weightSum > 0 ? weightSum : remaining.length;
    const capped = [];

    for (const item of remaining) {
      const proportionalBudget =
        weightSum > 0 ? (remainingCap * item.weight) / divisor : remainingCap / divisor;
      if (proportionalBudget > laneCap) {
        capped.push(item);
      }
    }

    if (!capped.length) {
      for (const item of remaining) {
        const budget = weightSum > 0 ? (remainingCap * item.weight) / divisor : remainingCap / divisor;
        budgets.set(item.lane.id, budget);
      }
      break;
    }

    for (const item of capped) {
      budgets.set(item.lane.id, laneCap);
      remainingCap -= laneCap;
    }

    const cappedIds = new Set(capped.map((item) => item.lane.id));
    remaining = remaining.filter((item) => !cappedIds.has(item.lane.id));
  }

  return budgets;
}

function expectedPassingRateForThreshold(lane, thresholdPct) {
  return lane.loadsPerMin * passRateForThreshold(thresholdPct);
}

function currentExpectedPassingRate(sim, lane) {
  return expectedPassingRateForThreshold(lane, thresholdForLane(sim, lane));
}

function globalExpectedPassingRate(sim) {
  return sim.lanes.reduce((sum, lane) => sum + currentExpectedPassingRate(sim, lane), 0);
}

function dynamicTargetThreshold(sim, lane, globalPassingRate, budgetByLane) {
  const safeCap = safeCapacityPerMin();
  const gamma = uiState.config.dynamic.allocationGamma;
  const laneWeight = Math.pow(Math.max(lane.loadsPerMin, 0.0001), gamma);
  const localBudget = Math.max(0.05, budgetByLane.get(lane.id) ?? 0);
  const localPassingRate = currentExpectedPassingRate(sim, lane);
  const rawTargetPassRate = clamp(localBudget / Math.max(0.05, lane.loadsPerMin), 0.02, 0.98);
  const targetPassRate = rawTargetPassRate;

  lane.dynamicWeight = laneWeight;
  lane.dynamicBudgetPerMin = localBudget;
  lane.dynamicExpectedPassingPerMin = localPassingRate;
  lane.dynamicTargetPassRate = targetPassRate;

  return clamp(100 * (1 - targetPassRate), 0, 99);
}

function updateDynamicThresholds(sim) {
  if (sim.policyId !== "dynamic") {
    return;
  }

  const globalPassingRate = globalExpectedPassingRate(sim);
  const budgetByLane = computeCappedBudgets(sim);

  for (const lane of sim.lanes) {
    const targetThreshold = dynamicTargetThreshold(sim, lane, globalPassingRate, budgetByLane);
    lane.dynamicTargetThresholdPct = targetThreshold;
    lane.dynamicThresholdPct = clamp(
      lane.dynamicThresholdPct * (1 - uiState.config.dynamic.smoothing) +
        targetThreshold * uiState.config.dynamic.smoothing,
      0,
      99,
    );
  }
}

function markFiltered(sim, lane, load, rejectedBy, anchor = "gate") {
  load.stage = "filtered";
  load.rejectedBy = rejectedBy;
  load.filterAnchor = anchor;
  load.visibleUntil = sim.time + 4;
  if (rejectedBy === "local") {
    sim.stats.localFiltered += 1;
    lane.counts.localFiltered += 1;
  } else {
    sim.stats.globalFiltered += 1;
    lane.counts.globalFiltered += 1;
  }
}

function queueVisibleCandidates(sim) {
  return sim.queue.filter((load) => !load.serviceStartedAt && load.queueEnteredAt <= sim.time);
}

function removeFromQueue(sim, load) {
  sim.queue = sim.queue.filter((candidate) => candidate.id !== load.id);
}

function weakestQueuedLoad(sim) {
  const candidates = sim.queue.filter((load) => !load.serviceStartedAt);
  if (!candidates.length) {
    return null;
  }
  return [...candidates].sort((a, b) => lanePriority(a, sim.time) - lanePriority(b, sim.time))[0];
}

function acceptIntoQueue(sim, lane, load) {
  load.queueEnteredAt = sim.time + 1.2;
  load.staleAt = sim.time + uiState.config.staleWindowSec;
  load.visibleUntil = sim.time + 30;
  sim.queue.push(load);
  sim.stats.queued += 1;
  lane.counts.queued += 1;
}

function applyPolicyAdmission(sim, lane, load) {
  if (sim.policyId === "current") {
    acceptIntoQueue(sim, lane, load);
    return;
  }

  const cap = actionableLimit(sim);
  const waitingCount = sim.queue.filter((candidate) => !candidate.serviceStartedAt).length;

  if (waitingCount < cap) {
    acceptIntoQueue(sim, lane, load);
    return;
  }

  const weakest = weakestQueuedLoad(sim);
  if (weakest && load.score > weakest.score) {
    removeFromQueue(sim, weakest);
    const weakestLane = sim.lanes.find((candidate) => candidate.id === weakest.laneId);
    markFiltered(sim, weakestLane, weakest, "global", "queue");
    acceptIntoQueue(sim, lane, load);
    return;
  }

  markFiltered(sim, lane, load, "global", "queue");
}

function createLoad(sim, lane) {
  lane.arrivalCount += 1;
  lane.counts.arrived += 1;
  sim.stats.arrived += 1;

  const threshold = thresholdForLane(sim, lane);
  const score = deterministicScorePercentile(lane, lane.arrivalCount);

  const load = {
    id: sim.nextLoadId++,
    laneId: lane.id,
    laneName: lane.name,
    profileBucket: lane.profileBucket,
    score,
    threshold,
    createdAt: sim.time,
    queueEnteredAt: null,
    serviceStartedAt: null,
    serviceCompletedAt: null,
    staleAt: null,
    stage: "incoming",
    rejectedBy: null,
    filterAnchor: "gate",
    visibleUntil: sim.time + 30,
  };

  sim.loads.push(load);

  if (score < threshold) {
    markFiltered(sim, lane, load, "local", "gate");
    return;
  }

  applyPolicyAdmission(sim, lane, load);
}

function enforceGlobalCap(sim) {
  if (sim.policyId !== "layered") {
    return;
  }

  const cap = actionableLimit(sim);
  const waiting = sim.queue.filter((load) => !load.serviceStartedAt);

  if (waiting.length <= cap) {
    return;
  }

  const keepIds = new Set(
    [...waiting]
      .sort((a, b) => lanePriority(b, sim.time) - lanePriority(a, sim.time))
      .slice(0, cap)
      .map((load) => load.id),
  );

  const keptQueue = [];
  for (const load of sim.queue) {
    if (load.serviceStartedAt || keepIds.has(load.id)) {
      keptQueue.push(load);
      continue;
    }

    const lane = sim.lanes.find((candidate) => candidate.id === load.laneId);
    markFiltered(sim, lane, load, "global", "queue");
  }

  sim.queue = keptQueue;
}

function releaseAgents(sim) {
  for (const agent of sim.agents) {
    if (agent.currentLoad && sim.time >= agent.busyUntil) {
      sim.stats.completed += 1;
      agent.currentLoad.stage = "completed";
      agent.currentLoad.visibleUntil = sim.time + 1;
      agent.currentLoad = null;
      agent.startedAt = 0;
    }
  }
}

function expireLoads(sim) {
  const remainingQueue = [];

  for (const load of sim.queue) {
    if (load.serviceStartedAt) {
      remainingQueue.push(load);
      continue;
    }

    if (load.staleAt && load.staleAt <= sim.time) {
      load.stage = "expired";
      load.visibleUntil = sim.time + 5;
      sim.stats.expired += 1;
      const lane = sim.lanes.find((candidate) => candidate.id === load.laneId);
      lane.counts.expired += 1;
      continue;
    }

    remainingQueue.push(load);
  }

  sim.queue = remainingQueue;
}

function assignAgents(sim) {
  const availableAgents = sim.agents.filter((agent) => !agent.currentLoad);
  if (!availableAgents.length) {
    return;
  }

  const candidates = queueVisibleCandidates(sim).sort(
    (a, b) => lanePriority(b, sim.time) - lanePriority(a, sim.time),
  );

  for (const agent of availableAgents) {
    const nextLoad = candidates.shift();
    if (!nextLoad) {
      break;
    }

    removeFromQueue(sim, nextLoad);
    nextLoad.stage = "assigned";
    nextLoad.serviceStartedAt = sim.time;
    nextLoad.serviceCompletedAt = sim.time + uiState.config.handleTimeSec;
    nextLoad.visibleUntil = nextLoad.serviceCompletedAt + 2;

    agent.currentLoad = nextLoad;
    agent.startedAt = sim.time;
    agent.busyUntil = nextLoad.serviceCompletedAt;

    sim.stats.grabbed += 1;
    const lane = sim.lanes.find((candidate) => candidate.id === nextLoad.laneId);
    lane.counts.grabbed += 1;
  }
}

function updateVisibleStages(sim) {
  const now = sim.time;

  for (const load of sim.loads) {
    if (load.stage === "completed") {
      continue;
    }

    if (load.serviceStartedAt) {
      load.stage = "assigned";
      continue;
    }

    if (load.rejectedBy) {
      load.stage = "filtered";
      continue;
    }

    if (load.staleAt && now >= load.staleAt) {
      load.stage = "expired";
      continue;
    }

    if (load.queueEnteredAt && now >= load.queueEnteredAt) {
      load.stage = "queued";
    } else {
      load.stage = "incoming";
    }
  }

  sim.loads = sim.loads.filter((load) => load.visibleUntil > now);
}

function updateHistory(sim) {
  const waiting = queueVisibleCandidates(sim).length;
  sim.history.queue.push({ time: sim.time, value: waiting });
  sim.history.capture.push({ time: sim.time, value: rollingRate(sim, "grabbed") });

  if (sim.history.queue.length > 200) {
    sim.history.queue.shift();
  }
  if (sim.history.capture.length > 200) {
    sim.history.capture.shift();
  }

  sim.metricsWindow.push({
    time: sim.time,
    arrived: sim.stats.arrived,
    queued: sim.stats.queued,
    grabbed: sim.stats.grabbed,
    expired: sim.stats.expired,
    globalFiltered: sim.stats.globalFiltered,
  });

  const windowStart = sim.time - 600;
  while (sim.metricsWindow.length && sim.metricsWindow[0].time < windowStart) {
    sim.metricsWindow.shift();
  }
}

function tickSim(sim, dt) {
  sim.time += dt;
  releaseAgents(sim);
  updateDynamicThresholds(sim);

  for (const lane of sim.lanes) {
    const interval = 60 / Math.max(lane.loadsPerMin, 0.01);
    while (lane.nextArrivalAt <= sim.time) {
      createLoad(sim, lane);
      lane.nextArrivalAt += interval;
    }
  }

  enforceGlobalCap(sim);
  expireLoads(sim);
  enforceGlobalCap(sim);
  assignAgents(sim);
  updateVisibleStages(sim);
  updateHistory(sim);
}

function tickAll(dt) {
  tickSim(runtime.sims.current, dt);
  tickSim(runtime.sims.layered, dt);
  tickSim(runtime.sims.dynamic, dt);
}

function rollingRate(sim, metric) {
  const current = sim.metricsWindow[sim.metricsWindow.length - 1];
  if (!current) {
    return 0;
  }

  const floorTime = sim.time - 120;
  const earlier = sim.metricsWindow.find((point) => point.time >= floorTime) || sim.metricsWindow[0];
  const delta = current[metric] - earlier[metric];
  const spanSec = Math.max(1, current.time - earlier.time);
  return (delta / spanSec) * 60;
}

function utilization(sim) {
  const busy = sim.agents.filter((agent) => agent.currentLoad).length;
  return busy / Math.max(1, sim.agents.length);
}

function oldestQueueAge(sim) {
  const waiting = queueVisibleCandidates(sim);
  if (!waiting.length) {
    return 0;
  }
  const oldestEnteredAt = Math.min(...waiting.map((load) => load.queueEnteredAt));
  return Math.max(0, sim.time - oldestEnteredAt);
}

function waitingQueueDepth(sim) {
  return queueVisibleCandidates(sim).length;
}

function averageEffectiveThreshold(sim) {
  return (
    sim.lanes.reduce((sum, lane) => sum + thresholdForLane(sim, lane), 0) /
    Math.max(1, sim.lanes.length)
  );
}

function dynamicSummary(sim) {
  return {
    safeCapacity: safeCapacityPerMin(),
    globalExpectedPassing: globalExpectedPassingRate(sim),
    weightSum: totalWeight(sim),
    avgThreshold: averageEffectiveThreshold(sim),
    maxLaneShare: uiState.config.dynamic.maxLaneShare,
  };
}

function comparisonSummary() {
  return Object.fromEntries(
    Object.entries(runtime.sims).map(([policyId, sim]) => [
      policyId,
      {
        actionableRate: rollingRate(sim, "queued"),
        grabbedRate: rollingRate(sim, "grabbed"),
        expiredPct: (sim.stats.expired / Math.max(1, sim.stats.queued)) * 100,
        globalFiltered: sim.stats.globalFiltered,
        avgThreshold: averageEffectiveThreshold(sim),
      },
    ]),
  );
}

function svgPath(points, width, height) {
  if (!points.length) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChart(ref, points, color) {
  const width = 360;
  const height = 120;
  const path = svgPath(points, width, height);
  ref.innerHTML = `
    <defs>
      <linearGradient id="${ref.id}-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"></stop>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"></stop>
      </linearGradient>
    </defs>
    <path d="${path} L${width},${height} L0,${height} Z" fill="url(#${ref.id}-fill)"></path>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
  `;
}

function renderMetricCards() {
  const sim = selectedSim();
  const actionableRate = rollingRate(sim, "queued");
  const grabbedRate = rollingRate(sim, "grabbed");
  const controlCard =
    sim.policyId === "dynamic"
      ? {
          label: "Avg threshold now",
          value: `${averageEffectiveThreshold(sim).toFixed(0)}%`,
          detail: "Feedback from local and global passing flow",
        }
      : {
          label: "Global Filters",
          value: String(sim.stats.globalFiltered),
          detail: sim.policyId === "layered" ? "Rejected by global top-K" : "Not used in current model",
        };
  const expiredPct = ((sim.stats.expired / Math.max(1, sim.stats.queued)) * 100).toFixed(1);
  const elapsed = sim.time;
  const elapsedLabel = elapsed >= 60 ? `${(elapsed / 60).toFixed(1)}m` : `${elapsed.toFixed(0)}s`;
  const cards = [
    {
      label: "Sim Time",
      value: elapsedLabel,
    },
    {
      label: "Total Loads",
      value: String(sim.stats.arrived),
    },
    {
      label: "Incoming / min",
      value: rollingRate(sim, "arrived").toFixed(1),
    },
    {
      label: "Actionable / min",
      value: actionableRate.toFixed(1),
    },
    {
      label: "Grabbed / min",
      value: grabbedRate.toFixed(1),
    },
    {
      label: "Capacity / min",
      value: `${serviceCapacityPerMin().toFixed(2)} (${safeCapacityPerMin().toFixed(2)} safe)`,
    },
    controlCard,
    {
      label: "Expired",
      value: `${sim.stats.expired} (${expiredPct}%)`,
    },
    {
      label: "Utilization",
      value: `${(utilization(sim) * 100).toFixed(0)}%`,
    },
  ];

  refs.metricCards.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <span class="metric-label">${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderComparisonCards() {
  const summary = comparisonSummary();
  const comparisonModel = uiState.config.selectedModel === "current" ? "dynamic" : uiState.config.selectedModel;
  const expiredDelta = summary.current.expiredPct - summary[comparisonModel].expiredPct;
  const grabbedDelta = summary[comparisonModel].grabbedRate - summary.current.grabbedRate;
  const expiredText =
    expiredDelta >= 0
      ? `${expiredDelta.toFixed(1)} pts lower expiration`
      : `${Math.abs(expiredDelta).toFixed(1)} pts higher expiration`;
  const grabbedText =
    grabbedDelta >= 0
      ? `+${grabbedDelta.toFixed(1)}/m grabbed rate`
      : `${grabbedDelta.toFixed(1)}/m grabbed rate`;

  refs.comparisonCards.innerHTML = `
    <article class="compare-card ${uiState.config.selectedModel === "current" ? "selected" : ""}" data-model="current">
      <div class="compare-header">
        <strong>${modelCatalog.current.label}</strong>
        <span>${modelCatalog.current.shortLabel}</span>
      </div>
      <div class="compare-metrics">
        <span>Actionable ${summary.current.actionableRate.toFixed(1)}/m</span>
        <span>Grabbed ${summary.current.grabbedRate.toFixed(1)}/m</span>
        <span>Expired ${summary.current.expiredPct.toFixed(1)}%</span>
        <span>Avg threshold ${summary.current.avgThreshold.toFixed(0)}%</span>
      </div>
    </article>
    <article class="compare-card ${uiState.config.selectedModel === "layered" ? "selected" : ""}" data-model="layered">
      <div class="compare-header">
        <strong>${modelCatalog.layered.label}</strong>
        <span>${modelCatalog.layered.shortLabel}</span>
      </div>
      <div class="compare-metrics">
        <span>Actionable ${summary.layered.actionableRate.toFixed(1)}/m</span>
        <span>Grabbed ${summary.layered.grabbedRate.toFixed(1)}/m</span>
        <span>Expired ${summary.layered.expiredPct.toFixed(1)}%</span>
        <span>Avg threshold ${summary.layered.avgThreshold.toFixed(0)}%</span>
      </div>
    </article>
    <article class="compare-card ${uiState.config.selectedModel === "dynamic" ? "selected" : ""}" data-model="dynamic">
      <div class="compare-header">
        <strong>${modelCatalog.dynamic.label}</strong>
        <span>${modelCatalog.dynamic.shortLabel}</span>
      </div>
      <div class="compare-metrics">
        <span>Actionable ${summary.dynamic.actionableRate.toFixed(1)}/m</span>
        <span>Grabbed ${summary.dynamic.grabbedRate.toFixed(1)}/m</span>
        <span>Expired ${summary.dynamic.expiredPct.toFixed(1)}%</span>
        <span>Avg threshold ${summary.dynamic.avgThreshold.toFixed(0)}%</span>
      </div>
    </article>
    <div class="compare-delta">
      <strong>${modelCatalog[comparisonModel].label} vs current</strong>
      <span>${expiredText}</span>
      <span>${grabbedText}</span>
    </div>
  `;
}

function renderDynamicInspector() {
  const dynamicSim = runtime.sims.dynamic;
  const summary = dynamicSummary(dynamicSim);

  refs.dynamicSummaryCards.innerHTML = `
    <article class="metric-card">
      <span class="metric-label">Service Capacity / min</span>
      <strong>${serviceCapacityPerMin().toFixed(2)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Safe Capacity / min</span>
      <strong>${summary.safeCapacity.toFixed(2)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Expected Passing / min</span>
      <strong>${summary.globalExpectedPassing.toFixed(2)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Allocation Gamma</span>
      <strong>${uiState.config.dynamic.allocationGamma.toFixed(2)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Max Lane Share</span>
      <strong>${(summary.maxLaneShare * 100).toFixed(0)}%</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Avg Dynamic Threshold</span>
      <strong>${summary.avgThreshold.toFixed(0)}%</strong>
    </article>
  `;

  refs.dynamicInspector.innerHTML = `
    <div class="dynamic-header">
      <span>Post</span>
      <span>LPM</span>
      <span>Budget / min</span>
      <span>Expected Pass / min</span>
      <span>Target Threshold</span>
      <span>Live Threshold</span>
    </div>
    ${dynamicSim.lanes
      .map(
        (lane) => `
          <div class="dynamic-row">
            <strong>${lane.name}</strong>
            <span>${formatLoadsPerMin(lane.loadsPerMin, 4)}</span>
            <span>${lane.dynamicBudgetPerMin.toFixed(2)}</span>
            <span>${lane.dynamicExpectedPassingPerMin.toFixed(2)}</span>
            <span>${formatThresholdRatio(lane.dynamicTargetThresholdPct)}</span>
            <span>${formatThresholdRatio(lane.dynamicThresholdPct)}</span>
          </div>
        `,
      )
      .join("")}
  `;
}

function renderQueueCards() {
  const sim = selectedSim();
  const waiting = queueVisibleCandidates(sim)
    .sort((a, b) => lanePriority(b, sim.time) - lanePriority(a, sim.time))
    .slice(0, 8);

  refs.queueDepth.textContent = `${waitingQueueDepth(sim)} waiting`;
  refs.queueDelay.textContent = `${oldestQueueAge(sim).toFixed(1)}s oldest age`;

  while (waiting.length < 8) {
    waiting.push(null);
  }

  refs.queueCards.innerHTML = waiting
    .map((load, index) => {
      if (!load) {
        return `
          <article class="queue-card hidden-card">
            <strong>Queue slot ${index + 1}</strong>
            <span>Available</span>
          </article>
        `;
      }

      const age = selectedSim().time - load.queueEnteredAt;
      return `
        <article class="queue-card">
          <strong>${load.laneName} · score ${load.score.toFixed(0)}</strong>
          <span>Threshold ${formatThresholdRatio(load.threshold)} · ${resolveProfileLabel(load.profileBucket)}</span>
          <div class="queue-meta">
            <span>Age ${age.toFixed(1)}s</span>
            <span>Priority ${lanePriority(load, sim.time).toFixed(1)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAgentCards() {
  const sim = selectedSim();
  refs.agentCards.innerHTML = sim.agents
    .map((agent) => {
      if (!agent.currentLoad) {
        return `
          <article class="agent-card idle">
            <strong>${agent.id}</strong>
            <span>Idle and ready</span>
            <div class="agent-meta">
              <span>No load assigned</span>
              <span>0%</span>
            </div>
            <div class="progress"><div style="width: 0%"></div></div>
          </article>
        `;
      }

      const progress = clamp(
        ((sim.time - agent.startedAt) / uiState.config.handleTimeSec) * 100,
        0,
        100,
      );

      return `
        <article class="agent-card busy">
          <strong>${agent.id} · ${agent.currentLoad.laneName}</strong>
          <span>Grabbed at ${formatTime(agent.startedAt)}</span>
          <div class="agent-meta">
            <span>Score ${agent.currentLoad.score.toFixed(0)}</span>
            <span>${progress.toFixed(0)}%</span>
          </div>
          <div class="progress"><div style="width: ${progress}%"></div></div>
        </article>
      `;
    })
    .join("");
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function renderLoadDot(sim, load) {
  let x = 0;
  let y = 50;
  let opacity = 1;
  let className = "incoming";

  if (load.stage === "incoming") {
    const progress = clamp((sim.time - load.createdAt) / 1.2, 0, 1);
    x = progress * 34;
  } else if (load.stage === "queued") {
    const progress = clamp((sim.time - load.queueEnteredAt) / 1.5, 0, 1);
    x = 34 + progress * 32;
    className = "queued";
  } else if (load.stage === "assigned") {
    const progress = clamp((sim.time - load.serviceStartedAt) / 1.2, 0, 1);
    x = 66 + progress * 26;
    className = "assigned";
  } else if (load.stage === "expired") {
    const progress = clamp((sim.time - load.staleAt) / 1.8, 0, 1);
    x = 66 + progress * 8;
    y = 50 + progress * 20;
    opacity = 1 - progress * 0.45;
    className = "expired";
  } else if (load.rejectedBy === "global") {
    const progress = clamp((sim.time - load.createdAt) / 1.6, 0, 1);
    x = 66 + progress * 6;
    y = 50 + progress * 18;
    opacity = 1 - progress * 0.35;
    className = "global-filtered";
  } else {
    const progress = clamp((sim.time - load.createdAt) / 1.4, 0, 1);
    x = 34 + progress * 8;
    y = 50 + progress * 22;
    opacity = 1 - progress * 0.45;
    className = "filtered";
  }

  const size = 10 + (load.score / 100) * 6;

  return `
    <div
      class="load-dot ${className}"
      style="left: calc(${x}% - ${size / 2}px); top: calc(${y}% - ${size / 2}px); width: ${size}px; height: ${size}px; opacity: ${opacity};"
      title="${load.laneName} | score ${load.score.toFixed(0)} | ${load.rejectedBy || load.stage}"
    ></div>
  `;
}

function renderLaneStage() {
  const sim = selectedSim();
  refs.laneStage.innerHTML = sim.lanes
    .map((lane) => {
      const laneLoads = sim.loads
        .filter((load) => load.laneId === lane.id)
        .slice(-18)
        .map((load) => renderLoadDot(sim, load));

      return `
        <article class="lane-visual">
          <div class="lane-header-row">
            <div>
              <div class="lane-title">${lane.name}</div>
              <div class="lane-meta">
                <span>${resolveProfileLabel(lane.profileBucket)} profile</span>
                <span>${formatLoadsPerMin(lane.loadsPerMin, 4)} lpm</span>
                <span>${formatThresholdRatio(thresholdForLane(sim, lane))} threshold now</span>
              </div>
            </div>
            <div class="lane-meta">
              <span>${lane.counts.queued} actionable</span>
              <span>${lane.counts.grabbed} grabbed</span>
              <span>${lane.counts.expired} expired</span>
            </div>
          </div>
          <div class="lane-track">
            ${laneLoads.join("")}
          </div>
          <div class="lane-track-labels">
            <span>Arrivals</span>
            <span>Local Gate</span>
            <span>${sim.policyId === "layered" ? "Global Set" : sim.policyId === "dynamic" ? "Adaptive Queue" : "Shared Queue"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBucketTable() {
  refs.bucketTable.innerHTML = `
    <div class="bucket-header">
      <span>Bucket</span>
      <span>Rate Band</span>
      <span>Default threshold</span>
      <span>Admit est. / min</span>
    </div>
    ${Object.entries(bucketThresholds)
      .map(([bucket, threshold]) => {
        const [minRate, maxRate] = bucketProfiles[bucket].rateRange;
        const passRate = passRateForThreshold(threshold);
        const admittedMin = minRate * passRate;
        const admittedMax = maxRate * passRate;

        const fmtRate = (v) => v % 1 === 0 ? v.toFixed(0) : v < 1 ? v.toFixed(2) : v.toFixed(1);
        const fmtAdmit = (v) => v < 0.01 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);

        return `
          <div class="bucket-row">
            <strong>${bucket}</strong>
            <span>${fmtRate(minRate)}-${fmtRate(maxRate)}</span>
            <span>${threshold}%</span>
            <span>${fmtAdmit(admittedMin)}-${fmtAdmit(admittedMax)}</span>
          </div>
        `;
      })
      .join("")}
  `;
}

function renderLaneTable() {
  refs.laneTable.innerHTML = `
    <div class="lane-header">
      <span>Post</span>
      <span>Profile</span>
      <span>Threshold</span>
      <span>LPM</span>
      <span>Admit est.</span>
    </div>
    ${uiState.laneConfigs
      .map((lane, index) => {
        const admitRate = lane.loadsPerMin * passRateForThreshold(lane.thresholdPct);
        return `
          <div class="lane-row">
            <input type="text" value="${lane.name}" data-action="lane-name" data-index="${index}" />
            <select data-action="lane-profile" data-index="${index}">
              ${["custom", ...Object.keys(bucketThresholds)]
                .map(
                  (bucket) =>
                    `<option value="${bucket}" ${bucket === lane.profileBucket ? "selected" : ""}>${resolveProfileLabel(bucket)}</option>`,
                )
                .join("")}
            </select>
            <input type="number" min="0" max="0.9999" step="0.0001" value="${formatThresholdRatio(lane.thresholdPct)}" data-action="lane-threshold" data-index="${index}" />
            <input type="number" min="0.01" max="999" step="0.1" value="${formatLoadsPerMin(lane.loadsPerMin, 4)}" data-action="lane-lpm" data-index="${index}" />
            <output>${admitRate.toFixed(2)}/m</output>
          </div>
        `;
      })
      .join("")}
  `;
}

function renderLabels() {
  const sim = selectedSim();
  refs.speedLabel.textContent = `${uiState.config.speed}x`;
  refs.safetyFactorLabel.textContent = `${uiState.config.dynamic.safetyFactor.toFixed(2)}`;
  refs.allocationGammaLabel.textContent = `${uiState.config.dynamic.allocationGamma.toFixed(2)}`;
  refs.maxShareLabel.textContent = `${(uiState.config.dynamic.maxLaneShare * 100).toFixed(0)}%`;
  refs.smoothingLabel.textContent = `${uiState.config.dynamic.smoothing.toFixed(2)}`;
}

function renderAll() {
  syncSimulationButton();
  renderLabels();
  renderMetricCards();
  renderBucketTable();
  renderLaneTable();
  renderLaneStage();
  renderQueueCards();
  renderAgentCards();
  renderDynamicInspector();
}

function bindRefs() {
  const ids = [
    "heroPosts",
    "heroAgents",
    "heroStale",
    "agentsInput",
    "handleTimeInput",
    "staleInput",
    "speedInput",
    "speedLabel",
    "safetyFactorInput",
    "safetyFactorLabel",
    "allocationGammaInput",
    "allocationGammaLabel",
    "maxShareInput",
    "maxShareLabel",
    "smoothingInput",
    "smoothingLabel",
    "modelSelector",
    "toggleSimButton",
    "resetButton",
    "balancedPresetButton",
    "surgePresetButton",
    "providedPresetButton",
    "bucketTable",
    "laneTable",
    "metricCards",
    "comparisonCards",
    "dynamicSummaryCards",
    "dynamicInspector",
    "queueChart",
    "captureChart",
    "queueTrendLabel",
    "captureTrendLabel",
    "laneStage",
    "queueDepth",
    "queueDelay",
    "queueCards",
    "agentCards",
  ];

  ids.forEach((id) => {
    refs[id] = document.getElementById(id);
  });
}

function syncInputs() {
  refs.agentsInput.value = String(uiState.config.agents);
  refs.handleTimeInput.value = String(uiState.config.handleTimeSec);
  refs.staleInput.value = String(uiState.config.staleWindowSec);
  refs.speedInput.value = String(uiState.config.speed);
  refs.safetyFactorInput.value = String(uiState.config.dynamic.safetyFactor);
  refs.allocationGammaInput.value = String(uiState.config.dynamic.allocationGamma);
  refs.maxShareInput.value = String(uiState.config.dynamic.maxLaneShare);
  refs.smoothingInput.value = String(uiState.config.dynamic.smoothing);
  refs.modelSelector.value = uiState.config.selectedModel;
}

function bindEvents() {
  refs.toggleSimButton.addEventListener("click", () => {
    uiState.running = !uiState.running;
    syncSimulationButton();
  });

  refs.resetButton.addEventListener("click", () => {
    resetSimulations();
  });

  refs.balancedPresetButton.addEventListener("click", () => {
    applyScenarioPreset("balanced");
  });

  refs.surgePresetButton.addEventListener("click", () => {
    applyScenarioPreset("surge");
  });

  refs.providedPresetButton.addEventListener("click", () => {
    applyScenarioPreset("provided");
  });

  refs.modelSelector.addEventListener("change", (event) => {
    uiState.config.selectedModel = event.target.value;
    renderAll();
  });

  refs.agentsInput.addEventListener("input", (event) => {
    uiState.config.agents = clamp(Number(event.target.value), 1, 20);
    resetSimulations();
  });

  refs.handleTimeInput.addEventListener("input", (event) => {
    uiState.config.handleTimeSec = clamp(Number(event.target.value), 10, 600);
    resetSimulations();
  });

  refs.staleInput.addEventListener("input", (event) => {
    uiState.config.staleWindowSec = clamp(Number(event.target.value), 5, 180);
    resetSimulations();
  });

  refs.speedInput.addEventListener("input", (event) => {
    uiState.config.speed = Number(event.target.value);
    renderLabels();
  });

  refs.safetyFactorInput.addEventListener("input", (event) => {
    uiState.config.dynamic.safetyFactor = Number(event.target.value);
    resetSimulations();
  });

  refs.allocationGammaInput.addEventListener("input", (event) => {
    uiState.config.dynamic.allocationGamma = Number(event.target.value);
    resetSimulations();
  });

  refs.maxShareInput.addEventListener("input", (event) => {
    uiState.config.dynamic.maxLaneShare = Number(event.target.value);
    resetSimulations();
  });

  refs.smoothingInput.addEventListener("input", (event) => {
    uiState.config.dynamic.smoothing = Number(event.target.value);
    resetSimulations();
  });

  refs.laneTable.addEventListener("input", (event) => {
    const action = event.target.dataset.action;
    const index = Number(event.target.dataset.index);
    const lane = uiState.laneConfigs[index];
    if (!lane) {
      return;
    }

    if (action === "lane-name") {
      lane.name = event.target.value || lane.name;
    }
    if (action === "lane-profile") {
      lane.profileBucket = event.target.value;
      if (bucketThresholds[lane.profileBucket]) {
        lane.loadsPerMin = representativeRate(lane.profileBucket);
        lane.thresholdPct = bucketThresholds[lane.profileBucket];
      }
    }
    if (action === "lane-threshold") {
      lane.thresholdPct = clamp(Number(event.target.value) * 100, 0, 99.99);
    }
    if (action === "lane-lpm") {
      lane.loadsPerMin = clamp(Number(event.target.value), 0.01, 999);
    }

    resetSimulations();
  });

  if (refs.comparisonCards) {
    refs.comparisonCards.addEventListener("click", (event) => {
      const card = event.target.closest("[data-model]");
      if (!card) {
        return;
      }
      uiState.config.selectedModel = card.dataset.model;
      refs.modelSelector.value = uiState.config.selectedModel;
      renderAll();
    });
  }
}

function loop(lastTimestamp) {
  function frame(now) {
    const realDelta = Math.min(0.05, (now - lastTimestamp) / 1000 || 0.016);
    lastTimestamp = now;

    if (uiState.running) {
      tickAll(realDelta * uiState.config.speed);
      renderAll();
    }

    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

function init() {
  bindRefs();
  applyPresetConfig(DEFAULT_PRESET);
  initializeLaneConfigs(DEFAULT_PRESET);
  syncInputs();
  bindEvents();
  resetSimulations();
  renderAll();
  loop(performance.now());
}

init();
