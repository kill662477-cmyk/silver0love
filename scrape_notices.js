const fs = require("fs");
const puppeteer = require("puppeteer");

const TARGETS = [
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

  { name: "소주양", userId: "soju2022", bbsNo: "94261520" },

  { name: "임조이", userId: "dlaguswl501", bbsNo: "101549531" },

  { name: "비타밍", userId: "seemin88", bbsNo: "105540651" },

  { name: "먼진", userId: "2meonjin", bbsNo: "119304089" },

  { name: "아리송이", userId: "vldpfm2", bbsNo: "89090859" },

  { name: "진땅콩", userId: "wlswn6565", bbsNo: "117225449" }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^Notice\s*/i, "")
    .trim();
}

function getPostNo(link) {
  const m = String(link || "").match(/\/post\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function normalizeTimeText(text) {
  const t = String(text || "").trim();

  if (!t) return "";

  const relativeMatch = t.match(
    /(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)$/i
  );
  if (relativeMatch) return relativeMatch[1].replace(/\s+/g, "");

  const absoluteMatch = t.match(
    /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
  );
  if (absoluteMatch) {
    return absoluteMatch[1]
      .replace(/\//g, "-")
      .replace(/\./g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

async function crawlTarget(browser, target) {
  const page = await browser.newPage();
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

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
      function textOf(el) {
        return (el?.innerText || "").replace(/\s+/g, " ").trim();
      }

      function cleanInlineText(str) {
        return String(str || "").replace(/\s+/g, " ").trim();
      }

      function findCardRoot(anchor) {
        return (
          anchor.closest("li") ||
          anchor.closest("article") ||
          anchor.closest('[class*="post"]') ||
          anchor.closest('[class*="list"]') ||
          anchor.closest("div")
        );
      }

      function pickTime(text) {
        const relative = text.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/);
        if (relative) return relative[1].replace(/\s+/g, "");

        const absolute = text.match(/(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/);
        if (absolute) {
          return absolute[1]
            .replace(/\//g, "-")
            .replace(/\./g, "-")
            .replace(/\s+/g, " ")
            .trim();
        }

        return "";
      }

      const anchors = Array.from(document.querySelectorAll(`a[href*="/station/${targetInfo.userId}/post/"]`));
      const result = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href || "";
        if (!href) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const card = findCardRoot(a);
        const cardText = cleanInlineText(textOf(card));
        const ownText = cleanInlineText(textOf(a));

        let title = ownText;
        let summary = "";
        let time = "";

        const lines = cardText
          .split(/\n+/)
          .map(v => cleanInlineText(v))
          .filter(Boolean);

        // 기본 시간 추출
        time = pickTime(cardText);

        // 제목 후보 추출
        if (ownText) {
          title = ownText;
        } else {
          const titleCandidate = lines.find(line =>
            line &&
            !line.includes("공지사항") &&
            !line.includes("게시판") &&
            !line.match(/조회|댓글|좋아요/) &&
            !pickTime(line)
          );
          title = titleCandidate || "";
        }

        // summary 후보: 카드 텍스트에서 제목 다음 내용 느낌의 줄
        const filteredLines = lines.filter(line => {
          if (!line) return false;
          if (line === title) return false;
          if (line.includes("공지사항")) return false;
          if (line.includes("게시판")) return false;
          if (line.match(/^\d+\s*$/)) return false;
          return true;
        });

        const titleIndex = filteredLines.findIndex(v => v === title);
        if (titleIndex >= 0 && filteredLines[titleIndex + 1]) {
          summary = filteredLines[titleIndex + 1];
        }

        if (!summary) {
          const withoutMeta = cardText
            .replace(title, "")
            .replace(time, "")
            .replace(/\b(조회|댓글|좋아요)\b/g, "")
            .trim();
          summary = withoutMeta;
        }

        title = cleanInlineText(title)
          .replace(/^공지\s*/g, "")
          .replace(/^Notice\s*/gi, "")
          .trim();

        summary = cleanInlineText(summary)
          .replace(/^공지\s*/g, "")
          .replace(/^Notice\s*/gi, "")
          .trim();

        if (!title && !summary) continue;

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
          title,
          summary,
          time,
          link: href
        });
      }

      return result.slice(0, 5);
    }, target);

    return {
      ok: true,
      userId: target.userId,
      items: items.map(item => ({
        ...item,
        title: cleanText(item.title).slice(0, 120),
        summary: cleanText(item.summary).slice(0, 220),
        time: normalizeTimeText(item.time),
        postNo: getPostNo(item.link)
      }))
    };
  } catch (error) {
    return {
      ok: false,
      userId: target.userId,
      error: error.message,
      items: []
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const debug = {
    success: [],
    failed: [],
    skipped: []
  };

  const collected = [];

  for (const target of TARGETS) {
    if (!target.bbsNo || target.bbsNo === "여기입력") {
      debug.skipped.push({
        userId: target.userId,
        reason: "missing bbsNo"
      });
      continue;
    }

    const result = await crawlTarget(browser, target);

    if (result.ok) {
      debug.success.push({
        userId: result.userId,
        count: result.items.length
      });
      collected.push(...result.items);
    } else {
      debug.failed.push({
        userId: result.userId,
        reason: result.error
      });
    }

    await sleep(1000);
  }

  await browser.close();

  const dedupedMap = new Map();
  for (const item of collected) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const deduped = Array.from(dedupedMap.values());
  deduped.sort((a, b) => b.postNo - a.postNo);

  const visibleItems = deduped.slice(0, 10).map(({ postNo, ...rest }) => rest);

  const output = {
    checkedAt: new Date().toISOString(),
    visibleCount: visibleItems.length,
    items: visibleItems,
    debug
  };

  fs.writeFileSync("notices.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("notices.json updated");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
