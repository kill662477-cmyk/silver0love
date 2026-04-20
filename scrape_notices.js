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

  // 한국어 상대시간
  const krRelativeMatch = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
  if (krRelativeMatch) {
    return krRelativeMatch[1].replace(/\s+/g, "");
  }

  // 영어 상대시간
  const enRelativeMatch = t.match(
    /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
  );
  if (enRelativeMatch) {
    return enRelativeMatch[1].replace(/\s+/g, " ").trim();
  }

  // 절대 날짜/시간
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

function cleanSummaryText(summary, item) {
  let s = cleanText(summary);

  if (!s) return "";

  // station / writer 제거
  const removableWords = [
    item.stationName,
    item.writer,
    "공지사항",
    "General Board",
    "방송공지",
    "방송일정공지",
    "공지",
    "Notice"
  ].filter(Boolean);

  for (const word of removableWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escaped, "gi"), " ");
  }

  // 시간 제거
  if (item.time) {
    const escapedTime = item.time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escapedTime, "gi"), " ");
  }

  // 메타 숫자 뭉치 제거 (좋아요/댓글/조회수 영역)
  s = s.replace(/\b\d{1,3}(?:,\d{3})*\b/g, " ");

  // 하트/이모지성 게시판 장식 제거
  s = s.replace(/[❤❤️♥♡★☆•·]+/g, " ");

  // title이 summary 안에 중복되면 제거
  if (item.title) {
    const escapedTitle = item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escapedTitle, "i"), " ");
  }

  s = s.replace(/\s+/g, " ").trim();

  return s;
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
      function normalize(str) {
        return String(str || "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function pickTime(text) {
        const t = normalize(text);

        const krRelative = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
        if (krRelative) return krRelative[1].replace(/\s+/g, "");

        const enRelative = t.match(
          /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
        );
        if (enRelative) return enRelative[1].replace(/\s+/g, " ").trim();

        const absolute = t.match(
          /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
        );
        if (absolute) {
          return absolute[1]
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
          anchor.closest('[class*="post"]') ||
          anchor.closest('[class*="list"]') ||
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
        if (!href) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const card = findCardRoot(a);
        const cardText = normalize(card?.innerText || "");
        const ownText = normalize(a.innerText || "");

        if (!cardText && !ownText) continue;

        const time = pickTime(cardText);

        let title = ownText;
        let summary = "";

        const lines = (card?.innerText || "")
          .split("\n")
          .map(v => normalize(v))
          .filter(Boolean);

        // 제목이 링크 텍스트로 잡히면 우선 사용
        if (!title) {
          const titleCandidate = lines.find(line =>
            line &&
            !line.includes("공지사항") &&
            !line.includes("게시판") &&
            !line.match(/^\d+$/) &&
            !pickTime(line)
          );
          title = titleCandidate || "";
        }

        // summary는 title 다음 줄 우선
        const lineIndex = lines.findIndex(v => v === title);
        if (lineIndex >= 0 && lines[lineIndex + 1]) {
          summary = lines[lineIndex + 1];
        }

        // 없으면 카드 전체에서 title/time 뺀 값
        if (!summary) {
          summary = cardText;
        }

        title = normalize(title)
          .replace(/^공지\s*/i, "")
          .replace(/^Notice\s*/i, "")
          .trim();

        summary = normalize(summary)
          .replace(/^공지\s*/i, "")
          .replace(/^Notice\s*/i, "")
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
      items: items.map(item => {
        const normalized = {
          ...item,
          title: cleanText(item.title).slice(0, 120),
          time: normalizeTimeText(item.time),
          postNo: getPostNo(item.link)
        };

        normalized.summary = cleanSummaryText(item.summary, normalized).slice(0, 220);

        // summary가 비면 title을 fallback
        if (!normalized.summary) {
          normalized.summary = normalized.title;
        }

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
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const debug = {
    success: [],
    failed: [],
    skipped: []
  };

  const collected = [];

  for (const target of TARGETS) {
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
