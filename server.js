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

async function crawlDebug(target) {
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    await sleep(3000);

    const result = await page.evaluate(() => {
      const title = document.title;

      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1500);

      const links = Array.from(document.querySelectorAll("a"))
        .map(a => ({
          text: (a.innerText || "").trim(),
          href: a.href || ""
        }))
        .filter(x => x.text || x.href)
        .slice(0, 30);

      const boardLike = Array.from(document.querySelectorAll("a"))
        .map(a => ({
          text: (a.innerText || "").trim(),
          href: a.href || ""
        }))
        .filter(x => x.href.includes("/board/"));

      return {
        title,
        bodyText,
        links,
        boardLikeCount: boardLike.length,
        boardLike: boardLike.slice(0, 20)
      };
    });

    return { ok: true, url, ...result };
  } catch (e) {
    return {
      ok: false,
      url,
      error: e.message
    };
  } finally {
    await page.close();
  }
}

app.get("/notices", async (req, res) => {
  try {
    const result = await crawlDebug(TARGET);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: "Failed",
      detail: e.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("OK");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});