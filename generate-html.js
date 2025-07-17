#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function generateHTML(jsonData, outputFile = 'parliament_absences.html', activeMembersByParty = null) {
  // Handle new JSON format with sessions and activeMembersByParty
  let sessions, membersByParty;
  
  if (jsonData.sessions) {
    // New format: {sessions: [...], activeMembersByParty: {...}}
    sessions = jsonData.sessions;
    membersByParty = jsonData.activeMembersByParty ? new Map(Object.entries(jsonData.activeMembersByParty)) : null;
  } else {
    // Old format: just array of sessions
    sessions = jsonData;
    membersByParty = activeMembersByParty;
  }
  
  // Process data for analysis
  const { personStats, partyStats, sessionStats } = processData(sessions, membersByParty);
  
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Österreichischer Nationalrat - Abwesenheitsanalyse</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%) fixed;
            min-height: 100vh;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        .header {
            text-align: center;
            padding: 30px 0;
            color: #2c3e50;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.2em;
            margin-bottom: 8px;
            font-weight: 600;
        }
        
        .header p {
            font-size: 1.1em;
            opacity: 0.7;
            margin-bottom: 0;
        }
        
        .disclaimer {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 24px;
            font-size: 0.85em;
        }
        
        .disclaimer h3 {
            color: #856404;
            margin-bottom: 6px;
            font-size: 0.9em;
            font-weight: 500;
        }
        
        .disclaimer p {
            color: #856404;
            font-size: 0.8em;
            margin-bottom: 4px;
            line-height: 1.4;
        }
        
        .disclaimer p:last-child {
            margin-bottom: 0;
        }
        
        .nav {
            display: flex;
            justify-content: center;
            gap: 0;
            margin-bottom: 40px;
            background: white;
            border-radius: 50px;
            padding: 8px;
            max-width: 500px;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 40px;
        }
        
        .nav-btn {
            padding: 15px 30px;
            background: transparent;
            color: #666;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex: 1;
        }
        
        .nav-btn:hover {
            background: #f5f5f5;
            color: #333;
        }
        
        .nav-btn.active {
            background: #d32f2f;
            color: white;
            box-shadow: 0 4px 15px rgba(211, 47, 47, 0.3);
        }
        
        .section {
            display: none;
            padding: 0;
            margin-bottom: 30px;
        }
        
        .section.active {
            display: block;
        }
        
        .section h2 {
            font-size: 2.4em;
            margin-bottom: 30px;
            color: #d32f2f;
            font-weight: 700;
            text-align: center;
        }
        
        .search-box {
            width: 100%;
            padding: 18px 24px;
            border: 2px solid #e0e0e0;
            border-radius: 50px;
            font-size: 16px;
            margin-bottom: 30px;
            transition: all 0.3s ease;
            background: white;
        }
        
        .search-box:focus {
            outline: none;
            border-color: #d32f2f;
            background: white;
            box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.1);
        }
        
        .person-list, .party-list {
            display: block;
        }
        
        .person-item, .party-item {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e1e5e9;
            margin-bottom: 12px;
        }
        
        .person-item:hover, .party-item:hover {
            background: #f8f9fa;
        }
        
        .person-header, .party-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .person-name, .party-name {
            font-weight: 500;
            font-size: 1.1em;
            color: #1a1a1a;
        }
        
        .person-name {
            cursor: pointer;
        }
        
        .person-name:hover {
            color: #d32f2f;
        }
        
        .absence-count {
            color: #6c757d;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .club-tag {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 500;
            color: white;
            margin-top: 4px;
            display: inline-block;
        }
        
        .timeline {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        
        .session-dot {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            background: #e9ecef;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7em;
            color: #6c757d;
            cursor: pointer;
            font-weight: 500;
        }
        
        .session-dot.absent {
            background: #f59e0b;
            color: white;
        }
        
        .session-dot.absent:hover {
            background: #d97706;
        }
        
        .person-details {
            display: none;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #f1f2f6;
        }
        
        .person-details.active {
            display: block;
        }
        
        .person-details h4 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.1em;
        }
        
        .person-details ul {
            list-style: none;
            padding: 0;
        }
        
        .person-details li {
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .person-details li:last-child {
            border-bottom: none;
        }
        
        
        .party-ranking {
            margin-top: 16px;
        }
        
        .party-ranking h4 {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 12px;
            font-weight: 500;
        }
        
        .party-members {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .party-member-badge {
            background: #f1f3f4;
            color: #2c3e50;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 500;
            border: 1px solid #e1e5e9;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .party-member-badge:hover {
            background: #e1e5e9;
            transform: translateY(-1px);
        }
        
        .party-overview {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e1e5e9;
            margin-bottom: 20px;
        }
        
        .section {
            min-height: 400px;
        }
        
        .party-overview h3 {
            font-size: 1.1em;
            color: #2c3e50;
            margin-bottom: 16px;
            font-weight: 600;
        }
        
        .party-chart {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .party-chart-item {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .party-chart-label {
            min-width: 80px;
            font-size: 0.9em;
            color: #2c3e50;
            font-weight: 500;
        }
        
        .party-chart-bar {
            flex: 1;
            height: 24px;
            background: #f1f3f4;
            border-radius: 4px;
            position: relative;
        }
        
        .party-chart-fill {
            height: 100%;
            border-radius: 4px;
            position: relative;
        }
        
        .party-chart-text {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.8em;
            font-weight: 600;
            color: white;
            background: rgba(0,0,0,0.3);
            padding: 2px 6px;
            border-radius: 3px;
            white-space: nowrap;
            z-index: 10;
            min-width: 18px;
            text-align: center;
        }
        
        .no-results {
            text-align: center;
            padding: 60px;
            color: #666;
            font-style: italic;
            font-size: 1.1em;
        }
        
        .party-color {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            margin-right: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .party-fpoe { background: #005cbf; }
        .party-spoe { background: #ce000c; }
        .party-oevp { background: #63c3d0; }
        .party-neos { background: #e91c7a; }
        .party-gruene { background: #88b626; }
        .party-unknown { background: #6c757d; }
        
        .footer {
            margin-top: 20px;
            padding: 20px 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .footer-item {
            font-size: 0.75em;
            text-align: center;
            color: #6c757d;
        }
        
        .footer-item a {
            color: #d32f2f;
            text-decoration: none;
        }
        
        .footer-item a:hover {
            text-decoration: underline;
        }
        
        .download-btn {
            background: #d32f2f;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 0.9em;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 10px;
        }
        
        .download-btn:hover {
            background: #b71c1c;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(211, 47, 47, 0.3);
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 0 15px;
            }
            
            .header h1 {
                font-size: 1.8em;
            }
            
            .nav {
                flex-direction: column;
                gap: 0;
                border-radius: 15px;
                padding: 5px;
            }
            
            .nav-btn {
                border-radius: 10px;
                margin: 2px;
            }
            
            .section {
                padding: 25px;
            }
            
            .party-stats {
                grid-template-columns: 1fr;
            }
            
            .person-header, .party-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>Österreichischer Nationalrat</h1>
            <p>Abwesenheitsanalyse der Abgeordneten</p>
        </div>
    </div>
    
    <div class="container">
        <div class="disclaimer">
            <h3>ℹ️ Wichtige Hinweise</h3>
            <p><strong>Abwesenheitsgründe:</strong> Abwesenheiten können verschiedene Gründe haben, wie Krankheit, offizielle Termine, oder andere berechtigte Verpflichtungen.</p>
            <p><strong>Datenqualität:</strong> Die automatische Extraktion der Daten kann Fehler enthalten. Jede Abwesenheit kann durch Klick auf die entsprechende Sitzung im stenographischen Protokoll überprüft werden.</p>
            <p><strong>Verifikation:</strong> Klicken Sie auf die orangen Sitzungspunkte, um das offizielle Protokoll zu öffnen und die Abwesenheit zu bestätigen.</p>
            <p><strong>Legislaturperiode:</strong> Die Daten beziehen sich auf die aktuelle XXVIII. Legislaturperiode (Oktober 2024 - Oktober 2029). Die Zahlen 1, 2, 3, 4 etc. pro Abgeordneter verweisen auf die 1., 2., 3., 4. usw. Sitzung in dieser Legislaturperiode.</p>
        </div>
        
        <div class="nav">
            <button class="nav-btn active" onclick="showSection('persons')">Abgeordnete</button>
            <button class="nav-btn" onclick="showSection('parties')">Parteien</button>
        </div>
        
        <div id="persons" class="section active">
            <input type="text" class="search-box" placeholder="Nach Name oder Partei suchen..." onkeyup="filterPersons(this.value)">
            <div class="person-list" id="personList">
                ${generatePersonList(personStats)}
            </div>
        </div>
        
        <div id="parties" class="section">
            <div class="party-overview">
                <h3>Abwesenheiten nach Parteien</h3>
                <div class="party-chart">
                    ${generatePartyChart(partyStats)}
                </div>
            </div>
            <div class="party-list" id="partyList">
                ${generatePartyList(partyStats, personStats)}
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-item">
                <button class="download-btn" onclick="downloadJSON()">Download JSON</button>
            </div>
            <div class="footer-item">
                Diese Seite respektiert Ihre Privatsphäre durch den Verzicht auf Cookies oder ähnliche Technologien und sammelt keine personenbezogenen Daten.
            </div>
            <div class="footer-item">
                Mit Spucke und Tixo gebaut von <a href="https://mariozechner.at">Mario Zechner</a>
            </div>
            <div class="footer-item">
                Quellcode verfügbar auf <a href="https://github.com/badlogic/parlament-watch" target="_blank">GitHub</a>
            </div>
        </div>
    </div>
    
    <script>
        const data = ${JSON.stringify(jsonData, null, 2)};
        const personStats = ${JSON.stringify(personStats, null, 2)};
        const partyStats = ${JSON.stringify(partyStats, null, 2)};
        
        function showSection(sectionId) {
            // Hide all sections
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Remove active class from all nav buttons
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show selected section
            document.getElementById(sectionId).classList.add('active');
            
            // Activate corresponding nav button
            event.target.classList.add('active');
            
            // Update URL parameter
            const url = new URL(window.location);
            if (sectionId === 'parties') {
                url.searchParams.set('view', 'parties');
            } else {
                url.searchParams.delete('view');
            }
            window.history.pushState({}, '', url);
        }
        
        function filterPersons(query) {
            const personList = document.getElementById('personList');
            const items = personList.querySelectorAll('.person-item');
            
            items.forEach(item => {
                const name = item.querySelector('.person-name').textContent.toLowerCase();
                const club = item.querySelector('.club-tag').textContent.toLowerCase();
                
                if (name.includes(query.toLowerCase()) || club.includes(query.toLowerCase())) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }
        
        
        
        function getPartyColor(party) {
            const colors = {
                'FPÖ': '#0056b3',
                'SPÖ': '#ce000c',
                'ÖVP': '#000000',
                'NEOS': '#e91c7a',
                'Grüne': '#88b626',
                'Unknown': '#6c757d'
            };
            return colors[party] || '#6c757d';
        }
        
        function downloadJSON() {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'parlament-absences.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Parliament Absences Analysis loaded');
            
            // Check URL parameters on page load
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            
            if (view === 'parties') {
                // Show parties section
                document.getElementById('persons').classList.remove('active');
                document.getElementById('parties').classList.add('active');
                
                // Update nav buttons
                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                document.querySelector('.nav-btn[onclick*="parties"]').classList.add('active');
            }
        });
    </script>
</body>
</html>`;

  fs.writeFileSync(outputFile, html);
  console.log(`HTML report generated: ${outputFile}`);
}

function processData(jsonData, activeMembersByParty = null) {
  const personMap = new Map();
  const partyMap = new Map();
  let totalAbsences = 0;
  let sessionsWithAbsences = 0;
  
  // Process all sessions
  for (const session of jsonData) {
    let sessionHasAbsences = false;
    
    for (const absence of session.absentMembers) {
      if (absence.names && absence.names.length > 0) {
        sessionHasAbsences = true;
        
        for (const person of absence.names) {
          const name = person.name;
          const club = person.club || 'Unknown';
          
          // Track person stats
          if (!personMap.has(name)) {
            personMap.set(name, {
              name: name,
              club: club,
              profileUrl: person.profileUrl,
              absences: [],
              totalAbsences: 0
            });
          }
          
          const personStats = personMap.get(name);
          personStats.absences.push({
            session: session.session,
            date: session.scrapedAt,
            protocolUrl: absence.protocolUrl
          });
          personStats.totalAbsences++;
          
          // Track party stats
          if (!partyMap.has(club)) {
            partyMap.set(club, {
              name: club,
              members: new Set(),
              totalAbsences: 0,
              absencesByMember: new Map()
            });
          }
          
          const partyStats = partyMap.get(club);
          partyStats.members.add(name);
          partyStats.totalAbsences++;
          
          if (!partyStats.absencesByMember.has(name)) {
            partyStats.absencesByMember.set(name, 0);
          }
          partyStats.absencesByMember.set(name, partyStats.absencesByMember.get(name) + 1);
          
          totalAbsences++;
        }
      }
    }
    
    if (sessionHasAbsences) {
      sessionsWithAbsences++;
    }
  }
  
  // Convert to arrays and sort
  const personStats = Array.from(personMap.values())
    .sort((a, b) => b.totalAbsences - a.totalAbsences);
  
  const partyStats = Array.from(partyMap.values())
    .map(party => {
      const activeMembers = activeMembersByParty ? activeMembersByParty.get(party.name) || 0 : 0;
      const absentMembers = party.members.size;
      const absentPercentage = activeMembers > 0 ? (absentMembers / activeMembers) * 100 : 0;
      
      return {
        ...party,
        members: Array.from(party.members),
        memberCount: party.members.size,
        activeMembers: activeMembers,
        absentPercentage: absentPercentage,
        averageAbsencesPerMember: party.totalAbsences / party.members.size
      };
    })
    .sort((a, b) => b.totalAbsences - a.totalAbsences);
  
  const sessionStats = {
    totalSessions: jsonData.length,
    sessionsWithAbsences: sessionsWithAbsences,
    totalAbsences: totalAbsences
  };
  
  return { personStats, partyStats, sessionStats };
}

function generatePersonList(personStats) {
  // Find the maximum session number across all data
  const allSessions = personStats.flatMap(person => person.absences.map(a => a.session));
  const maxSession = Math.max(...allSessions, 1);
  
  return personStats.map((person, index) => {
    const sessionNumbers = person.absences.map(a => a.session).sort((a, b) => a - b);
    
    // Generate timeline dots for all sessions
    const timelineDots = [];
    for (let i = 1; i <= maxSession; i++) {
      const isAbsent = sessionNumbers.includes(i);
      const absence = person.absences.find(a => a.session === i);
      const protocolUrl = absence ? absence.protocolUrl : '';
      
      if (isAbsent && protocolUrl) {
        timelineDots.push(`<div class="session-dot absent" title="Sitzung ${i} - Abwesend (Klicken für Protokoll)" onclick="window.open('${protocolUrl}', '_blank')">${i}</div>`);
      } else {
        timelineDots.push(`<div class="session-dot ${isAbsent ? 'absent' : ''}" title="Sitzung ${i}">${i}</div>`);
      }
    }
    
    return `
      <div class="person-item">
        <div class="person-header">
          <div>
            <div class="person-name" onclick="${person.profileUrl ? `window.open('${person.profileUrl}', '_blank')` : 'return false'}">${person.name}</div>
            <span class="club-tag" style="background-color: ${getPartyColorJS(person.club)}">${person.club}</span>
          </div>
          <div class="absence-count">${person.totalAbsences} Abwesenheiten</div>
        </div>
        <div class="timeline">${timelineDots.join('')}</div>
      </div>
    `;
  }).join('');
}

function generatePartyList(partyStats, personStats) {
  // Create a lookup map for person URLs
  const personUrlMap = new Map();
  personStats.forEach(person => {
    personUrlMap.set(person.name, person.profileUrl);
  });
  
  return partyStats.map((party, index) => {
    const partyId = party.name.replace(/[^a-zA-Z0-9]/g, '');
    
    return `
      <div class="party-item">
        <div class="party-header">
          <div style="display: flex; align-items: center;">
            <div class="party-color" style="background-color: ${getPartyColorJS(party.name)}"></div>
            <div class="party-name">${party.name}</div>
          </div>
          <div class="absence-count">
            ${party.memberCount} Abgeordnete mit Abwesenheiten
            ${party.activeMembers > 0 ? 
              `<br><strong>${party.absentPercentage.toFixed(1)}% der ${party.activeMembers} aktiven ${party.name}-Abgeordneten hatten Abwesenheiten</strong>` : 
              '<br><em>Prozentsatz wird berechnet wenn aktive Mitgliederzahlen verfügbar sind</em>'
            }
          </div>
        </div>
        <div class="party-ranking">
          <h4>Abgeordnete nach Abwesenheiten:</h4>
          <div class="party-members">
            ${Array.from(party.absencesByMember.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([member, count]) => {
                const profileUrl = personUrlMap.get(member);
                const onClick = profileUrl ? `onclick="window.open('${profileUrl}', '_blank')"` : '';
                return `<div class="party-member-badge" ${onClick}>${member} (${count})</div>`;
              }).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function generatePartyChart(partyStats) {
  const maxAbsences = Math.max(...partyStats.map(p => p.totalAbsences));
  
  return partyStats.map(party => {
    const barWidth = (party.totalAbsences / maxAbsences) * 100;
    const partyColor = getPartyColorJS(party.name);
    
    return `
      <div class="party-chart-item">
        <div class="party-chart-label">${party.name}</div>
        <div class="party-chart-bar">
          <div class="party-chart-fill" style="width: ${barWidth}%; background-color: ${partyColor};"></div>
          <div class="party-chart-text">${party.totalAbsences}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getPartyColorJS(party) {
  const colors = {
    'FPÖ': '#005cbf',
    'SPÖ': '#ce000c', 
    'ÖVP': '#63c3d0',
    'NEOS': '#e91c7a',
    'Grüne': '#88b626',
    'Unknown': '#6c757d',
    'Unbekannt': '#6c757d'
  };
  return colors[party] || '#6c757d';
}

// CLI usage
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node generate-html.js <json-file> [output-file]');
    process.exit(1);
  }
  
  const jsonFile = args[0];
  const outputFile = args[1] || 'parliament_absences.html';
  
  if (!fs.existsSync(jsonFile)) {
    console.error(`Error: File ${jsonFile} does not exist`);
    process.exit(1);
  }
  
  try {
    const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    generateHTML(jsonData, outputFile);
  } catch (error) {
    console.error(`Error processing ${jsonFile}:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateHTML };