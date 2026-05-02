const fs = require("fs");
const puppeteer = require("puppeteer");

const TARGETS_FILE = "targets.json";

function loadTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf-8"));
    const list = Array.isArray(raw) ? raw : raw.items;

    return list
      .filter(t => t.enabled !== false)
      .filter(t => t.noticeEnabled !== false)
      .filter(t => t.bbsNo);
  } catch (e) {
    console.error("targets.json 읽기 실패:", e.message);
    return [];
  }
}

const TARGETS = loadTargets();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!TARGETS.length) {
    console.log("크롤링 대상 없음");
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const collected = [];

  for (const target of TARGETS) {
    const page = await browser.newPage();

    const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

    try {
      await page.goto(url, { waitUntil: "networkidle2" });

      await sleep(2000);

      const items = await page.evaluate((target) => {
        const anchors = Array.from(
          document.querySelectorAll(`a[href*="/station/${target.userId}/post/"]`)
        );

        return anchors.slice(0, 5).map(a => ({
          writer: target.name,
          userId: target.userId,
          summary: a.innerText,
          link: a.href
        }));
      }, target);

      collected.push(...items);

    } catch (e) {
      console.log("ERROR:", target.name);
    }

    await page.close();
  }

  await browser.close();

  fs.writeFileSync("notices.json", JSON.stringify({
    checkedAt: new Date().toISOString(),
    items: collected
  }, null, 2));

  console.log("notices.json 저장 완료");
}

main();
