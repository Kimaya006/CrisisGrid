// 🔑 GEMINI API KEY — Get from https://aistudio.google.com → paste AIza... key here
const GEMINI_KEY = "AIzaSyCm0ox1uylw6E9-bdyW2InY32v29p2FhL0";

// 🔑 FIREBASE CONFIG
const firebaseConfig = {
  apiKey:            "AIzaSyB6QdyAXSWkyJZxYZ-FmYodEf_CY-PsVik",
  authDomain:        "crisisgrid-36a3d.firebaseapp.com",
  projectId:         "crisisgrid-36a3d",
  storageBucket:     "crisisgrid-36a3d.firebasestorage.app",
  messagingSenderId: "1002066303670",
  appId:             "1:1002066303670:web:f761b2960aa90c067ba417"
};

// ══════════════════════════════════════════
//  PRECAUTIONS — fallback only (if Gemini fails)
// ══════════════════════════════════════════
const precautions = {
  fire: {
    dos:   ["Call 101 immediately", "Evacuate the building", "Stay low to avoid smoke", "Use stairs, not elevators", "Close doors to slow fire spread"],
    donts: ["Don't use water on electrical fires", "Don't open hot doors", "Don't go back inside", "Don't use lifts"]
  },
  accident: {
    dos:   ["Call 108 ambulance immediately", "Secure the area with warning signs", "Help injured if trained in first aid", "Note vehicle numbers", "Call 100 police"],
    donts: ["Don't move seriously injured persons", "Don't crowd the accident spot", "Don't remove helmet of injured", "Don't leave the scene"]
  },
  flood: {
    dos:   ["Move to higher ground immediately", "Disconnect all electricity", "Call NDRF: 011-24363260", "Carry emergency kit", "Follow evacuation orders"],
    donts: ["Don't walk in moving water", "Don't drive through flooded roads", "Don't touch electrical equipment", "Don't ignore warnings"]
  },
  medical: {
    dos:   ["Call 108 immediately", "Keep patient conscious and calm", "Start CPR if trained", "Keep patient warm", "Clear airway"],
    donts: ["Don't give food or water", "Don't move patient unnecessarily", "Don't leave patient alone", "Don't panic"]
  },
  robbery: {
    dos:   ["Call 100 immediately", "Move to a safe location", "Note suspect description", "Alert nearby people", "Cooperate with police"],
    donts: ["Don't resist the attacker", "Don't chase the suspect", "Don't touch evidence", "Don't share on social media before reporting"]
  },
  traffic: {
    dos:   ["Call 100 for traffic police", "Use alternate routes", "Follow traffic officer instructions", "Keep emergency lane clear"],
    donts: ["Don't honk unnecessarily", "Don't block emergency vehicles", "Don't stop on the road", "Don't use phone while driving"]
  },
  calamity: {
    dos:   ["Evacuate immediately", "Follow government advisories", "Call NDRF: 011-24363260", "Stock emergency supplies", "Stay tuned to news"],
    donts: ["Don't ignore warnings", "Don't spread rumours", "Don't enter danger zones", "Don't block rescue operations"]
  },
  other: {
    dos:   ["Call 112 for emergency", "Stay calm and assess situation", "Alert nearby people", "Follow authority instructions"],
    donts: ["Don't panic", "Don't spread unverified info", "Don't ignore the situation", "Don't obstruct emergency services"]
  }
};

const typeEmoji = {
  fire:'🔥', accident:'🚗', flood:'🌊', medical:'🏥',
  robbery:'🚨', traffic:'🚦', calamity:'⛈️', other:'⚠️'
};

function makeEmojiIcon(type) {
  const emoji = typeEmoji[type] || '⚠️';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="40" viewBox="0 0 36 40">
    <ellipse cx="18" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
    <circle cx="18" cy="17" r="17" fill="rgba(20,20,30,0.85)" stroke="white" stroke-width="2"/>
    <text x="18" y="23" text-anchor="middle" font-size="18">${emoji}</text>
  </svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(36, 40),
    anchor: new google.maps.Point(18, 40),
  };
}

// ══════════════════════════════════════════
//  FIREBASE INIT
// ══════════════════════════════════════════
import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js").then(({ initializeApp }) => {
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({ getAuth, onAuthStateChanged, signOut }) => {
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(({
      getFirestore, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp,
      onSnapshot, doc   // ✅ doc added here — required for broadcast listener
    }) => {
      const fbApp = initializeApp(firebaseConfig);
      const auth  = getAuth(fbApp);
      const db    = getFirestore(fbApp);
      window._db  = db;

      onAuthStateChanged(auth, user => {
        if (!user) { window.location.href = 'index.html'; return; }
        window.currentUser = user;

        const displayName = user.displayName || user.email.split('@')[0];
        document.getElementById('sidebar-name').textContent = displayName;
        document.getElementById('sidebar-role').textContent = 'Citizen Reporter';

        const avatarEl = document.getElementById('sidebar-avatar');
        if (user.photoURL) {
          avatarEl.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`;
        } else {
          avatarEl.textContent = displayName.charAt(0).toUpperCase();
        }

        document.getElementById('af-name').textContent  = displayName;
        document.getElementById('af-phone').textContent = user.phoneNumber || 'Not provided';
        document.getElementById('af-email').textContent = user.email || '—';

        loadMyReports();
        loadAllReportsOnMap();

        // ── BROADCAST ALERT — inside closure so doc/onSnapshot are in scope ──
        initBroadcastListener(db, doc, onSnapshot);
      });

      window.logoutUser = () => signOut(auth).then(() => window.location.href = 'index.html');

      window._saveReport = async (reportData) => {
        const areaKey = reportData.lat && reportData.lng
          ? `${parseFloat(reportData.lat.toFixed(2))}_${parseFloat(reportData.lng.toFixed(2))}`
          : 'unknown';
        const ref = await addDoc(collection(db, 'reports'), {
          ...reportData, areaKey, timestamp: serverTimestamp(),
        });
        return ref.id;
      };

      window.loadAllReportsOnMap = async () => {
        try {
          const snap = await getDocs(query(collection(db, 'reports'), orderBy('timestamp', 'desc')));
          const list = [];
          snap.forEach(d => { const r = d.data(); if (r.lat && r.lng) list.push({ ...r, firestoreId: d.id }); });
          liveIncidents = list;
          dropMarkersFromDB(list);
          renderFeed(list);
        } catch (e) { console.warn('Could not load reports:', e); }
      };

      window.loadMyReports = async () => {
        const panel = document.getElementById('my-reports-list');
        panel.innerHTML = `<div class="mr-empty">Loading...</div>`;
        if (!window.currentUser) return;
        try {
          const snap = await getDocs(query(
            collection(db, 'reports'),
            where('uid', '==', window.currentUser.uid),
            orderBy('timestamp', 'desc')
          ));
          if (snap.empty) {
            panel.innerHTML = `<div class="mr-empty">No reports yet.<br>Tap "+ Report Incident" to submit one.</div>`;
            return;
          }
          panel.innerHTML = '';
          snap.forEach(d => {
            const r  = d.data();
            const ts = r.timestamp?.toDate?.()?.toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) || 'Just now';
            const distText = (userLat && userLng && r.lat && r.lng)
              ? `${Math.round(getDistanceKm(userLat, userLng, r.lat, r.lng))} km away` : '';
            const statusMap = {
              verified:     { label:'✅ Verified & Live', cls:'status-verified' },
              under_review: { label:'⏳ Under Review',     cls:'status-review'   },
              rejected:     { label:'❌ Rejected',         cls:'status-rejected'  },
            };
            const st = statusMap[r.status] || statusMap['under_review'];
            panel.innerHTML += `
              <div class="mr-card" onclick="flyToIncident(${r.lat}, ${r.lng})">
                <div class="mr-top">
                  <span class="mr-icon">${typeEmoji[r.type]||'⚠️'}</span>
                  <span class="mr-type">${cap(r.type)}</span>
                  <span class="mr-badge ${st.cls}">${st.label}</span>
                </div>
                <div class="mr-desc">${r.desc||'No description'}</div>
                <div class="mr-meta">
                  <span>📍 ${r.locationLabel||'Location recorded'}</span>
                  <span>${ts}</span>
                  ${distText ? `<span>📏 ${distText}</span>` : ''}
                </div>
              </div>`;
          });
        } catch (err) {
          panel.innerHTML = `<div class="mr-empty">Could not load.<br><small style="color:#444">${err.message}</small></div>`;
        }
      };
    });
  });
});

// ══════════════════════════════════════════
//  BROADCAST ALERT — POPUP MODAL
// ══════════════════════════════════════════

const bcConfig = {
  warning:   { icon: '⚠️', label: 'WARNING',   color: '#FF7A00', bg: '#3d1d00', border: '#FF7A00' },
  emergency: { icon: '🚨', label: 'EMERGENCY', color: '#FF2D2D', bg: '#2a0000', border: '#FF2D2D' },
  info:      { icon: '📢', label: 'NOTICE',    color: '#4A90E2', bg: '#001a33', border: '#4A90E2' },
  safe:      { icon: '✅', label: 'SAFE ZONE', color: '#22c55e', bg: '#001a00', border: '#22c55e' },
};

function showBroadcastBanner(message, type, timestamp) {
  const old = document.getElementById('bc-popup-overlay');
  if (old) old.remove();

  const cfg = bcConfig[type] || bcConfig['warning'];

  let timeStr = 'Just now';
  if (timestamp?.toDate) {
    timeStr = timestamp.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  const overlay = document.createElement('div');
  overlay.id = 'bc-popup-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0;
    background:rgba(0,0,0,0.65);
    z-index:999999;
    display:flex; align-items:center; justify-content:center;
    animation:bcFadeIn 0.25s ease both;
    font-family:'DM Sans',sans-serif;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes bcFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes bcSlideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes bcPulse2  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }
      #bc-popup-box { animation:bcSlideUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
      .bc-dismiss-btn:hover { opacity:0.85; transform:scale(0.97); }
    </style>
    <div id="bc-popup-box" style="
      background:${cfg.bg};
      border:1.5px solid ${cfg.border};
      border-radius:18px;
      padding:28px 28px 22px;
      max-width:380px; width:90%;
      box-shadow:0 8px 48px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.05);
    ">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${cfg.color};animation:bcPulse2 1.3s ease-in-out infinite;flex-shrink:0;"></div>
        <span style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${cfg.color};">${cfg.label}</span>
        <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.3);">${timeStr}</span>
      </div>
      <div style="font-size:48px;text-align:center;margin-bottom:14px;line-height:1;">${cfg.icon}</div>
      <div style="font-size:16px;font-weight:600;color:#f0ece8;text-align:center;line-height:1.5;margin-bottom:22px;padding:0 4px;">${message}</div>
      <button class="bc-dismiss-btn" onclick="dismissBroadcast()" style="
        width:100%;padding:12px;
        background:${cfg.color};
        border:none;border-radius:10px;
        color:#fff;font-size:14px;font-weight:600;
        cursor:pointer;transition:opacity .2s,transform .15s;
        font-family:'DM Sans',sans-serif;
      ">Got it — Dismiss</button>
    </div>
  `;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismissBroadcast(); });
  document.body.appendChild(overlay);
}

function hideBroadcastBanner() {
  const overlay = document.getElementById('bc-popup-overlay');
  if (!overlay) return;
  overlay.style.transition = 'opacity 0.25s ease';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 250);
}

function dismissBroadcast() {
  hideBroadcastBanner();
}

// ══════════════════════════════════════════
//  GLOBALS
// ══════════════════════════════════════════
let map, markers = [], currentZoom = 5;
let userLat = null, userLng = null, userLocationLabel = '';
let userMarker = null;
let selectedModalType = null;
let modalFile = null;
let liveIncidents = [];
let geminiChatHistory = [];
let currentReportContext = null;

window.currentUser = null;
window._db = null;

// ══════════════════════════════════════════
//  GOOGLE MAPS INIT
// ══════════════════════════════════════════
window.initMap = function () {
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
  fetchUserLocation();
};

// ══════════════════════════════════════════
//  LOCATION
// ══════════════════════════════════════════
function fetchUserLocation() {
  showToast('📍 Fetching your location...');
  if (!navigator.geolocation) { showToast('❌ GPS not supported.', 3000); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    map.panTo({ lat: userLat, lng: userLng });
    setTimeout(() => { map.setZoom(12); currentZoom = 12; }, 600);
    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({
      position: { lat: userLat, lng: userLng }, map,
      title: 'Your Location',
      icon: { path:google.maps.SymbolPath.CIRCLE, scale:14, fillColor:'#4A90E2', fillOpacity:1, strokeColor:'#fff', strokeWeight:3 },
      zIndex: 999, animation: google.maps.Animation.BOUNCE,
    });
    setTimeout(() => { if (userMarker) userMarker.setAnimation(null); }, 2000);
    reverseGeocode(userLat, userLng);
    showToast('✅ Location found!', 3000);
  }, () => { showToast('⚠️ Location denied.', 3000); });
}

function reverseGeocode(lat, lng) {
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status !== 'OK' || !results[0]) return;
    let city = '', state = '';
    results[0].address_components.forEach(c => {
      if (c.types.includes('locality'))                    city  = c.long_name;
      if (c.types.includes('administrative_area_level_1')) state = c.short_name;
    });
    const label = city ? `${city}, ${state}` : 'Your Area';
    userLocationLabel = label;
    document.getElementById('breadcrumb').innerHTML =
      `<span class="bc-btn" onclick="resetView()">🇮🇳 India</span><span class="sep">›</span><span>📍 ${label}</span>`;
    document.getElementById('map-title').textContent      = `📍 ${label}`;
    document.getElementById('feed-location').textContent  = label;
    document.getElementById('sidebar-role').textContent   = `📍 ${label}`;
    document.getElementById('modal-loc-text').textContent = `${label} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  });
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function flyToIncident(lat, lng) {
  if (!map || !lat || !lng) return;
  map.panTo({ lat, lng }); map.setZoom(15); currentZoom = 15;
}

// ══════════════════════════════════════════
//  MAP MARKERS
// ══════════════════════════════════════════
function dropMarkersFromDB(list) {
  markers.forEach(m => m.setMap(null)); markers = [];
  list.forEach((inc, idx) => {
    const marker = new google.maps.Marker({
      position: { lat: inc.lat, lng: inc.lng }, map,
      title: `${inc.type} — ${inc.locationLabel || ''}`,
      icon: makeEmojiIcon(inc.type), zIndex: 100,
    });
    marker.addListener('click', () => showDBPopup(idx));
    markers.push(marker);
  });
}

// ══════════════════════════════════════════
//  FEED
// ══════════════════════════════════════════
function renderFeed(list) {
  const feed = document.getElementById('incident-feed');
  feed.innerHTML = '';
  if (!list || !list.length) {
    feed.innerHTML = `<div style="text-align:center;color:#444;font-size:12px;padding:20px">No incidents reported yet.</div>`;
    return;
  }
  list.forEach((inc, idx) => {
    const bc   = inc.severity==='critical'?'badge-critical':inc.severity==='moderate'?'badge-moderate':'badge-low';
    const ts   = inc.timestamp?.toDate?.()?.toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) || 'Just now';
    const dist = (userLat && userLng && inc.lat && inc.lng)
      ? `<span style="font-size:10px;color:#888;margin-left:6px">📏 ${Math.round(getDistanceKm(userLat,userLng,inc.lat,inc.lng))} km</span>` : '';
    feed.innerHTML += `
      <div class="feed-item ${inc.type}" onclick="showDBPopup(${idx})">
        <div class="feed-top">
          <span class="feed-icon">${typeEmoji[inc.type]||'⚠️'}</span>
          <span class="feed-type">${cap(inc.type)}</span>
          <span class="feed-time">${ts}</span>
        </div>
        <div class="feed-loc">📍 ${inc.locationLabel||'Location recorded'}${dist}</div>
        <span class="feed-badge ${bc}">${(inc.severity||'moderate').toUpperCase()}</span>
      </div>`;
  });
}

// ══════════════════════════════════════════
//  ✅ INCIDENT POPUP — Gemini AI Live Response
// ══════════════════════════════════════════
async function showDBPopup(idx) {
  const inc = liveIncidents[idx]; if (!inc) return;
  const dist = (userLat && userLng && inc.lat && inc.lng)
    ? `📏 ${Math.round(getDistanceKm(userLat, userLng, inc.lat, inc.lng))} km from you` : '';

  document.getElementById('popup-type').textContent = `${typeEmoji[inc.type]||'⚠️'} ${cap(inc.type)} Incident`;
  document.getElementById('popup-loc').textContent  = `📍 ${inc.locationLabel||'Location recorded'} ${dist}`;

  document.getElementById('popup-ai-text').innerHTML = `
    <div style="text-align:center;padding:18px 0;color:#888;font-size:12px">
      <div class="gemini-spinner" style="margin:0 auto 10px;width:20px;height:20px;border:2px solid rgba(255,45,45,.2);border-top-color:#FF2D2D;border-radius:50%;animation:spin .7s linear infinite"></div>
      🤖 Gemini AI analyzing incident...
    </div>`;

  document.getElementById('info-popup').style.display = 'block';
  if (map && inc.lat && inc.lng) map.panTo({ lat: inc.lat, lng: inc.lng });

  try {
    const prompt = `You are CrisisNet AI, an emergency response assistant for India.
A ${inc.type} incident was reported at ${inc.locationLabel || 'unknown location'}.
Reporter's description: "${inc.desc || 'No description provided'}"
Reported by: ${inc.userName || 'Anonymous'}

Give a concise, practical emergency response with:
1. Top 3 immediate DO's for this specific situation (with ✅)
2. Top 3 critical DON'Ts (with ❌)
3. The most relevant Indian emergency helpline number

Keep response under 120 words. Be direct and actionable. Respond in English.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyBbjxGe-YY0i60WF4YHbr5q4jBeFbt9ILY`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      }
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const data = await res.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not get AI response.';

    document.getElementById('popup-ai-text').innerHTML = `
      <div style="margin-bottom:8px;font-size:11px;color:#aaa">Reported by: <b>${inc.userName||'Anonymous'}</b></div>
      <div style="font-size:12px;line-height:1.9;color:#ccc;white-space:pre-wrap">${aiText}</div>`;

  } catch (err) {
    const p = precautions[inc.type] || precautions['other'];
    const dosHTML   = p.dos.map(d=>`<li>✅ ${d}</li>`).join('');
    const dontsHTML = p.donts.map(d=>`<li>❌ ${d}</li>`).join('');
    document.getElementById('popup-ai-text').innerHTML = `
      <div style="margin-bottom:8px;font-size:11px;color:#aaa">Reported by: <b>${inc.userName||'Anonymous'}</b></div>
      <div style="margin-bottom:6px;font-weight:600;color:#4fc3f7;font-size:12px">✅ DO's</div>
      <ul style="margin:0 0 10px 0;padding-left:16px;font-size:12px;line-height:1.8">${dosHTML}</ul>
      <div style="margin-bottom:6px;font-weight:600;color:#ef5350;font-size:12px">❌ DON'Ts</div>
      <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.8">${dontsHTML}</ul>`;
  }
}

function showPopup(id)  { showDBPopup(id); }
function closePopup()   { document.getElementById('info-popup').style.display = 'none'; }

function toggleFilter(btn, type) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  const filtered = type==='all' ? liveIncidents : liveIncidents.filter(i=>i.type===type);
  renderFeed(filtered);
  if (map) dropMarkersFromDB(filtered);
}

// ══════════════════════════════════════════
//  ZOOM & NAV
// ══════════════════════════════════════════
function zoomIn()  { if(map){ currentZoom=Math.min(currentZoom+1,18); map.setZoom(currentZoom); } }
function zoomOut() { if(map){ currentZoom=Math.max(currentZoom-1,3);  map.setZoom(currentZoom); } }
function resetView() {
  if (!map) return;
  map.panTo({lat:22.5,lng:80.0}); map.setZoom(5); currentZoom=5;
  document.getElementById('breadcrumb').innerHTML      = `<span>🇮🇳 India</span>`;
  document.getElementById('map-title').textContent     = '🇮🇳 India';
  document.getElementById('feed-location').textContent = 'All India';
  renderFeed(liveIncidents); dropMarkersFromDB(liveIncidents);
  if (userMarker) userMarker.setMap(map);
}
function goToMyLocation() {
  if (!userLat||!userLng) { fetchUserLocation(); return; }
  map.panTo({lat:userLat,lng:userLng}); map.setZoom(15); currentZoom=15;
}

// ══════════════════════════════════════════
//  SOS
// ══════════════════════════════════════════
function triggerSOS() {
  if (!confirm('🚨 SEND SOS ALERT?\n\nThis will share your GPS location and alert nearest authorities.\n\nConfirm?')) return;
  const btn = document.querySelector('.sos-btn');
  btn.textContent='...'; btn.style.background='#555';
  const send = (lat,lng) => {
    btn.textContent='✓'; btn.style.background='#22aa55';
    alert(`✅ SOS Sent!\nLocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nHelp is on the way!`);
    setTimeout(()=>{btn.textContent='SOS';btn.style.background='';},3000);
  };
  if (userLat&&userLng) { send(userLat,userLng); return; }
  navigator.geolocation.getCurrentPosition(
    pos => send(pos.coords.latitude, pos.coords.longitude),
    () => { btn.textContent='✓'; btn.style.background='#22aa55'; alert('✅ SOS Sent!'); setTimeout(()=>{btn.textContent='SOS';btn.style.background='';},3000); }
  );
}
function callAuthority() { alert('📞 Dialing 112 — Emergency Services'); }

// ══════════════════════════════════════════
//  SIDEBAR TAB
// ══════════════════════════════════════════
function switchSidebarTab(tab) {
  const isLive = tab==='live';
  document.getElementById('stab-live').classList.toggle('on',  isLive);
  document.getElementById('stab-mine').classList.toggle('on', !isLive);
  document.getElementById('panel-live').style.display = isLive ? 'block' : 'none';
  document.getElementById('panel-mine').style.display = isLive ? 'none'  : 'block';
  if (!isLive && window.loadMyReports) loadMyReports();
}

// ══════════════════════════════════════════
//  REPORT MODAL
// ══════════════════════════════════════════
function openReportPopup() {
  document.getElementById('report-modal').classList.add('open');
  if (userLat && userLng) {
    document.getElementById('modal-loc-text').textContent =
      userLocationLabel ? `${userLocationLabel} (${userLat.toFixed(4)}, ${userLng.toFixed(4)})` : `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
  } else {
    document.getElementById('modal-loc-text').textContent = 'Location not yet detected';
  }
  selectedModalType=null; modalFile=null;
  document.querySelectorAll('.mtype').forEach(c=>c.classList.remove('selected'));
  document.getElementById('modal-desc').value='';
  document.getElementById('modal-upload-label').textContent='📷 Tap to upload photo or video';
  document.getElementById('modal-submit').innerHTML='🚨 Submit Report';
  document.getElementById('modal-submit').disabled=false;
  document.getElementById('modal-submit').style.background='';
  document.getElementById('gemini-bar').style.display='none';
  document.getElementById('mopt-app').classList.add('selected');
  document.getElementById('mopt-call').classList.remove('selected');
}

function closeReportPopup() { document.getElementById('report-modal').classList.remove('open'); }
function overlayClick(e)    { if (e.target===document.getElementById('report-modal')) closeReportPopup(); }
function selectModalType(card) { document.querySelectorAll('.mtype').forEach(c=>c.classList.remove('selected')); card.classList.add('selected'); selectedModalType=card.dataset.type; }
function handleModalFile(input) { if (input.files?.[0]) { modalFile=input.files[0]; document.getElementById('modal-upload-label').textContent=`✅ ${modalFile.name}`; } }
function selectOpt(card) { document.querySelectorAll('.mopt').forEach(c=>c.classList.remove('selected')); card.classList.add('selected'); }

// ══════════════════════════════════════════
//  SUBMIT REPORT
// ══════════════════════════════════════════
async function submitModalReport() {
  if (!selectedModalType) { alert('⚠️ Please select an incident type.'); return; }
  const desc = document.getElementById('modal-desc').value.trim();
  if (!desc)  { alert('⚠️ Please describe the incident.'); return; }
  if (!userLat||!userLng) { alert('⚠️ Location not detected yet. Please wait.'); return; }

  const btn    = document.getElementById('modal-submit');
  const gemBar = document.getElementById('gemini-bar');
  const gemSub = document.getElementById('gemini-sub');

  btn.disabled=true;
  btn.innerHTML=`<span class="btn-spinner"></span> Submitting...`;
  gemBar.style.display='flex';
  gemSub.textContent='Saving your report...';

  const reportData = {
    type:          selectedModalType,
    desc:          desc,
    lat:           userLat,
    lng:           userLng,
    locationLabel: userLocationLabel || `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`,
    uid:           window.currentUser?.uid || 'guest',
    userName:      window.currentUser?.displayName || window.currentUser?.email?.split('@')[0] || 'Anonymous',
    userEmail:     window.currentUser?.email || '',
    photo:         modalFile?.name || null,
    status:        'verified',
    severity:      'moderate',
  };

  try {
    if (window._saveReport) await window._saveReport(reportData);
    gemSub.textContent = '✅ Report saved! Gemini AI is analyzing...';
    await delay(600);

    addLivePin(reportData);

    btn.innerHTML='✅ Report Submitted!';
    btn.style.background='linear-gradient(135deg,#22aa55,#118833)';
    showToast(`✅ Your ${selectedModalType} report is now LIVE on the map!`, 4000);

    if (document.getElementById('mopt-call')?.classList.contains('selected')) {
      setTimeout(()=>{ window.location.href='tel:112'; }, 1200);
    }

    currentReportContext = reportData;

    await delay(1200);
    closeReportPopup();

    openGeminiTab(reportData);

    if (window.loadMyReports) loadMyReports();
    switchSidebarTab('mine');

    btn.innerHTML='🚨 Submit Report';
    btn.style.background=''; btn.disabled=false;

  } catch (err) {
    console.error(err);
    gemSub.textContent='⚠️ Error: '+err.message;
    btn.innerHTML='⚠️ Try Again'; btn.disabled=false;
    showToast('❌ Error: '+err.message, 4000);
  }
}

function addLivePin(report) {
  if (!map||!report.lat||!report.lng) return;
  const newInc = {
    type:report.type, lat:report.lat, lng:report.lng,
    locationLabel:report.locationLabel||'Your Location',
    userName:report.userName, desc:report.desc,
    severity:'moderate', timestamp:null
  };
  liveIncidents.unshift(newInc);
  const marker = new google.maps.Marker({
    position:{lat:report.lat,lng:report.lng}, map,
    icon:makeEmojiIcon(report.type), animation:google.maps.Animation.BOUNCE, zIndex:500,
  });
  setTimeout(()=>marker.setAnimation(null),2500);
  marker.addListener('click',()=>showDBPopup(0));
  markers.push(marker);
  renderFeed(liveIncidents);
}

// ══════════════════════════════════════════
//  GEMINI CHAT TAB (post-report)
// ══════════════════════════════════════════
function openGeminiTab(report) {
  geminiChatHistory = [];
  currentReportContext = report;

  const p = precautions[report.type] || precautions['other'];
  const systemContext = `You are CrisisNet AI, an emergency response assistant for India.
A user just reported a ${report.type} incident at ${report.locationLabel}.
Their description: "${report.desc}"
Relevant Do's: ${p.dos.join(', ')}
Relevant Don'ts: ${p.donts.join(', ')}
Be concise, helpful, and calm. Respond in the same language the user writes in (Hindi or English). Keep responses short and actionable.`;

  geminiChatHistory.push({ role:'user', parts:[{ text: systemContext }] });

  const tab = document.getElementById('gemini-chat-tab');
  tab.classList.add('open');

  const msgs = document.getElementById('gemini-messages');
  msgs.innerHTML = '';

  const dosHTML   = p.dos.map(d=>`<li>✅ ${d}</li>`).join('');
  const dontsHTML = p.donts.map(d=>`<li>❌ ${d}</li>`).join('');

  addGeminiMessage('ai', `
    <div style="margin-bottom:8px">
      <b>${typeEmoji[report.type]||'⚠️'} ${cap(report.type)} incident reported</b><br>
      <span style="font-size:11px;color:#888">📍 ${report.locationLabel}</span>
    </div>
    <div style="margin-bottom:6px;color:#4fc3f7;font-weight:600;font-size:12px">✅ DO's</div>
    <ul style="margin:0 0 10px 0;padding-left:16px;font-size:12px;line-height:1.8;color:#ccc">${dosHTML}</ul>
    <div style="margin-bottom:6px;color:#ef5350;font-weight:600;font-size:12px">❌ DON'Ts</div>
    <ul style="margin:0 0 10px 0;padding-left:16px;font-size:12px;line-height:1.8;color:#ccc">${dontsHTML}</ul>
    <div style="margin-top:10px;padding:10px;background:rgba(255,45,45,.08);border-radius:8px;font-size:12px;color:#aaa">
      💬 Koi doubt hai? Mujhse puchho — main yahan hoon!<br>
      <span style="font-size:11px;color:#555">Ask me anything in Hindi or English.</span>
    </div>
  `);

  setTimeout(() => document.getElementById('gemini-input')?.focus(), 300);
}

function closeGeminiTab() {
  document.getElementById('gemini-chat-tab').classList.remove('open');
}

function addGeminiMessage(role, html) {
  const msgs = document.getElementById('gemini-messages');
  const div  = document.createElement('div');
  div.className = role === 'ai' ? 'gchat-msg ai' : 'gchat-msg user';
  div.innerHTML  = html;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendGeminiMessage() {
  const input = document.getElementById('gemini-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  addGeminiMessage('user', text);
  input.disabled = true;
  document.getElementById('gemini-send-btn').disabled = true;

  geminiChatHistory.push({ role:'user', parts:[{ text }] });

  const typingId = 'typing-' + Date.now();
  const msgs = document.getElementById('gemini-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'gchat-msg ai';
  typingDiv.id = typingId;
  typingDiv.innerHTML = '<span class="gchat-typing"><span></span><span></span><span></span></span>';
  msgs.appendChild(typingDiv);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const response = await callGeminiChat(geminiChatHistory);
    document.getElementById(typingId)?.remove();
    addGeminiMessage('ai', response);
    geminiChatHistory.push({ role:'model', parts:[{ text: response }] });
  } catch (err) {
    document.getElementById(typingId)?.remove();
    addGeminiMessage('ai', `⚠️ Sorry, couldn't reach Gemini AI right now. Please try again.`);
  }

  input.disabled = false;
  document.getElementById('gemini-send-btn').disabled = false;
  input.focus();
}

async function callGeminiChat(history) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyBbjxGe-YY0i60WF4YHbr5q4jBeFbt9ILY`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: history })
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
}

function geminiKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGeminiMessage(); }
}

// ══════════════════════════════════════════
//  ✅ FLOATING CHATBOT — Live Incidents Aware
// ══════════════════════════════════════════
let chatHistory = [
  {
    role: "user",
    parts: [{ text: "You are CrisisNet AI, a helpful emergency response assistant for India. Help users with safety tips, emergency numbers (101 for fire, 108 for ambulance, 100 for police, 112 for all emergencies), and disaster advice. Be calm, concise, and professional. Respond in the same language the user uses (Hindi or English). When asked about nearby incidents or reports, I will provide you the live data directly in the message — use that data to answer." }]
  },
  {
    role: "model",
    parts: [{ text: "Understood. I am CrisisNet AI, ready to assist with emergency information, safety guidance, and live incident reports." }]
  }
];

function isNearbyReportsQuery(text) {
  const t = text.toLowerCase();
  const nearbyKeywords = [
    'near me', 'nearby', 'reports near', 'incidents near',
    'news near', 'what happened near', 'kya ho raha', 'aas paas',
    'close to me', 'around me', 'in my area', 'local incidents',
    'live incidents', 'show incidents', 'list incidents',
    'list reports', 'show reports', 'recent reports',
    'current incidents', 'active incidents', 'what is happening',
    'kya chal raha', 'area mein', 'mere paas'
  ];
  return nearbyKeywords.some(kw => t.includes(kw));
}

function buildIncidentsContext() {
  if (!liveIncidents || liveIncidents.length === 0) {
    return "No live incidents are currently reported on CrisisNet.";
  }

  let sorted = [...liveIncidents];
  if (userLat && userLng) {
    sorted = sorted
      .filter(r => r.lat && r.lng)
      .sort((a, b) =>
        getDistanceKm(userLat, userLng, a.lat, a.lng) -
        getDistanceKm(userLat, userLng, b.lat, b.lng)
      );
  }

  const top = sorted.slice(0, 10);

  const lines = top.map((inc, i) => {
    const dist = (userLat && userLng && inc.lat && inc.lng)
      ? `${Math.round(getDistanceKm(userLat, userLng, inc.lat, inc.lng))} km away`
      : 'distance unknown';
    const ts = inc.timestamp?.toDate?.()?.toLocaleString('en-IN', {
      dateStyle: 'short', timeStyle: 'short'
    }) || 'Just now';
    return `${i + 1}. [${(inc.type || 'unknown').toUpperCase()}] at ${inc.locationLabel || 'Unknown location'} — ${dist} — "${inc.desc || 'No description'}" — Reported by ${inc.userName || 'Anonymous'} at ${ts} — Severity: ${inc.severity || 'moderate'}`;
  });

  const userLocText = (userLat && userLng)
    ? `User's current location: ${userLocationLabel || `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`}`
    : `User location not available`;

  return `${userLocText}\n\nLive CrisisNet Incidents (sorted nearest first):\n${lines.join('\n')}`;
}

function toggleChat() {
  const chat = document.getElementById('ai-chat-wrapper');
  chat.classList.toggle('open');
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  addMessageToUI('user', text);
  input.value = '';

  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true;
  sendBtn.innerText = "...";

  let messageToSend = text;
  if (isNearbyReportsQuery(text)) {
    const incidentsData = buildIncidentsContext();
    messageToSend = `${text}\n\n[SYSTEM DATA — Live CrisisNet Map Feed]:\n${incidentsData}\n\nUsing the above live data, list the incidents sorted by proximity. For each, show: type emoji, type name, location, distance, brief description, severity badge, and time reported. Format clearly with line breaks. End with a safety tip relevant to the most severe nearby incident.`;
  }

  chatHistory.push({ role: "user", parts: [{ text: messageToSend }] });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyBbjxGe-YY0i60WF4YHbr5q4jBeFbt9ILY`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: chatHistory })
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';

    addMessageToUI('ai', aiText);
    chatHistory.push({ role: "model", parts: [{ text: aiText }] });

  } catch (error) {
    console.error("Chat Error:", error);
    addMessageToUI('ai', `⚠️ Error: ${error.message}. Check your GEMINI_KEY in dashboard.js.`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerText = "Send";
  }
}

function addMessageToUI(role, text) {
  const chatBody = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${role}`;
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
  msgDiv.innerHTML = html;
  chatBody.appendChild(msgDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ══════════════════════════════════════════
//  TOAST & UTILS
// ══════════════════════════════════════════
function showToast(msg, duration=0) {
  let t = document.getElementById('crisisnet-toast');
  if (!t) {
    t = document.createElement('div'); t.id='crisisnet-toast';
    t.style.cssText=`position:fixed;bottom:110px;left:50%;transform:translateX(-50%);background:rgba(18,18,18,.97);color:#F0F0F0;border:1px solid rgba(255,255,255,.1);border-radius:30px;padding:10px 22px;font-size:13px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:'DM Sans',sans-serif;transition:opacity .3s;white-space:nowrap;`;
    document.body.appendChild(t);
  }
  t.textContent=msg; t.style.opacity='1'; t.style.display='block';
  if (duration>0) setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.style.display='none',300);},duration);
}
// ════════════════════════════════════════
//  BROADCAST ALERT POPUP
//  Replace the existing onSnapshot block
//  inside your Firebase closure with this.
//  (The part that currently calls showBroadcastBanner)
// ════════════════════════════════════════

// ── Config (same as banner) ──
const popupConfig = {
  warning:   { icon: '⚠️',  label: 'WARNING'   },
  emergency: { icon: '🚨',  label: 'EMERGENCY'  },
  info:      { icon: '📢',  label: 'NOTICE'     },
  safe:      { icon: '✅',  label: 'SAFE ZONE'  },
};

// Tracks the last alert we showed — so we don't re-popup same alert on refresh
let _lastShownAlertTime = null;



function initBroadcastListener(db, doc, onSnapshot) {
  const broadcastRef = doc(db, 'broadcasts', 'latest');
  onSnapshot(broadcastRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    if (!data.active) {
      closeAlertPopup();
      hideBroadcastBanner();
      return;
    }

    // Show banner always (top strip)
    showBroadcastBanner(data.message, data.type, data.timestamp);

   
  });
}

// ── Show popup ──
function showAlertPopup(message, type, timestamp) {
  const cfg     = popupConfig[type] || popupConfig['warning'];
  const overlay = document.getElementById('alert-popup-overlay');

  document.getElementById('alert-popup-icon').textContent         = cfg.icon;
  document.getElementById('alert-popup-type-label').textContent   = cfg.label;
  document.getElementById('alert-popup-message').textContent      = message;

  if (timestamp?.toDate) {
    const d = timestamp.toDate();
    document.getElementById('alert-popup-time').textContent =
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) +
      ' · ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } else {
    document.getElementById('alert-popup-time').textContent = 'Just now';
  }

  overlay.classList.remove('type-warning','type-emergency','type-info','type-safe');
  overlay.classList.add(`type-${type || 'warning'}`);
  overlay.classList.add('show');
}

// ── Close popup ──
function closeAlertPopup() {
  const overlay = document.getElementById('alert-popup-overlay');
  if (!overlay) return;
  overlay.style.opacity    = '0';
  overlay.style.transition = 'opacity 0.25s ease';
  setTimeout(() => {
    overlay.classList.remove('show');
    overlay.style.opacity    = '';
    overlay.style.transition = '';
  }, 250);
}

// Close on overlay background click
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('alert-popup-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAlertPopup();
    });
  }
});

function cap(s)    { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }
function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }

function searchLocation() {
  const input = document.getElementById('map-search-input').value.trim();
  if (!input) { showToast('⚠️ Type something first.', 3000); return; }
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: input }, (results, status) => {
    if (status!=='OK'||!results[0]) { showToast(`❌ Location not found.`,4000); return; }
    const loc = results[0].geometry.location;
    map.panTo(loc); map.setZoom(13); currentZoom=13;
    showToast(`📍 Showing: ${results[0].formatted_address}`, 4000);
  });
}

// Live stats counter
setInterval(() => {
  const now = new Date();
  const activeEl = document.getElementById('active-count');
  if (activeEl) activeEl.textContent = liveIncidents.length || 0;
  const todayEl = document.getElementById('today-count');
  if (todayEl) {
    const c = liveIncidents.filter(r=>{ const t=r.timestamp?.toDate?.(); return t&&(now-t)<86400000; }).length;
    todayEl.textContent = c>=1000 ? (c/1000).toFixed(1)+'K+' : c;
  }
  const statesEl = document.getElementById('states-count');
  if (statesEl) {
    const s = new Set(liveIncidents.map(r=>r.locationLabel?.split(',')?.[1]?.trim()).filter(Boolean));
    statesEl.textContent = s.size || 0;
  }
  const responseEl = document.getElementById('response-time');
  if (responseEl) responseEl.textContent = '—';
}, 4000);

