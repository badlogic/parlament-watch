#!/usr/bin/env node

const ParliamentScraper = require('./scraper');

function showUsage() {
  console.log(`
Austrian Parliament Absence Scraper

Usage:
  node cli.js <period> [start] [end]
  node cli.js --help

Arguments:
  period    Legislative period (e.g., XXVIII, XXVII, etc.)
  start     Start session number (default: 1)
  end       End session number (default: auto-detect until 404)

Examples:
  node cli.js XXVIII              # Scrape all XXVIII sessions
  node cli.js XXVII 1 20          # Scrape XXVII sessions 1-20
  node cli.js XXVIII 5            # Scrape XXVIII from session 5 until 404

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
  const startSession = parseInt(args[1]) || 1;
  const endSession = args[2] ? parseInt(args[2]) : null;
  
  if (!period.match(/^[A-Z]+$/)) {
    console.error('Error: Period must be in Roman numerals (e.g., XXVIII)');
    process.exit(1);
  }
  
  console.log(`Scraping period ${period} from session ${startSession}${endSession ? ` to ${endSession}` : ' until 404'}...`);
  
  const scraper = new ParliamentScraper();
  scraper.period = period; // Override default XXVIII
  scraper.sessionPattern = `/gegenstand/${period}/NRSITZ/{session}?selectedStage=111`;
  
  await scraper.scrapeAllSessions(startSession, endSession);
  
  const filename = `parliament_absences_${period}.json`;
  scraper.saveResults(filename);
  scraper.generateReport();
  
  console.log(`\nDone! Results saved to ${filename}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}