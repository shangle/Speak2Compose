const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('=== STARTING AUTOMATED PLAYWRIGHT BROWSER TESTS ===');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const fileUrl = `file://${path.resolve(__dirname, 'app.html')}`;
  console.log(`Loading local application URL: ${fileUrl}`);
  
  await page.goto(fileUrl);
  
  // Wait for JQuery and base document to resolve
  await page.waitForTimeout(1000);
  
  // 1. Verify QBasic Editor Layout exists
  const editorVisible = await page.isVisible('#qbasic-editor-content');
  console.log(`[TEST] QBasic Editor visible: ${editorVisible ? 'PASS' : 'FAIL'}`);
  
  // 2. Verify that Clippy.js script successfully loaded in context
  const clippyDefined = await page.evaluate(() => typeof window.clippy !== 'undefined');
  console.log(`[TEST] Clippy.js Library loaded in window context: ${clippyDefined ? 'PASS' : 'FAIL'}`);
  
  // 3. Verify z-index for Webamp overlay styles
  const webampZIndex = await page.evaluate(() => {
    // Check style sheets or create temp div to check computed style of #webamp target selector
    const temp = document.createElement('div');
    temp.id = 'webamp';
    document.body.appendChild(temp);
    const z = window.getComputedStyle(temp).zIndex;
    document.body.removeChild(temp);
    return z;
  });
  console.log(`[TEST] Webamp Layering Order (z-index): ${webampZIndex} (Expected: 99999) -> ${webampZIndex === '99999' ? 'PASS' : 'FAIL'}`);

  // 4. Run the internal diagnostics suite directly on the page and read the console output
  console.log('Triggering automated internal diagnostics suite...');
  await page.evaluate(() => {
    runDiagnosticTestSuite();
  });
  
  // Wait for diagnostics print-out typewriter time
  await page.waitForTimeout(1000);
  
  const editorText = await page.innerText('#qbasic-editor-content');
  const diagnosticsPassed = editorText.includes('ALL 4 DIAGNOSTIC TESTS PASSED');
  console.log(`[TEST] Internals diagnostic tests output: \n---\n${editorText}\n---`);
  console.log(`[TEST] Diagnostic compilation check: ${diagnosticsPassed ? 'PASS' : 'FAIL'}`);
  
  await browser.close();
  
  if (editorVisible && clippyDefined && webampZIndex === '99999' && diagnosticsPassed) {
    console.log('=== ALL BRIDGED BROWSER TESTS PASSED SUCCESSFULLY ===');
    process.exit(0);
  } else {
    console.error('=== BROWSER TESTS ENCOUNTERED FAILURES ===');
    process.exit(1);
  }
})();
