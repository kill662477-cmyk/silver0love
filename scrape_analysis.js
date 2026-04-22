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

// 나중에 20명 확장할 때 별칭용으로 쓰면 됨
const ELO_NAME_MAP = {
  "김윤환": "김윤환",
  "비타밍": "비타밍"
};

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .trim();
}

function getEloSearchName(playerName) {
  return ELO_NAME_MAP[playerName] || playerName;
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

  await new Promise(r => setTimeout(r, 5000));

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("tr"))
      .map((tr, idx) => ({
        index: idx,
        text: (tr.innerText || "").replace(/\s+/g, " ").trim()
      }))
      .filter(row => row.text);
  });

  return rows;
}

function findMonthlyRecordFromRows(rows, playerName) {
  const target = normalizeName(getEloSearchName(playerName));

  const row = rows.find(r => {
    const text = normalizeName(r.text);
    return text.includes(target);
  });

  if (!row) {
    return {
      monthlyRecord: "전적없음",
      monthlyWinRate: "-",
      debugRow: "name not found"
    };
  }

  const text = cleanText(row.text);

  const recordMatch = text.match(/(\d+\s*전\s*\d+\s*승\s*\d+\s*패)/);
  const rateMatch = text.match(/(\d+(?:\.\d+)?%)/);

  return {
    monthlyRecord: recordMatch ? cleanText(recordMatch[1]) : "전적없음",
    monthlyWinRate: rateMatch ? cleanText(rateMatch[1]) : "-",
    debugRow: text
  };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const eloRows = {
    men: [],
    women: []
  };

  // 1. 남/여 ELO 월간 랭킹 페이지 읽기
  for (const gender of ["men", "women"]) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      eloRows[gender] = await scrapeEloRankPage(page, ELO_URLS[gender]);
      console.log(`ELO ${gender} page loaded. rows=${eloRows[gender].length}`);
    } catch (e) {
      console.log(`ELO ${gender} ERROR:`, e.message);
      eloRows[gender] = [];
    } finally {
      await page.close();
    }
  }

  // 2. 풍투데이 + eloboard 데이터 합치기
  const results = [];

  for (const target of TEST_TARGETS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      const poongData = await scrapePoong(page, target);
      const eloData = findMonthlyRecordFromRows(eloRows[target.gender], target.name);

      console.log("ELO DEBUG:", target.name, eloData.debugRow);

      const merged = {
        name: target.name,
        userId: target.userId,
        gender: target.gender,
        monthlyBroadcastTime: poongData.monthlyBroadcastTime || "",
        monthlyViewers: poongData.monthlyViewers || "",
        monthlyPoong: poongData.monthlyPoong || "",
        peakViewers: poongData.peakViewers || "",
        monthlyRecord: eloData.monthlyRecord,
        monthlyWinRate: eloData.monthlyWinRate,
        debugRow: eloData.debugRow
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
        debugRow: e.message,
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
