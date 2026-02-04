#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const PORT = 4000;
const SITE_URL = `http://localhost:${PORT}/`;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'TimPevey_resume_2025.pdf');
const SITE_DIR = path.join(__dirname, '..', '_site');

// Check if --skip-build flag is passed
const skipBuild = process.argv.includes('--skip-build');

async function buildJekyll() {
  // Check if _site exists and skip-build is requested
  if (skipBuild) {
    if (fs.existsSync(SITE_DIR)) {
      console.log('Skipping Jekyll build (--skip-build flag, _site exists).');
      return;
    } else {
      console.log('Warning: --skip-build specified but _site does not exist.');
    }
  }

  console.log('Building Jekyll site...');
  try {
    execSync('bundle exec jekyll build', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('Jekyll build complete.');
  } catch (error) {
    // Check if _site exists from a previous build
    if (fs.existsSync(SITE_DIR)) {
      console.log('Jekyll build failed, but _site exists. Continuing with existing build.');
    } else {
      throw new Error('Jekyll build failed and no _site directory exists. Run "bundle exec jekyll build" first, or use --skip-build with an existing _site.');
    }
  }
}

function startServer() {
  console.log(`Starting server on port ${PORT}...`);
  const server = spawn('npx', ['serve', '_site', '-p', PORT.toString(), '-s', '-L'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: false
  });

  return server;
}

async function waitForServer(url, maxAttempts = 30) {
  const http = require('http');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Server did not become ready');
}

async function generatePDF() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Emulate print media to trigger @media print styles
  await page.emulateMediaType('print');

  console.log(`Navigating to ${SITE_URL}...`);
  await page.goto(SITE_URL, { waitUntil: 'networkidle0' });

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Debug: take screenshot to see what's rendered
  const screenshotPath = path.join(OUTPUT_DIR, 'debug-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Debug screenshot saved to ${screenshotPath}`);

  console.log(`Generating PDF to ${OUTPUT_FILE}...`);
  await page.pdf({
    path: OUTPUT_FILE,
    format: 'Letter',
    printBackground: true,
    margin: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in'
    }
  });

  await browser.close();
  console.log('PDF generated successfully!');
}

async function main() {
  let server = null;

  try {
    // Build Jekyll site
    await buildJekyll();

    // Start local server
    server = startServer();

    // Wait for server to be ready
    console.log('Waiting for server...');
    await waitForServer(SITE_URL);

    // Generate PDF
    await generatePDF();

    console.log(`\nPDF saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (server) {
      console.log('Stopping server...');
      server.kill();
    }
  }
}

main();
