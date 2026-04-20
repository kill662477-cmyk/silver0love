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

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000
    });

    await sleep(3000);

    const items = await page.evaluate((targetInfo) => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const result = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href || "";
        if (!href.includes(`/station/${targetInfo.userId}/post/`)) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const ownText = (a.innerText || "").replace(/\s+/g, " ").trim();
        const parentText = (a.closest("li, article, div, tr")?.innerText || "")
          .replace(/\s+/g, " ")
          .trim();

        const fullText = ownText || parentText;
        if (!fullText) continue;

        const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2}|\d{4}\.\d{2}\.\d{2}/);

        let title = fullText.split("Notice").pop().trim();
        if (!title) title = fullText.slice(0, 60);

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          title: title,
          summary: fullText.slice(0, 220),
          time: dateMatch ? dateMatch[0].replace(/\./g, "-") : "",
          link: href
        });
      }

      return result.slice(0, 10);
    }, target);

    return { ok: true, url, items };
  } catch (e) {
    return { ok: false, url, error: e.message };
  } finally {
    try {
      await page.close();
    } catch (_) {}
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
  console.log(`Server running on ${PORT}`);
});