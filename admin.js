// ══════════════════════════════════════════
//  FIREBASE CONFIG — same as dashboard.js
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyB6QdyAXSWkyJZxYZ-FmYodEf_CY-PsVik",
  authDomain:        "crisisgrid-36a3d.firebaseapp.com",
  projectId:         "crisisgrid-36a3d",
  storageBucket:     "crisisgrid-36a3d.firebasestorage.app",
  messagingSenderId: "1002066303670",
  appId:             "1:1002066303670:web: "
};

const typeEmoji = {
  fire:     '🔥',
  accident: '🚗',
  flood:    '🌊',
  medical:  '🏥',
  robbery:  '🚨',
  traffic:  '🚦',
  calamity: '⛈️',
  other:    '⚠️'
};

// ══════════════════════════════════════════
//  GLOBALS
// ══════════════════════════════════════════
let map, heatmap;
let allReports    = [];
let allUsers      = {};
let currentReport = null;
let heatmapOn     = false;
let markers       = [];
let selectedBType = 'warning';

// ══════════════════════════════════════════
//  GOOGLE MAPS INIT
// ══════════════════════════════════════════
window.initMap = function() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 22.5, lng: 80.0 },
    zoom: 5,
    mapTypeId: 'roadmap',
    disableDefaultUI: true,
    styles: [
      { elementType:'geometry',              stylers:[{color:'#1d2c4d'}] },
      { elementType:'labels.text.fill',      stylers:[{color:'#8ec3b9'}] },
      { elementType:'labels.text.stroke',    stylers:[{color:'#1a3646'}] },
      { featureType:'water', elementType:'geometry',         stylers:[{color:'#0e1626'}] },
      { featureType:'water', elementType:'labels.text.fill', stylers:[{color:'#4e6d70'}] },
      { featureType:'road',  elementType:'geometry',         stylers:[{color:'#304a7d'}] },
      { featureType:'road',  elementType:'geometry.stroke',  stylers:[{color:'#255763'}] },
      { featureType:'poi',   elementType:'geometry',         stylers:[{color:'#283d6a'}] },
      { featureType:'administrative', elementType:'geometry',stylers:[{color:'#4b6878'}] },
      { featureType:'landscape.natural', elementType:'geometry', stylers:[{color:'#023e58'}] },
    ],
  });

  loadFirebase();
};

// ══════════════════════════════════════════
//  FIREBASE LOAD
// ══════════════════════════════════════════
function loadFirebase() {
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js").then(({ initializeApp }) => {
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({ getAuth, onAuthStateChanged, signOut }) => {
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(({
        getFirestore, collection, getDocs, doc,
        updateDoc, deleteDoc, query, orderBy, setDoc, getDoc
      }) => {

        const fbApp = initializeApp(firebaseConfig);
        const auth  = getAuth(fbApp);
        const db    = getFirestore(fbApp);

        // ── Check admin auth ──
        onAuthStateChanged(auth, async user => {
          if (!user) { window.location.href = 'index.html'; return; }

          // Check if user has admin role in Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            alert('⛔ Access denied. Admins only.');
            window.location.href = 'index.html';
            return;
          }

          const displayName = user.displayName || user.email.split('@')[0];
          document.getElementById('admin-name').textContent   = displayName;
          document.getElementById('admin-avatar').textContent = displayName.charAt(0).toUpperCase();

          // Load everything
          await loadAllReports(db);
          await loadAllUsers(db);

          // ── Logout ──
          window.logoutUser = () => signOut(auth).then(() => window.location.href = 'index.html');

          // ── Update report status ──
          window.updateStatus = async (status) => {
            if (!currentReport) return;
            try {
              await updateDoc(doc(db, 'reports', currentReport.firestoreId), { status });
              currentReport.status = status;
              showToast(`✅ Status updated to ${status}`, 3000);
              closePopup();
              await loadAllReports(db);
            } catch(e) {
              showToast('❌ Error: ' + e.message, 3000);
            }
          };

          // ── Delete report ──
          window.deleteReport = async () => {
            if (!currentReport) return;
            if (!confirm('🗑️ Delete this report permanently?')) return;
            try {
              await deleteDoc(doc(db, 'reports', currentReport.firestoreId));
              showToast('🗑️ Report deleted.', 3000);
              closePopup();
              await loadAllReports(db);
            } catch(e) {
              showToast('❌ Error: ' + e.message, 3000);
            }
          };

          // ── Ban user ──
          window.banUser = async (uid, btn) => {
            const isBanned = btn.classList.contains('banned');
            try {
              await updateDoc(doc(db, 'users', uid), { banned: !isBanned });
              btn.textContent = isBanned ? 'Ban' : 'Banned';
              btn.classList.toggle('banned', !isBanned);
              showToast(isBanned ? '✅ User unbanned.' : '🚫 User banned.', 3000);
            } catch(e) {
              showToast('❌ Error: ' + e.message, 3000);
            }
          };

          // ── Send broadcast ──
          window.sendBroadcast = async () => {
            const msg = document.getElementById('broadcast-msg').value.trim();
            if (!msg) { showToast('⚠️ Type a message first.', 3000); return; }
            try {
              await setDoc(doc(db, 'broadcasts', 'latest'), {
                message:   msg,
                type:      selectedBType,
                timestamp: new Date(),
                active:    true,
              });
              showToast('📢 Broadcast sent to all users!', 4000);
              closeBroadcast();
              document.getElementById('broadcast-msg').value = '';
            } catch(e) {
              showToast('❌ Error: ' + e.message, 3000);
            }
          };

        });
      });
    });
  });
}

// ══════════════════════════════════════════
//  LOAD ALL REPORTS
// ══════════════════════════════════════════
async function loadAllReports(db) {
  const { getFirestore, collection, getDocs, query, orderBy } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

  try {
    const q    = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    allReports = [];

    snap.forEach(d => {
      const r = d.data();
      allReports.push({ ...r, firestoreId: d.id });
    });

    // Auto-flag suspicious users (5+ reports in 10 mins)
    autoFlagSuspicious();

    renderReports(allReports);
    dropMarkers(allReports);
    updateStats(allReports);

  } catch(e) {
    console.warn('Error loading reports:', e);
  }
}

// ══════════════════════════════════════════
//  LOAD ALL USERS
// ══════════════════════════════════════════
async function loadAllUsers(db) {
  try {
    const { collection, getDocs } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const snap = await getDocs(collection(db, 'users'));
    allUsers   = {};

    snap.forEach(d => {
      allUsers[d.id] = { ...d.data(), uid: d.id };
    });

    renderUsers(Object.values(allUsers));

  } catch(e) {
    console.warn('Error loading users:', e);
  }
}

// ══════════════════════════════════════════
//  AUTO FLAG SUSPICIOUS
//  If same user submits 5+ reports in 10 mins
// ══════════════════════════════════════════
function autoFlagSuspicious() {
  const userTimes = {};

  allReports.forEach(r => {
    if (!r.uid || !r.timestamp) return;
    if (!userTimes[r.uid]) userTimes[r.uid] = [];
    const t = r.timestamp?.toDate?.() || new Date();
    userTimes[r.uid].push(t.getTime());
  });

  const suspiciousUIDs = new Set();

  Object.entries(userTimes).forEach(([uid, times]) => {
    times.sort((a, b) => a - b);
    for (let i = 0; i <= times.length - 5; i++) {
      const diff = times[i + 4] - times[i];
      if (diff <= 10 * 60 * 1000) { // 10 minutes
        suspiciousUIDs.add(uid);
        break;
      }
    }
  });

  // Mark reports as flagged if from suspicious user
  allReports.forEach(r => {
    if (suspiciousUIDs.has(r.uid)) r.autoFlagged = true;
  });
}

// ══════════════════════════════════════════
//  RENDER REPORTS LIST
// ══════════════════════════════════════════
function renderReports(list) {
  const el = document.getElementById('reports-list');
  el.innerHTML = '';

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;color:#444;font-size:12px;padding:24px">No reports found.</div>`;
    return;
  }

  list.forEach((r, idx) => {
    const ts = r.timestamp?.toDate?.()?.toLocaleString('en-IN', {
      dateStyle:'short', timeStyle:'short'
    }) || 'Just now';

    const isFlagged = r.autoFlagged;

    const statusMap = {
      verified:     { label:'✅ Verified',     cls:'badge-verified' },
      under_review: { label:'⏳ Review',        cls:'badge-review'   },
      rejected:     { label:'❌ Rejected',      cls:'badge-rejected'  },
    };

    const st = statusMap[r.status] || statusMap['under_review'];

    el.innerHTML += `
      <div class="report-card ${isFlagged ? 'flagged' : r.type}" onclick="openReportPopup(${idx})">
        <div class="rc-top">
          <span class="rc-icon">${typeEmoji[r.type] || '⚠️'}</span>
          <span class="rc-type">${cap(r.type)}</span>
          <span class="rc-badge ${isFlagged ? 'badge-flagged' : st.cls}">
            ${isFlagged ? '🚩 Flagged' : st.label}
          </span>
        </div>
        <div class="rc-loc">📍 ${r.locationLabel || 'Location recorded'}</div>
        <div class="rc-user">👤 ${r.userName || 'Anonymous'} · ${ts}</div>
      </div>`;
  });
}

// ══════════════════════════════════════════
//  RENDER USERS LIST
// ══════════════════════════════════════════
function renderUsers(list) {
  const el = document.getElementById('users-list');
  el.innerHTML = '';

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;color:#444;font-size:12px;padding:24px">No users found.</div>`;
    return;
  }

  list.forEach(u => {
    const reportCount = allReports.filter(r => r.uid === u.uid).length;
    const isBanned    = u.banned || false;
    const name        = u.displayName || u.email?.split('@')[0] || 'Unknown';

    el.innerHTML += `
      <div class="user-card">
        <div class="uc-avatar">${name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="uc-name">${name}</div>
          <div class="uc-email">${u.email || '—'}</div>
          <div class="uc-count">📋 ${reportCount} reports</div>
        </div>
        <button class="ban-btn ${isBanned ? 'banned' : ''}"
          onclick="banUser('${u.uid}', this)">
          ${isBanned ? 'Banned' : 'Ban'}
        </button>
      </div>`;
  });
}

// ══════════════════════════════════════════
//  UPDATE STATS
// ══════════════════════════════════════════
function updateStats(list) {
  const now   = new Date();
  const today = list.filter(r => {
    const t = r.timestamp?.toDate?.();
    return t && (now - t) < 86400000;
  });
  const week = list.filter(r => {
    const t = r.timestamp?.toDate?.();
    return t && (now - t) < 7 * 86400000;
  });
  const flagged = list.filter(r => r.autoFlagged);

  document.getElementById('stat-today').textContent   = today.length;
  document.getElementById('stat-week').textContent    = week.length;
  document.getElementById('stat-total').textContent   = list.length;
  document.getElementById('stat-flagged').textContent = flagged.length;

  // Most common type
  const typeCounts = {};
  list.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('insight-type').textContent =
    topType ? `${typeEmoji[topType[0]]} ${cap(topType[0])}` : '—';

  // Most affected city
  const cityCounts = {};
  list.forEach(r => {
    const city = r.locationLabel?.split(',')?.[0]?.trim();
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
  });
  const topCity = Object.entries(cityCounts).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('insight-city').textContent = topCity ? topCity[0] : '—';
}

// ══════════════════════════════════════════
//  MAP MARKERS
// ══════════════════════════════════════════
function makeEmojiIcon(type, flagged) {
  const emoji = flagged ? '🚩' : (typeEmoji[type] || '⚠️');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="40" viewBox="0 0 36 40">
      <ellipse cx="18" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
      <circle cx="18" cy="17" r="17" fill="rgba(20,20,30,0.85)" stroke="${flagged ? '#FF2D2D' : 'white'}" stroke-width="2"/>
      <text x="18" y="23" text-anchor="middle" font-size="18">${emoji}</text>
    </svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(36, 40),
    anchor:     new google.maps.Point(18, 40),
  };
}

function dropMarkers(list) {
  markers.forEach(m => m.setMap(null));
  markers = [];

  list.forEach((r, idx) => {
    if (!r.lat || !r.lng) return;
    const marker = new google.maps.Marker({
      position: { lat: r.lat, lng: r.lng },
      map,
      icon:   makeEmojiIcon(r.type, r.autoFlagged),
      zIndex: r.autoFlagged ? 200 : 100,
    });
    marker.addListener('click', () => openReportPopup(idx));
    markers.push(marker);
  });

  // Setup heatmap data
  const heatData = list
    .filter(r => r.lat && r.lng)
    .map(r => new google.maps.LatLng(r.lat, r.lng));

  if (heatmap) {
    heatmap.setData(heatData);
  } else {
    heatmap = new google.maps.visualization.HeatmapLayer({
      data: heatData,
      map:  null,
      radius: 40,
    });
  }
}

// ══════════════════════════════════════════
//  REPORT POPUP
// ══════════════════════════════════════════
function openReportPopup(idx) {
  const r = allReports[idx];
  if (!r) return;
  currentReport = r;

  const ts = r.timestamp?.toDate?.()?.toLocaleString('en-IN', {
    dateStyle:'short', timeStyle:'short'
  }) || 'Just now';

  document.getElementById('popup-type').textContent =
    `${typeEmoji[r.type] || '⚠️'} ${cap(r.type)} ${r.autoFlagged ? '🚩 FLAGGED' : ''}`;
  document.getElementById('popup-loc').textContent  =
    `📍 ${r.locationLabel || 'Location recorded'}`;
  document.getElementById('popup-desc').textContent =
    r.desc || 'No description provided.';
  document.getElementById('popup-meta').innerHTML   =
    `👤 ${r.userName || 'Anonymous'}<br>✉️ ${r.userEmail || '—'}<br>🕐 ${ts}<br>📌 Status: ${r.status || 'under_review'}`;

  document.getElementById('info-popup').style.display = 'block';

  if (map && r.lat && r.lng) {
    map.panTo({ lat: r.lat, lng: r.lng });
    map.setZoom(14);
  }
}

function closePopup() {
  document.getElementById('info-popup').style.display = 'none';
  currentReport = null;
}

// ══════════════════════════════════════════
//  FILTER REPORTS
// ══════════════════════════════════════════
function filterReports(btn, type) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');

  let filtered;
  if      (type === 'all')          filtered = allReports;
  else if (type === 'flagged')      filtered = allReports.filter(r => r.autoFlagged);
  else                              filtered = allReports.filter(r => r.status === type);

  renderReports(filtered);
  dropMarkers(filtered);
}

// ══════════════════════════════════════════
//  HEATMAP TOGGLE
// ══════════════════════════════════════════
function toggleHeatmap() {
  heatmapOn = !heatmapOn;
  if (heatmap) heatmap.setMap(heatmapOn ? map : null);

  const btn = document.querySelector('.action-btn');
  btn.classList.toggle('on', heatmapOn);

  // Hide/show normal markers when heatmap is on
  markers.forEach(m => m.setMap(heatmapOn ? null : map));
}

// ══════════════════════════════════════════
//  RESET MAP
// ══════════════════════════════════════════
function resetMapView() {
  if (!map) return;
  map.panTo({ lat: 22.5, lng: 80.0 });
  map.setZoom(5);
}

// ══════════════════════════════════════════
//  TAB SWITCH
// ══════════════════════════════════════════
function switchTab(tab) {
  const isReports = tab === 'reports';
  document.getElementById('stab-reports').classList.toggle('on',  isReports);
  document.getElementById('stab-users').classList.toggle('on',   !isReports);
  document.getElementById('panel-reports').style.display = isReports ? 'block' : 'none';
  document.getElementById('panel-users').style.display   = isReports ? 'none'  : 'block';
}

// ══════════════════════════════════════════
//  BROADCAST MODAL
// ══════════════════════════════════════════
function openBroadcast()  { document.getElementById('broadcast-modal').classList.add('open'); }
function closeBroadcast() { document.getElementById('broadcast-modal').classList.remove('open'); }
function overlayClick(e)  { if (e.target === document.getElementById('broadcast-modal')) closeBroadcast(); }

function selectBType(el) {
  document.querySelectorAll('.btype').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedBType = el.dataset.type;
}

// ══════════════════════════════════════════
//  EXPORT CSV
// ══════════════════════════════════════════
function exportCSV() {
  if (!allReports.length) { showToast('⚠️ No reports to export.', 3000); return; }

  const headers = ['Type','Description','Location','Lat','Lng','User','Email','Status','Timestamp'];
  const rows = allReports.map(r => [
    r.type        || '',
    (r.desc       || '').replace(/,/g, ' '),
    (r.locationLabel || '').replace(/,/g, ' '),
    r.lat         || '',
    r.lng         || '',
    r.userName    || '',
    r.userEmail   || '',
    r.status      || '',
    r.timestamp?.toDate?.()?.toLocaleString('en-IN') || '',
  ]);

  const csv     = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `crisisnet_reports_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇️ CSV downloaded!', 3000);
}

// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════
function showToast(msg, duration = 0) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.style.cssText = `
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:rgba(18,18,18,.97); color:#F0F0F0;
      border:1px solid rgba(255,255,255,.1); border-radius:30px;
      padding:10px 22px; font-size:13px; z-index:9999;
      box-shadow:0 8px 24px rgba(0,0,0,.5);
      font-family:'DM Sans',sans-serif;
      transition:opacity .3s; white-space:nowrap;
    `;
    document.body.appendChild(t);
  }
  t.textContent   = msg;
  t.style.opacity = '1';
  t.style.display = 'block';
  if (duration > 0) setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.style.display = 'none', 300);
  }, duration);
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }