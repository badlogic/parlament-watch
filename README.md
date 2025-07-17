# Austrian Parliament Absence Scraper

A Node.js tool to scrape "Als verhindert gemeldet sind" (reported as absent) information from Austrian Parliament sessions for the XXVIII legislative period.

## Features

- Scrapes all parliament sessions until 404 errors
- Extracts absence information from stenographic protocols
- Saves results to JSON format
- Generates summary reports
- Exponential backoff retry mechanism (3 retries max)
- Fast 100ms base delay between requests
- Auto-stops after 3 consecutive failures

## Installation

```bash
npm install
```

## Usage

### CLI Usage (Recommended)
```bash
# Scrape all XXVIII sessions
node cli.js XXVIII

# Scrape XXVII sessions 1-20
node cli.js XXVII 1 20

# Scrape XXVIII from session 5 until 404
node cli.js XXVIII 5

# Show help
node cli.js --help
```

### Quick Start (XXVIII only)
```bash
npm start
```

### Test Single Session
```bash
npm test
```

### Programmatic Usage
```javascript
const ParliamentScraper = require('./scraper');

async function customScrape() {
  const scraper = new ParliamentScraper();
  
  // Scrape all sessions until 404
  await scraper.scrapeAllSessions();
  
  // Or scrape specific range
  await scraper.scrapeAllSessions(1, 50);
  
  scraper.saveResults('custom_results.json');
  scraper.generateReport();
}
```

## Output Format

The scraper generates JSON files with the following structure:

```json
[
  {
    "session": 1,
    "url": "https://www.parlament.gv.at/gegenstand/XXVIII/NRSITZ/1?selectedStage=111",
    "protocolUrl": "https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/1/fnameorig_1688618.html",
    "absentMembers": [
      "Für die heutige Sitzung ist niemand als verhindert gemeldet."
    ],
    "scrapedAt": "2024-07-17T10:30:00.000Z"
  }
]
```

## Configuration

- `delay`: Time between requests (default: 100ms)
- `maxRetries`: Maximum retry attempts (default: 3)
- `baseBackoff`: Base backoff delay for retries (default: 1000ms)
- Exponential backoff: 1s, 2s, 4s on retries

## Retry Mechanism

The scraper uses exponential backoff for failed requests:
- 1st retry: 1 second delay
- 2nd retry: 2 second delay  
- 3rd retry: 4 second delay
- Only 100ms delay between successful requests

## Notes

- The scraper looks for stenographic protocol documents (`fnameorig_*.html`)
- It searches for patterns like "Als verhindert gemeldet sind" and "niemand als verhindert gemeldet"
- Some sessions may not have stenographic protocols available
- Results are saved with timestamps for tracking