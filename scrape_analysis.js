const fs = require("fs");
const puppeteer = require("puppeteer");

const TEST_TARGETS = [
  { name: "김윤환", userId: "brainzerg7", poongUrl: "https://poong.today/broadcast/brainzerg7" },
  { name: "비타밍", userId: "seemin88", poongUrl: "https://poong.today/broadcast/seemin88" }
];

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractValue(body, label) {
  const regex = new RegExp(`${label}\\s*([\\s\\S]*?)(?=\\n|$)`, "i");
  const match = body.match(regex);
  if (!match) return "";

  return cleanText(match[1]);
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

  const monthlyPoong = extractMetric(body, "누적 별풍선");
  const peakViewers = extractMetric(body, "최고 시청자");
  const monthlyViewers = extractMetric(body, "누적 시청자");
  const broadcastTime = extractMetric(body, "방송 시간");

  return {
    name: target.name,
    userId: target.userId,
    monthlyBroadcastTime: broadcastTime,
    monthlyViewers,
    monthlyPoong,
    peakViewers
  };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const results = [];

  for (const target of TEST_TARGETS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      const data = await scrapePoong(page, target);
      console.log("RESULT:", data);
      results.push(data);
    } catch (e) {
      console.log("ERROR:", target.name, e.message);
      results.push({
        name: target.name,
        userId: target.userId,
        monthlyBroadcastTime: "",
        monthlyViewers: "",
        monthlyPoong: "",
        peakViewers: "",
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
