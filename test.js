const ParliamentScraper = require('./scraper');

async function testScraper() {
  console.log('Testing Parliament Scraper...\n');
  
  const scraper = new ParliamentScraper();
  
  // Test single session
  console.log('Testing single session (Session 1)...');
  const result = await scraper.scrapeSession(1);
  
  if (result) {
    console.log('✓ Session 1 scraped successfully');
    console.log('  URL:', result.url);
    console.log('  Protocol URL:', result.protocolUrl);
    console.log('  Absent members:', result.absentMembers);
  } else {
    console.log('✗ Failed to scrape session 1');
  }
  
  console.log('\n=== Test Results ===');
  console.log('Sessions scraped:', scraper.results.length);
  if (scraper.results.length > 0) {
    scraper.generateReport();
  }
}

testScraper().catch(console.error);