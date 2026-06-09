const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

console.log('=== STARTING AUTOMATED PLAYWRIGHT BROWSER TESTS ===');

// Spin up a simple HTTP server to avoid CORS issues with file:// protocol
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]; // Strip query parameters
  let filePath = path.join(__dirname, urlPath === '/' ? 'app.html' : urlPath);
  
  // Resolve directory traversal for security
  filePath = path.resolve(filePath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  if (ext === '.css') contentType = 'text/css';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(9000, async () => {
  console.log('Local test server running on http://localhost:9000');
  
  let browser;
  let exitCode = 0;
  
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Capture page console logs for debugging
    page.on('console', msg => console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.toString()}`));
    page.on('requestfailed', req => {
      console.log(`[NETWORK ERROR] Request failed: ${req.url()} - Error: ${req.failure() ? req.failure().errorText : 'Unknown'}`);
    });
    
    // Mock SpeechRecognition API to support testing voice record triggering
    await page.addInitScript(() => {
      class MockSpeechRecognition {
        constructor() {
          this.continuous = false;
          this.lang = 'en-US';
          this.interimResults = false;
        }
        start() {
          setTimeout(() => {
            if (this.onstart) this.onstart();
          }, 50);
        }
        stop() {
          setTimeout(() => {
            if (this.onend) this.onend();
          }, 50);
        }
      }
      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    });
    
    console.log('Loading local application via HTTP server...');
    await page.goto('http://localhost:9000/app.html');
    
    // Wait for jQuery and base DOM to settle
    await page.waitForTimeout(2000);

    // 1. Verify QBasic Editor Layout exists
    const editorVisible = await page.isVisible('#qbasic-editor-content');
    console.log(`[TEST] QBasic Editor visible: ${editorVisible ? 'PASS' : 'FAIL'}`);
    if (!editorVisible) throw new Error('QBasic Editor not visible');

    // 2. Verify that Clippy.js script successfully loaded in context
    const clippyDefined = await page.evaluate(() => typeof window.clippy !== 'undefined');
    console.log(`[TEST] Clippy.js Library loaded in window context: ${clippyDefined ? 'PASS' : 'FAIL'}`);
    if (!clippyDefined) throw new Error('Clippy.js Library not defined');

    // 3. Wait for actual Clippy DOM agent to render on screen
    console.log('Waiting for Clippy agent DOM element to be generated...');
    const clippyAgentVisible = await page.waitForSelector('.clippy', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    console.log(`[TEST] Clippy Agent DOM element visible: ${clippyAgentVisible ? 'PASS' : 'FAIL'}`);
    if (!clippyAgentVisible) throw new Error('Clippy Agent DOM element not visible');

    // 3b. Test clicking on Clippy to trigger speech recording
    console.log('Testing click interaction on Clippy to start speech recording...');
    await page.click('.clippy');
    await page.waitForTimeout(500);
    const isListening = await page.evaluate(() => window.Speak2Compose.getIsSpeechListening());
    const trayText = await page.innerText('#mic-status');
    console.log(`[TEST] Clippy click starts speech recording: ${isListening ? 'PASS' : 'FAIL'} (Tray: ${trayText})`);
    if (!isListening || !trayText.includes('Listening')) {
      throw new Error('Clicking Clippy did not activate speech recognition state');
    }

    // 4. Verify z-index for Webamp overlay styles
    const webampZIndex = await page.evaluate(() => {
      const temp = document.createElement('div');
      temp.id = 'webamp';
      document.body.appendChild(temp);
      const z = window.getComputedStyle(temp).zIndex;
      document.body.removeChild(temp);
      return z;
    });
    console.log(`[TEST] Webamp Layering Order (z-index): ${webampZIndex} (Expected: 99999) -> ${webampZIndex === '99999' ? 'PASS' : 'FAIL'}`);
    if (webampZIndex !== '99999') throw new Error('Webamp layering order incorrect');

    // 5. Test Webamp Player launching and mounting
    console.log('Launching Webamp player...');
    await page.evaluate(() => window.Speak2Compose.toggleWebamp());
    
    console.log('Waiting for Webamp container to render content...');
    let webampRendered = false;
    let webampDomExists = false;
    
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      webampRendered = await page.evaluate(() => window.Speak2Compose.getWebampRendered());
      webampDomExists = await page.$('#webamp') !== null;
      const html = await page.innerHTML('#webamp-container');
      console.log(`[DEBUG] Second ${i+1}: Webamp Rendered in JS: ${webampRendered}, DOM Exists: ${webampDomExists}, Container HTML length: ${html.length}`);
      if (webampRendered && webampDomExists) break;
    }
    
    console.log(`[TEST] Webamp initialization and DOM render: ${webampRendered && webampDomExists ? 'PASS' : 'FAIL'}`);
    if (!webampRendered || !webampDomExists) throw new Error('Webamp player did not render');

    // 6. Test E2E Feature: Speech commands processing & Fuzzy Match
    console.log('Simulating spoken commands...');
    await page.evaluate(() => {
      window.Speak2Compose.processChainedCommands("give me a bass drum and add a snare");
    });
    await page.waitForTimeout(500);

    const isKickEnabled = await page.evaluate(() => window.Speak2Compose.getGenrePacks().popTechno.enabled.kick);
    const isSnareEnabled = await page.evaluate(() => window.Speak2Compose.getGenrePacks().popTechno.enabled.snare);
    const editorText = await page.innerText('#qbasic-editor-content');
    
    console.log(`[TEST] Speech fuzzy match transpiled: ${isKickEnabled && isSnareEnabled ? 'PASS' : 'FAIL'}`);
    console.log(`[TEST] Editor updated with transpiled code: ${editorText.includes('kick*4') && editorText.includes('snare') ? 'PASS' : 'FAIL'}`);
    if (!isKickEnabled || !isSnareEnabled || !editorText.includes('kick*4')) {
      throw new Error('Speech fuzzy match or code transpilation failed');
    }

    // 7. Test E2E Feature: Volume Modifiers
    console.log('Simulating volume adjustment...');
    const originalVol = await page.evaluate(() => window.Speak2Compose.getMixerChannels().kick.volume);
    await page.evaluate(() => {
      window.Speak2Compose.processChainedCommands("lower volume on kick");
    });
    const updatedVol = await page.evaluate(() => window.Speak2Compose.getMixerChannels().kick.volume);
    console.log(`[TEST] Volume modifier (lower volume on kick): ${updatedVol < originalVol ? 'PASS' : 'FAIL'} (${originalVol} -> ${updatedVol})`);
    if (updatedVol >= originalVol) throw new Error('Volume modifier failed');

    // 8. Test E2E Feature: BPM Adjustments
    console.log('Simulating tempo adjustment...');
    const originalTempo = await page.evaluate(() => window.Speak2Compose.getTempo());
    await page.evaluate(() => {
      window.Speak2Compose.processChainedCommands("make it faster");
    });
    const updatedTempo = await page.evaluate(() => window.Speak2Compose.getTempo());
    console.log(`[TEST] Tempo adjustment (make it faster): ${updatedTempo > originalTempo ? 'PASS' : 'FAIL'} (${originalTempo} -> ${updatedTempo})`);
    if (updatedTempo <= originalTempo) throw new Error('Tempo adjustment failed');

    // 9. Test E2E Feature: Webamp synthesizer controls (Play / Stop sync)
    console.log('Testing synthesizer play/stop state sync...');
    await page.evaluate(() => window.Speak2Compose.executeMusicCode());
    let isPlaying = await page.evaluate(() => window.Speak2Compose.getIsPlaying());
    console.log(`[TEST] Audio Synthesis Play state: ${isPlaying ? 'PASS' : 'FAIL'}`);
    if (!isPlaying) throw new Error('Synthesizer play state failed');

    await page.evaluate(() => window.Speak2Compose.stopMusicEngine());
    isPlaying = await page.evaluate(() => window.Speak2Compose.getIsPlaying());
    console.log(`[TEST] Audio Synthesis Stop state: ${!isPlaying ? 'PASS' : 'FAIL'}`);
    if (isPlaying) throw new Error('Synthesizer stop state failed');

    // 10. Run the internal diagnostics suite
    console.log('Triggering automated internal diagnostics suite...');
    await page.evaluate(() => {
      runDiagnosticTestSuite();
    });
    await page.waitForTimeout(1000);
    const diagText = await page.innerText('#qbasic-editor-content');
    const diagnosticsPassed = diagText.includes('ALL 4 DIAGNOSTIC TESTS PASSED');
    console.log(`[TEST] Diagnostic compilation check: ${diagnosticsPassed ? 'PASS' : 'FAIL'}`);
    if (!diagnosticsPassed) throw new Error('Internal diagnostic suite failed');

    console.log('=== ALL BRIDGED BROWSER TESTS PASSED SUCCESSFULLY ===');
    exitCode = 0;

  } catch (err) {
    console.error('=== BROWSER TESTS ENCOUNTERED FAILURES ===');
    console.error(err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(exitCode);
  }
});
