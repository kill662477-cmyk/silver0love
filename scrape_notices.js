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
    .trim();
}

function getPostNo(link) {
  const m = String(link || "").match(/\/post\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function normalizeTimeText(text) {
  const t = String(text || "").trim();
  if (!t) return "";

  const kr = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
  if (kr) return kr[1].replace(/\s+/g, "");

  const en = t.match(
    /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
  );
  if (en) return en[1].replace(/\s+/g, " ").trim();

  const abs = t.match(
    /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
  );
  if (abs) {
    return abs[1]
      .replace(/\//g, "-")
      .replace(/\./g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function cleanSummaryText(summary, item) {
  let s = cleanText(summary);

  // ✔ 시간만 제거 (이것만 유지)
  if (item.time) {
    const escaped = item.time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }

  // ✔ 공백 정리만
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

async function crawlTarget(browser, target) {
  const page = await browser.newPage();
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000
    });

    await sleep(2500);

    const items = await page.evaluate((targetInfo) => {
      function normalize(str) {
        return String(str || "").replace(/\s+/g, " ").trim();
      }

      function pickTime(text) {
        const t = normalize(text);

        const kr = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
        if (kr) return kr[1].replace(/\s+/g, "");

        const en = t.match(
          /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
        );
        if (en) return en[1].replace(/\s+/g, " ").trim();

        const abs = t.match(
          /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
        );
        if (abs) {
          return abs[1]
            .replace(/\//g, "-")
            .replace(/\./g, "-")
            .replace(/\s+/g, " ")
            .trim();
        }

        return "";
      }

      function findCardRoot(anchor) {
        return (
          anchor.closest("li") ||
          anchor.closest("article") ||
          anchor.closest("div")
        );
      }

      const anchors = Array.from(
        document.querySelectorAll(`a[href*="/station/${targetInfo.userId}/post/"]`)
      );

      const result = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href || "";
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const card = findCardRoot(a);
        const cardText = normalize(card?.innerText || "");
        const ownText = normalize(a.innerText || "");

        if (!cardText && !ownText) continue;

        const time = pickTime(cardText);

        let summary = ownText || cardText;

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
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
      items: items.map(item => {
        const normalized = {
          stationName: item.stationName,
          writer: item.writer,
          userId: item.userId,
          time: normalizeTimeText(item.time),
          link: item.link,
          postNo: getPostNo(item.link)
        };

        normalized.summary = cleanSummaryText(item.summary, normalized).slice(0, 220);

        return normalized;
      })
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
    args: ["--no-sandbox"]
  });

  const collected = [];

  for (const target of TARGETS) {
    const result = await crawlTarget(browser, target);
    if (result.ok) collected.push(...result.items);
    await sleep(1000);
  }

  await browser.close();

  const deduped = Array.from(new Map(collected.map(i => [i.link, i])).values());
  deduped.sort((a, b) => b.postNo - a.postNo);

  const output = {
    checkedAt: new Date().toISOString(),
    visibleCount: 10,
    items: deduped.slice(0, 10).map(({ postNo, ...rest }) => rest)
  };

  fs.writeFileSync("notices.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("done");
}

main();
