const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 10000;

// 공지 대상
const NOTICE_TARGETS = [
  { name: "김윤환", userId: "brainzerg7", bbsNo: "54143154" },
  { name: "이경민", userId: "rudals5467", bbsNo: "65249107" },
  { name: "박준오", userId: "h78ert", bbsNo: "1489236" },
  { name: "박수범", userId: "jihoon002", bbsNo: "106970519" },
  { name: "사테", userId: "hoonykkk", bbsNo: "1371967" },
  { name: "지동원", userId: "rondobba", bbsNo: "40202570" },
  { name: "배성흠", userId: "goodzerg", bbsNo: "58482962" },
  { name: "파도튜브", userId: "kthrs9207", bbsNo: "여기입력" },
  { name: "토마토", userId: "freshtomato", bbsNo: "여기입력" },
  { name: "지두두", userId: "wjswlgns09", bbsNo: "여기입력" },
  { name: "햇살", userId: "thelddl", bbsNo: "여기입력" },
  { name: "찌킹", userId: "alaelddl97", bbsNo: "여기입력" },
  { name: "치리", userId: "db001202", bbsNo: "여기입력" },
  { name: "주하랑", userId: "fpahsdltu1", bbsNo: "여기입력" },
  { name: "소주양", userId: "soju2022", bbsNo: "94261720" },
  { name: "임조이", userId: "dlaguswl501", bbsNo: "여기입력" },
  { name: "비타밍", userId: "seemin88", bbsNo: "여기입력" },
  { name: "먼진", userId: "2meonjin", bbsNo: "여기입력" },
  { name: "아리송이", userId: "vldpfm2", bbsNo: "여기입력" },
  { name: "진땅콩", userId: "wlswn6565", bbsNo: "여기입력" }
];

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

let browser = null;
let noticeRefreshing = false;
let noticeRefreshPromise = null;

let noticeCache = {
  items: [],
  checkedAt: null,
  expiresAt: 0,
  debug: {
    skipped: [],
    failed: [],
    success: []
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toTimestamp(v) {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

async function getBrowser() {
  if (browser) return browser;

  browser = await puppeteer.launch({
    headless: "new",
    executablePath: "/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  return browser;
}

async function crawlBoardList(target) {
  const result = {
    items: [],
    error: null
  };

  if (!target.bbsNo || target.bbsNo === "여기입력") {
    result.error = "missing bbsNo";
    return result;
  }

  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    await page.waitForTimeout(2000);

    const items = await page.evaluate((targetInfo) => {
      const links = Array.from(document.querySelectorAll("a"));
      const found = [];
      const seen = new Set();

      for (const a of links) {
        const href = a.href || "";
        const text = (a.innerText || "").trim();

        if (!href || !text) continue;
        if (!href.includes(`/station/${targetInfo.userId}/board/${targetInfo.bbsNo}`)) continue;
        if (seen.has(href)) continue;

        seen.add(href);

        let container = a.closest("li, tr, article, div");
        let blockText = container ? (container.innerText || "") : "";
        blockText = blockText.replace(/\s+/g, " ").trim();

        const dateMatch = blockText.match(/\d{4}[-.]\d{2}[-.]\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?/);

        found.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
          title: text,
          time: dateMatch ? dateMatch[0].replace(/\./g, "-") : "",
          summary: blockText.slice(0, 180),
          link: href
        });
      }

      return found.slice(0, 3);
    }, target);

    result.items = items;
    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  } finally {
    try {
      await page.close();
    } catch (_) {}
  }
}

async function doRefreshNotices() {
  const debug = {
    skipped: [],
    failed: [],
    success: []
  };

  const collected = [];

  for (const target of NOTICE_TARGETS) {
    if (!target.bbsNo || target.bbsNo === "여기입력") {
      debug.skipped.push({
        userId: target.userId,
        reason: "missing bbsNo"
      });
      continue;
    }

    const { items, error } = await crawlBoardList(target);

    if (error) {
      debug.failed.push({
        userId: target.userId,
        reason: error
      });
    } else {
      debug.success.push({
        userId: target.userId,
        count: items.length
      });
      collected.push(...items);
    }

    // 512MB 보호용
    await sleep(800);
  }

  const dedupedMap = new Map();
  for (const item of collected) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const deduped = Array.from(dedupedMap.values()).map(item => ({
    ...item,
    timestamp: toTimestamp(item.time)
  }));

  deduped.sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.title.localeCompare(b.title);
  });

  const visibleItems = deduped.slice(0, 10).map(({ timestamp, ...rest }) => rest);

  noticeCache = {
    items: visibleItems,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    debug
  };

  return noticeCache;
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
        debug: noticeCache.debug
      });
    }

    const data = await refreshNoticesSafe();

    return res.json({
      items: data.items,
      checkedAt: data.checkedAt,
      cached: false,
      visibleCount: data.items.length,
      debug: data.debug
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch notices",
      detail: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("SOOP notice server is running.");
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    await refreshNoticesSafe();
  } catch (e) {
    console.error("Initial notice refresh failed:", e.message);
  }
});