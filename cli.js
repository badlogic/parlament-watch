#!/usr/bin/env node

const ParliamentScraper = require('./scraper');

function showUsage() {
  console.log(`
Austrian Parliament Absence Scraper

Usage:
  node cli.js <period> [session]
  node cli.js <period> [start] [end]
  node cli.js --help

Arguments:
  period    Legislative period (e.g., XXVIII, XXVII, etc.)
  session   Single session number to scrape
  start     Start session number (default: 1)
  end       End session number (default: auto-detect until 404)

Examples:
  node cli.js XXVIII              # Scrape all XXVIII sessions
  node cli.js XXVIII 5            # Scrape only XXVIII session 5
  node cli.js XXVIII 5 10         # Scrape XXVIII sessions 5-10

Output:
  Results saved to: parliament_absences_<period>.json
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showUsage();
    process.exit(0);
  }
  
  const period = args[0];
  let startSession = 1;
  let endSession = null;
  
  if (!period.match(/^[A-Z]+$/)) {
    console.error('Error: Period must be in Roman numerals (e.g., XXVIII)');
    process.exit(1);
  }
  
  if (args.length === 2) {
    // Single session: node cli.js XXVIII 5
    startSession = parseInt(args[1]);
    endSession = startSession;
  } else if (args.length === 3) {
    // Range: node cli.js XXVIII 5 10
    startSession = parseInt(args[1]);
    endSession = parseInt(args[2]);
  }
  // else: args.length === 1, scrape all sessions (default values)
  
  console.log(`Scraping period ${period}${endSession && endSession === startSession ? ` session ${startSession}` : ` from session ${startSession}${endSession ? ` to ${endSession}` : ' until 404'}`}...`);
  
  const scraper = new ParliamentScraper();
  scraper.period = period; // Override default XXVIII
  scraper.sessionPattern = `/gegenstand/${period}/NRSITZ/{session}?selectedStage=111`;
  
  const filename = `parliament_absences_${period}.json`;
  scraper.outputFile = filename; // Set output file for intermediate saves
  
  await scraper.scrapeAllSessions(startSession, endSession);
  
  scraper.saveResults(filename);
  scraper.generateReport();
  
  // Generate HTML report
  const { generateHTML } = require('./generate-html');
  const htmlFilename = `parliament_absences_${period}.html`;
  
  // Create data structure for HTML generation
  const htmlData = {
    sessions: scraper.results,
    activeMembersByParty: scraper.activeMembersByParty ? Object.fromEntries(scraper.activeMembersByParty) : null,
    scrapedAt: new Date().toISOString()
  };
  
  generateHTML(htmlData, htmlFilename);
  
  // Open HTML report in browser
  const { exec } = require('child_process');
  const path = require('path');
  const fullPath = path.resolve(htmlFilename);
  
  const openCommand = process.platform === 'win32' ? 'start' : 
                     process.platform === 'darwin' ? 'open' : 'xdg-open';
  
  exec(`${openCommand} "${fullPath}"`, (error) => {
    if (error) {
      console.log(`Could not open browser automatically: ${error.message}`);
    } else {
      console.log('Opening report in browser...');
    }
  });
  
  console.log(`\nDone! Results saved to ${filename}`);
  console.log(`HTML report generated: ${htmlFilename}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}