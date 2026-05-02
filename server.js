const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const SOOP_CLIENT_ID = process.env.SOOP_CLIENT_ID || "";

const TARGETS_FILE = path.join(__dirname, "targets.json");

// targets.json 읽기
function loadTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf-8"));
    const list = Array.isArray(raw) ? raw : (raw.items || []);

    return list
      .filter(t => t.enabled !== false)
      .filter(t => t.liveEnabled !== false)
      .filter(t => t.userId)
      .map(t => ({
        name: t.name || t.userId,
        userId: t.userId
      }));
  } catch (e) {
    console.error("[TARGETS LOAD ERROR]", e.message);
    return [];
  }
}

function getLiveTargets() {
  const list = loadTargets();

  return {
    ids: list.map(t => t.userId),
    names: Object.fromEntries(
      list.map(t => [t.userId, t.name || t.userId])
    )
  };
}

// 캐시
let cache = {
  statuses: {},
  lives: [],
  checkedAt: null,
  sourcePagesChecked: 0,
  refreshMs: 12000,
  targetCount: 0
};

let isRefreshing = false;

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// 공식 broad/list 호출
async function fetchBroadList(pageNo = 1) {
  const response = await axios.get("https://openapi.sooplive.com/broad/list", {
    params: {
      client_id: SOOP_CLIENT_ID,
      page_no: pageNo
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "*/*"
    },
    timeout: 8000
  });

  return response.data;
}

// 백그라운드 갱신
async function refreshStatuses() {
  if (!SOOP_CLIENT_ID) {
    throw new Error("SOOP_CLIENT_ID is missing");
  }

  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const { ids: TARGETS, names: DISPLAY_NAMES } = getLiveTargets();

    if (!TARGETS.length) {
      cache = {
        statuses: {},
        lives: [],
        checkedAt: new Date().toISOString(),
        sourcePagesChecked: 0,
        refreshMs: 12000,
        targetCount: 0,
        error: "targets.json에 liveEnabled 대상이 없습니다."
      };

      console.log("[LIVE REFRESH] no live targets");
      return;
    }

    const remaining = new Set(TARGETS);
    const liveMap = new Map();

    const MAX_PAGES = 100;
    const PAGE_BATCH = 3;

    let pagesChecked = 0;

    for (let startPage = 1; startPage <= MAX_PAGES; startPage += PAGE_BATCH) {
      const pageNumbers = [];

      for (let i = 0; i < PAGE_BATCH; i++) {
        const pageNo = startPage + i;
        if (pageNo <= MAX_PAGES) {
          pageNumbers.push(pageNo);
        }
      }

      const results = await Promise.all(
        pageNumbers.map(pageNo =>
          fetchBroadList(pageNo).catch(err => {
            console.error(`[BROAD LIST ERROR] page=${pageNo}`, err.message);
            return null;
          })
        )
      );

      for (const data of results) {
        if (!data) continue;

        const broadList = Array.isArray(data?.broad) ? data.broad : [];
        pagesChecked++;

        if (!broadList.length) continue;

        for (const item of broadList) {
          const id = item.user_id;
          if (!id) continue;

          if (remaining.has(id)) {
            liveMap.set(id, {
              userId: id,
              userNick: item.user_nick || DISPLAY_NAMES[id] || id,
              displayName: DISPLAY_NAMES[id] || item.user_nick || id,
              title: item.broad_title || "",
              broadNo: item.broad_no || "",
              thumbnail: item.broad_thumb
                ? (
                    String(item.broad_thumb).startsWith("//")
                      ? "https:" + item.broad_thumb
                      : item.broad_thumb
                  )
                : "",
              startTime: item.broad_start || "",
              totalViewCnt: item.total_view_cnt || "0",
              profileImg: item.profile_img
                ? (
                    String(item.profile_img).startsWith("//")
                      ? "https:" + item.profile_img
                      : item.profile_img
                  )
                : "",
              stationUrl: `https://www.sooplive.com/station/${id}`,
              playUrl: item.broad_no
                ? `https://play.sooplive.com/${id}/${item.broad_no}`
                : `https://play.sooplive.com/${id}`
            });

            remaining.delete(id);
          }
        }
      }

      if (remaining.size === 0) {
        break;
      }
    }

    const statuses = {};
    const lives = [];

    for (const id of TARGETS) {
      const info = liveMap.get(id);
      statuses[id] = !!info;

      if (info) {
        lives.push(info);
      }
    }

    cache = {
      statuses,
      lives,
      checkedAt: new Date().toISOString(),
      sourcePagesChecked: pagesChecked,
      refreshMs: 12000,
      targetCount: TARGETS.length,
      cached: false
    };

    console.log(
      `[LIVE REFRESH] checkedAt=${cache.checkedAt}, targets=${TARGETS.length}, pages=${pagesChecked}, liveCount=${lives.length}`
    );
  } catch (error) {
    console.error("[LIVE REFRESH ERROR]", error.message);

    cache = {
      ...cache,
      checkedAt: cache.checkedAt || new Date().toISOString(),
      error: error.message
    };
  } finally {
    isRefreshing = false;
  }
}

// 현재 대상 확인용
app.get("/targets", (req, res) => {
  const { ids, names } = getLiveTargets();

  res.json({
    count: ids.length,
    ids,
    names
  });
});

// 사용자는 캐시만 즉시 받음
app.get("/live-status", (req, res) => {
  return res.json({
    statuses: cache.statuses,
    lives: cache.lives,
    checkedAt: cache.checkedAt,
    sourcePagesChecked: cache.sourcePagesChecked,
    refreshMs: cache.refreshMs,
    targetCount: cache.targetCount,
    cached: true,
    error: cache.error || null
  });
});

// 강제 갱신용
app.get("/refresh", async (req, res) => {
  try {
    await refreshStatuses();

    res.json({
      ok: true,
      statuses: cache.statuses,
      lives: cache.lives,
      checkedAt: cache.checkedAt,
      sourcePagesChecked: cache.sourcePagesChecked,
      targetCount: cache.targetCount,
      error: cache.error || null
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

// 헬스체크
app.get("/", (req, res) => {
  res.send("SOOP live status cache server is running.");
});

// 시작
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    await refreshStatuses();
  } catch (e) {
    console.error("Initial refresh failed:", e.message);
  }

  setInterval(() => {
    refreshStatuses();
  }, 12000);
});
