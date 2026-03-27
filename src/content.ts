console.log("faceit potential elo extension works!");

const PLAYER_CARD_SELECTOR = ".styles__Holder-sc-3a6c9dc6-1";
const PLAYER_NAME_SELECTOR = ".Nickname__Name-sc-cf3aab55-1";
const PLAYER_ELO_ROW_SELECTOR = ".TextBlock__RowHolder-sc-329a9735-1";
const PLAYER_ELO_VALUE_SELECTOR = ".Subtitle__Holder-sc-7dc77f2f-0";
const PROCESSED_CARD_ATTR = "data-potential-elo-bound";
const SCAN_DEBOUNCE_MS = 250;

type ContentPlayerApiStats = {
  playerId: string | null;
  nickname: string | null;
  matches: string | null;
  totalMatches: string | null;
  adr: string | null;
  averageKdRatio: string | null;
  recent20: {
    requestedMatches: number;
    matchesAnalyzed: number;
    averageAdr: number | null;
    averageKdRatio: number | null;
    averageKrRatio: number | null;
  } | null;
  recent50: {
    requestedMatches: number;
    matchesAnalyzed: number;
    averageAdr: number | null;
    averageKdRatio: number | null;
    averageKrRatio: number | null;
  } | null;
};

type ContentFetchPlayerStatsResponse =
  | { ok: true; data: ContentPlayerApiStats }
  | { ok: false; error: string };

type PotentialEloInput = {
  currentElo: number | null;
  matches: number | null;
  totalMatches: number | null;
  adr: number | null;
  averageKdRatio: number | null;
  recent20Adr: number | null;
  recent20KdRatio: number | null;
  recent20KrRatio: number | null;
  recent50Adr: number | null;
  recent50KdRatio: number | null;
  recent50KrRatio: number | null;
};

let scanTimeoutId: number | null = null;
const playerStatsCache = new Map<string, Promise<ContentPlayerApiStats | null> | ContentPlayerApiStats>();

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseLocalizedNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace("%", "")
    .replace(",", ".");

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function calculatePotentialElo(input: PotentialEloInput): number | null {
  let {
    currentElo,
    adr,
    averageKdRatio,
    totalMatches,
    matches,
    recent20Adr,
    recent20KdRatio,
    recent50Adr,
    recent50KdRatio,
  } = input;

  recent20Adr = recent20Adr as number;
  recent50Adr = recent50Adr as number;
  adr = adr as number;

  recent20KdRatio = recent20KdRatio as number;
  recent50KdRatio = recent50KdRatio as number;
  averageKdRatio = averageKdRatio as number;

  adr = (recent20Adr + recent50Adr + adr) / 3;
  averageKdRatio = (recent20KdRatio + recent50KdRatio + averageKdRatio) / 3;
  adr = Math.floor(adr as number);
  matches = matches as number;
  currentElo = currentElo as number;

  let elo_ratio = 1
  let matches_impact_ratio = 1
  let kd_impact_ratio = 1
  let adr_impact_ratio = 1

  if (currentElo <= 1200) {
    elo_ratio = 1.2
  } else if (currentElo <= 1500) {
    elo_ratio = 1.06
  } else if (currentElo <= 2000) {
    elo_ratio = 1.04
  } else if (currentElo <= 2200) {
    elo_ratio = 1.01
  } else {
    elo_ratio = 1;
  }

  if (adr <= 40) {
     adr_impact_ratio -= 0.2 * elo_ratio
  } else if (adr <= 50) {
     adr_impact_ratio -= 0.15 * elo_ratio
  } else if (adr <= 60) {
    adr_impact_ratio -= 0.1 * elo_ratio
  } else if (adr <= 70) {
     adr_impact_ratio -= 0.04 * elo_ratio
  } else if (adr >= 80) {
    adr_impact_ratio += 0.06 * elo_ratio
  } else if (adr >= 85) {
    adr_impact_ratio += 0.1 * elo_ratio
  } else if (adr >= 90) {
    adr_impact_ratio += 0.2 * elo_ratio
  } else if (adr >= 100) {
    adr_impact_ratio += 0.3 * elo_ratio
  } else {
    adr_impact_ratio = 1
  }

  if (averageKdRatio <= 0.6) {
    kd_impact_ratio -= 0.3 * elo_ratio
  } else if (averageKdRatio <= 0.7) {
    kd_impact_ratio -= 0.2 * elo_ratio
  } else if (averageKdRatio <= 0.8) {
    kd_impact_ratio -= 0.1 * elo_ratio
  } else if (averageKdRatio <= 0.9) {
    kd_impact_ratio -= 0.05 * elo_ratio
  } else if (averageKdRatio >= 1.1) {
    kd_impact_ratio += 0.1 * elo_ratio
  } else if (averageKdRatio >= 1.2) {
    kd_impact_ratio += 0.15 * elo_ratio
  } else if (averageKdRatio >= 1.35) {
    kd_impact_ratio += 0.2 * elo_ratio
  } else if (averageKdRatio >= 1.5) {
    kd_impact_ratio += 0.3 * elo_ratio
  } else if (averageKdRatio >= 1.7) {
    kd_impact_ratio += 0.35 * elo_ratio
  } else if (averageKdRatio >= 2) {
    kd_impact_ratio += 0.4 * elo_ratio
  } else {
    kd_impact_ratio = 1
  }

  if (matches <= 50 && matches > 30) {
    matches_impact_ratio += 0.01 * elo_ratio
  } else if (matches <= 30) {
    matches_impact_ratio = 1
  } else if (matches < 100) {
    matches_impact_ratio += 0.05 * elo_ratio
  } else if (matches < 150) {
    matches_impact_ratio += 0.01 * elo_ratio
  } else if (matches < 300) {
    matches_impact_ratio += 0.004 * elo_ratio
  } else if (matches < 500) {
    matches_impact_ratio += 0.001 * elo_ratio
  } else {
    matches_impact_ratio = 1
  }

  if (currentElo === null) {
    return null;
  }

  const potential_elo = Math.floor(currentElo * matches_impact_ratio * kd_impact_ratio * adr_impact_ratio);
  return potential_elo ?? currentElo;
}

function renderPotentialEloBadge(
  badge: HTMLElement,
  currentElo: number | null,
  potentialElo: number | null,
): void {
  badge.classList.remove("is-positive", "is-negative", "is-neutral", "is-loading", "is-error");

  if (potentialElo === null) {
    badge.textContent = " (n/a)";
    badge.classList.add("is-neutral");
    return;
  }

  badge.textContent = ` (${potentialElo})`;

  if (currentElo === null) {
    badge.classList.add("is-neutral");
    return;
  }

  if (potentialElo >= currentElo) {
    badge.classList.add("is-positive");
    return;
  }

  badge.classList.add("is-negative");
}

function getOrCreatePotentialEloBadge(eloValueEl: Element): HTMLElement {
  const parentElement = eloValueEl.parentElement;

  if (!parentElement) {
    throw new Error("Elo value element has no parent element");
  }

  const existingBadge = parentElement.querySelector<HTMLElement>(".potential-elo-badge");

  if (existingBadge) {
    return existingBadge;
  }

  const badge = document.createElement("small");
  badge.className = "potential-elo-badge is-loading";
  badge.textContent = " (...)";
  eloValueEl.insertAdjacentElement("afterend", badge);

  return badge;
}

async function fetchPlayerStatsByNickname(nickname: string): Promise<ContentPlayerApiStats | null> {
  if (!nickname) {
    return null;
  }

  const cachedValue = playerStatsCache.get(nickname);

  if (cachedValue) {
    return cachedValue;
  }

  const request = chrome.runtime.sendMessage<{
    type: "FACEIT_FETCH_PLAYER_STATS";
    nickname: string;
  }, ContentFetchPlayerStatsResponse>({
    type: "FACEIT_FETCH_PLAYER_STATS",
    nickname,
  }).then((response) => {
    if (!response?.ok) {
      throw new Error(response?.error || "Unknown Faceit API error");
    }

    return response.data;
  });

  playerStatsCache.set(nickname, request);

  try {
    const data = await request;
    playerStatsCache.set(nickname, data);
    return data;
  } catch (error) {
    playerStatsCache.delete(nickname);
    throw error;
  }
}

async function hydratePlayerCard(card: Element): Promise<boolean> {
  const nicknameEl = card.querySelector<HTMLElement>(PLAYER_NAME_SELECTOR);
  const eloRowEl = card.querySelector<HTMLElement>(PLAYER_ELO_ROW_SELECTOR);
  const eloValueEl = eloRowEl?.querySelector<HTMLElement>(PLAYER_ELO_VALUE_SELECTOR);

  if (!nicknameEl || !eloValueEl) {
    return false;
  }

  const nickname = normalizeText(nicknameEl.textContent || "");
  const elo = normalizeText(eloValueEl.textContent || "");
  const currentElo = parseLocalizedNumber(elo);
  const badge = getOrCreatePotentialEloBadge(eloValueEl);

  card.setAttribute(PROCESSED_CARD_ATTR, "true");

  try {
    const stats = await fetchPlayerStatsByNickname(nickname);
    const potentialElo = calculatePotentialElo({
      currentElo,
      matches: parseLocalizedNumber(stats?.matches || null),
      totalMatches: parseLocalizedNumber(stats?.totalMatches || null),
      adr: parseLocalizedNumber(stats?.adr || null),
      averageKdRatio: parseLocalizedNumber(stats?.averageKdRatio || null),
      recent20Adr: stats?.recent20?.averageAdr ?? null,
      recent20KdRatio: stats?.recent20?.averageKdRatio ?? null,
      recent20KrRatio: stats?.recent20?.averageKrRatio ?? null,
      recent50Adr: stats?.recent50?.averageAdr ?? null,
      recent50KdRatio: stats?.recent50?.averageKdRatio ?? null,
      recent50KrRatio: stats?.recent50?.averageKrRatio ?? null,
    });

    renderPotentialEloBadge(badge, currentElo, potentialElo);

    console.log("FACEIT player API data:", {
      nickname,
      elo,
      playerId: stats?.playerId || null,
      matches: stats?.matches || null,
      totalMatches: stats?.totalMatches || null,
      adr: stats?.adr || null,
      averageKdRatio: stats?.averageKdRatio || null,
      recent20: stats?.recent20 || null,
      recent50: stats?.recent50 || null,
      potentialElo,
    });
  } catch (error) {
    badge.classList.remove("is-positive", "is-negative", "is-neutral", "is-loading");
    badge.classList.add("is-error");
    badge.textContent = " (error)";
    console.error(`Failed to load FACEIT stats for ${nickname}:`, error);
  }

  return true;
}

function scanPlayers(): void {
  const cards = document.querySelectorAll(PLAYER_CARD_SELECTOR);
  let queuedCount = 0;

  cards.forEach((card) => {
    if (card.hasAttribute(PROCESSED_CARD_ATTR)) {
      return;
    }

    void hydratePlayerCard(card);
    queuedCount += 1;
  });

  if (queuedCount > 0) {
    console.log(`FACEIT potential elo: queued ${queuedCount} player cards`);
  }
}

function scheduleScan(): void {
  if (scanTimeoutId !== null) {
    window.clearTimeout(scanTimeoutId);
  }

  scanTimeoutId = window.setTimeout(() => {
    scanTimeoutId = null;
    scanPlayers();
  }, SCAN_DEBOUNCE_MS);
}

const observer = new MutationObserver((mutations) => {
  const shouldRescan = mutations.some((mutation) => {
    const addedNodes = Array.from(mutation.addedNodes);

    return addedNodes.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      if (node.classList.contains("potential-elo-badge")) {
        return false;
      }

      return true;
    });
  });

  if (shouldRescan) {
    scheduleScan();
  }
});

scanPlayers();
observer.observe(document.body, {
  childList: true,
  subtree: true,
});
