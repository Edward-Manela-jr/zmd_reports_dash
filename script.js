/* --- SHARED LOGIC --- */
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function updateClock() {
    const now = new Date();
    document.getElementById('currentDate').innerText = now.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
    document.getElementById('currentTime').innerText = now.toLocaleTimeString([], { hour12: false });
}
setInterval(updateClock, 1000); updateClock();

/* --- STATION MONITOR LOGIC --- */
let stationMaster = new Map();
async function processMonitorFiles(e) {
    const files = Array.from(e.target.files);
    const now = new Date();
    const noise = ['CRASH', 'DCP', 'MQTT', 'AWS', 'SOLAR', 'LOG', 'SYNOP', 'TABLE'];
    const noiseRegex = new RegExp('(' + noise.join('|') + ').*', 'g');

    for (const file of files) {
        let name = file.name.split('.')[0].toUpperCase().replace(noiseRegex, '').replace(/(?<=[A-Z_\s])\d+/g, '').replace(/_/g, ' ').trim();
        if (name.length < 2) continue;

        try {
            const text = new TextDecoder().decode(await file.arrayBuffer());
            const matches = text.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g);
            if (!matches) continue;

            const latestDate = new Date(Math.max(...matches.map(d => {
                const s = d.split(/[-/]/);
                return s[0].length === 4 ? new Date(d) : new Date(s[2], s[1]-1, s[0]);
            })));

            const existing = stationMaster.get(name);
            if (!existing || latestDate > existing.rawDate) {
                const diff = (now - latestDate) / 3600000;
                stationMaster.set(name, {
                    rawDate: latestDate,
                    dateStr: latestDate.toISOString().split('T')[0],
                    status: diff > 72 ? "Offline" : (diff > 24 ? "Delayed" : "Online")
                });
            }
        } catch (err) {}
    }
    updateMonitorDisplay();
}

function updateMonitorDisplay() {
    const query = document.getElementById('search').value.toLowerCase();
    const tbody = document.getElementById('monitorTable');
    tbody.innerHTML = '';
    let stats = { total: 0, online: 0, delayed: 0, offline: 0 };

    Array.from(stationMaster.keys()).sort().forEach(name => {
        if (!name.toLowerCase().includes(query)) return;
        const data = stationMaster.get(name);
        stats.total++; stats[data.status.toLowerCase()]++;
        tbody.innerHTML += `<tr><td><strong>${name}</strong></td><td>${data.dateStr}</td><td><span class="status status-${data.status.toLowerCase()}">${data.status}</span></td></tr>`;
    });

    document.getElementById('kTotal').innerText = stats.total;
    document.getElementById('kOnline').innerText = stats.online;
    document.getElementById('kDelayed').innerText = stats.delayed;
    document.getElementById('kOffline').innerText = stats.offline;
}

function resetMonitor() { stationMaster.clear(); updateMonitorDisplay(); }

function downloadCSV() {
    let csv = "Station ID,Transmission,Status\n";
    stationMaster.forEach((v, k) => csv += `"${k}","${v.dateStr}","${v.status}"\n`);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
    a.download = "ZMD_Monitor_Report.csv"; a.click();
}

/* --- PHOTO RENAMER LOGIC --- */
let photoQueue = [];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function handleRenamerFiles(e) {
    photoQueue = Array.from(e.target.files).filter(f => !f.name.startsWith('.'));
    const log = document.getElementById('renLog');
    if (photoQueue.length > 0) {
        document.getElementById('renProcessBtn').disabled = false;
        log.innerHTML += `<br><span style="color:#4ade80">[READY] ${photoQueue.length} photos loaded.</span>`;
    }
}

async function executeRenaming() {
    const log = document.getElementById('renLog');
    const zip = new JSZip();
    const folderPath = photoQueue[0].webkitRelativePath || "ARCHIVE_2026";
    const folderName = folderPath.split('/')[0];
    const parts = folderName.split('_');
    const year = parts[0] || "2026";
    const skips = parts.slice(1).map(n => parseInt(n));
    
    const avail = [];
    for (let i = 1; i <= 12; i++) if (!skips.includes(i)) avail.push(MONTHS[i-1]);

    log.innerHTML += `<br>[START] Renaming for ${year}...`;
    const perMonth = Math.ceil(photoQueue.length / avail.length);

    photoQueue.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true})).forEach((file, i) => {
        let mIdx = Math.min(Math.floor(i / perMonth), avail.length - 1);
        const ext = file.name.split('.').pop();
        const newName = `${avail[mIdx]}_${year}_${(i % perMonth) + 1}.${ext}`;
        zip.file(`${folderName}_Renamed/${newName}`, file);
    });

    const content = await zip.generateAsync({type: "blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${folderName}_Processed.zip`;
    link.click();
    log.innerHTML += `<br><span style="color:#4ade80">[COMPLETE] Downloaded.</span>`;
}

function resetRenamer() { photoQueue = []; document.getElementById('renLog').innerHTML = "[SYSTEM] Ready."; document.getElementById('renProcessBtn').disabled = true; }
