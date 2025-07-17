# Austrian Parliament Absence Scraper

A Node.js tool to scrape "Als verhindert gemeldet sind" (reported as absent) information from Austrian Parliament sessions and generate interactive HTML reports with percentage analysis.

## Installation

```bash
npm install
```

## Usage

### CLI Usage (Recommended)
```bash
# Scrape all XXVIII sessions and generate HTML report
node cli.js XXVIII

# Scrape XXVII sessions 1-20
node cli.js XXVII 1 20

# Scrape XXVIII from session 5 until 404
node cli.js XXVIII 5

# Show help
node cli.js --help
```

### Generate HTML Report from Existing Data
```bash
# Generate HTML report from JSON file
node generate-html.js parliament_absences_XXVIII.json

# Generate with custom output filename
node generate-html.js parliament_absences_XXVIII.json custom_report.html
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
{
  "sessions": [
    {
      "session": 1,
      "url": "https://www.parlament.gv.at/gegenstand/XXVIII/NRSITZ/1?selectedStage=111",
      "protocolType": "full",
      "absentMembers": [
        {
          "text": "Als verhindert gemeldet sind die Abgeordneten...",
          "names": [
            {
              "name": "Max Mustermann",
              "profileUrl": "https://www.parlament.gv.at/person/123",
              "club": "ÖVP"
            }
          ],
          "protocolUrl": "https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/1/fnameorig_1688618.html"
        }
      ],
      "scrapedAt": "2025-07-17T10:30:00.000Z"
    }
  ],
  "activeMembersByParty": {
    "ÖVP": 51,
    "SPÖ": 41,
    "FPÖ": 57,
    "NEOS": 18,
    "Grüne": 16
  },
  "scrapedAt": "2025-07-17T10:30:00.000Z"
}
```