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
    this.outputFile = null; // Will be set when scraping starts
    this.personCache = new Map(); // Cache for person info by profileUrl
    this.nameToPersonMap = new Map(); // Map cleaned names to full person info
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

  async fetchApiPage(url, queryParams, jsonPayload, retryCount = 0) {
    try {
      return await new Promise((resolve, reject) => {
        const { URL } = require('url');
        const urlObj = new URL(url);
        const queryString = new URLSearchParams(queryParams).toString();
        const jsonData = JSON.stringify(jsonPayload);
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname + '?' + queryString,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://www.parlament.gv.at',
            'Referer': 'https://www.parlament.gv.at/recherchieren/personen/nationalrat/index.html',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Content-Length': Buffer.byteLength(jsonData)
          }
        };
        
        const request = https.request(options, (response) => {
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
        
        request.write(jsonData);
        request.end();
      });
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const backoffDelay = this.baseBackoff * Math.pow(2, retryCount);
        console.log(`  Retry ${retryCount + 1}/${this.maxRetries} after ${backoffDelay}ms: ${url}`);
        await this.sleep(backoffDelay);
        return this.fetchApiPage(url, queryParams, jsonPayload, retryCount + 1);
      }
      throw error;
    }
  }

  extractStenographicProtocolUrl(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Strategy 1: Look for full stenographic protocol
    // Full protocols are in a section with "Stenographisches Protokoll" text and fnameorig_ links
    const allLinks = document.querySelectorAll('a[href*="fnameorig_"]');
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (href && href.includes('.html')) {
        // Check if this link is in a "Stenographisches Protokoll" section
        let container = link.closest('li') || link.closest('div') || link.parentElement;
        let searchContainer = container;
        
        // Search up to 5 levels up for "Stenographisches Protokoll" text
        for (let i = 0; i < 5 && searchContainer; i++) {
          const text = searchContainer.textContent || '';
          if (text.includes('Stenographisches Protokoll')) {
            console.log(`  Found full stenographic protocol: ${href}`);
            return { type: 'full', url: this.baseUrl + href };
          }
          searchContainer = searchContainer.parentElement;
        }
      }
    }
    
    // Strategy 2: Parse embedded JSON data for session details
    const scriptTags = document.querySelectorAll('script');
    let presidiumSections = [];
    
    for (const script of scriptTags) {
      const content = script.textContent || '';
      if (content.includes('progress') && content.includes('Präsidium')) {
        try {
          // Find the props object in the script
          const propsMatch = content.match(/props:\s*({.+?})\s*}\s*\)\s*;/s);
          if (propsMatch) {
            const propsData = JSON.parse(propsMatch[1]);
            
            // Navigate to the progress array
            const progress = propsData?.data?.content?.[1]?.progress;
            if (Array.isArray(progress)) {
              for (const item of progress) {
                if (item.text === 'Präsidium' && item.protocol?.data?.links) {
                  for (const linkGroup of item.protocol.data.links) {
                    for (const doc of linkGroup.documents) {
                      if (doc.type === 'HTML' && doc.link) {
                        presidiumSections.push(this.baseUrl + doc.link);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // JSON parsing failed, continue with next strategy
        }
      }
    }
    
    if (presidiumSections.length > 0) {
      console.log(`  Found ${presidiumSections.length} Präsidium sections from JSON`);
      return { type: 'sections', urls: presidiumSections };
    }
    
    // Strategy 3: Fallback to HTML parsing for Präsidium sections
    // Look for specific structure: <p>Präsidium</p> followed by HTML links
    const presidiumParagraphs = document.querySelectorAll('p');
    
    for (const p of presidiumParagraphs) {
      const text = p.textContent.trim();
      if (text === 'Präsidium') {
        // Found a Präsidium paragraph, look for HTML links in the same container
        const container = p.closest('td') || p.closest('div') || p.parentElement;
        if (container) {
          const htmlLinks = container.querySelectorAll('a[href*=".html"]');
          for (const link of htmlLinks) {
            const href = link.getAttribute('href');
            if (href) {
              presidiumSections.push(this.baseUrl + href);
            }
          }
        }
      }
    }
    
    if (presidiumSections.length > 0) {
      console.log(`  Found ${presidiumSections.length} Präsidium sections from HTML`);
      if (presidiumSections.length > 10) {
        console.log(`  Warning: Found ${presidiumSections.length} sections, this seems too many for Präsidium`);
        console.log(`  First few URLs: ${presidiumSections.slice(0, 3).join(', ')}`);
      }
      return { type: 'sections', urls: presidiumSections };
    }
    
    return null;
  }

  async extractAbsentMembers(html) {
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
        
        // Parse names and links from the HTML
        const names = await this.parseNamesWithLinks(cleanText, p);
        
        matches.push({
          text: cleanText,
          names: names
        });
      }
    }
    
    return matches.length > 0 ? matches : [{ text: 'No absence information found', names: [] }];
  }

  async parseNamesWithLinks(text, paragraphElement) {
    // Handle "niemand" case
    if (text.includes('niemand als verhindert gemeldet')) {
      return [];
    }
    
    // Extract all person links from the paragraph
    const personLinks = paragraphElement.querySelectorAll('a[href*="/person/"]');
    const names = [];
    
    if (personLinks.length > 0) {
      // We have person links, use them
      for (const link of personLinks) {
        const href = link.getAttribute('href');
        const rawName = link.textContent.trim();
        
        if (href && rawName) {
          const profileUrl = href.startsWith('http') ? href : this.baseUrl + href;
          
          // Clean the name by removing titles and degrees
          const cleanedName = rawName.replace(/\b(Mag\.|Dr\.|Ing\.|Prof\.|DI\.|DDr\.|BA\.|MA\.|MSc\.|BSc\.|MMag\.|MMMag\.|Dipl-Ing\.|Dipl\.-Ing\.|MR\.|Priv-Doz\.|KR\.|Komm-Rat\.|Bgm\.|LL\.M\.)\s*/g, '')
                                     .replace(/\s+(BA|MA|MSc|BSc|MMag|MMMag|Dr|Ing|Prof|DI|DDr|Dipl-Ing|Dipl\.-Ing|MR|Priv-Doz|KR|Komm-Rat|Bgm|LL\.M)\.?\b/g, '')
                                     .replace(/,\s*$/, '') // Remove trailing comma
                                     .trim();
          
          // Check cache first
          if (this.personCache.has(profileUrl)) {
            const cachedPerson = this.personCache.get(profileUrl);
            names.push({
              name: cleanedName,
              profileUrl: profileUrl,
              club: cachedPerson.club
            });
            console.log(`  Using cached club info for ${cleanedName}: ${cachedPerson.club}`);
          } else {
            // Fetch club information
            let club = 'Unknown';
            try {
              await this.sleep(this.delay);
              const club_info = await this.fetchClubInfo(profileUrl);
              club = club_info;
            } catch (error) {
              console.log(`  Could not fetch club for ${cleanedName}: ${error.message}`);
            }
            
            // Cache the person info
            const personInfo = {
              name: cleanedName,
              profileUrl: profileUrl,
              club: club
            };
            this.personCache.set(profileUrl, personInfo);
            
            // Also add to name mapping for backfilling
            this.nameToPersonMap.set(cleanedName, personInfo);
            
            // Also add family name mapping for partial matches
            const familyName = cleanedName.split(' ').pop(); // Last part of name
            if (familyName && familyName !== cleanedName) {
              this.nameToPersonMap.set(familyName, personInfo);
            }
            
            names.push(personInfo);
          }
        }
      }
    } else {
      // No person links found, fall back to text parsing
      const textNames = this.parseNames(text);
      for (const name of textNames) {
        names.push({
          name: name,
          profileUrl: null,
          club: 'Unbekannt'
        });
      }
    }
    
    return names;
  }
  
  normalizeClubName(clubName) {
    const clubNameLower = clubName.toLowerCase();
    
    // Fuzzy matching based on keywords
    if (clubNameLower.includes('freiheitlich') || clubNameLower.includes('fpö')) {
      return 'FPÖ';
    }
    
    if (clubNameLower.includes('sozialdemokratisch') || clubNameLower.includes('spö')) {
      return 'SPÖ';
    }
    
    if (clubNameLower.includes('volkspartei') || clubNameLower.includes('övp')) {
      return 'ÖVP';
    }
    
    if (clubNameLower.includes('neos')) {
      return 'NEOS';
    }
    
    if (clubNameLower.includes('grüne') || clubNameLower.includes('grün')) {
      return 'Grüne';
    }
    
    // If no match found, return original name
    return clubName;
  }

  async fetchClubInfo(profileUrl) {
    try {
      const html = await this.fetchPage(profileUrl);
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // First, try to extract from embedded JSON data
      const scriptTags = document.querySelectorAll('script');
      for (const script of scriptTags) {
        const content = script.textContent || '';
        if (content.includes('props:') && content.includes('mandate')) {
          try {
            // Extract the props object from the script
            const propsMatch = content.match(/props:\s*({.+?})\s*}?\s*\)\s*;/s);
            if (propsMatch) {
              const propsData = JSON.parse(propsMatch[1]);
              
              // Look for current mandate with club info
              const mandates = propsData?.data?.content?.biografie?.mandatefunktionen?.mandate;
              if (Array.isArray(mandates)) {
                for (const mandate of mandates) {
                  if (mandate.klub && mandate.gremium === 'NR' && mandate.aktiv !== false) {
                    return this.normalizeClubName(mandate.klub);
                  }
                }
                // If no active NR mandate, try any NR mandate
                for (const mandate of mandates) {
                  if (mandate.klub && mandate.gremium === 'NR') {
                    return this.normalizeClubName(mandate.klub);
                  }
                }
                // If no NR mandate with club, try wahlpartei
                for (const mandate of mandates) {
                  if (mandate.wahlpartei && mandate.gremium === 'NR') {
                    return this.normalizeClubName(mandate.wahlpartei);
                  }
                }
              }
            }
          } catch (e) {
            // JSON parsing failed, continue with HTML parsing
          }
        }
      }
      
      // Fallback: look for current club information in HTML
      const klubElements = document.querySelectorAll('p');
      for (const p of klubElements) {
        const text = p.textContent || '';
        if (text.includes('Klub:')) {
          // Extract club name after "Klub:"
          const clubMatch = text.match(/Klub:\s*(.+)/);
          if (clubMatch) {
            return this.normalizeClubName(clubMatch[1].trim());
          }
        }
      }
      
      // If no current club found, look in political mandates section
      const sections = document.querySelectorAll('section');
      for (const section of sections) {
        const heading = section.querySelector('h3');
        if (heading && heading.textContent.includes('Politische Mandate/Funktionen')) {
          // Look for the most recent Nationalrat mandate
          const listItems = section.querySelectorAll('li');
          for (const li of listItems) {
            const text = li.textContent || '';
            // Look for "Abgeordneter zum Nationalrat" entries with party info
            const nationalratMatch = text.match(/Abgeordneter zum Nationalrat[^,]*,\s*([A-ZÖÄÜ]+)/);
            if (nationalratMatch) {
              return this.normalizeClubName(nationalratMatch[1]);
            }
          }
        }
      }
      
      return 'Unbekannt';
    } catch (error) {
      return 'Unbekannt';
    }
  }

  parseNames(text) {
    // Handle "niemand" case
    if (text.includes('niemand als verhindert gemeldet')) {
      return [];
    }
    
    // Extract names from plural or singular patterns
    let match = text.match(/Als verhindert gemeldet sind die Abgeordneten (.+)\./);
    if (!match) {
      // Try singular pattern "Als verhindert gemeldet ist heute Abgeordneter..."
      match = text.match(/Als verhindert gemeldet ist (?:heute )?(?:Abgeordneter|Abgeordnete) (.+)\./);
      if (!match) {
        return [];
      }
    }
    
    const namesPart = match[1];
    
    // First, remove standalone titles and degrees
    const cleanedText = namesPart.replace(/\b(Mag\.|Dr\.|Ing\.|Prof\.|DI\.|DDr\.|BA\.|MA\.|MSc\.|BSc\.|MMag\.|MMMag\.|Dipl-Ing\.|Dipl\.-Ing\.|MR\.|Priv-Doz\.|KR\.|Komm-Rat\.|Bgm\.|LL\.M\.)\s*/g, '')
                               .replace(/\s+(BA|MA|MSc|BSc|MMag|MMMag|Dr|Ing|Prof|DI|DDr|Dipl-Ing|Dipl\.-Ing|MR|Priv-Doz|KR|Komm-Rat|Bgm|LL\.M)\.?\b/g, '');
    
    // Split by commas and "und"
    const rawNames = cleanedText.split(/,\s*|\s+und\s+/);
    
    // Clean up each name and filter out empty/title-only entries
    const names = rawNames.map(name => name.trim())
                          .filter(name => name.length > 0 && 
                                         !name.match(/^(Mag|Dr|Ing|Prof|DI|DDr|BA|MA|MSc|BSc|MMag|Dipl-Ing|Dipl\.-Ing|MR|Priv-Doz|KR|Komm-Rat|Bgm|LL\.M)\.?$/));
    
    return names;
  }

  async scrapeSession(sessionNumber) {
    try {
      console.log(`Scraping session ${sessionNumber}...`);
      
      const sessionUrl = this.baseUrl + this.sessionPattern.replace('{session}', sessionNumber);
      const sessionHtml = await this.fetchPage(sessionUrl);
      
      const protocolInfo = this.extractStenographicProtocolUrl(sessionHtml);
      if (!protocolInfo) {
        console.log(`  No stenographic protocol found for session ${sessionNumber}`);
        return null;
      }
      
      console.log(`  Protocol type: ${protocolInfo.type}`);
      
      await this.sleep(this.delay);
      
      let absentMembers = [];
      
      if (protocolInfo.type === 'full') {
        // Single full protocol
        const protocolHtml = await this.fetchPage(protocolInfo.url);
        const rawAbsences = await this.extractAbsentMembers(protocolHtml);
        
        // Filter and add protocol URL to each absence entry
        absentMembers = rawAbsences
          .filter(entry => 
            !entry.text.includes('No absence information found')
          )
          .map(entry => ({
            ...entry,
            protocolUrl: protocolInfo.url
          }));
          
      } else if (protocolInfo.type === 'sections') {
        // Multiple Präsidium sections
        absentMembers = [];
        
        for (const url of protocolInfo.urls) {
          await this.sleep(this.delay);
          const sectionHtml = await this.fetchPage(url);
          const sectionAbsences = await this.extractAbsentMembers(sectionHtml);
          
          // Filter and add protocol URL to each absence entry
          const filteredSectionAbsences = sectionAbsences
            .filter(entry => 
              !entry.text.includes('No absence information found')
            )
            .map(entry => ({
              ...entry,
              protocolUrl: url
            }));
          
          absentMembers.push(...filteredSectionAbsences);
        }
      }
      
      const result = {
        session: sessionNumber,
        url: sessionUrl,
        protocolType: protocolInfo.type,
        absentMembers: absentMembers,
        scrapedAt: new Date().toISOString()
      };
      
      this.results.push(result);
      console.log(`  Session ${sessionNumber}: ${absentMembers.length} absence entries found`);
      
      // Save intermediate results after each session
      this.saveIntermediateResults();
      
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
    
    // Backfill missing person information
    this.backfillPersonInfo();
    
    // Fetch active member counts for percentage calculations
    console.log('\nFetching active member counts for percentage calculations...');
    try {
      this.activeMembersByParty = await this.fetchActiveMemberCount();
    } catch (error) {
      console.error(`Failed to fetch active member counts: ${error.message}`);
      this.activeMembersByParty = null;
    }
    
    return this.results;
  }

  backfillPersonInfo() {
    console.log('\nBackfilling missing person information...');
    let backfillCount = 0;
    
    for (const session of this.results) {
      for (const absence of session.absentMembers) {
        for (const person of absence.names) {
          // Only backfill if we don't have profile URL or club info
          if (!person.profileUrl || person.club === 'Unknown') {
            const mappedPerson = this.nameToPersonMap.get(person.name);
            if (mappedPerson) {
              person.name = mappedPerson.name; // Use full name from cached item
              person.profileUrl = mappedPerson.profileUrl;
              person.club = mappedPerson.club;
              backfillCount++;
              console.log(`  Backfilled ${person.name} -> ${mappedPerson.club}`);
            }
          }
        }
      }
    }
    
    console.log(`Backfilled ${backfillCount} person entries`);
  }

  saveResults(filename = 'parliament_absences.json') {
    const outputData = {
      sessions: this.results,
      activeMembersByParty: this.activeMembersByParty ? Object.fromEntries(this.activeMembersByParty) : null,
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(filename, JSON.stringify(outputData, null, 2));
    console.log(`Results saved to ${filename}`);
  }

  saveIntermediateResults() {
    if (this.outputFile && this.results.length > 0) {
      try {
        fs.writeFileSync(this.outputFile, JSON.stringify(this.results, null, 2));
        console.log(`  Intermediate results saved (${this.results.length} sessions)`);
      } catch (error) {
        console.error(`  Failed to save intermediate results: ${error.message}`);
      }
    }
  }

  async fetchActiveMemberCount() {
    try {
      console.log('Fetching active member count from API...');
      const activeMembersByParty = new Map();
      
      // The API uses pagination, so we need to fetch all pages
      let pageNumber = 1;
      let hasMorePages = true;
      let totalMembers = 0;
      
      while (hasMorePages) {
        const apiUrl = `https://www.parlament.gv.at/Filter/api/json/post`;
        
        try {
          const response = await this.fetchApiPage(
            apiUrl,
            {
              jsMode: 'EVAL',
              FBEZ: 'WFW_002',
              listeId: 'undefined',
              pageNumber: pageNumber,
              pagesize: 50,
              feldRnr: 1,
              ascDesc: 'ASC'
            },
            {
              STEP: ["1000"],
              NRBR: ["NR"],
              GP: ["AKT"],
              R_WF: ["FR"],
              R_PBW: ["WK"],
              M: ["M"],
              W: ["W"]
            }
          );
          
          const data = JSON.parse(response);
          
          
          // Check if response has the rows property (member data)
          if (data && data.rows) {
            const members = data.rows;
            
            if (members.length === 0) {
              hasMorePages = false;
              break;
            }
            
            for (const member of members) {
              // Member data is an array: [name, party_html, constituency, state, ...]
              if (Array.isArray(member) && member.length > 1) {
                const partyHtml = member[1]; // Second element contains party info with HTML
                
                if (partyHtml) {
                  // Extract party name from HTML - look for the tooltip content
                  const { JSDOM } = require('jsdom');
                  const dom = new JSDOM(partyHtml);
                  const spanElement = dom.window.document.querySelector('span');
                  
                  if (spanElement) {
                    const partyName = spanElement.textContent.trim();
                    const normalizedClub = this.normalizeClubName(partyName);
                    const count = activeMembersByParty.get(normalizedClub) || 0;
                    activeMembersByParty.set(normalizedClub, count + 1);
                    totalMembers++;
                  }
                }
              }
            }
            
            console.log(`  Page ${pageNumber}: Found ${members.length} members`);
            pageNumber++;
            
            // If we got fewer results than pagesize, we've reached the end
            if (members.length < 50) {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        } catch (error) {
          console.error(`Error fetching page ${pageNumber}:`, error.message);
          hasMorePages = false;
        }
        
        // Add a small delay between requests
        await this.sleep(this.delay);
      }
      
      if (totalMembers > 0) {
        console.log(`Successfully fetched ${totalMembers} active members from API`);
        for (const [party, count] of activeMembersByParty) {
          console.log(`  ${party}: ${count} members`);
        }
        return activeMembersByParty;
      } else {
        throw new Error('No members found in API response');
      }
      
    } catch (error) {
      throw new Error(`Failed to fetch active member count: ${error.message}`);
    }
  }
  

  generateReport() {
    const report = {
      totalSessions: this.results.length,
      sessionsWithAbsences: this.results.filter(r => 
        r.absentMembers.some(m => m.text && m.text.includes('Als verhindert gemeldet sind'))
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