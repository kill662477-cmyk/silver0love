const fs = require("fs");
const puppeteer = require("puppeteer");

const TARGETS = [
  { name: "소주양", userId: "soju2022", bbsNo: "94261720" }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^Notice\s*/i, "")
    .trim();
}

function getPostNo(link) {
  const m = String(link || "").match(/\/post\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function crawlTarget(browser, target) {
  const page = await browser.newPage();
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000
    });

    await sleep(2500);

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

        const titleRaw = fullText.split("\n")[0] || fullText;
        const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2}|\d{4}\.\d{2}\.\d{2}/);

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
          title: titleRaw,
          summary: fullText,
          time: dateMatch ? dateMatch[0].replace(/\./g, "-") : "",
          link: href
        });
      }

      return result.slice(0, 5);
    }, target);

    return {
      ok: true,
      userId: target.userId,
      items: items.map(item => ({
        ...item,
        title: cleanText(item.title).slice(0, 120),
        summary: cleanText(item.summary).slice(0, 220),
        postNo: getPostNo(item.link)
      }))
    };
  } catch (error) {
    return {
      ok: false,
      userId: target.userId,
      error: error.message,
      items: []
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const debug = {
    success: [],
    failed: []
  };

  const collected = [];

  for (const target of TARGETS) {
    const result = await crawlTarget(browser, target);

    if (result.ok) {
      debug.success.push({
        userId: result.userId,
        count: result.items.length
      });
      collected.push(...result.items);
    } else {
      debug.failed.push({
        userId: result.userId,
        reason: result.error
      });
    }

    await sleep(1000);
  }

  await browser.close();

  const dedupedMap = new Map();
  for (const item of collected) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const deduped = Array.from(dedupedMap.values());
  deduped.sort((a, b) => b.postNo - a.postNo);

  const visibleItems = deduped.slice(0, 10).map(({ postNo, ...rest }) => rest);

  const output = {
    checkedAt: new Date().toISOString(),
    visibleCount: visibleItems.length,
    items: visibleItems,
    debug
  };

  fs.writeFileSync("notices.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("notices.json updated");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
