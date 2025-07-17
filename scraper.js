const https = require('https');
const fs = require('fs');
const { JSDOM } = require('jsdom');

class ParliamentScraper {
  constructor() {
    this.results = [];
    this.baseUrl = 'https://www.parlament.gv.at';
    this.sessionPattern = '/gegenstand/XXVIII/NRSITZ/{session}?selectedStage=111';
    this.delay = 100; // 100ms base delay between requests
    this.maxRetries = 3;
    this.baseBackoff = 1000; // 1 second base backoff
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchPage(url, retryCount = 0) {
    try {
      return await new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
          let data = '';
          response.on('data', (chunk) => data += chunk);
          response.on('end', () => {
            if (response.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${response.statusCode}: ${url}`));
            }
          });
        });
        
        request.on('error', reject);
        request.setTimeout(10000, () => {
          request.destroy();
          reject(new Error(`Timeout: ${url}`));
        });
      });
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const backoffDelay = this.baseBackoff * Math.pow(2, retryCount);
        console.log(`  Retry ${retryCount + 1}/${this.maxRetries} after ${backoffDelay}ms: ${url}`);
        await this.sleep(backoffDelay);
        return this.fetchPage(url, retryCount + 1);
      }
      throw error;
    }
  }

  extractStenographicProtocolUrl(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Look for stenographic protocol links
    const links = document.querySelectorAll('a[href*="fnameorig_"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.includes('.html')) {
        return this.baseUrl + href;
      }
    }
    return null;
  }

  extractAbsentMembers(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Find all <p> tags containing "verhindert gemeldet"
    const paragraphs = document.querySelectorAll('p');
    const matches = [];
    
    for (const p of paragraphs) {
      const text = p.textContent || p.innerText || '';
      if (text.includes('verhindert gemeldet')) {
        // Replace non-breaking spaces (U+00A0) and normalize whitespace
        const cleanText = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Parse names from the text
        const names = this.parseNames(cleanText);
        
        matches.push({
          text: cleanText,
          names: names
        });
      }
    }
    
    return matches.length > 0 ? matches : [{ text: 'No absence information found', names: [] }];
  }

  parseNames(text) {
    // Handle "niemand" case
    if (text.includes('niemand als verhindert gemeldet')) {
      return [];
    }
    
    // Extract names from "Als verhindert gemeldet sind die Abgeordneten..."
    const match = text.match(/Als verhindert gemeldet sind die Abgeordneten (.+)\./);
    if (!match) {
      return [];
    }
    
    const namesPart = match[1];
    
    // First, remove standalone titles and degrees
    const cleanedText = namesPart.replace(/\b(Mag\.|Dr\.|Ing\.|Prof\.|DI\.|DDr\.|BA\.|MA\.|MSc\.|BSc\.|MMag\.|Dipl-Ing\.|MR\.|Priv-Doz\.|KR\.|Komm-Rat\.|Bgm\.)\s*/g, '')
                               .replace(/\s+(BA|MA|MSc|BSc|MMag|Dr|Ing|Prof|DI|DDr|Dipl-Ing|MR|Priv-Doz|KR|Komm-Rat|Bgm)\.?\b/g, '');
    
    // Split by commas and "und"
    const rawNames = cleanedText.split(/,\s*|\s+und\s+/);
    
    // Clean up each name and filter out empty/title-only entries
    const names = rawNames.map(name => name.trim())
                          .filter(name => name.length > 0 && 
                                         !name.match(/^(Mag|Dr|Ing|Prof|DI|DDr|BA|MA|MSc|BSc|MMag|Dipl-Ing|MR|Priv-Doz|KR|Komm-Rat|Bgm)\.?$/));
    
    return names;
  }

  async scrapeSession(sessionNumber) {
    try {
      console.log(`Scraping session ${sessionNumber}...`);
      
      const sessionUrl = this.baseUrl + this.sessionPattern.replace('{session}', sessionNumber);
      const sessionHtml = await this.fetchPage(sessionUrl);
      
      const protocolUrl = this.extractStenographicProtocolUrl(sessionHtml);
      if (!protocolUrl) {
        console.log(`  No stenographic protocol found for session ${sessionNumber}`);
        return null;
      }
      
      await this.sleep(this.delay);
      
      const protocolHtml = await this.fetchPage(protocolUrl);
      const absentMembers = this.extractAbsentMembers(protocolHtml);
      
      const result = {
        session: sessionNumber,
        url: sessionUrl,
        protocolUrl: protocolUrl,
        absentMembers: absentMembers,
        scrapedAt: new Date().toISOString()
      };
      
      this.results.push(result);
      console.log(`  Session ${sessionNumber}: ${absentMembers.length} absence entries found`);
      
      return result;
      
    } catch (error) {
      console.error(`Error scraping session ${sessionNumber}: ${error.message}`);
      return null;
    }
  }

  async scrapeAllSessions(startSession = 1, endSession = null) {
    console.log(`Starting scrape from session ${startSession}${endSession ? ` to ${endSession}` : ' until 404'}...`);
    
    let session = startSession;
    let consecutiveFailures = 0;
    
    while (true) {
      const result = await this.scrapeSession(session);
      
      if (!result) {
        consecutiveFailures++;
        console.log(`  Session ${session} failed (${consecutiveFailures} consecutive failures)`);
        
        // Stop after 3 consecutive failures
        if (consecutiveFailures >= 3) {
          console.log(`  Stopping after 3 consecutive failures`);
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
      
      // Stop if we've reached the specified end session
      if (endSession && session >= endSession) {
        break;
      }
      
      session++;
      await this.sleep(this.delay);
    }
    
    return this.results;
  }

  saveResults(filename = 'parliament_absences.json') {
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`Results saved to ${filename}`);
  }

  generateReport() {
    const report = {
      totalSessions: this.results.length,
      sessionsWithAbsences: this.results.filter(r => 
        r.absentMembers.some(m => m.includes('Als verhindert gemeldet sind'))
      ).length,
      allAbsences: this.results.flatMap(r => 
        r.absentMembers.map(m => ({ session: r.session, absence: m }))
      )
    };
    
    console.log('\n=== SCRAPING REPORT ===');
    console.log(`Total sessions scraped: ${report.totalSessions}`);
    console.log(`Sessions with absences: ${report.sessionsWithAbsences}`);
    console.log(`Total absence entries: ${report.allAbsences.length}`);
    
    return report;
  }
}

// Usage
async function main() {
  const scraper = new ParliamentScraper();
  
  // Scrape all sessions until 404
  await scraper.scrapeAllSessions();
  
  scraper.saveResults();
  scraper.generateReport();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ParliamentScraper;