const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 10000;

const TARGET = { name: "소주양", userId: "soju2022", bbsNo: "94261720" };

let browser = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function crawlNotices(target) {
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      if (["image", "media", "font"].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await sleep(3000);

    const items = await page.evaluate((targetInfo) => {
      const links = Array.from(document.querySelectorAll("a"));
      const result = [];
      const seen = new Set();

      for (const a of links) {
        const href = a.href || "";
        const text = (a.innerText || "").trim();

        if (!href.includes(`/station/${targetInfo.userId}/post/`)) continue;
        if (!text) continue;
        if (seen.has(href)) continue;

        seen.add(href);

        const container = a.closest("li, article, div, tr");
        const blockText = (container?.innerText || text).replace(/\s+/g, " ").trim();

        const dateMatch = blockText.match(/\d{4}-\d{2}-\d{2}|\d{4}\.\d{2}\.\d{2}/);

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          title: text.split("\n")[0].replace(/^Notice/, "").trim(),
          summary: blockText.slice(0, 200),
          time: dateMatch ? dateMatch[0].replace(/\./g, "-") : "",
          link: href
        });
      }

      return result.slice(0, 10);
    }, target);

    await page.close();
    return { ok: true, url, items };
  } catch (e) {
    try { await page.close(); } catch (_) {}
    return { ok: false, url, error: e.message };
  }
}

app.get("/notices", async (req, res) => {
  try {
    const data = await crawlNotices(TARGET);
    res.json(data);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("OK");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});