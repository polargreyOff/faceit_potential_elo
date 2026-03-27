import {faceit_api_key} from "../options.json"
const API_KEY = faceit_api_key;
const FACEIT_API_BASE_URL = "https://open.faceit.com/data/v4";
const FACEIT_GAME = "cs2";

type FaceitPlayerResponse = {
  player_id?: string;
  nickname?: string;
};

type FaceitStatsResponse = {
  lifetime?: Record<string, string | undefined>;
};

type FaceitMatchStatsItem = {
  stats?: Record<string, string | number | undefined>;
};

type FaceitMatchStatsResponse = {
  items?: FaceitMatchStatsItem[];
};

type RecentWindowStats = {
  requestedMatches: number;
  matchesAnalyzed: number;
  averageAdr: number | null;
  averageKdRatio: number | null;
  averageKrRatio: number | null;
};

type BackgroundPlayerApiStats = {
  playerId: string | null;
  nickname: string | null;
  matches: string | null;
  totalMatches: string | null;
  adr: string | null;
  averageKdRatio: string | null;
  recent20: RecentWindowStats | null;
  recent50: RecentWindowStats | null;
};

type FetchPlayerStatsMessage = {
  type: "FACEIT_FETCH_PLAYER_STATS";
  nickname: string;
};

type BackgroundFetchPlayerStatsResponse =
  | { ok: true; data: BackgroundPlayerApiStats }
  | { ok: false; error: string };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

async function fetchPlayerByNickname(nickname: string): Promise<FaceitPlayerResponse> {
  const encodedNickname = encodeURIComponent(nickname);
  const url = `${FACEIT_API_BASE_URL}/players?nickname=${encodedNickname}&game=${FACEIT_GAME}`;

  return fetchJson<FaceitPlayerResponse>(url);
}

async function fetchPlayerStats(playerId: string): Promise<FaceitStatsResponse> {
  const url = `${FACEIT_API_BASE_URL}/players/${playerId}/stats/${FACEIT_GAME}`;

  return fetchJson<FaceitStatsResponse>(url);
}

async function fetchRecentPlayerMatches(playerId: string, limit: number): Promise<FaceitMatchStatsResponse> {
  const url = `${FACEIT_API_BASE_URL}/players/${playerId}/games/${FACEIT_GAME}/stats?limit=${limit}`;

  return fetchJson<FaceitMatchStatsResponse>(url);
}

function parseStatNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalizedValue = String(value)
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace("%", "")
    .replace(",", ".");

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);

  return Number((sum / values.length).toFixed(2));
}

function buildRecentWindowStats(limit: number, response: FaceitMatchStatsResponse): RecentWindowStats {
  const items = response.items || [];
  const adrValues: number[] = [];
  const kdValues: number[] = [];
  const krValues: number[] = [];

  items.forEach((item) => {
    const stats = item.stats || {};
    const adr = parseStatNumber(stats["ADR"]);
    const kdRatio = parseStatNumber(stats["K/D Ratio"]);
    const krRatio = parseStatNumber(stats["K/R Ratio"]);

    if (adr !== null) {
      adrValues.push(adr);
    }

    if (kdRatio !== null) {
      kdValues.push(kdRatio);
    }

    if (krRatio !== null) {
      krValues.push(krRatio);
    }
  });

  return {
    requestedMatches: limit,
    matchesAnalyzed: items.length,
    averageAdr: calculateAverage(adrValues),
    averageKdRatio: calculateAverage(kdValues),
    averageKrRatio: calculateAverage(krValues),
  };
}

function mapLifetimeStats(player: FaceitPlayerResponse, statsResponse: FaceitStatsResponse): BackgroundPlayerApiStats {
  const lifetime = statsResponse.lifetime || {};

  return {
    playerId: player.player_id || null,
    nickname: player.nickname || null,
    matches: lifetime["Matches"] || null,
    totalMatches: lifetime["Total Matches"] || null,
    adr: lifetime["ADR"] || null,
    averageKdRatio: lifetime["Average K/D Ratio"] || null,
    recent20: null,
    recent50: null,
  };
}

chrome.runtime.onMessage.addListener((
  message: FetchPlayerStatsMessage,
  _sender,
  sendResponse: (response: BackgroundFetchPlayerStatsResponse) => void,
) => {
  if (message?.type !== "FACEIT_FETCH_PLAYER_STATS") {
    return false;
  }

  void (async () => {
    try {
      const player = await fetchPlayerByNickname(message.nickname);
      const playerId = player.player_id;

      if (!playerId) {
        throw new Error(`Player ID not found for nickname "${message.nickname}"`);
      }

      const statsResponse = await fetchPlayerStats(playerId);
      const data = mapLifetimeStats(player, statsResponse);
      const totalMatches = parseStatNumber(data.totalMatches ?? data.matches ?? undefined);
      const recentRequests: Array<Promise<void>> = [];

      if (totalMatches !== null && totalMatches > 20) {
        recentRequests.push(
          fetchRecentPlayerMatches(playerId, 20).then((response) => {
            data.recent20 = buildRecentWindowStats(20, response);
          }),
        );
      }

      if (totalMatches !== null && totalMatches > 50) {
        recentRequests.push(
          fetchRecentPlayerMatches(playerId, 50).then((response) => {
            data.recent50 = buildRecentWindowStats(50, response);
          }),
        );
      }

      if (recentRequests.length > 0) {
        await Promise.all(recentRequests);
      }

      sendResponse({
        ok: true,
        data,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});
