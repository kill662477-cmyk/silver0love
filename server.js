const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 10000;

// 🔥 테스트용 (소주양 1명만)
const NOTICE_TARGETS = [
  { name: "소주양", userId: "soju2022", bbsNo: "94261720" }
];

let browser = null;

// 기본 딜레이
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 브라우저 1개만 유지
async function getBrowser() {
  if (browser) return browser;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ]
  });

  return browser;
}

// 크롤링
async function crawl(target) {
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20000
    });

    await sleep(1500);

    const data = await page.evaluate(() => {
      const result = [];

      document.querySelectorAll("a").forEach(a => {
        const href = a.href || "";
        const text = (a.innerText || "").trim();

        if (!href.includes("/board/")) return;
        if (!text) return;

        result.push({
          title: text,
          link: href
        });
      });

      return result.slice(0, 5);
    });

    return data;

  } catch (e) {
    return { error: e.message };
  } finally {
    await page.close();
  }
}

// API
app.get("/notices", async (req, res) => {
  try {
    const target = NOTICE_TARGETS[0];

    const result = await crawl(target);

    res.json({
      success: true,
      count: result.length,
      items: result
    });

  } catch (e) {
    res.status(500).json({
      error: "Failed",
      detail: e.message
    });
  }
});

// 기본 확인
app.get("/", (req, res) => {
  res.send("OK");
});

// 🚨 중요: 초기 크롤링 없음
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});