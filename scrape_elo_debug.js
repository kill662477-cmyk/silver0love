const puppeteer = require("puppeteer");
const fs = require("fs");

const URLS = [
  {
    label: "men",
    url: "https://eloboard.com/men/bbs/board.php?bo_table=rank_list"
  },
  {
    label: "women",
    url: "https://eloboard.com/women/bbs/board.php?bo_table=rank_list"
  }
];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  for (const item of URLS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      await page.goto(item.url, {
        waitUntil: "networkidle2",
        timeout: 45000
      });

      await new Promise(r => setTimeout(r, 5000));

      const title = await page.title();

      const info = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table")).map((table, idx) => ({
          index: idx,
          text: (table.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1000)
        }));

        const trs = Array.from(document.querySelectorAll("tr")).slice(0, 30).map((tr, idx) => ({
          index: idx,
          text: (tr.innerText || "").replace(/\s+/g, " ").trim()
        }));

        return {
          bodyText: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000),
          tableCount: document.querySelectorAll("table").length,
          trCount: document.querySelectorAll("tr").length,
          tables,
          trs
        };
      });

      await page.screenshot({ path: `elo_${item.label}.png`, fullPage: true });
      fs.writeFileSync(`elo_${item.label}.json`, JSON.stringify({ title, ...info }, null, 2), "utf-8");

      console.log("====", item.label, "====");
      console.log("TITLE:", title);
      console.log("TABLE COUNT:", info.tableCount);
      console.log("TR COUNT:", info.trCount);
      console.log("FIRST TRS:", info.trs.slice(0, 5));
    } catch (e) {
      console.log("ERROR:", item.label, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main().catch(console.error);
