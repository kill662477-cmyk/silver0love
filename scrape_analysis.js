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

// 실제 eloboard 표기명이 다르면 여기서 별칭 조정
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
    .replace(/[🌈💜❤♥♡★☆!]/g, "")
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

function parseEloRow(rowText) {
  const text = cleanText(rowText);

  // 예:
  // 83. 비타밍T 3승 5패 4승 5패 0승 0패 17전 7승 10패 41.2% 1117.9
  const rankMatch = text.match(/^(\d+)\.\s*/);
  if (!rankMatch) return null;

  const afterRank = text.replace(/^(\d+)\.\s*/, "");
  const firstToken = afterRank.split(" ")[0] || "";

  // 이름+종족 토큰에서 종족 한 글자 제거
  let playerToken = firstToken;
  let race = "";

  if (/[ZPT]$/.test(playerToken)) {
    race = playerToken.slice(-1);
    playerToken = playerToken.slice(0, -1);
  }

  playerToken = normalizeName(playerToken);

  const recordMatch = text.match(/(\d+\s*전\s*\d+\s*승\s*\d+\s*패)/);
  const rateMatch = text.match(/(\d+(?:\.\d+)?%)/);

  return {
    raw: text,
    rank: rankMatch ? rankMatch[1] : "",
    playerName: playerToken,
    race,
    monthlyRecord: recordMatch ? cleanText(recordMatch[1]) : "전적없음",
    monthlyWinRate: rateMatch ? cleanText(rateMatch[1]) : "-"
  };
}

function findMonthlyRecordFromRows(rows, playerName) {
  const target = normalizeName(getEloSearchName(playerName));
  const parsedRows = rows
    .map(r => parseEloRow(r.text))
    .filter(Boolean);

  // 정확히 이름 일치하는 행만 찾기
  const exact = parsedRows.find(row => row.playerName === target);
  if (exact) {
    return {
      monthlyRecord: exact.monthlyRecord,
      monthlyWinRate: exact.monthlyWinRate,
      debugRow: exact.raw
    };
  }

  return {
    monthlyRecord: "전적없음",
    monthlyWinRate: "-",
    debugRow: "name not found"
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
