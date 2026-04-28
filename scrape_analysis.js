const fs = require("fs");
const puppeteer = require("puppeteer");

const OUTPUT_FILE = "analysis.json";
const FAILED_FILE = "elo_failed.json";

const TARGETS = [
  { name: "김윤환", userId: "brainzerg7", gender: "men", poongUrl: "https://poong.today/broadcast/brainzerg7" },
  { name: "이경민", userId: "rudals5467", gender: "men", poongUrl: "https://poong.today/broadcast/rudals5467" },
  { name: "박수범", userId: "jihoon002", gender: "men", poongUrl: "https://poong.today/broadcast/jihoon002" },
  { name: "사테", userId: "hoonykkk", gender: "men", poongUrl: "https://poong.today/broadcast/hoonykkk" },
  { name: "박준오", userId: "h78ert", gender: "men", poongUrl: "https://poong.today/broadcast/h78ert" },
  { name: "지동원", userId: "rondobba", gender: "men", poongUrl: "https://poong.today/broadcast/rondobba" },
  { name: "배성흠", userId: "goodzerg", gender: "men", poongUrl: "https://poong.today/broadcast/goodzerg" },
  { name: "파도튜브", userId: "kthrs9207", gender: "men", eloSource: "pado", poongUrl: "https://poong.today/broadcast/kthrs9207" },

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
  { name: "진땅콩", userId: "wlswn6565", gender: "women", poongUrl: "https://poong.today/broadcast/wlswn6565" },
  { name: "낭니", userId: "sksmsskdsl10", gender: "women", poongUrl: "https://poong.today/broadcast/sksmsskdsl10" }
];

const ELO_URLS = {
  men: "https://eloboard.com/men/bbs/board.php?bo_table=rank_list",
  women: "https://eloboard.com/women/bbs/board.php?bo_table=rank_list",
  pado: "https://eloboard.com/women/bbs/board.php?bo_table=mix_rank_list"
};

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
  "진땅콩": "진땅콩",
  "낭니": "낭니"
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

function loadPrevData() {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) return { items: [] };
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  } catch (e) {
    console.log("기존 analysis.json 읽기 실패:", e.message);
    return { items: [] };
  }
}

function getPrevItem(prevData, name) {
  return (prevData.items || []).find(v => v.name === name) || {};
}

async function preparePage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1365, height: 900 });

  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);

  return page;
}

async function scrapePoong(page, target) {
  await page.goto(target.poongUrl, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  const body = await page.evaluate(() => document.body.innerText);

  return {
    monthlyBroadcastTime: extractMetric(body, "방송 시간"),
    monthlyViewers: extractMetric(body, "누적 시청자"),
    monthlyPoong: extractMetric(body, "누적 별풍선"),
    peakViewers: extractMetric(body, "최고 시청자")
  };
}

async function scrapePoongWithRetry(browser, target, prev) {
  for (let i = 0; i < 3; i++) {
    const page = await preparePage(browser);

    try {
      console.log(`POONG TRY ${i + 1}: ${target.name}`);

      const data = await scrapePoong(page, target);

      await page.close();

      return {
        monthlyBroadcastTime: data.monthlyBroadcastTime || prev.monthlyBroadcastTime || "",
        monthlyViewers: data.monthlyViewers || prev.monthlyViewers || "",
        monthlyPoong: data.monthlyPoong || prev.monthlyPoong || "",
        peakViewers: data.peakViewers || prev.peakViewers || ""
      };
    } catch (e) {
      console.log(`POONG ERROR ${target.name} try=${i + 1}:`, e.message);
      await page.close().catch(() => {});
      await sleep(3000 + i * 2000);
    }
  }

  console.log(`POONG FALLBACK 기존값 유지: ${target.name}`);

  return {
    monthlyBroadcastTime: prev.monthlyBroadcastTime || "",
    monthlyViewers: prev.monthlyViewers || "",
    monthlyPoong: prev.monthlyPoong || "",
    peakViewers: prev.peakViewers || ""
  };
}

async function scrapeEloRankPage(page, url, sourceName) {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(6000);

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("tr"))
      .map((tr, idx) => ({
        index: idx,
        text: (tr.innerText || "").replace(/\s+/g, " ").trim()
      }))
      .filter(row => row.text);
  });

  console.log(`ELO ${sourceName} loaded. rows=${rows.length}`);

  if (!rows || rows.length < 5) {
    throw new Error(`ELO ${sourceName} rows too small: ${rows.length}`);
  }

  return rows;
}

async function scrapeEloWithRetry(browser, source) {
  const url = ELO_URLS[source];

  for (let i = 0; i < 3; i++) {
    const page = await preparePage(browser);

    try {
      console.log(`ELO TRY ${i + 1}: ${source}`);

      const rows = await scrapeEloRankPage(page, url, source);

      await page.close();

      return {
        ok: true,
        rows,
        error: ""
      };
    } catch (e) {
      console.log(`ELO ERROR ${source} try=${i + 1}:`, e.message);
      await page.close().catch(() => {});
      await sleep(4000 + i * 3000);
    }
  }

  return {
    ok: false,
    rows: [],
    error: `ELO ${source} 최종 실패`
  };
}

function parseEloRow(rowText) {
  const text = cleanText(rowText);

  const rankMatch = text.match(/^(\d+)\.\s*/);
  if (!rankMatch) return null;

  const afterRank = text.replace(/^(\d+)\.\s*/, "");
  const parts = afterRank.split(" ").filter(Boolean);
  if (!parts.length) return null;

  let playerToken = parts[0];
  let race = "";

  if (parts[1] && /^[ZPT]$/i.test(parts[1])) {
    race = parts[1].toUpperCase();
  } else if (/[ZPT]$/i.test(playerToken)) {
    race = playerToken.slice(-1).toUpperCase();
    playerToken = playerToken.slice(0, -1);
  }

  playerToken = normalizeName(playerToken);

  const recordMatch = text.match(/(\d+\s*전\s*\d+\s*승\s*\d+\s*패)/);
  const rateMatch = text.match(/(\d+(?:\.\d+)?%)/);

  return {
    raw: text,
    rank: rankMatch[1],
    playerName: playerToken,
    race,
    monthlyRecord: recordMatch ? cleanText(recordMatch[1]) : "",
    monthlyWinRate: rateMatch ? cleanText(rateMatch[1]) : ""
  };
}

function findMonthlyRecordFromRows(rows, playerName) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const target = normalizeName(getEloSearchName(playerName));
  const parsedRows = rows.map(r => parseEloRow(r.text)).filter(Boolean);

  const exact = parsedRows.find(row => row.playerName === target);

  if (exact && exact.monthlyRecord && exact.monthlyWinRate) {
    return {
      monthlyRecord: exact.monthlyRecord,
      monthlyWinRate: exact.monthlyWinRate,
      debugRow: exact.raw
    };
  }

  return null;
}

async function main() {
  const prevData = loadPrevData();
  const failed = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const eloRows = {
    men: [],
    women: [],
    pado: []
  };

  const eloStatus = {
    men: false,
    women: false,
    pado: false
  };

  for (const source of ["men", "women", "pado"]) {
    const result = await scrapeEloWithRetry(browser, source);

    eloRows[source] = result.rows;
    eloStatus[source] = result.ok;

    if (!result.ok) {
      failed.push({
        type: "elo_source",
        source,
        reason: result.error
      });
    }
  }

  const results = [];

  for (const target of TARGETS) {
    const prev = getPrevItem(prevData, target.name);

    const poongData = await scrapePoongWithRetry(browser, target, prev);

    const eloKey = target.eloSource || target.gender;
    const eloData = findMonthlyRecordFromRows(eloRows[eloKey], target.name);

    let monthlyRecord = "";
    let monthlyWinRate = "";

    if (eloData) {
      monthlyRecord = eloData.monthlyRecord;
      monthlyWinRate = eloData.monthlyWinRate;
    } else {
      monthlyRecord = prev.monthlyRecord || "전적없음";
      monthlyWinRate = prev.monthlyWinRate || "-";

      failed.push({
        type: "elo_player",
        name: target.name,
        eloKey,
        reason: eloStatus[eloKey] ? "이름 매칭 실패 또는 파싱 실패 - 기존값 유지" : "ELO 소스 로딩 실패 - 기존값 유지",
        fallbackRecord: monthlyRecord,
        fallbackWinRate: monthlyWinRate
      });
    }

    const merged = {
      name: target.name,
      userId: target.userId,
      gender: target.gender,
      monthlyBroadcastTime: poongData.monthlyBroadcastTime || "",
      monthlyViewers: poongData.monthlyViewers || "",
      monthlyPoong: poongData.monthlyPoong || "",
      peakViewers: poongData.peakViewers || "",
      monthlyRecord,
      monthlyWinRate
    };

    console.log("RESULT:", merged);
    results.push(merged);
  }

  await browser.close();

  const output = {
    checkedAt: new Date().toISOString(),
    items: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  fs.writeFileSync(FAILED_FILE, JSON.stringify({
    checkedAt: new Date().toISOString(),
    failed
  }, null, 2), "utf-8");

  console.log(`${OUTPUT_FILE} saved`);
  console.log(`${FAILED_FILE} saved`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
