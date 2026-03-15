(async function() {

  const DELAY_MS = 100;   // ← adjust this if you get errors (try 200 if so)
  const TOTAL_PAGES = 503;
  const results = [];
  const seenCodes = new Set();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function scrapeWorkload(path) {
    const urlMatch = path.match(/\/courses\/([A-Z]+)(\d+[A-Z0-9]*)\/(\d+)\//i);
    const subject  = urlMatch ? urlMatch[1] : "";
    const num      = urlMatch ? urlMatch[2] : "";

    try {
      const res = await fetch(`https://atlas.ai.umich.edu${path}`, { credentials: "include" });
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, "text/html");
      const title = doc.querySelector('title')?.textContent?.replace(/^[^:]+:\s*/, '').trim() || "";

      let workload = null;
      for (const card of doc.querySelectorAll('.course-eval-card-container')) {
        if (card.querySelector('h4')?.textContent?.toLowerCase().includes('workload')) {
          const stat = card.querySelector('.eval-stat');
          if (stat) workload = parseInt(stat.textContent.trim());
          break;
        }
      }
      if (workload === null) {
        const m = (doc.body?.textContent || "").match(/(\d+)%\s*of respondents perceived the workload/i);
        if (m) workload = parseInt(m[1]);
      }

      return { subject, course_number: num, course_name: title, course_code: subject + num, workload_percent: workload ?? "N/A" };
    } catch(e) {
      return { subject, course_number: num, course_name: "", course_code: subject + num, workload_percent: "ERROR" };
    }
  }

  function downloadCSV(label) {
    const headers = ["Subject", "Course Number", "Course Name", "Course Code", "Workload %"];
    const rows = results.map(r => [
      `"${r.subject}"`,
      `"${r.course_number}"`,
      `"${(r.course_name || "").replace(/"/g, '""')}"`,
      `"${r.course_code}"`,
      `"${r.workload_percent}"`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `umich_atlas_workload_${label}.csv`
    }).click();
    console.log(`💾 Saved: ${results.length} courses → umich_atlas_workload_${label}.csv`);
  }

  console.log(`🚀 Scraping ${TOTAL_PAGES} pages × 32 courses = ~16,065 courses`);
  console.log(`   Estimated time: ~${Math.round(TOTAL_PAGES * 32 * DELAY_MS / 1000 / 60)} min`);
  console.log(`   Auto-saves every 10 pages. Don't close this tab!`);

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    let links = [];

    try {
      const res  = await fetch(`https://atlas.ai.umich.edu/courses/?page=${page}&sort=alpha`, { credentials: "include" });
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, "text/html");

      links = [...doc.querySelectorAll('a[href*="/courses/"]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h?.match(/\/courses\/[A-Z]/));

      if (links.length === 0) {
        history.pushState({}, '', `https://atlas.ai.umich.edu/courses/?page=${page}&sort=alpha`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await sleep(2500);
        links = [...document.querySelectorAll('a[href*="/courses/"]')]
          .map(a => a.getAttribute('href'))
          .filter(h => h?.match(/\/courses\/[A-Z]/));
      }
    } catch(e) {
      console.warn(`⚠️ Page ${page} failed:`, e.message);
      await sleep(2000);
      continue;
    }

    const newLinks = links.filter(l => !seenCodes.has(l));
    newLinks.forEach(l => seenCodes.add(l));
    console.log(`📄 Page ${page}/${TOTAL_PAGES} | ${newLinks.length} courses | Total: ${seenCodes.size}`);

    for (let i = 0; i < newLinks.length; i++) {
      results.push(await scrapeWorkload(newLinks[i]));
      await sleep(DELAY_MS);
    }

    console.log(`  ✅ Page ${page} done | Scraped: ${results.length}`);
    if (page % 10 === 0) downloadCSV(`checkpoint_p${page}`);
    await sleep(300);
  }

  downloadCSV("FINAL");
  const found = results.filter(r => r.workload_percent !== "N/A" && r.workload_percent !== "ERROR").length;
  console.log(`\n🎉 Done! ${results.length} total | ${found} with workload % | ${results.length - found} N/A`);

})();
