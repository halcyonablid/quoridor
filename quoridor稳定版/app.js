"use strict";

const BOARD_SIZE = 9;
const WALL_ANCHOR_SIZE = BOARD_SIZE - 1;
const MAX_WALLS = 10;
const FILES = "abcdefghi";
const WALL_FILES = "abcdefgh";
const STORAGE_KEY = "quoridor-local-arena-config-v1";
const KNOWLEDGE_PATHS = {
  skillManifest: "./skill/index.json",
  cardManifest: "./卡片经验积累/index.json"
};
const DEFAULT_KNOWLEDGE_LIBRARY = [
  {
    id: "qk-policy-value-search",
    title: "策略先验 + 价值评估 + 搜索",
    sourceKind: "skill",
    kind: "method",
    tags: ["policy", "value", "search"],
    triggers: [],
    effect_self_path_weight: 8,
    effect_opp_path_weight: 8,
    effect_center_bias: 2,
    effect_wall_resource_bias: 1,
    summary: "先看局面标签和经验卡，再比较高分候选；API 负责解释，规则引擎和搜索负责兜底。"
  },
  {
    id: "qk-opening-center-path",
    title: "开局优先最短路与中心控制",
    sourceKind: "card",
    kind: "tactical",
    tags: ["opening", "path-race", "center-control"],
    triggers: ["opening", "walls_many"],
    effect_self_path_weight: 20,
    effect_opp_path_weight: 8,
    effect_center_bias: 6,
    effect_wall_resource_bias: 2,
    summary: "开局先确保自己最短路稳定，并尽量保持中路附近；不要一上来就乱放墙。"
  },
  {
    id: "qk-behind-use-wall",
    title: "落后时优先用墙换路径差",
    sourceKind: "card",
    kind: "tactical",
    tags: ["behind", "wall-timing", "tempo"],
    triggers: ["self_behind", "walls_many"],
    effect_self_path_weight: 10,
    effect_opp_path_weight: 18,
    effect_center_bias: 2,
    effect_wall_resource_bias: 5,
    summary: "自己最短路落后且还有墙时，优先找能拉大路径差的墙位。"
  },
  {
    id: "qk-ahead-dont-overwall",
    title: "领先时减少无效墙并保持直冲",
    sourceKind: "card",
    kind: "tactical",
    tags: ["ahead", "finish-race", "wall-discipline"],
    triggers: ["self_ahead"],
    effect_self_path_weight: 18,
    effect_opp_path_weight: 6,
    effect_center_bias: 3,
    effect_wall_resource_bias: 1,
    summary: "领先时优先继续推进，不要为了看起来像在防守而浪费墙。"
  },
  {
    id: "qk-endgame-finish",
    title: "终盘接近目标线时优先冲线",
    sourceKind: "card",
    kind: "tactical",
    tags: ["endgame", "finish-race"],
    triggers: ["endgame", "near_goal"],
    effect_self_path_weight: 24,
    effect_opp_path_weight: 7,
    effect_center_bias: 1,
    effect_wall_resource_bias: 0,
    summary: "自己已经很接近目标线时，除非能立刻挡住对手冲线，否则优先缩短自己到线步数。"
  }
];

const els = {
  boardStage: document.getElementById("board-stage"),
  turnBanner: document.getElementById("turn-banner"),
  boardHint: document.getElementById("board-hint"),
  statusGrid: document.getElementById("status-grid"),
  latestExplanation: document.getElementById("latest-explanation"),
  summaryPanel: document.getElementById("summary-panel"),
  historyList: document.getElementById("history-list"),
  messageLog: document.getElementById("message-log"),
  moveModeBtn: document.getElementById("move-mode-btn"),
  wallModeBtn: document.getElementById("wall-mode-btn"),
  wallHBtn: document.getElementById("wall-h-btn"),
  wallVBtn: document.getElementById("wall-v-btn"),
  wallOrientationWrap: document.getElementById("wall-orientation-wrap"),
  newGameBtn: document.getElementById("new-game-btn"),
  requestAiBtn: document.getElementById("request-ai-btn"),
  summaryBtn: document.getElementById("summary-btn"),
  applyProviderBtn: document.getElementById("apply-provider-btn"),
  saveConfigBtn: document.getElementById("save-config-btn"),
  testApiBtn: document.getElementById("test-api-btn"),
  apiHealthPanel: document.getElementById("api-health-panel"),
  apiHealthBadge: document.getElementById("api-health-badge"),
  apiHealthText: document.getElementById("api-health-text"),
  knowledgeSource: document.getElementById("knowledge-source"),
  knowledgeStatus: document.getElementById("knowledge-status"),
  knowledgeList: document.getElementById("knowledge-list"),
  player1Type: document.getElementById("player1-type"),
  player2Type: document.getElementById("player2-type"),
  apiProvider: document.getElementById("api-provider"),
  mctsIterations: document.getElementById("mcts-iterations"),
  mctsExploration: document.getElementById("mcts-exploration"),
  apiEndpoint: document.getElementById("api-endpoint"),
  apiModel: document.getElementById("api-model"),
  apiKey: document.getElementById("api-key"),
  apiTemperature: document.getElementById("api-temperature"),
  apiRetries: document.getElementById("api-retries"),
  customHeaders: document.getElementById("custom-headers"),
  systemPrompt: document.getElementById("system-prompt"),
  autoSummary: document.getElementById("auto-summary")
};

const state = {
  config: loadConfig(),
  ui: {
    mode: "move",
    wallOrientation: "horizontal",
    pending: false,
    summaryPending: false
  },
  apiHealth: {
    status: "idle",
    text: "请在填好 API Endpoint / Model / Key 后点“测试 API 连通”。",
    checkedAt: ""
  },
  knowledge: {
    status: "idle",
    source: "未加载",
    text: "尚未加载棋类方法论与经验卡。",
    docs: [],
    matchedByPlayer: {
      P1: [],
      P2: []
    }
  },
  game: createInitialGame({
    P1: "human",
    P2: "human"
  }),
  logs: [],
  latestExplanation: null,
  summary: null
};

hydrateConfigForm();
applyProviderPreset(false);
applyConfigToPlayers();
bindEvents();
render();
void loadKnowledgeBase();
maybeRunAiTurn("init");

function createInitialGame(playerTypes) {
  return {
    currentPlayer: "P1",
    winner: "",
    turnNumber: 1,
    players: {
      P1: {
        id: "P1",
        label: "玩家 1",
        type: playerTypes.P1 || "human",
        row: BOARD_SIZE - 1,
        col: 4,
        goalRow: 0,
        wallsRemaining: MAX_WALLS
      },
      P2: {
        id: "P2",
        label: "玩家 2",
        type: playerTypes.P2 || "human",
        row: 0,
        col: 4,
        goalRow: BOARD_SIZE - 1,
        wallsRemaining: MAX_WALLS
      }
    },
    walls: [],
    history: []
  };
}

function loadConfig() {
  const fallback = {
    apiProvider: "custom-openai",
    apiEndpoint: "",
    apiModel: "",
    apiKey: "",
    apiTemperature: "0.3",
    apiRetries: "3",
    mctsIterations: "240",
    mctsExploration: "1.4",
    minimaxDepth: "",
    customHeaders: "",
    systemPrompt: "",
    autoSummary: true,
    player1Type: "human",
    player2Type: "human"
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    return {
      ...fallback,
      ...saved
    };
  } catch (error) {
    return fallback;
  }
}

function saveConfig() {
  state.config = {
    apiProvider: els.apiProvider.value,
    apiEndpoint: els.apiEndpoint.value.trim(),
    apiModel: els.apiModel.value.trim(),
    apiKey: els.apiKey.value.trim(),
    apiTemperature: els.apiTemperature.value.trim() || "0.3",
    apiRetries: els.apiRetries.value.trim() || "3",
    mctsIterations: els.mctsIterations.value.trim() || "240",
    mctsExploration: els.mctsExploration.value.trim() || "1.4",
    minimaxDepth: state.config.minimaxDepth || "",
    customHeaders: els.customHeaders.value.trim(),
    systemPrompt: els.systemPrompt.value.trim(),
    autoSummary: !!els.autoSummary.checked,
    player1Type: els.player1Type.value,
    player2Type: els.player2Type.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  applyConfigToPlayers();
  pushLog("success", "配置已保存，本局后续 AI 请求会使用新配置。");
}

function hydrateConfigForm() {
  els.apiProvider.value = state.config.apiProvider || "custom-openai";
  els.apiEndpoint.value = state.config.apiEndpoint || "";
  els.apiModel.value = state.config.apiModel || "";
  els.apiKey.value = state.config.apiKey || "";
  els.apiTemperature.value = state.config.apiTemperature || "0.3";
  els.apiRetries.value = state.config.apiRetries || "3";
  els.mctsIterations.value = state.config.mctsIterations || mapLegacyDepthToIterations(state.config.minimaxDepth || "2");
  els.mctsExploration.value = state.config.mctsExploration || "1.4";
  els.customHeaders.value = state.config.customHeaders || "";
  els.systemPrompt.value = state.config.systemPrompt || "";
  els.autoSummary.checked = !!state.config.autoSummary;
  els.player1Type.value = state.config.player1Type || "human";
  els.player2Type.value = state.config.player2Type || "human";
}

function applyConfigToPlayers() {
  state.game.players.P1.type = els.player1Type.value;
  state.game.players.P2.type = els.player2Type.value;
}

async function loadKnowledgeBase() {
  state.knowledge.status = "loading";
  state.knowledge.source = "加载中";
  state.knowledge.text = "正在读取 quoridor/skill 与 quoridor/卡片经验积累 ...";
  renderKnowledgePanel();
  try {
    const docs = await loadKnowledgeLibraryFromFiles();
    if (!docs.length) throw new Error("未读取到任何经验文档");
    state.knowledge = {
      status: "ready",
      source: "文件夹实时加载",
      text: `已加载 ${docs.length} 条方法论/经验卡，当前行动方会自动匹配适用条目。`,
      docs,
      matchedByPlayer: { P1: [], P2: [] }
    };
    pushLog("success", `Second Brain 已加载 ${docs.length} 条方法论/经验卡。`);
  } catch (error) {
    const fallbackDocs = DEFAULT_KNOWLEDGE_LIBRARY.map((doc) => ({ ...doc }));
    state.knowledge = {
      status: "fallback",
      source: "内置快照",
      text: `未能直接读取本地文件，已回退到内置方法论快照。若要实时读取文件夹，请用本地静态服务器打开此页。`,
      docs: fallbackDocs,
      matchedByPlayer: { P1: [], P2: [] }
    };
    pushLog("warn", `Second Brain 文件夹读取失败，已回退到内置快照：${error.message}`);
  }
  renderKnowledgePanel();
}

async function loadKnowledgeLibraryFromFiles() {
  const docs = [];
  const skillFiles = await loadKnowledgeManifest(KNOWLEDGE_PATHS.skillManifest);
  for (const file of skillFiles) {
    const doc = await loadKnowledgeDoc(`./skill/${file}`, "skill");
    if (doc) docs.push(doc);
  }
  const cardFiles = await loadKnowledgeManifest(KNOWLEDGE_PATHS.cardManifest);
  for (const file of cardFiles) {
    const doc = await loadKnowledgeDoc(`./卡片经验积累/${file}`, "card");
    if (doc) docs.push(doc);
  }
  return docs;
}

async function loadKnowledgeManifest(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`无法读取 ${path}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.files)) return [];
  return data.files.filter((item) => typeof item === "string" && item.trim());
}

async function loadKnowledgeDoc(path, sourceKind) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`无法读取 ${path}`);
  }
  const text = await response.text();
  const parsed = parseFrontmatterAndBody(text);
  return {
    id: parsed.frontmatter.id || path,
    title: parsed.frontmatter.title || parsed.frontmatter.name || path.split("/").pop() || "未命名文档",
    sourceKind,
    kind: String(parsed.frontmatter.kind || sourceKind || "note"),
    tags: ensureStringArray(parsed.frontmatter.tags),
    triggers: ensureStringArray(parsed.frontmatter.triggers),
    effect_self_path_weight: Number(parsed.frontmatter.effect_self_path_weight || 0),
    effect_opp_path_weight: Number(parsed.frontmatter.effect_opp_path_weight || 0),
    effect_center_bias: Number(parsed.frontmatter.effect_center_bias || 0),
    effect_wall_resource_bias: Number(parsed.frontmatter.effect_wall_resource_bias || 0),
    summary: String(parsed.frontmatter.summary || parsed.frontmatter.description || parsed.body.split(/\n+/).find(Boolean) || "").trim(),
    body: parsed.body
  };
}

function parseFrontmatterAndBody(markdown) {
  const text = String(markdown || "");
  if (!text.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: text.trim()
    };
  }
  const endMarker = text.indexOf("\n---", 4);
  if (endMarker < 0) {
    return {
      frontmatter: {},
      body: text.trim()
    };
  }
  const rawFrontmatter = text.slice(4, endMarker).trim();
  const body = text.slice(endMarker + 4).trim();
  const frontmatter = {};
  rawFrontmatter.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    frontmatter[key] = parseFrontmatterValue(rawValue);
  });
  return { frontmatter, body };
}

function parseFrontmatterValue(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (text.startsWith("[") && text.endsWith("]")) {
    return text.slice(1, -1).split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text.replace(/^['"]|['"]$/g, "");
}

function ensureStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function deriveStrategicStateTags(game, playerId) {
  const selfDist = getShortestPathLength(game, playerId);
  const oppId = getOpponentId(playerId);
  const oppDist = getShortestPathLength(game, oppId);
  const player = game.players[playerId];
  const totalTurns = game.history.length;
  const tags = new Set();
  if (totalTurns <= 8) tags.add("opening");
  if (totalTurns > 8 && totalTurns <= 22) tags.add("midgame");
  if (totalTurns > 22 || selfDist <= 3 || oppDist <= 3) tags.add("endgame");
  if (selfDist <= 3) tags.add("near_goal");
  if (oppDist <= 3) tags.add("opponent_near_goal");
  if (selfDist + 1 < oppDist) tags.add("self_ahead");
  if (selfDist > oppDist + 1) tags.add("self_behind");
  if (player.wallsRemaining >= 6) tags.add("walls_many");
  if (player.wallsRemaining <= 3) tags.add("walls_low");
  if (Math.abs(player.col - 4) <= 1) tags.add("center_stable");
  return Array.from(tags);
}

function getMatchedKnowledgeDocs(game, playerId, limit = 6) {
  const docs = Array.isArray(state.knowledge?.docs) ? state.knowledge.docs : [];
  if (!docs.length || !game?.players?.[playerId]) return [];
  const tags = new Set(deriveStrategicStateTags(game, playerId));
  return docs
    .filter((doc) => {
      const triggers = ensureStringArray(doc.triggers);
      return triggers.every((trigger) => tags.has(trigger));
    })
    .sort((a, b) => {
      const aScore = ensureStringArray(a.triggers).length + (a.sourceKind === "skill" ? 0.2 : 0);
      const bScore = ensureStringArray(b.triggers).length + (b.sourceKind === "skill" ? 0.2 : 0);
      return bScore - aScore;
    })
    .slice(0, limit);
}

function buildSecondBrainProfile(game, playerId) {
  const activeDocs = getMatchedKnowledgeDocs(game, playerId, 6);
  const totals = activeDocs.reduce((acc, doc) => {
    acc.selfPath += Number(doc.effect_self_path_weight || 0);
    acc.oppPath += Number(doc.effect_opp_path_weight || 0);
    acc.center += Number(doc.effect_center_bias || 0);
    acc.wallResource += Number(doc.effect_wall_resource_bias || 0);
    return acc;
  }, {
    selfPath: 0,
    oppPath: 0,
    center: 0,
    wallResource: 0
  });
  return {
    tags: deriveStrategicStateTags(game, playerId),
    activeDocs,
    weights: {
      selfPathWeight: 100 + totals.selfPath,
      oppPathWeight: 100 + totals.oppPath,
      centerWeight: 1.5 + totals.center * 0.15,
      wallResourceWeight: 4 + totals.wallResource * 0.5,
      mobilityWeight: 2
    }
  };
}

function bindEvents() {
  els.moveModeBtn.addEventListener("click", () => {
    state.ui.mode = "move";
    render();
  });
  els.wallModeBtn.addEventListener("click", () => {
    state.ui.mode = "wall";
    render();
  });
  els.wallHBtn.addEventListener("click", () => {
    state.ui.wallOrientation = "horizontal";
    render();
  });
  els.wallVBtn.addEventListener("click", () => {
    state.ui.wallOrientation = "vertical";
    render();
  });
  els.newGameBtn.addEventListener("click", () => {
    saveConfig();
    state.game = createInitialGame({
      P1: els.player1Type.value,
      P2: els.player2Type.value
    });
    state.latestExplanation = null;
    state.summary = null;
    state.ui.mode = "move";
    pushLog("info", "已新开一局。");
    render();
    maybeRunAiTurn("new-game");
  });
  els.requestAiBtn.addEventListener("click", async () => {
    await runAiTurn({ force: true });
  });
  els.summaryBtn.addEventListener("click", async () => {
    await generateTeachingSummary(false);
  });
  els.applyProviderBtn.addEventListener("click", () => {
    applyProviderPreset(true);
    saveConfig();
    render();
  });
  els.saveConfigBtn.addEventListener("click", () => {
    saveConfig();
    render();
  });
  els.testApiBtn.addEventListener("click", async () => {
    await testApiConnectivity();
  });
  els.apiProvider.addEventListener("change", () => {
    applyProviderPreset(false);
    saveConfig();
    render();
  });
  els.player1Type.addEventListener("change", () => {
    state.game.players.P1.type = els.player1Type.value;
    saveConfig();
    render();
    maybeRunAiTurn("player-type-change");
  });
  els.player2Type.addEventListener("change", () => {
    state.game.players.P2.type = els.player2Type.value;
    saveConfig();
    render();
    maybeRunAiTurn("player-type-change");
  });
}

function render() {
  renderBoard();
  renderTurnBanner();
  renderStatus();
  renderHistory();
  renderExplanation();
  renderSummary();
  renderLogs();
  renderApiHealth();
  renderKnowledgePanel();
  renderControls();
}

function renderControls() {
  els.moveModeBtn.classList.toggle("active", state.ui.mode === "move");
  els.wallModeBtn.classList.toggle("active", state.ui.mode === "wall");
  els.wallHBtn.classList.toggle("active", state.ui.wallOrientation === "horizontal");
  els.wallVBtn.classList.toggle("active", state.ui.wallOrientation === "vertical");
  els.wallOrientationWrap.style.opacity = state.ui.mode === "wall" ? "1" : "0.5";
  const currentPlayer = getCurrentPlayer();
  const currentType = currentPlayer.type;
  const canTriggerCurrentAi = currentType === "minimax" ? true : (currentType === "hybrid" ? canUseApiAi() : canUseApiAi());
  els.requestAiBtn.disabled = state.ui.pending || state.ui.summaryPending || (state.game.winner ? true : !canTriggerCurrentAi);
  if (state.game.winner) {
    els.requestAiBtn.textContent = "对局已结束";
  } else if (state.ui.pending) {
    els.requestAiBtn.textContent = "AI 思考中...";
  } else if (currentType === "minimax") {
    els.requestAiBtn.textContent = `执行 ${currentPlayer.label} 的本地搜索 AI`;
  } else if (currentType === "hybrid") {
    els.requestAiBtn.textContent = `执行 ${currentPlayer.label} 的本地搜索 + API 解说`;
  } else if (currentType === "api") {
    els.requestAiBtn.textContent = `请求 ${currentPlayer.label} 的 API AI`;
  } else {
    els.requestAiBtn.textContent = `为 ${currentPlayer.label} 请求 API 走子`;
  }
  els.summaryBtn.disabled = state.ui.pending || state.ui.summaryPending || !canUseApiAi();
  els.summaryBtn.textContent = state.ui.summaryPending ? "总结生成中..." : "生成教学总结";
}

function renderTurnBanner() {
  const currentPlayer = getCurrentPlayer();
  if (state.game.winner) {
    els.turnBanner.textContent = `${getPlayerLabel(state.game.winner)} 已达成胜利条件。`;
    return;
  }
  els.turnBanner.textContent = `${currentPlayer.label} 回合 · ${getPlayerTypeLabel(currentPlayer.type)} · 剩余墙数 ${currentPlayer.wallsRemaining}`;
}

function renderStatus() {
  const shortestP1 = getShortestPathLength(state.game, "P1");
  const shortestP2 = getShortestPathLength(state.game, "P2");
  const currentPlayer = getCurrentPlayer();
  const cards = [
    {
      title: "当前行动方",
      lines: [
        `${currentPlayer.label} / ${getPlayerTypeLabel(currentPlayer.type)}`,
        state.game.winner ? `胜者: ${getPlayerLabel(state.game.winner)}` : `回合数: ${state.game.turnNumber}`
      ]
    },
    {
      title: "路径估计",
      lines: [
        `P1 最短路: ${shortestP1 === Infinity ? "无路" : shortestP1 + " 步"}`,
        `P2 最短路: ${shortestP2 === Infinity ? "无路" : shortestP2 + " 步"}`
      ]
    },
    {
      title: "玩家 1",
      lines: [
        `位置: ${cellToNotation(state.game.players.P1.row, state.game.players.P1.col)}`,
        `剩余墙数: ${state.game.players.P1.wallsRemaining}`
      ]
    },
    {
      title: "玩家 2",
      lines: [
        `位置: ${cellToNotation(state.game.players.P2.row, state.game.players.P2.col)}`,
        `剩余墙数: ${state.game.players.P2.wallsRemaining}`
      ]
    }
  ];
  els.statusGrid.innerHTML = cards.map((card) => `
    <div class="status-card">
      <h3>${escapeHtml(card.title)}</h3>
      <div>${card.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
    </div>
  `).join("");
}

function renderBoard() {
  els.boardStage.innerHTML = "";
  const humanTurn = !state.game.winner && getCurrentPlayer().type === "human" && !state.ui.pending;
  const legalMoves = state.ui.mode === "move" ? getLegalPawnMoves(state.game, state.game.currentPlayer) : [];
  const moveSet = new Set(legalMoves.map((move) => `${move.row},${move.col}`));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = document.createElement("button");
      const player = getPlayerAt(state.game, row, col);
      cell.className = `board-cell ${moveSet.has(`${row},${col}`) && humanTurn ? "legal" : ""} ${row === 0 ? "goal-p1" : ""} ${row === BOARD_SIZE - 1 ? "goal-p2" : ""}`;
      positionRect(cell, {
        top: row * (cellSize() + gapSize()),
        left: col * (cellSize() + gapSize()),
        width: cellSize(),
        height: cellSize()
      });
      cell.setAttribute("title", cellToNotation(row, col));
      cell.dataset.coord = cellToNotation(row, col);
      const coord = document.createElement("span");
      coord.className = "cell-coord";
      coord.textContent = cellToNotation(row, col);
      cell.appendChild(coord);
      if (player) {
        const pawn = document.createElement("div");
        pawn.className = `pawn ${player.id.toLowerCase()}`;
        cell.appendChild(pawn);
      }
      if (humanTurn && state.ui.mode === "move" && moveSet.has(`${row},${col}`)) {
        cell.addEventListener("click", () => {
          handleHumanAction({
            type: "move",
            to: cellToNotation(row, col)
          });
        });
      }
      els.boardStage.appendChild(cell);
    }
  }

  state.game.walls.forEach((wall) => {
    const wallEl = document.createElement("div");
    wallEl.className = `wall-piece ${wall.orientation}`;
    positionRect(wallEl, wallAnchorToRect(wall));
    wallEl.setAttribute("title", `${wall.orientation === "horizontal" ? "横墙" : "竖墙"} ${wallAnchorToNotation(wall.r, wall.c)}`);
    els.boardStage.appendChild(wallEl);
  });

  if (humanTurn && state.ui.mode === "wall" && getCurrentPlayer().wallsRemaining > 0) {
    renderWallAnchors();
  }

  if (state.game.winner) {
    els.boardHint.textContent = `${getPlayerLabel(state.game.winner)} 获胜。你可以复盘、生成教学总结，或者新开一局。`;
  } else if (state.ui.pending) {
    els.boardHint.textContent = "AI 正在思考，规则引擎会在执行前验证它的动作是否合法。";
  } else if (state.ui.mode === "move") {
    els.boardHint.textContent = "点击高亮格子走子。若对手正挡在前方，规则引擎会自动处理跳子/斜跳规则。";
  } else {
    els.boardHint.textContent = `当前为放墙模式，方向：${state.ui.wallOrientation === "horizontal" ? "横墙" : "竖墙"}。点击高亮墙位即可落墙。`;
  }
}

function renderWallAnchors() {
  const orientation = state.ui.wallOrientation;
  for (let row = 0; row < WALL_ANCHOR_SIZE; row += 1) {
    for (let col = 0; col < WALL_ANCHOR_SIZE; col += 1) {
      const wall = { orientation, r: row, c: col };
      const validation = validateWallPlacement(state.game, state.game.currentPlayer, wall);
      const anchor = document.createElement("button");
      anchor.className = `wall-anchor ${validation.ok ? "legal" : "illegal"}`;
      positionRect(anchor, wallAnchorToRect(wall));
      anchor.setAttribute("title", `${orientation === "horizontal" ? "横墙" : "竖墙"} ${wallAnchorToNotation(row, col)}${validation.ok ? "" : ` · ${validation.reason}`}`);
      anchor.addEventListener("click", () => {
        handleHumanAction({
          type: "wall",
          orientation,
          at: wallAnchorToNotation(row, col)
        });
      });
      els.boardStage.appendChild(anchor);
    }
  }
}

function renderHistory() {
  const history = state.game.history;
  if (history.length === 0) {
    els.historyList.className = "history-list empty";
    els.historyList.textContent = "还没有行动记录。";
    return;
  }
  els.historyList.className = "history-list";
  els.historyList.innerHTML = "";
  history.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const chips = [];
    if (entry.actorType === "api") chips.push("API AI");
    if (entry.actorType === "minimax") chips.push("本地搜索 AI");
    if (entry.actorType === "hybrid") chips.push("本地搜索 + API 解说");
    if (entry.action.type === "wall") chips.push(entry.action.orientation === "horizontal" ? "横墙" : "竖墙");
    item.innerHTML = `
      <strong>第 ${entry.turn} 手 · ${escapeHtml(entry.playerLabel)} · ${escapeHtml(entry.actionLabel)}</strong>
      <div class="history-meta">${escapeHtml(entry.timestampLabel)}</div>
      ${entry.reason ? `<div style="margin-top:8px;">${escapeHtml(entry.reason)}</div>` : ""}
      ${chips.length ? `<div class="chip-row">${chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
    `;
    els.historyList.appendChild(item);
  });
}

function renderExplanation() {
  const info = state.latestExplanation;
  if (!info) {
    els.latestExplanation.className = "explanation-panel empty";
    els.latestExplanation.textContent = "暂无解释。AI 下出一步后，这里会展示原因、教学提示和回合摘要。";
    return;
  }
  els.latestExplanation.className = "explanation-panel";
  els.latestExplanation.innerHTML = `
    <div class="explanation-block">
      <strong>${escapeHtml(info.title)}</strong>
      <div><strong>原因</strong>${wrapParagraphs(info.reason || "未提供")}</div>
      <div style="margin-top:10px;"><strong>教学提示</strong>${wrapParagraphs(info.teaching || "未提供")}</div>
      <div style="margin-top:10px;"><strong>本手摘要</strong>${wrapParagraphs(info.summary || "未提供")}</div>
    </div>
  `;
}

function renderSummary() {
  if (!state.summary) {
    els.summaryPanel.className = "summary-panel empty";
    els.summaryPanel.textContent = "对局结束后可自动或手动生成总结。";
    return;
  }
  els.summaryPanel.className = "summary-panel";
  const turningPoints = Array.isArray(state.summary.turningPoints) ? state.summary.turningPoints : [];
  const lessons = Array.isArray(state.summary.lessons) ? state.summary.lessons : [];
  const blocks = [];
  blocks.push(`
    <div class="summary-block">
      <strong>整体总结</strong>
      ${wrapParagraphs(state.summary.overview || "未提供")}
    </div>
  `);
  if (turningPoints.length > 0) {
    blocks.push(`
      <div class="summary-block">
        <strong>关键转折</strong>
        <ol>${turningPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>
    `);
  }
  if (lessons.length > 0) {
    blocks.push(`
      <div class="summary-block">
        <strong>训练建议</strong>
        <ol>${lessons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>
    `);
  }
  if (state.summary.nextPractice) {
    blocks.push(`
      <div class="summary-block">
        <strong>下一步练习重点</strong>
        ${wrapParagraphs(state.summary.nextPractice)}
      </div>
    `);
  }
  els.summaryPanel.innerHTML = blocks.join("");
}

function renderLogs() {
  if (state.logs.length === 0) {
    els.messageLog.innerHTML = `<div class="log-item info">系统准备就绪。</div>`;
    return;
  }
  els.messageLog.innerHTML = "";
  state.logs.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = `log-item ${entry.level}`;
    item.innerHTML = `
      <div>${escapeHtml(entry.message)}</div>
      <div class="log-meta">${escapeHtml(entry.time)}</div>
    `;
    els.messageLog.appendChild(item);
  });
}

function renderApiHealth() {
  const status = state.apiHealth?.status || "idle";
  const checkedAt = state.apiHealth?.checkedAt || "";
  const text = state.apiHealth?.text || "";
  els.apiHealthPanel.className = `api-health-panel ${status}`;
  els.apiHealthBadge.textContent = status === "testing"
    ? "检测中"
    : status === "success"
      ? "联通正常"
      : status === "error"
        ? "联通失败"
        : "未测试";
  els.apiHealthText.textContent = checkedAt ? `${text}\n最后检测: ${checkedAt}` : text;
}

function renderKnowledgePanel() {
  const knowledge = state.knowledge || {};
  const currentPlayerId = state.game?.currentPlayer || "P1";
  const matched = getMatchedKnowledgeDocs(state.game, currentPlayerId);
  knowledge.matchedByPlayer[currentPlayerId] = matched;
  els.knowledgeSource.textContent = knowledge.source || "未加载";
  els.knowledgeStatus.textContent = knowledge.text || "尚未加载棋类方法论与经验卡。";
  if (!matched.length) {
    els.knowledgeList.className = "knowledge-list empty";
    els.knowledgeList.textContent = "当前局面还没有命中的 skill / 经验卡。";
    return;
  }
  els.knowledgeList.className = "knowledge-list";
  els.knowledgeList.innerHTML = matched.map((doc) => `
    <div class="knowledge-card">
      <div class="knowledge-card-head">
        <strong>${escapeHtml(doc.title)}</strong>
        <span class="knowledge-kind">${escapeHtml(doc.sourceKind === "skill" ? "方法论" : "经验卡")}</span>
      </div>
      <p>${escapeHtml(doc.summary || "无摘要")}</p>
    </div>
  `).join("");
}

function handleHumanAction(action) {
  if (state.ui.pending || state.game.winner) return;
  const currentPlayer = getCurrentPlayer();
  if (currentPlayer.type !== "human") {
    pushLog("warn", "当前回合由 AI 控制。");
    return;
  }
  const validation = validateAction(state.game, state.game.currentPlayer, action);
  if (!validation.ok) {
    pushLog("warn", validation.reason);
    render();
    return;
  }
  applyTurn(action, {
    actorType: "human",
    reason: "手动操作",
    teaching: "这一步由真人玩家执行。",
    summary: "已记录本手。"
  });
}

function applyTurn(action, explanation) {
  const beforePlayerId = state.game.currentPlayer;
  const nextGame = cloneGame(state.game);
  const applied = mutateGameByAction(nextGame, beforePlayerId, action);
  if (!applied.ok) {
    pushLog("error", applied.reason || "动作执行失败");
    return;
  }
  const winner = detectWinner(nextGame);
  if (winner) nextGame.winner = winner;
  else nextGame.currentPlayer = beforePlayerId === "P1" ? "P2" : "P1";
  nextGame.turnNumber = nextGame.history.length + 1;

  const entry = {
    turn: nextGame.history.length + 1,
    playerId: beforePlayerId,
    playerLabel: getPlayerLabel(beforePlayerId),
    actorType: explanation.actorType || "human",
    action,
    actionLabel: actionToLabel(action),
    reason: explanation.reason || "",
    teaching: explanation.teaching || "",
    summary: explanation.summary || "",
    timestampLabel: new Date().toLocaleString("zh-CN")
  };
  nextGame.history.push(entry);

  state.game = nextGame;
  state.latestExplanation = {
    title: `${entry.playerLabel} · ${entry.actionLabel}`,
    reason: explanation.reason || "",
    teaching: explanation.teaching || "",
    summary: explanation.summary || ""
  };

  if (state.ui.mode === "wall" && !state.game.winner) {
    state.ui.mode = "move";
  }

  pushLog("success", `${entry.playerLabel} 执行了 ${entry.actionLabel}`);
  render();

  if (state.game.winner) {
    pushLog("success", `${getPlayerLabel(state.game.winner)} 获胜。`);
    if (canUseApiAi() && state.config.autoSummary) {
      void generateTeachingSummary(true);
    }
    return;
  }

  maybeRunAiTurn("after-turn");
}

function maybeRunAiTurn(reason) {
  if (state.ui.pending || state.game.winner) return;
  const currentPlayer = getCurrentPlayer();
  if (currentPlayer.type === "human") return;
  window.setTimeout(() => {
    void runAiTurn({ force: false, reason });
  }, 260);
}

async function runAiTurn(options = {}) {
  if (state.ui.pending || state.game.winner) return;
  const currentPlayer = getCurrentPlayer();
  const strategy = resolveTurnAiStrategy(currentPlayer.type, options.force);
  if (!strategy) return;
  if ((strategy === "api" || strategy === "hybrid") && !canUseApiAi()) {
    pushLog("error", `${strategy === "hybrid" ? "API 解说" : "API AI"} 配置不完整，请先填写 Endpoint 和 Model。`);
    return;
  }

  state.ui.pending = true;
  render();
  pushLog("info", `${currentPlayer.label} 开始${strategy === "minimax" ? "进行本地搜索" : strategy === "hybrid" ? "进行本地搜索并请求 API 解说" : "请求 API AI"}...`);

  try {
    let decision;
    if (strategy === "minimax") {
      decision = await requestMinimaxDecision(cloneGame(state.game), currentPlayer.id);
    } else if (strategy === "hybrid") {
      const localDecision = await requestMinimaxDecision(cloneGame(state.game), currentPlayer.id);
      let commentary = localDecision;
      try {
        commentary = await requestAiCommentaryForChosenAction(cloneGame(state.game), currentPlayer.id, localDecision.action, localDecision);
      } catch (error) {
        pushLog("warn", `API 解说失败，已回退到本地解释：${error.message}`);
      }
      decision = {
        action: localDecision.action,
        reason: commentary.reason,
        teaching: commentary.teaching,
        summary: commentary.summary
      };
    } else {
      decision = await requestAiActionDecision(cloneGame(state.game), currentPlayer.id);
    }
    if (!decision || !decision.action) {
      pushLog("error", "AI 没有返回可执行动作。");
      return;
    }
    const validation = validateAction(state.game, currentPlayer.id, decision.action);
    if (!validation.ok) {
      pushLog("error", `AI 最终返回了非法动作：${validation.reason}`);
      return;
    }
    applyTurn(decision.action, {
      actorType: strategy,
      reason: decision.reason,
      teaching: decision.teaching,
      summary: decision.summary
    });
  } catch (error) {
    pushLog("error", `AI 请求失败：${error.message}`);
  } finally {
    state.ui.pending = false;
    render();
    maybeRunAiTurn("ai-chain");
  }
}

async function testApiConnectivity() {
  saveConfig();
  if (!canUseApiAi()) {
    state.apiHealth = {
      status: "error",
      text: "缺少必要配置：请至少填写 API Endpoint 和 Model。",
      checkedAt: new Date().toLocaleString("zh-CN")
    };
    pushLog("warn", "请先填写 Endpoint 和 Model。");
    render();
    return;
  }
  state.ui.pending = true;
  state.apiHealth = {
    status: "testing",
    text: `正在检测 ${getApiProviderLabel(state.config.apiProvider)} 接口...`,
    checkedAt: new Date().toLocaleString("zh-CN")
  };
  render();
  try {
    const result = await requestAiJson({
      messages: [
        {
          role: "system",
          content: "You are a connectivity checker. Return only JSON."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "ping",
            instruction: "Return JSON {\"status\":\"ok\",\"message\":\"...\",\"provider\":\"...\"}"
          })
        }
      ]
    });
    const statusText = String(result?.json?.status || "").trim().toLowerCase();
    if (statusText !== "ok") {
      throw new Error(`接口已响应，但未返回预期状态: ${result.rawText.slice(0, 180)}`);
    }
    const providerText = String(result?.json?.provider || "").trim();
    const messageText = String(result?.json?.message || "").trim() || result.rawText.slice(0, 180);
    state.apiHealth = {
      status: "success",
      text: `接口响应正常${providerText ? ` · provider: ${providerText}` : ""}\n摘要: ${messageText}`,
      checkedAt: new Date().toLocaleString("zh-CN")
    };
    pushLog("success", `API 测试成功：${messageText.slice(0, 120)}`);
  } catch (error) {
    state.apiHealth = {
      status: "error",
      text: `接口测试失败：${error.message}`,
      checkedAt: new Date().toLocaleString("zh-CN")
    };
    pushLog("error", `API 测试失败：${error.message}`);
  } finally {
    state.ui.pending = false;
    render();
  }
}

async function generateTeachingSummary(autoTriggered) {
  if (state.ui.summaryPending) return;
  if (!canUseApiAi()) {
    pushLog("warn", "未配置 AI API，无法生成总结。");
    return;
  }
  state.ui.summaryPending = true;
  render();
  try {
    const summary = await requestAiSummary(cloneGame(state.game));
    state.summary = summary;
    pushLog("success", autoTriggered ? "已自动生成教学总结。" : "已生成教学总结。");
  } catch (error) {
    pushLog("error", `生成总结失败：${error.message}`);
  } finally {
    state.ui.summaryPending = false;
    render();
  }
}

function canUseApiAi() {
  const endpoint = els.apiEndpoint.value.trim();
  const model = els.apiModel.value.trim();
  return !!endpoint && !!model;
}

function getApiProviderLabel(provider) {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "minimax-api") return "MiniMax API";
  return "自定义 OpenAI 兼容";
}

function getPlayerTypeLabel(type) {
  if (type === "minimax") return "本地搜索 AI";
  if (type === "hybrid") return "本地搜索 + API 解说";
  if (type === "api") return "API AI";
  return "Human";
}

function resolveTurnAiStrategy(currentType, force) {
  if (currentType === "minimax" || currentType === "api" || currentType === "hybrid") return currentType;
  if (force) return canUseApiAi() ? "api" : "";
  return "";
}

function applyProviderPreset(forceModel = false) {
  const provider = els.apiProvider.value;
  if (provider === "deepseek") {
    if (!els.apiEndpoint.value.trim() || forceModel || /deepseek|openai/i.test(els.apiEndpoint.value.trim())) {
      els.apiEndpoint.value = "https://api.deepseek.com/chat/completions";
    }
    if (!els.apiModel.value.trim() || forceModel || /deepseek|gpt/i.test(els.apiModel.value.trim())) {
      els.apiModel.value = "deepseek-chat";
    }
    if (!els.systemPrompt.value.trim()) {
      els.systemPrompt.value = "请用中文回答，并保持教学解释清晰、简洁。";
    }
    return;
  }
  if (provider === "minimax-api") {
    if (!els.apiEndpoint.value.trim() || forceModel || /deepseek|minimax|minimaxi|openai/i.test(els.apiEndpoint.value.trim())) {
      els.apiEndpoint.value = "https://api.minimax.io/v1/chat/completions";
    }
    if (!els.apiModel.value.trim() || forceModel || /deepseek|minimax|gpt/i.test(els.apiModel.value.trim())) {
      els.apiModel.value = "MiniMax-M2.5";
    }
    if (!els.apiTemperature.value.trim() || forceModel) {
      els.apiTemperature.value = "1";
    }
    if (!els.systemPrompt.value.trim()) {
      els.systemPrompt.value = "请用中文回答，并保持教学解释清晰、简洁。";
    }
  }
}

function getCurrentPlayer() {
  return state.game.players[state.game.currentPlayer];
}

function getPlayerLabel(playerId) {
  const player = state.game.players[playerId];
  return player ? player.label : playerId;
}

function getPlayerAt(game, row, col) {
  return Object.values(game.players).find((player) => player.row === row && player.col === col) || null;
}

function getOpponentId(playerId) {
  return playerId === "P1" ? "P2" : "P1";
}

function cloneGame(game) {
  return JSON.parse(JSON.stringify(game));
}

function mutateGameByAction(game, playerId, action) {
  const player = game.players[playerId];
  if (!player) return { ok: false, reason: "无效玩家" };
  if (action.type === "move") {
    const target = notationToCell(action.to);
    if (!target) return { ok: false, reason: "无效坐标" };
    player.row = target.row;
    player.col = target.col;
    return { ok: true };
  }
  if (action.type === "wall") {
    const anchor = notationToWallAnchor(action.at);
    if (!anchor) return { ok: false, reason: "无效墙坐标" };
    game.walls.push({
      orientation: normalizeOrientation(action.orientation),
      r: anchor.row,
      c: anchor.col
    });
    player.wallsRemaining -= 1;
    return { ok: true };
  }
  return { ok: false, reason: "未知动作类型" };
}

function detectWinner(game) {
  if (game.players.P1.row === game.players.P1.goalRow) return "P1";
  if (game.players.P2.row === game.players.P2.goalRow) return "P2";
  return "";
}

function validateAction(game, playerId, action) {
  if (game.winner) return { ok: false, reason: "对局已经结束" };
  if (game.currentPlayer !== playerId) return { ok: false, reason: "还没轮到该玩家行动" };
  if (!action || typeof action !== "object") return { ok: false, reason: "动作格式无效" };

  if (action.type === "move") {
    const target = notationToCell(action.to);
    if (!target) return { ok: false, reason: "移动坐标不合法" };
    const legalMoves = getLegalPawnMoves(game, playerId);
    const ok = legalMoves.some((move) => move.row === target.row && move.col === target.col);
    return ok
      ? { ok: true }
      : { ok: false, reason: `不能移动到 ${action.to}` };
  }

  if (action.type === "wall") {
    const orientation = normalizeOrientation(action.orientation);
    const anchor = notationToWallAnchor(action.at);
    if (!orientation || !anchor) return { ok: false, reason: "墙坐标或方向不合法" };
    return validateWallPlacement(game, playerId, {
      orientation,
      r: anchor.row,
      c: anchor.col
    });
  }

  return { ok: false, reason: "动作类型必须是 move 或 wall" };
}

function validateWallPlacement(game, playerId, wall) {
  const player = game.players[playerId];
  if (!player) return { ok: false, reason: "无效玩家" };
  if (player.wallsRemaining <= 0) return { ok: false, reason: "墙已用完" };
  if (!wall || !["horizontal", "vertical"].includes(wall.orientation)) return { ok: false, reason: "墙方向无效" };
  if (wall.r < 0 || wall.r >= WALL_ANCHOR_SIZE || wall.c < 0 || wall.c >= WALL_ANCHOR_SIZE) {
    return { ok: false, reason: "墙位置超出范围" };
  }

  const conflict = findWallConflict(game.walls, wall);
  if (conflict) return { ok: false, reason: conflict };

  const trial = cloneGame(game);
  trial.walls.push({ ...wall });
  const p1Path = hasGoalPath(trial, "P1");
  const p2Path = hasGoalPath(trial, "P2");
  if (!p1Path || !p2Path) {
    return { ok: false, reason: "该墙会堵死至少一方的所有路径" };
  }

  return { ok: true };
}

function findWallConflict(existingWalls, nextWall) {
  for (const wall of existingWalls) {
    if (wall.orientation === nextWall.orientation && wall.r === nextWall.r && wall.c === nextWall.c) {
      return "该位置已经有同向墙";
    }
    if (wall.orientation !== nextWall.orientation && wall.r === nextWall.r && wall.c === nextWall.c) {
      return "该位置已有交叉墙";
    }
    if (wall.orientation === "horizontal" && nextWall.orientation === "horizontal" && wall.r === nextWall.r && Math.abs(wall.c - nextWall.c) <= 1) {
      return "横墙与现有横墙重叠";
    }
    if (wall.orientation === "vertical" && nextWall.orientation === "vertical" && wall.c === nextWall.c && Math.abs(wall.r - nextWall.r) <= 1) {
      return "竖墙与现有竖墙重叠";
    }
  }
  return "";
}

function getLegalPawnMoves(game, playerId) {
  const player = game.players[playerId];
  const opponent = game.players[getOpponentId(playerId)];
  const candidates = [];
  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const dir of directions) {
    const ar = player.row + dir.dr;
    const ac = player.col + dir.dc;
    if (!isCellInBounds(ar, ac)) continue;
    if (!canTraverse(game.walls, player.row, player.col, ar, ac)) continue;

    if (opponent.row === ar && opponent.col === ac) {
      const br = ar + dir.dr;
      const bc = ac + dir.dc;
      if (isCellInBounds(br, bc) && canTraverse(game.walls, ar, ac, br, bc)) {
        candidates.push({ row: br, col: bc });
      } else {
        const sideways = dir.dr !== 0
          ? [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }]
          : [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }];
        for (const side of sideways) {
          const sr = ar + side.dr;
          const sc = ac + side.dc;
          if (!isCellInBounds(sr, sc)) continue;
          if (!canTraverse(game.walls, ar, ac, sr, sc)) continue;
          candidates.push({ row: sr, col: sc });
        }
      }
    } else {
      candidates.push({ row: ar, col: ac });
    }
  }

  const seen = new Set();
  return candidates.filter((move) => {
    const key = `${move.row},${move.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canTraverse(walls, fromRow, fromCol, toRow, toCol) {
  if (!isCellInBounds(fromRow, fromCol) || !isCellInBounds(toRow, toCol)) return false;
  const deltaRow = toRow - fromRow;
  const deltaCol = toCol - fromCol;
  if (Math.abs(deltaRow) + Math.abs(deltaCol) !== 1) return false;

  if (deltaRow === 1) {
    return !isBlockedByHorizontalWall(walls, fromRow, fromCol);
  }
  if (deltaRow === -1) {
    return !isBlockedByHorizontalWall(walls, toRow, toCol);
  }
  if (deltaCol === 1) {
    return !isBlockedByVerticalWall(walls, fromRow, fromCol);
  }
  if (deltaCol === -1) {
    return !isBlockedByVerticalWall(walls, toRow, toCol);
  }
  return false;
}

function isBlockedByHorizontalWall(walls, row, col) {
  return walls.some((wall) =>
    wall.orientation === "horizontal" &&
    wall.r === row &&
    (wall.c === col || wall.c === col - 1)
  );
}

function isBlockedByVerticalWall(walls, row, col) {
  return walls.some((wall) =>
    wall.orientation === "vertical" &&
    wall.c === col &&
    (wall.r === row || wall.r === row - 1)
  );
}

function hasGoalPath(game, playerId) {
  return getShortestPathLength(game, playerId) !== Infinity;
}

function getShortestPathLength(game, playerId) {
  const player = game.players[playerId];
  const startKey = `${player.row},${player.col}`;
  const queue = [{ row: player.row, col: player.col, dist: 0 }];
  const visited = new Set([startKey]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.row === player.goalRow) return current.dist;
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];
    for (const dir of dirs) {
      const nr = current.row + dir.dr;
      const nc = current.col + dir.dc;
      if (!isCellInBounds(nr, nc)) continue;
      if (!canTraverse(game.walls, current.row, current.col, nr, nc)) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ row: nr, col: nc, dist: current.dist + 1 });
    }
  }
  return Infinity;
}

function listLegalActions(game, playerId) {
  const actions = getLegalPawnMoves(game, playerId).map((move) => ({
    type: "move",
    to: cellToNotation(move.row, move.col)
  }));
  const player = game.players[playerId];
  if (player.wallsRemaining > 0) {
    for (let row = 0; row < WALL_ANCHOR_SIZE; row += 1) {
      for (let col = 0; col < WALL_ANCHOR_SIZE; col += 1) {
        for (const orientation of ["horizontal", "vertical"]) {
          const validation = validateWallPlacement(game, playerId, { orientation, r: row, c: col });
          if (!validation.ok) continue;
          actions.push({
            type: "wall",
            orientation,
            at: wallAnchorToNotation(row, col)
          });
        }
      }
    }
  }
  return actions;
}

function getShortestPathTrace(game, playerId) {
  const player = game.players[playerId];
  const queue = [{ row: player.row, col: player.col }];
  const visited = new Set([`${player.row},${player.col}`]);
  const parentMap = new Map();
  let targetKey = "";

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.row === player.goalRow) {
      targetKey = `${current.row},${current.col}`;
      break;
    }
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];
    for (const dir of directions) {
      const nextRow = current.row + dir.dr;
      const nextCol = current.col + dir.dc;
      if (!isCellInBounds(nextRow, nextCol)) continue;
      if (!canTraverse(game.walls, current.row, current.col, nextRow, nextCol)) continue;
      const key = `${nextRow},${nextCol}`;
      if (visited.has(key)) continue;
      visited.add(key);
      parentMap.set(key, `${current.row},${current.col}`);
      queue.push({ row: nextRow, col: nextCol });
    }
  }

  if (!targetKey) return [];
  const path = [];
  let cursor = targetKey;
  while (cursor) {
    const [rowText, colText] = cursor.split(",");
    path.unshift({ row: Number(rowText), col: Number(colText) });
    cursor = parentMap.get(cursor) || "";
  }
  return path;
}

function simulateAction(game, playerId, action) {
  const next = cloneGame(game);
  mutateGameByAction(next, playerId, action);
  const winner = detectWinner(next);
  next.winner = winner || "";
  next.currentPlayer = winner ? playerId : getOpponentId(playerId);
  return next;
}

function evaluatePosition(game, perspectivePlayerId) {
  if (game.winner === perspectivePlayerId) return 100000;
  if (game.winner && game.winner !== perspectivePlayerId) return -100000;
  const profile = buildSecondBrainProfile(game, perspectivePlayerId);
  const weights = profile.weights;
  const self = game.players[perspectivePlayerId];
  const oppId = getOpponentId(perspectivePlayerId);
  const opp = game.players[oppId];
  const selfDist = getShortestPathLength(game, perspectivePlayerId);
  const oppDist = getShortestPathLength(game, oppId);
  const centerBias = (-Math.abs(self.col - 4) + Math.abs(opp.col - 4)) * weights.centerWeight;
  const wallBias = (self.wallsRemaining - opp.wallsRemaining) * weights.wallResourceWeight;
  const mobilityBias = getLegalPawnMoves(game, perspectivePlayerId).length - getLegalPawnMoves(game, oppId).length;
  return oppDist * weights.oppPathWeight - selfDist * weights.selfPathWeight + wallBias + centerBias + mobilityBias * weights.mobilityWeight;
}

function buildStrategicWallActions(game, playerId, limit = 14) {
  const beforeSelf = getShortestPathLength(game, playerId);
  const oppId = getOpponentId(playerId);
  const beforeOpp = getShortestPathLength(game, oppId);
  const candidateMap = new Map();
  const player = game.players[playerId];
  const opponent = game.players[oppId];
  const seedPoints = [
    { row: player.row, col: player.col },
    { row: opponent.row, col: opponent.col },
    ...getShortestPathTrace(game, playerId),
    ...getShortestPathTrace(game, oppId)
  ];

  seedPoints.forEach((point) => {
    if (!point) return;
    for (let dr = -1; dr <= 0; dr += 1) {
      for (let dc = -1; dc <= 0; dc += 1) {
        const row = point.row + dr;
        const col = point.col + dc;
        if (row < 0 || row >= WALL_ANCHOR_SIZE || col < 0 || col >= WALL_ANCHOR_SIZE) continue;
        ["horizontal", "vertical"].forEach((orientation) => {
          const key = `${orientation}:${row},${col}`;
          if (!candidateMap.has(key)) {
            candidateMap.set(key, {
              type: "wall",
              orientation,
              at: wallAnchorToNotation(row, col)
            });
          }
        });
      }
    }
  });

  const scored = [];
  candidateMap.forEach((action) => {
    const validation = validateAction(game, playerId, action);
    if (!validation.ok) return;
    const trial = simulateAction(game, playerId, action);
    const afterSelf = getShortestPathLength(trial, playerId);
    const afterOpp = getShortestPathLength(trial, oppId);
    const score = (afterOpp - beforeOpp) * 14 - (afterSelf - beforeSelf) * 11;
    scored.push({ action, score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.action);
}

function listStrategicActions(game, playerId) {
  const moves = getLegalPawnMoves(game, playerId).map((move) => ({
    type: "move",
    to: cellToNotation(move.row, move.col)
  }));
  const player = game.players[playerId];
  const walls = player.wallsRemaining > 0 ? buildStrategicWallActions(game, playerId, 12) : [];
  return moves.concat(walls);
}

function scoreActionForOrdering(game, playerId, action, perspectivePlayerId) {
  const next = simulateAction(game, playerId, action);
  return evaluatePosition(next, perspectivePlayerId);
}

function normalizeEvaluationScore(score) {
  return Math.tanh(Number(score || 0) / 220);
}

function buildMctsActionEntries(game, playerId) {
  const actions = listStrategicActions(game, playerId);
  if (!actions.length) return [];
  const scored = actions
    .map((action) => ({
      action,
      score: scoreActionForOrdering(game, playerId, action, playerId)
    }))
    .sort((a, b) => b.score - a.score);
  const bestScore = scored[0]?.score || 0;
  const weights = scored.map((entry) => ({
    ...entry,
    prior: Math.exp((entry.score - bestScore) / 45)
  }));
  const total = weights.reduce((sum, entry) => sum + entry.prior, 0) || 1;
  return weights.map((entry) => ({
    action: entry.action,
    score: entry.score,
    prior: entry.prior / total
  }));
}

function createMctsNode(game, actionFromParent = null, prior = 1, parent = null) {
  const actionEntries = game.winner ? [] : buildMctsActionEntries(game, game.currentPlayer);
  return {
    game,
    parent,
    actionFromParent,
    prior,
    visits: 0,
    valueSum: 0,
    actionEntries,
    children: []
  };
}

function getMctsNodeMeanValue(node) {
  return node.visits > 0 ? node.valueSum / node.visits : 0;
}

function selectMctsChild(node, exploration) {
  let bestChild = null;
  let bestScore = -Infinity;
  const parentVisits = Math.max(1, node.visits);
  for (const child of node.children) {
    const q = -getMctsNodeMeanValue(child);
    const u = exploration * child.prior * Math.sqrt(parentVisits) / (1 + child.visits);
    const score = q + u;
    if (score > bestScore) {
      bestScore = score;
      bestChild = child;
    }
  }
  return bestChild;
}

function expandMctsNode(node) {
  const usedActions = new Set(node.children.map((child) => JSON.stringify(child.actionFromParent)));
  const nextEntry = node.actionEntries.find((entry) => !usedActions.has(JSON.stringify(entry.action)));
  if (!nextEntry) return node;
  const nextGame = simulateAction(node.game, node.game.currentPlayer, nextEntry.action);
  const child = createMctsNode(nextGame, nextEntry.action, nextEntry.prior, node);
  node.children.push(child);
  return child;
}

function chooseWeightedAction(entries) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.prior), 0) || 1;
  let threshold = Math.random() * total;
  for (const entry of entries) {
    threshold -= Math.max(0, entry.prior);
    if (threshold <= 0) return entry.action;
  }
  return entries[entries.length - 1].action;
}

function evaluateRollout(game, perspectivePlayerId, maxSteps = 8) {
  let current = cloneGame(game);
  for (let step = 0; step < maxSteps && !current.winner; step += 1) {
    const currentId = current.currentPlayer;
    const entries = buildMctsActionEntries(current, currentId).slice(0, 6);
    const action = chooseWeightedAction(entries);
    if (!action) break;
    current = simulateAction(current, currentId, action);
  }
  if (current.winner) {
    return current.winner === perspectivePlayerId ? 1 : -1;
  }
  return normalizeEvaluationScore(evaluatePosition(current, perspectivePlayerId));
}

function backpropagateMcts(path, leafValue) {
  let value = leafValue;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const node = path[index];
    node.visits += 1;
    node.valueSum += value;
    value = -value;
  }
}

function mctsSearch(game, rootPlayerId, options = {}) {
  const iterations = clampNumber(Number(options.iterations || 240), 40, 4000);
  const exploration = clampNumber(Number(options.exploration || 1.4), 0.2, 4);
  const root = createMctsNode(cloneGame(game), null, 1, null);
  if (!root.actionEntries.length) {
    return { action: null, iterations: 0, bestVisits: 0, candidateStats: [] };
  }

  for (let run = 0; run < iterations; run += 1) {
    const path = [root];
    let node = root;

    while (!node.game.winner && node.children.length > 0 && node.children.length >= node.actionEntries.length) {
      node = selectMctsChild(node, exploration);
      if (!node) break;
      path.push(node);
    }
    if (!node) continue;

    if (!node.game.winner && node.children.length < node.actionEntries.length) {
      node = expandMctsNode(node);
      path.push(node);
    }

    const leafPerspective = node.game.currentPlayer;
    const leafValue = evaluateRollout(node.game, leafPerspective, 8);
    backpropagateMcts(path, leafValue);
  }

  const candidateStats = root.children
    .map((child) => ({
      action: child.actionFromParent,
      visits: child.visits,
      meanValueFromRoot: -getMctsNodeMeanValue(child),
      prior: child.prior
    }))
    .sort((a, b) => b.visits - a.visits || b.meanValueFromRoot - a.meanValueFromRoot);

  const best = candidateStats[0] || null;
  return {
    action: best?.action || null,
    iterations,
    bestVisits: best?.visits || 0,
    candidateStats
  };
}

function buildMinimaxExplanation(game, playerId, action) {
  const profile = buildSecondBrainProfile(game, playerId);
  const beforeSelf = getShortestPathLength(game, playerId);
  const beforeOpp = getShortestPathLength(game, getOpponentId(playerId));
  const trial = simulateAction(game, playerId, action);
  const afterSelf = getShortestPathLength(trial, playerId);
  const afterOpp = getShortestPathLength(trial, getOpponentId(playerId));
  const knowledgeLine = profile.activeDocs.length
    ? `当前命中的方法论/经验卡：${profile.activeDocs.map((doc) => doc.title).join("、")}。`
    : "当前没有额外命中的经验卡，按基础评估函数搜索。";
  if (action.type === "move") {
    return {
      reason: `这一步把自己的最短路径从 ${beforeSelf} 步调整到 ${afterSelf} 步，同时对手仍需 ${afterOpp} 步到达目标线。${knowledgeLine}`,
      teaching: "本地搜索 AI 会先读 second brain 的局面标签和经验卡，再比较双方最短路、墙资源和中心控制。",
      summary: `走到 ${String(action.to || "").toUpperCase()}，优先保证推进效率。`
    };
  }
  const selfDelta = afterSelf - beforeSelf;
  const oppDelta = afterOpp - beforeOpp;
  return {
    reason: `这堵墙让对手最短路径变化 ${oppDelta >= 0 ? "+" : ""}${oppDelta} 步，自己的路径变化 ${selfDelta >= 0 ? "+" : ""}${selfDelta} 步。${knowledgeLine}`,
    teaching: "好墙不是单看阻挡力度，而是看双方最短路径的净差值是否更优；second brain 也会参与这个判断。",
    summary: `${action.orientation === "horizontal" ? "横墙" : "竖墙"} ${String(action.at || "").toUpperCase()}，用路径差换节奏。`
  };
}

async function requestMinimaxDecision(game, playerId) {
  const iterations = clampNumber(Number(els.mctsIterations.value || state.config.mctsIterations || mapLegacyDepthToIterations(state.config.minimaxDepth || "2")), 40, 4000);
  const exploration = clampNumber(Number(els.mctsExploration.value || state.config.mctsExploration || 1.4), 0.2, 4);
  const result = mctsSearch(game, playerId, {
    iterations,
    exploration
  });
  if (!result?.action) {
    throw new Error("本地搜索 AI 没有找到动作");
  }
  const explanation = buildMinimaxExplanation(game, playerId, result.action);
  const topStats = result.candidateStats.slice(0, 3).map((entry) => `${actionToLabel(entry.action)}(${entry.visits})`).join(" / ");
  pushLog("success", `本地搜索 AI 已完成 ${result.iterations} 次 MCTS 迭代：${actionToLabel(result.action)}${topStats ? ` · 候选访问量 ${topStats}` : ""}`);
  return {
    action: result.action,
    reason: `${explanation.reason} 这一步在本轮 MCTS 中获得了较高访问量。`,
    teaching: `${explanation.teaching} 当前本地搜索使用的是 MCTS，而不是固定深度穷举。`,
    summary: `${explanation.summary}（MCTS ${result.iterations} 次迭代）`
  };
}

function scoreActionDelta(game, playerId, action) {
  const oppId = getOpponentId(playerId);
  const beforeSelf = getShortestPathLength(game, playerId);
  const beforeOpp = getShortestPathLength(game, oppId);
  const next = simulateAction(game, playerId, action);
  const afterSelf = getShortestPathLength(next, playerId);
  const afterOpp = getShortestPathLength(next, oppId);
  const evalScore = evaluatePosition(next, playerId);
  return {
    action,
    evalScore,
    beforeSelf,
    beforeOpp,
    afterSelf,
    afterOpp,
    selfDelta: afterSelf - beforeSelf,
    oppDelta: afterOpp - beforeOpp
  };
}

function buildApiStrategicGuidance(game, playerId) {
  const profile = buildSecondBrainProfile(game, playerId);
  const candidateActions = listStrategicActions(game, playerId);
  const scored = candidateActions.map((action) => scoreActionDelta(game, playerId, action))
    .sort((a, b) => b.evalScore - a.evalScore);
  const best = scored[0] || null;
  const topCandidates = scored.slice(0, 6).map((entry, index) => ({
    rank: index + 1,
    action: entry.action,
    actionLabel: actionToLabel(entry.action),
    evalScore: Math.round(entry.evalScore),
    selfShortestPathDelta: entry.selfDelta,
    opponentShortestPathDelta: entry.oppDelta,
    note: entry.action.type === "move"
      ? "这步主要看自身推进效率。"
      : "这步主要看双方最短路径差值。"
  }));
  const discouragedActions = scored.slice(-4).reverse().map((entry) => ({
    action: entry.action,
    actionLabel: actionToLabel(entry.action),
    evalScore: Math.round(entry.evalScore),
    reason: entry.action.type === "move"
      ? `这步会让自己的最短路变化 ${entry.selfDelta >= 0 ? "+" : ""}${entry.selfDelta}。`
      : `这堵墙对手路径变化 ${entry.oppDelta >= 0 ? "+" : ""}${entry.oppDelta}，自己变化 ${entry.selfDelta >= 0 ? "+" : ""}${entry.selfDelta}。`
  }));
  return {
    stateTags: profile.tags,
    activeKnowledge: profile.activeDocs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      sourceKind: doc.sourceKind,
      summary: doc.summary
    })),
    bestAction: best ? {
      action: best.action,
      actionLabel: actionToLabel(best.action),
      evalScore: Math.round(best.evalScore)
    } : null,
    topCandidates,
    discouragedActions
  };
}

function actionsEqual(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "move") {
    return String(a.to || "").trim().toLowerCase() === String(b.to || "").trim().toLowerCase();
  }
  return normalizeOrientation(a.orientation) === normalizeOrientation(b.orientation)
    && String(a.at || "").trim().toLowerCase() === String(b.at || "").trim().toLowerCase();
}

function evaluateApiDecisionQuality(game, playerId, action, guidance) {
  if (!guidance?.topCandidates?.length) return { ok: true };
  if (guidance.topCandidates.some((entry) => actionsEqual(entry.action, action))) {
    return { ok: true };
  }
  const chosen = scoreActionDelta(game, playerId, action);
  const bestScore = Number(guidance.topCandidates[0]?.evalScore || 0);
  const scoreGap = bestScore - chosen.evalScore;
  if (scoreGap <= 35) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `${actionToLabel(action)} 与本地最优候选差距过大（约 ${Math.round(scoreGap)} 分）`
  };
}

async function requestAiActionDecision(game, playerId) {
  const retries = clampNumber(Number(els.apiRetries.value || state.config.apiRetries || 3), 1, 6);
  const guidance = buildApiStrategicGuidance(game, playerId);
  let invalidFeedback = "";

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const aiContext = buildAiActionContext(game, playerId, invalidFeedback, attempt, retries, guidance);
    const response = await requestAiJson({
      messages: [
        {
          role: "system",
          content: buildAiSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(aiContext, null, 2)
        }
      ]
    });
    const decision = normalizeAiDecision(response.json);
    const validation = validateAction(game, playerId, decision.action);
    if (!validation.ok) {
      invalidFeedback = `上一轮提议非法：${validation.reason}`;
      pushLog("warn", `AI 第 ${attempt} 次提议非法：${validation.reason}`);
      continue;
    }
    const guardrail = evaluateApiDecisionQuality(game, playerId, decision.action, guidance);
    if (guardrail.ok) {
      pushLog("success", `AI 返回合法动作：${actionToLabel(decision.action)}`);
      return decision;
    }
    invalidFeedback = `上一轮动作虽然合法，但质量太差：${guardrail.reason}`;
    pushLog("warn", `AI 第 ${attempt} 次动作被策略护栏驳回：${guardrail.reason}`);
  }

  throw new Error("AI 在重试后仍未给出合法动作");
}

async function requestAiSummary(game) {
  const context = buildAiSummaryContext(game);
  const response = await requestAiJson({
    messages: [
      {
        role: "system",
        content: buildAiSummarySystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify(context, null, 2)
      }
    ]
  });
  return normalizeSummaryResponse(response.json, response.rawText);
}

async function requestAiCommentaryForChosenAction(game, playerId, action, localDecision = null) {
  const context = buildAiCommentaryContext(game, playerId, action, localDecision);
  const response = await requestAiJson({
    messages: [
      {
        role: "system",
        content: buildAiCommentarySystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify(context, null, 2)
      }
    ]
  });
  const json = response.json || {};
  return {
    reason: String(json.reason || localDecision?.reason || "").trim(),
    teaching: String(json.teaching || localDecision?.teaching || "").trim(),
    summary: String(json.summary || localDecision?.summary || "").trim()
  };
}

function buildAiActionContext(game, playerId, invalidFeedback, attempt, maxRetries, guidance = null) {
  const player = game.players[playerId];
  const opponent = game.players[getOpponentId(playerId)];
  const legalActions = listLegalActions(game, playerId);
  const profile = buildSecondBrainProfile(game, playerId);
  return {
    task: "quoridor_move_decision",
    language: "zh-CN",
    attempt,
    maxRetries,
    invalidFeedback,
    outputSchema: {
      action: {
        type: "move | wall",
        to: "e5 (when type=move)",
        orientation: "horizontal | vertical (when type=wall)",
        at: "c4 (when type=wall)"
      },
      reason: "为什么这么走",
      teaching: "这一步给人的教学提示",
      summary: "一句话总结这手的战术意义"
    },
    state: serializeGameForAi(game, playerId),
    boardOrientation: {
      northEdge: "第 1 行",
      southEdge: "第 9 行",
      westEdge: "a 列",
      eastEdge: "i 列",
      topLeft: "a1",
      bottomRight: "i9",
      ruleReminder: "P1 从 e9 出发，目标是向北到第 1 行；P2 从 e1 出发，目标是向南到第 9 行。"
    },
    actor: {
      id: playerId,
      label: player.label,
      pawn: cellToNotation(player.row, player.col),
      goal: player.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
      moveDirection: player.goalRow === 0 ? "向北推进" : "向南推进",
      wallsRemaining: player.wallsRemaining
    },
    opponent: {
      id: opponent.id,
      label: opponent.label,
      pawn: cellToNotation(opponent.row, opponent.col),
      goal: opponent.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
      moveDirection: opponent.goalRow === 0 ? "向北推进" : "向南推进",
      wallsRemaining: opponent.wallsRemaining
    },
    secondBrain: {
      source: state.knowledge?.source || "未加载",
      stateTags: profile.tags,
      activeDocs: profile.activeDocs.map((doc) => ({
        title: doc.title,
        sourceKind: doc.sourceKind,
        summary: doc.summary,
        effect: {
          selfPathWeight: doc.effect_self_path_weight || 0,
          opponentPathWeight: doc.effect_opp_path_weight || 0,
          centerBias: doc.effect_center_bias || 0,
          wallResourceBias: doc.effect_wall_resource_bias || 0
        }
      })),
      methodology: [
        "先识别当前局面的标签，再看命中的方法论/经验卡。",
        "优先从 strategicGuidance.topCandidates 中选招。",
        "如果偏离本地高分候选，必须明确说明偏离理由。"
      ]
    },
    strategicGuidance: guidance,
    legalActions,
    instruction: "只能从 legalActions 中选择一步，并且只返回 JSON。不要输出 markdown，不要输出代码块。再次强调：如果 actor.id 是 P2，你的目标是向南到第 9 行，不是向北。必须先参考 secondBrain 与 strategicGuidance，再做选择；优先参考 strategicGuidance.topCandidates，除非你能明确说明为什么要偏离它们。"
  };
}

function buildAiCommentaryContext(game, playerId, action, localDecision = null) {
  const player = game.players[playerId];
  const opponentId = getOpponentId(playerId);
  const opponent = game.players[opponentId];
  const nextGame = simulateAction(game, playerId, action);
  const profile = buildSecondBrainProfile(game, playerId);
  const guidance = buildApiStrategicGuidance(game, playerId);
  return {
    task: "quoridor_explain_fixed_action",
    language: "zh-CN",
    outputSchema: {
      reason: "为什么这一步合理",
      teaching: "这一步的教学提示",
      summary: "一句话总结"
    },
    actor: {
      id: playerId,
      label: player.label,
      pawn: cellToNotation(player.row, player.col),
      goal: player.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
      moveDirection: player.goalRow === 0 ? "向北推进" : "向南推进"
    },
    opponent: {
      id: opponent.id,
      label: opponent.label,
      pawn: cellToNotation(opponent.row, opponent.col),
      goal: opponent.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
      moveDirection: opponent.goalRow === 0 ? "向北推进" : "向南推进"
    },
    stateBefore: serializeGameForAi(game, playerId),
    stateAfter: serializeGameForAi(nextGame, playerId),
    fixedAction: {
      action,
      actionLabel: actionToLabel(action)
    },
    secondBrain: {
      source: state.knowledge?.source || "未加载",
      stateTags: profile.tags,
      activeDocs: profile.activeDocs.map((doc) => ({
        title: doc.title,
        sourceKind: doc.sourceKind,
        summary: doc.summary
      }))
    },
    localSearch: {
      engine: "MCTS",
      localReason: String(localDecision?.reason || "").trim(),
      localTeaching: String(localDecision?.teaching || "").trim(),
      localSummary: String(localDecision?.summary || "").trim(),
      topCandidates: guidance.topCandidates
    },
    instruction: "动作已经固定，不能更改 fixedAction。你只负责解释为什么这一步合理，并给出教学提示。只返回 JSON，不要输出 markdown。"
  };
}

function buildAiSummaryContext(game) {
  return {
    task: "quoridor_teaching_summary",
    language: "zh-CN",
    outputSchema: {
      overview: "整体总结",
      turningPoints: ["关键转折 1", "关键转折 2"],
      lessons: ["训练建议 1", "训练建议 2"],
      nextPractice: "下一步建议"
    },
    finalState: serializeGameForAi(game, game.currentPlayer),
    winner: game.winner ? getPlayerLabel(game.winner) : "未结束",
    history: game.history.map((entry) => ({
      turn: entry.turn,
      player: entry.playerLabel,
      actorType: entry.actorType,
      action: entry.actionLabel,
      reason: entry.reason,
      teaching: entry.teaching,
      summary: entry.summary
    })),
    instruction: "请基于整盘对局做教学总结，只返回 JSON。"
  };
}

function buildAiSystemPrompt() {
  const base = [
    "你是 Quoridor 教学型对手。",
    "你不能自己发明规则，必须严格遵守用户给出的 legalActions。",
    "你不是裸下棋手，必须先结合 secondBrain 和 strategicGuidance 理解局面，再选动作。",
    "棋盘坐标是 a1 在左上角，i9 在右下角，数字从北到南递增。",
    "P1 的目标线是北面的第 1 行；P2 的目标线是南面的第 9 行。",
    "如果当前 actor 是 P2，你必须把“向南到第 9 行”当成自己的胜利目标。",
    "你只负责选择动作、解释原因和给出教学提示。",
    "你必须只返回 JSON。"
  ].join("\n");
  const extra = els.systemPrompt.value.trim();
  return extra ? `${base}\n\n附加要求:\n${extra}` : base;
}

function buildAiCommentarySystemPrompt() {
  const base = [
    "你是 Quoridor 教学解说员。",
    "动作已经由本地 MCTS 决定，你不能修改动作。",
    "你必须结合 secondBrain、局面前后变化和本地搜索提示来解释这一步。",
    "你必须只返回 JSON。"
  ].join("\n");
  const extra = els.systemPrompt.value.trim();
  return extra ? `${base}\n\n附加要求:\n${extra}` : base;
}

function buildAiSummarySystemPrompt() {
  const base = [
    "你是 Quoridor 复盘教练。",
    "请根据给出的整局历史，总结关键转折和训练建议。",
    "你必须只返回 JSON。"
  ].join("\n");
  const extra = els.systemPrompt.value.trim();
  return extra ? `${base}\n\n附加要求:\n${extra}` : base;
}

function serializeGameForAi(game, playerId) {
  const currentPlayer = game.players[playerId];
  const opponent = game.players[getOpponentId(playerId)];
  return {
    boardSize: BOARD_SIZE,
    coordinateSystem: {
      topLeft: "a1",
      topRight: "i1",
      bottomLeft: "a9",
      bottomRight: "i9",
      rowsIncreaseTowardSouth: true
    },
    currentPlayer: getPlayerLabel(playerId),
    players: {
      P1: {
        pawn: cellToNotation(game.players.P1.row, game.players.P1.col),
        wallsRemaining: game.players.P1.wallsRemaining,
        shortestPath: getShortestPathLength(game, "P1"),
        goal: "到达第 1 行",
        moveDirection: "向北推进"
      },
      P2: {
        pawn: cellToNotation(game.players.P2.row, game.players.P2.col),
        wallsRemaining: game.players.P2.wallsRemaining,
        shortestPath: getShortestPathLength(game, "P2"),
        goal: "到达第 9 行",
        moveDirection: "向南推进"
      }
    },
    actorPerspective: {
      self: {
        pawn: cellToNotation(currentPlayer.row, currentPlayer.col),
        wallsRemaining: currentPlayer.wallsRemaining,
        goal: currentPlayer.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
        moveDirection: currentPlayer.goalRow === 0 ? "向北推进" : "向南推进"
      },
      opponent: {
        pawn: cellToNotation(opponent.row, opponent.col),
        wallsRemaining: opponent.wallsRemaining,
        goal: opponent.goalRow === 0 ? "到达第 1 行" : "到达第 9 行",
        moveDirection: opponent.goalRow === 0 ? "向北推进" : "向南推进"
      }
    },
    walls: game.walls.map((wall) => ({
      orientation: wall.orientation,
      at: wallAnchorToNotation(wall.r, wall.c)
    })),
    moveHistory: game.history.slice(-16).map((entry) => ({
      turn: entry.turn,
      player: entry.playerLabel,
      action: entry.actionLabel
    }))
  };
}

async function requestAiJson({ messages }) {
  saveConfig();
  const adapter = window.QuoridorAiApiAdapter || {};
  const endpoint = state.config.apiEndpoint;
  const customHeaders = parseCustomHeaders(state.config.customHeaders);
  const headers = {
    "Content-Type": "application/json",
    ...customHeaders
  };
  if (state.config.apiKey) {
    headers.Authorization = `Bearer ${state.config.apiKey}`;
  }

  const payload = typeof adapter.buildRequestPayload === "function"
    ? adapter.buildRequestPayload({
      model: state.config.apiModel,
      temperature: Number(state.config.apiTemperature || 0.3),
      messages
    })
    : {
      model: state.config.apiModel,
      temperature: Number(state.config.apiTemperature || 0.3),
      messages
    };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = typeof adapter.extractTextFromResponse === "function"
    ? adapter.extractTextFromResponse(data)
    : defaultExtractAiTextFromResponse(data);
  if (!text) {
    throw new Error("API 响应里没有可解析文本");
  }
  const json = parseJsonFromText(text);
  return {
    data,
    rawText: text,
    json
  };
}

function defaultExtractAiTextFromResponse(data) {
  if (typeof data?.choices?.[0]?.message?.reasoning_content === "string" && typeof data?.choices?.[0]?.message?.content === "string") {
    return data.choices[0].message.content;
  }
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (Array.isArray(data?.choices?.[0]?.message?.content)) {
    return data.choices[0].message.content.map((item) => item?.text || item?.content || "").join("\n");
  }
  if (typeof data?.output_text === "string") return data.output_text;
  if (Array.isArray(data?.output)) {
    const texts = [];
    data.output.forEach((chunk) => {
      if (Array.isArray(chunk?.content)) {
        chunk.content.forEach((part) => {
          if (typeof part?.text === "string") texts.push(part.text);
        });
      }
    });
    if (texts.length) return texts.join("\n");
  }
  return "";
}

function parseJsonFromText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("无法从 AI 文本中解析 JSON");
  }
}

function normalizeAiDecision(json) {
  const action = json?.action || json || {};
  const type = String(action.type || "").trim().toLowerCase();
  if (type === "move") {
    return {
      action: {
        type: "move",
        to: String(action.to || json.to || "").trim().toLowerCase()
      },
      reason: String(json.reason || "").trim(),
      teaching: String(json.teaching || "").trim(),
      summary: String(json.summary || "").trim()
    };
  }
  if (type === "wall") {
    return {
      action: {
        type: "wall",
        orientation: normalizeOrientation(action.orientation || json.orientation),
        at: String(action.at || json.at || "").trim().toLowerCase()
      },
      reason: String(json.reason || "").trim(),
      teaching: String(json.teaching || "").trim(),
      summary: String(json.summary || "").trim()
    };
  }
  throw new Error("AI 返回的 action.type 非法");
}

function normalizeSummaryResponse(json, rawText) {
  if (!json || typeof json !== "object") {
    return {
      overview: rawText,
      turningPoints: [],
      lessons: [],
      nextPractice: ""
    };
  }
  return {
    overview: String(json.overview || rawText || "").trim(),
    turningPoints: Array.isArray(json.turningPoints) ? json.turningPoints.map((item) => String(item)) : [],
    lessons: Array.isArray(json.lessons) ? json.lessons.map((item) => String(item)) : [],
    nextPractice: String(json.nextPractice || "").trim()
  };
}

function parseCustomHeaders(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    pushLog("warn", "额外 Headers JSON 解析失败，已忽略。");
    return {};
  }
}

function positionRect(el, rect) {
  el.style.top = `${rect.top}px`;
  el.style.left = `${rect.left}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function wallAnchorToRect(wall) {
  if (wall.orientation === "horizontal") {
    return {
      top: wall.r * (cellSize() + gapSize()) + cellSize(),
      left: wall.c * (cellSize() + gapSize()),
      width: cellSize() * 2 + gapSize(),
      height: gapSize()
    };
  }
  return {
    top: wall.r * (cellSize() + gapSize()),
    left: wall.c * (cellSize() + gapSize()) + cellSize(),
    width: gapSize(),
    height: cellSize() * 2 + gapSize()
  };
}

function cellSize() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
}

function gapSize() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap-size"));
}

function normalizeOrientation(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "h" || text === "horizontal") return "horizontal";
  if (text === "v" || text === "vertical") return "vertical";
  return "";
}

function cellToNotation(row, col) {
  return `${FILES[col]}${row + 1}`;
}

function notationToCell(text) {
  const clean = String(text || "").trim().toLowerCase();
  if (!/^[a-i][1-9]$/.test(clean)) return null;
  const col = FILES.indexOf(clean[0]);
  const row = Number(clean[1]) - 1;
  if (!isCellInBounds(row, col)) return null;
  return { row, col };
}

function wallAnchorToNotation(row, col) {
  return `${WALL_FILES[col]}${row + 1}`;
}

function notationToWallAnchor(text) {
  const clean = String(text || "").trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(clean)) return null;
  const col = WALL_FILES.indexOf(clean[0]);
  const row = Number(clean[1]) - 1;
  if (row < 0 || row >= WALL_ANCHOR_SIZE || col < 0 || col >= WALL_ANCHOR_SIZE) return null;
  return { row, col, r: row, c: col };
}

function actionToLabel(action) {
  if (!action) return "未知动作";
  if (action.type === "move") return `移动到 ${String(action.to || "").toUpperCase()}`;
  if (action.type === "wall") return `${normalizeOrientation(action.orientation) === "horizontal" ? "横墙" : "竖墙"} ${String(action.at || "").toUpperCase()}`;
  return "未知动作";
}

function isCellInBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function mapLegacyDepthToIterations(depthText) {
  const depth = clampNumber(Number(depthText || 2), 1, 4);
  if (depth === 1) return "120";
  if (depth === 2) return "240";
  if (depth === 3) return "420";
  return "700";
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapParagraphs(text) {
  return String(text || "")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("") || "<p>未提供</p>";
}

function pushLog(level, message) {
  state.logs.push({
    level,
    message,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false })
  });
  if (state.logs.length > 80) {
    state.logs = state.logs.slice(-80);
  }
  renderLogs();
}

window.QuoridorAiApiAdapter = window.QuoridorAiApiAdapter || {
  buildRequestPayload({ model, temperature, messages }) {
    return { model, temperature, messages };
  },
  extractTextFromResponse(data) {
    return defaultExtractAiTextFromResponse(data);
  }
};
