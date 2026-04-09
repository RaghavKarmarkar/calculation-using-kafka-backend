const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const htmlPath = path.resolve(__dirname, 'sequence-diagram.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for Mermaid to render
  await page.waitForSelector('svg', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const outputPath = path.resolve(__dirname, 'Sequence-Diagram.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  });

  console.log(`PDF generated: ${outputPath}`);
  await browser.close();
})();
