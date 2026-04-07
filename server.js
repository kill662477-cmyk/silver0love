const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

/**
 * -----------------------------
 * LIVE STATUS
 * -----------------------------
 */
const TARGETS = [
  "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207", "freshtomato",
  "wjswlgns09", "thelddl", "alaelddl97", "db001202", "fpahsdltu1",
  "soju2022", "dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565"
];

let liveCache = { statuses: {}, checkedAt: null, expiresAt: 0 };

async function checkUser(userId) {
  try {
    const response = await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": `https://www.sooplive.com/station/${userId}`
      },
      timeout: 3000
    });

    const data = response.data;
    const isLive = !!(
      data?.station?.is_broad ||
      (data?.broad?.broad_no && data?.broad?.broad_no !== 0)
    );

    return { userId, isLive };
  } catch (e) {
    return { userId, isLive: false };
  }
}

app.get("/live-status", async (req, res) => {
  if (Date.now() < liveCache.expiresAt && liveCache.checkedAt) {
    return res.json({
      statuses: liveCache.statuses,
      checkedAt: liveCache.checkedAt,
      cached: true
    });
  }

  const newStatuses = {};
  const chunks = [];

  for (let i = 0; i < TARGETS.length; i += 5) {
    chunks.push(TARGETS.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(id => checkUser(id)));
    results.forEach(r => {
      newStatuses[r.userId] = r.isLive;
    });
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  liveCache = {
    statuses: newStatuses,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + 15000
  };

  res.json({
    statuses: liveCache.statuses,
    checkedAt: liveCache.checkedAt,
    cached: false
  });
});

/**
 * -----------------------------
 * NOTICES
 * -----------------------------
 * bbsNo 전부 실제 숫자로 채워야 함
 */
const NOTICE_TARGETS = [
  { name: "김윤환", userId: "brainzerg7", bbsNo: "54143154" },
  { name: "이경민", userId: "rudals5467", bbsNo: "65249107" },
  { name: "박준오", userId: "h78ert", bbsNo: "1489236" },
  { name: "박수범", userId: "jihoon002", bbsNo: "106970519" },
  { name: "사테", userId: "hoonykkk", bbsNo: "1371967" },
  { name: "지동원", userId: "rondobba", bbsNo: "40202570" },
  { name: "배성흠", userId: "goodzerg", bbsNo: "58482962" },
  { name: "파도튜브", userId: "kthrs9207", bbsNo: "4130352" },
  { name: "토마토", userId: "freshtomato", bbsNo: "79127541" },
  { name: "지두두", userId: "wjswlgns09", bbsNo: "41739132" },
  { name: "햇살", userId: "thelddl", bbsNo: "19332732" },
  { name: "찌킹", userId: "alaelddl97", bbsNo: "66723840" },
  { name: "치리", userId: "db001202", bbsNo: "102538363" },
  { name: "주하랑", userId: "fpahsdltu1", bbsNo: "88012442" },
  { name: "소주양", userId: "soju2022", bbsNo: "94261520" },
  { name: "임조이", userId: "dlaguswl501", bbsNo: "101549531" },
  { name: "비타밍", userId: "seemin88", bbsNo: "105540651" },
  { name: "먼진", userId: "2meonjin", bbsNo: "119304089" },
  { name: "아리송이", userId: "vldpfm2", bbsNo: "89090859" },
  { name: "진땅콩", userId: "wlswn6565", bbsNo: "117225449" }
];

let noticeCache = {
  items: [],
  checkedAt: null,
  expiresAt: 0
};

let noticeRefreshing = false;
let noticeRefreshPromise = null;

let noticeDebug = {
  skipped: [],
  failed: [],
  success: []
};

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

function stripBr(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function toTimestamp(v) {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function normalizeNoticeItem(item, stationName) {
  const link = `https://www.sooplive.com/station/${item.user_id}/board/${item.bbs_no}/${item.title_no}`;

  return {
    titleNo: item.title_no,
    writer: item.user_nick || "",
    userId: item.user_id || "",
    stationName: stationName || "",
    title: item.title_name || "",
    time: item.reg_date || "",
    timestamp: toTimestamp(item.reg_date),
    summary:
      item.content && (item.content.summary || item.content.text_content)
        ? stripBr(item.content.summary || item.content.text_content)
        : "",
    text:
      item.content && item.content.text_content
        ? stripBr(item.content.text_content)
        : "",
    bbsName:
      item.display && item.display.bbs_name
        ? item.display.bbs_name
        : "",
    noticeYn: item.notice_yn || 0,
    boardType: item.board_type || null,
    pinned: !!(item.pin && item.pin.is_pin),
    profileImage: normalizeUrl(item.profile_image || ""),
    photoCount: item.photo_cnt || 0,
    photos: Array.isArray(item.photos)
      ? item.photos.map((p) => normalizeUrl(p.url || "")).filter(Boolean)
      : [],
    readCount: item.count ? item.count.read_cnt || 0 : 0,
    commentCount: item.count ? item.count.comment_cnt || 0 : 0,
    likeCount: item.count ? item.count.like_cnt || 0 : 0,
    link
  };
}

async function fetchNoticeBoard(userId, bbsNo, page = 1) {
  const url = `https://chapi.sooplive.com/api/${userId}/board/${bbsNo}?page=${page}`;

  const response = await axios.get(url, {
    timeout: 8000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Referer": `https://www.sooplive.com/station/${userId}/board/${bbsNo}`,
      "Origin": "https://www.sooplive.com"
    }
  });

  return response.data;
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;

  async function runner() {
    while (index < items.length) {
      const current = index++;
      try {
        const result = await worker(items[current], current);
        if (result) results.push(result);
      } catch (_) {}
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runner()
  );

  await Promise.all(workers);
  return results;
}

async function doRefreshNotices() {
  const collected = [];

  noticeDebug = {
    skipped: [],
    failed: [],
    success: []
  };

  await runWithConcurrency(NOTICE_TARGETS, 3, async (target) => {
    try {
      if (!target.bbsNo || target.bbsNo === "여기입력") {
        noticeDebug.skipped.push({
          userId: target.userId,
          reason: "missing bbsNo"
        });
        console.warn(`[notices] skip ${target.userId} - missing bbsNo`);
        return;
      }

      const json = await fetchNoticeBoard(target.userId, target.bbsNo, 1);

      const pinnedItems = Array.isArray(json.notice_data)
        ? json.notice_data.map(item => normalizeNoticeItem(item, target.name))
        : [];

      const boardItems = Array.isArray(json.data)
        ? json.data.map(item => normalizeNoticeItem(item, target.name))
        : [];

      collected.push(...pinnedItems, ...boardItems);

      noticeDebug.success.push({
        userId: target.userId,
        count: pinnedItems.length + boardItems.length
      });
    } catch (error) {
      noticeDebug.failed.push({
        userId: target.userId,
        reason: error.message,
        status: error.response ? error.response.status : null,
        body: error.response && error.response.data ? error.response.data : null
      });
      console.error(`[notices] failed for ${target.userId}: ${error.message}`);
    }
  });

  const dedupedMap = new Map();
  for (const item of collected) {
    if (!dedupedMap.has(item.titleNo)) {
      dedupedMap.set(item.titleNo, item);
    }
  }

  const deduped = Array.from(dedupedMap.values());
  deduped.sort((a, b) => b.timestamp - a.timestamp);

  const visibleItems = deduped.slice(0, 10);

  noticeCache = {
    items: visibleItems,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  return {
    items: noticeCache.items,
    checkedAt: noticeCache.checkedAt,
    totalCollected: deduped.length,
    visibleCount: visibleItems.length
  };
}

async function refreshNoticesSafe() {
  if (noticeRefreshing && noticeRefreshPromise) {
    return noticeRefreshPromise;
  }

  noticeRefreshing = true;
  noticeRefreshPromise = doRefreshNotices().finally(() => {
    noticeRefreshing = false;
    noticeRefreshPromise = null;
  });

  return noticeRefreshPromise;
}

app.get("/notices", async (req, res) => {
  try {
    if (Date.now() < noticeCache.expiresAt && noticeCache.checkedAt) {
      return res.json({
        items: noticeCache.items,
        checkedAt: noticeCache.checkedAt,
        cached: true,
        visibleCount: noticeCache.items.length,
        debug: noticeDebug
      });
    }

    const data = await refreshNoticesSafe();

    return res.json({
      items: data.items,
      checkedAt: data.checkedAt,
      cached: false,
      totalCollected: data.totalCollected,
      visibleCount: data.visibleCount,
      debug: noticeDebug
    });
  } catch (error) {
    if (noticeCache.checkedAt) {
      return res.json({
        items: noticeCache.items,
        checkedAt: noticeCache.checkedAt,
        cached: true,
        stale: true,
        error: error.message,
        visibleCount: noticeCache.items.length,
        debug: noticeDebug
      });
    }

    return res.status(500).json({
      error: "Failed to fetch notices",
      detail: error.message,
      debug: noticeDebug
    });
  }
});

app.get("/", (req, res) => {
  res.send("SOOP backend is running.");
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));