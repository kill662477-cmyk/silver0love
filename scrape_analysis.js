const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const TARGETS_FILE = path.join(__dirname, "targets.json");

function loadTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf-8"));
    const list = Array.isArray(raw) ? raw : (raw.items || []);

    console.log("TARGETS loaded:", list.length);

    return list;
  } catch (e) {
    console.error("targets.json 읽기 실패:", e.message);
    return [];
  }
}

const TARGETS = loadTargets()
  .filter(t => t.enabled !== false)
  .filter(t => t.analysisEnabled !== false)
  .filter(t => t.name && t.userId && t.gender)
  .map(t => ({
    ...t,
    poongUrl: t.poongUrl || `https://poong.today/broadcast/${t.userId}`
  }));

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!TARGETS.length) {
    console.log("분석 대상 없음");
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const results = [];

  for (const target of TARGETS) {
    const page = await browser.newPage();

    try {
      await page.goto(target.poongUrl, { waitUntil: "networkidle2" });

      await sleep(2000);

      const body = await page.evaluate(() => document.body.innerText);

      const viewers = body.match(/누적 시청자\s*(\d+)/)?.[1] || "";

      results.push({
        name: target.name,
        userId: target.userId,
        monthlyViewers: viewers,
        monthlyRecord: "전적없음",
        monthlyWinRate: "-"
      });

    } catch (e) {
      console.log("ERROR:", target.name);
    }

    await page.close();
  }

  await browser.close();

  fs.writeFileSync("analysis.json", JSON.stringify({
    checkedAt: new Date().toISOString(),
    items: results
  }, null, 2));

  console.log("analysis.json 저장 완료");
}

main();
