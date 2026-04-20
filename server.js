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
  { name: "파도튜브", userId: "kthrs9207", bbsNo: "4130352" },
  { name: "토마토", userId: "freshtomato", bbsNo: "79127541" },
  { name: "지두두", userId: "wjswlgns09", bbsNo: "41739132" },
  { name: "햇살", userId: "thelddl", bbsNo: "19332732" },
  { name: "찌킹", userId: "alaelddl97", bbsNo: "122264133" },
  { name: "치리", userId: "db001202", bbsNo: "102538363" },
  { name: "주하랑", userId: "fpahsdltu1", bbsNo: "88012442" },
  { name: "소주양", userId: "soju2022", bbsNo: "94261720" },
  { name: "임조이", userId: "dlaguswl501", bbsNo: "101549531" },
  { name: "비타밍", userId: "seemin88", bbsNo: "105540651" },
  { name: "먼진", userId: "2meonjin", bbsNo: "119304089" },
  { name: "아리송이", userId: "vldpfm2", bbsNo: "89090859" },
  { name: "진땅콩", userId: "wlswn6565", bbsNo: "117225449" }
];

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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^Notice\s*/i, "")
    .trim();
}

function getPostNo(link) {
  const m = String(link || "").match(/\/post\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function getBrowser() {
  if (browser) return browser;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ]
  });

  return browser;
}

async function crawlNotices(target) {
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000
    });

    await sleep(2500);

    const items = await page.evaluate((targetInfo) => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const result = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href || "";
        if (!href.includes(`/station/${targetInfo.userId}/post/`)) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const ownText = (a.innerText || "").replace(/\s+/g, " ").trim();
        const parentText = (a.closest("li, article, div, tr")?.innerText || "")
          .replace(/\s+/g, " ")
          .trim();

        const fullText = ownText || parentText;
        if (!fullText) continue;

        const titleRaw = fullText.split("\n")[0] || fullText;
        const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2}|\d{4}\.\d{2}\.\d{2}/);

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
          title: titleRaw,
          summary: fullText,
          time: dateMatch ? dateMatch[0].replace(/\./g, "-") : "",
          link: href
        });
      }

      return result.slice(0, 5);
    }, target);

    return { ok: true, url, items };
  } catch (e) {
    return { ok: false, url, error: e.message, items: [] };
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

    const result = await crawlNotices(target);

    if (!result.ok) {
      debug.failed.push({
        userId: target.userId,
        reason: result.error || "unknown error"
      });
    } else {
      debug.success.push({
        userId: target.userId,
        count: result.items.length
      });

      for (const item of result.items) {
        collected.push({
          ...item,
          title: cleanText(item.title).slice(0, 120),
          summary: cleanText(item.summary).slice(0, 220),
          postNo: getPostNo(item.link)
        });
      }
    }

    // Render 보호용
    await sleep(500);
  }

  const dedupedMap = new Map();
  for (const item of collected) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const deduped = Array.from(dedupedMap.values());

  // time이 없으니까 post 번호 기준으로 최신순 정렬
  deduped.sort((a, b) => b.postNo - a.postNo);

  const visibleItems = deduped.slice(0, 10).map(({ postNo, ...rest }) => rest);

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});