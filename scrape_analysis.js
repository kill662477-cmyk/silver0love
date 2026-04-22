const fs = require("fs");
const puppeteer = require("puppeteer");

const TARGETS = [
  { name: "김윤환", userId: "brainzerg7", gender: "men", poongUrl: "https://poong.today/broadcast/brainzerg7" },
  { name: "이경민", userId: "rudals5467", gender: "men", poongUrl: "https://poong.today/broadcast/rudals5467" },
  { name: "박수범", userId: "jihoon002", gender: "men", poongUrl: "https://poong.today/broadcast/jihoon002" },
  { name: "사테", userId: "hoonykkk", gender: "men", poongUrl: "https://poong.today/broadcast/hoonykkk" },
  { name: "박준오", userId: "h78ert", gender: "men", poongUrl: "https://poong.today/broadcast/h78ert" },
  { name: "지동원", userId: "rondobba", gender: "men", poongUrl: "https://poong.today/broadcast/rondobba" },
  { name: "배성흠", userId: "goodzerg", gender: "men", poongUrl: "https://poong.today/broadcast/goodzerg" },
  { name: "파도튜브", userId: "kthrs9207", gender: "men",eloSource:"pado", poongUrl: "https://poong.today/broadcast/kthrs9207" },

  { name: "토마토", userId: "freshtomato", gender: "women", poongUrl: "https://poong.today/broadcast/freshtomato" },
  { name: "지두두", userId: "wjswlgns09", gender: "women", poongUrl: "https://poong.today/broadcast/wjswlgns09" },
  { name: "햇살", userId: "thelddl", gender: "women", poongUrl: "https://poong.today/broadcast/thelddl" },
  { name: "찌킹", userId: "alaelddl97", gender: "women", poongUrl: "https://poong.today/broadcast/alaelddl97" },
  { name: "치리", userId: "db001202", gender: "women", poongUrl: "https://poong.today/broadcast/db001202" },
  { name: "주하랑", userId: "fpahsdltu1", gender: "women", poongUrl: "https://poong.today/broadcast/fpahsdltu1" },
  { name: "소주양", userId: "soju2022", gender: "women", poongUrl: "https://poong.today/broadcast/soju2022" },
  { name: "임조이", userId: "dlaguswl501", gender: "women", poongUrl: "https://poong.today/broadcast/dlaguswl501" },
  { name: "비타밍", userId: "seemin88", gender: "women", poongUrl: "https://poong.today/broadcast/seemin88" },
  { name: "먼진", userId: "2meonjin", gender: "women", poongUrl: "https://poong.today/broadcast/2meonjin" },
  { name: "아리송이", userId: "vldpfm2", gender: "women", poongUrl: "https://poong.today/broadcast/vldpfm2" },
  { name: "진땅콩", userId: "wlswn6565", gender: "women", poongUrl: "https://poong.today/broadcast/wlswn6565" }
];

const ELO_URLS = {
  men: "https://eloboard.com/men/bbs/board.php?bo_table=rank_list",
  women: "https://eloboard.com/women/bbs/board.php?bo_table=rank_list",
  pado : "https://eloboard.com/women/bbs/board.php?bo_table=mix_rank_list"
};

// eloboard 표기명이 다를 수 있는 멤버만 여기서 조정
const ELO_NAME_MAP = {
  "김윤환": "김윤환",
  "이경민": "이경민",
  "박수범": "박수범",
  "사테": "김태영",
  "박준오": "박준오",
  "지동원": "지동원",
  "배성흠": "배성흠",
  "파도튜브": "파도튜브",

  "토마토": "토마토",
  "지두두": "지두두",
  "햇살": "햇살",
  "찌킹": "찌킹",
  "치리": "치리",
  "주하랑": "주하랑",
  "소주양": "소주양",
  "임조이": "임조이",
  "비타밍": "비타밍",
  "먼진": "먼진",
  "아리송이": "아리송이",
  "진땅콩": "진땅콩"
};

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
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
  const rankMatch = text.match(/^(\d+)\.\s*/);
  if (!rankMatch) return null;

  const afterRank = text.replace(/^(\d+)\.\s*/, "");
  const firstToken = afterRank.split(" ")[0] || "";

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
  const parsedRows = rows.map(r => parseEloRow(r.text)).filter(Boolean);

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
    women: [],
    pado: []
  };

 for (const source of ["men", "women", "pado"]) {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    eloRows[source] = await scrapeEloRankPage(page, ELO_URLS[source]);
    console.log(`ELO ${source} loaded. rows=${eloRows[source].length}`);
  } catch (e) {
    console.log(`ELO ${source} ERROR:`, e.message);
    eloRows[source] = [];
  } finally {
    await page.close();
  }
}

  const results = [];

  for (const target of TARGETS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      const poongData = await scrapePoong(page, target);
      const eloData = findMonthlyRecordFromRows(eloRows[target.gender], target.name);

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
        monthlyWinRate: "-"
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
