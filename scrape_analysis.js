const fs = require("fs");
const puppeteer = require("puppeteer");

const TEST_TARGETS = [
  {
    name: "김윤환",
    userId: "brainzerg7",
    gender: "men",
    poongUrl: "https://poong.today/broadcast/brainzerg7"
  },
  {
    name: "비타밍",
    userId: "seemin88",
    gender: "women",
    poongUrl: "https://poong.today/broadcast/seemin88"
  }
];

const ELO_URLS = {
  men: "https://eloboard.com/men/bbs/board.php?bo_table=rank_list",
  women: "https://eloboard.com/women/bbs/board.php?bo_table=rank_list"
};

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractMetric(body, label) {
  const lines = String(body || "")
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean);

  const idx = lines.findIndex(line => line === label);
  if (idx === -1) return "";

  return cleanText(lines[idx + 1] || "");
}

async function scrapePoong(page, target) {
  await page.goto(target.poongUrl, {
    waitUntil: "networkidle2",
    timeout: 45000
  });

  await new Promise(r => setTimeout(r, 2500));

  const body = await page.evaluate(() => document.body.innerText);

  return {
    monthlyBroadcastTime: extractMetric(body, "방송 시간"),
    monthlyViewers: extractMetric(body, "누적 시청자"),
    monthlyPoong: extractMetric(body, "누적 별풍선"),
    peakViewers: extractMetric(body, "최고 시청자")
  };
}

async function scrapeEloRankPage(page, url) {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 45000
  });

  await new Promise(r => setTimeout(r, 2500));

  const body = await page.evaluate(() => document.body.innerText);
  return body;
}

function findMonthlyRecordFromBody(body, playerName) {
  const lines = String(body || "")
    .split("\n")
    .map(v => cleanText(v))
    .filter(Boolean);

  const idx = lines.findIndex(line => line.includes(playerName));
  if (idx === -1) {
    return {
      monthlyRecord: "전적없음",
      monthlyWinRate: "-"
    };
  }

  const slice = lines.slice(idx, idx + 12).join(" | ");

  // 예: 12전 8승 4패 / 66.7%
  const recordMatch = slice.match(/(\d+\s*전\s*\d+\s*승\s*\d+\s*패)/);
  const rateMatch = slice.match(/(\d+(?:\.\d+)?\s*%)/);

  return {
    monthlyRecord: recordMatch ? cleanText(recordMatch[1]) : "전적없음",
    monthlyWinRate: rateMatch ? cleanText(rateMatch[1]) : "-"
  };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const eloBodies = {
    men: "",
    women: ""
  };

  // 1. eloboard 남/여 페이지 먼저 읽기
  for (const gender of ["men", "women"]) {
    const page = await browser.newPage();
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      eloBodies[gender] = await scrapeEloRankPage(page, ELO_URLS[gender]);
      console.log(`ELO ${gender} page loaded`);
    } catch (e) {
      console.log(`ELO ${gender} ERROR:`, e.message);
      eloBodies[gender] = "";
    } finally {
      await page.close();
    }
  }

  // 2. 풍투데이 + 전적 합치기
  const results = [];

  for (const target of TEST_TARGETS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      const poongData = await scrapePoong(page, target);
      const eloData = findMonthlyRecordFromBody(eloBodies[target.gender], target.name);

      const merged = {
        name: target.name,
        userId: target.userId,
        gender: target.gender,
        monthlyBroadcastTime: poongData.monthlyBroadcastTime || "",
        monthlyViewers: poongData.monthlyViewers || "",
        monthlyPoong: poongData.monthlyPoong || "",
        peakViewers: poongData.peakViewers || "",
        monthlyRecord: eloData.monthlyRecord,
        monthlyWinRate: eloData.monthlyWinRate
      };

      console.log("RESULT:", merged);
      results.push(merged);
    } catch (e) {
      console.log("ERROR:", target.name, e.message);
      results.push({
        name: target.name,
        userId: target.userId,
        gender: target.gender,
        monthlyBroadcastTime: "",
        monthlyViewers: "",
        monthlyPoong: "",
        peakViewers: "",
        monthlyRecord: "전적없음",
        monthlyWinRate: "-",
        error: e.message
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const output = {
    checkedAt: new Date().toISOString(),
    items: results
  };

  fs.writeFileSync("analysis_test.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("analysis_test.json saved");
}

main().catch(console.error);
