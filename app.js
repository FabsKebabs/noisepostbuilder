/* ── OAUTH2 (refresh token — never expires) ── */
const _DBX_APP_KEY = 'bwedwhrr000d23m';
const _DBX_APP_SEC = 'i91el890zf4ywga';
const _DBX_REFRESH = '59_KffjEi_4AAAAAAAAAAZRvA-Pxe477k-Gf885jATnhU3iQxeTxZBLfHtsDcYA_';

let _cachedToken = null;
let _tokenExpiry = 0;

async function getToken() {
    if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: _DBX_REFRESH,
        client_id: _DBX_APP_KEY,
        client_secret: _DBX_APP_SEC,
    });
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body });
    const d = await r.json();
    if (!r.ok) throw new Error('Token refresh failed: ' + (d.error_description || d.error));
    _cachedToken = d.access_token;
    _tokenExpiry = Date.now() + (d.expires_in * 1000);
    return _cachedToken;
}

/* ── CONSTANTS ── */
const ROOT = '/Brands';
const PAL = ['#FF3300', '#E8390E', '#FF6B35', '#ff9500', '#FFCC00', '#34c759', '#00a876', '#32ade6', '#5856d6', '#af52de', '#ff2d55', '#1c1c1e', '#0a84ff', '#30d158', '#e17055', '#fd9644'];
const STORE = 'noise_v6';

/* ── STORAGE ── */
// shape: { [path]: { joined, postIdx, batches:[{name,path}], color } }
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = d => localStorage.setItem(STORE, JSON.stringify(d));

let allBrands = [];

/* ── DROPBOX API ── */
async function dbxList(path) {
    const r = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + await getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path === '/' ? '' : path, recursive: false })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_summary || 'Dropbox error');

    let entries = d.entries || [];
    let cursor = d.cursor, has_more = d.has_more;
    while (has_more) {
        const r2 = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + await getToken(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ cursor })
        });
        const d2 = await r2.json();
        entries = [...entries, ...(d2.entries || [])];
        cursor = d2.cursor;
        has_more = d2.has_more;
    }
    return entries;
}

async function dbxGetShareLink(path) {
    const tok = await getToken();
    const r = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, settings: { requested_visibility: { '.tag': 'public' } } })
    });
    if (r.ok) { const d = await r.json(); return d.url; }

    const r2 = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, direct_only: true })
    });
    const d2 = await r2.json();
    if (d2.links && d2.links.length > 0) return d2.links[0].url;
    throw new Error('Could not get share link');
}

/* ── LOAD BRANDS ── */
async function loadBrands() {
    const grid = document.getElementById('brands-grid');
    const btn = document.getElementById('refresh-btn');

    // Skeleton placeholders
    grid.innerHTML = Array(4).fill(0).map(() => `
        <div class="skel-card">
            <div class="skel skel-top"></div>
            <div class="skel-bot">
                <div class="skel skel-line" style="width:60%"></div>
                <div class="skel skel-line" style="width:40%"></div>
            </div>
        </div>`).join('');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin spin-dark"></span>';

    try {
        const entries = await dbxList(ROOT);
        const folders = entries
            .filter(e => e['.tag'] === 'folder')
            .sort((a, b) => a.name.localeCompare(b.name));

        const data = load();
        allBrands = folders.map((f, i) => {
            if (!data[f.path_lower]) {
                data[f.path_lower] = { joined: false, postIdx: 0, batches: [], color: PAL[i % PAL.length] };
            } else if (!data[f.path_lower].color) {
                data[f.path_lower].color = PAL[i % PAL.length];
            }
            return { name: f.name, path: f.path_lower, color: data[f.path_lower].color };
        });
        save(data);
        rBrands();
        updateHdr();
    } catch (e) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ei">❌</span><p>Failed to load from Dropbox.<br><small>${e.message}</small></p></div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔄 Refresh';
    }
}

async function refreshBrands() { await loadBrands(); }

/* ── JOIN ── */
async function joinBrand(path, btn) {
    const brand = allBrands.find(b => b.path === path);
    if (!brand) return;

    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>';
    btn.disabled = true;

    try {
        const entries = await dbxList(path);
        const batches = entries
            .filter(e => e['.tag'] === 'folder')
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map(f => ({ name: f.name, path: f.path_lower }));

        const data = load();
        if (!data[path]) data[path] = { color: brand.color };
        data[path].joined = true;
        data[path].name = brand.name;
        data[path].postIdx = 0;
        data[path].batches = batches;
        save(data);

        rBrands(); rPosts(); updateHdr();
        toast(`✅ Joined ${brand.name}! ${batches.length} batch${batches.length !== 1 ? 'es' : ''} ready.`, 'gr');
    } catch (e) {
        toast('Error: ' + e.message, 'rd');
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

/* ── LEAVE ── */
function confirmLeave(path, name) {
    document.getElementById('c-title').textContent = 'Leave ' + name + '?';
    document.getElementById('c-msg').textContent = 'You can always rejoin later.';
    document.getElementById('c-ok').onclick = () => {
        const data = load();
        if (data[path]) data[path].joined = false;
        save(data);
        closeCon(); rBrands(); rPosts(); updateHdr();
        toast('👋 Left ' + name, 'rd');
    };
    document.getElementById('c-ov').classList.add('open');
}

function closeCon() { document.getElementById('c-ov').classList.remove('open'); }

/* ── GENERATE (random batch with slot-machine animation) ── */
async function nextBatch(path, btn) {
    const data = load();
    if (!data[path]) return;
    const batches = data[path].batches || [];
    if (batches.length < 2) return;

    const orig = btn.innerHTML;
    btn.disabled = true;

    // Slot-machine: flash through random names quickly
    const names = batches.map(b => b.name);
    let flashes = 0;
    const total = 14; // number of flashes
    const delay = ms => new Promise(res => setTimeout(res, ms));

    for (let i = 0; i < total; i++) {
        const rnd = names[Math.floor(Math.random() * names.length)];
        // Speed: starts fast, slows down toward end
        const wait = 60 + Math.floor((i / total) ** 2 * 260);
        btn.innerHTML = `<span class="spin"></span> ${rnd}`;
        await delay(wait);
    }

    // Pick a final random index (different from current when possible)
    const cur = data[path].postIdx || 0;
    let pick = Math.floor(Math.random() * batches.length);
    if (batches.length > 1 && pick === cur) pick = (pick + 1) % batches.length;

    data[path].postIdx = pick;
    save(data);
    rPosts();
    toast('✨ Generated!', 'gr');
}

/* ── DOWNLOAD ── */
async function downloadBatch(path, btn) {
    const data = load();
    const entry = data[path];
    if (!entry) return;
    const batch = (entry.batches || [])[entry.postIdx || 0];
    if (!batch) { toast('No batch found', 'rd'); return; }

    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span> Getting link…';
    btn.disabled = true;

    try {
        const url = await dbxGetShareLink(batch.path);
        const dlUrl = url.replace(/[?&]dl=\d/, '').replace(/\?$/, '') + (url.includes('?') ? '&' : '?') + 'dl=1';
        window.location.href = dlUrl;
        toast('📥 Download starting…', 'gr');
        btn.innerHTML = 'Downloading…';
        setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 4000);
    } catch (e) {
        toast('Error: ' + e.message, 'rd');
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

/* ── RENDER: MY POSTS ── */
function rPosts() {
    const data = load();
    // Read joined brands directly from localStorage so this works on cold page load
    // (before loadBrands() has finished populating allBrands)
    const joined = Object.entries(data)
        .filter(([, d]) => d.joined)
        .map(([path, d]) => ({
            path,
            name: d.name || path.split('/').pop(),
            color: d.color || '#FF3300'
        }));
    document.getElementById('jchip').textContent = joined.length + ' joined';

    const el = document.getElementById('posts-list');
    if (joined.length === 0) {
        el.innerHTML = `<div class="empty anim"><span class="ei">🎯</span><p>You haven't joined any brands yet.<br>Go to <span class="go" onclick="sw('brands')">All Brands</span> to browse and join.</p></div>`;
        return;
    }

    el.innerHTML = joined.map(b => {
        const d = data[b.path] || {};
        const batches = d.batches || [];
        const idx = d.postIdx || 0;
        const total = batches.length;
        const batch = total > 0 ? batches[idx] : null;
        const pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
        const init = ini(b.name);

        return `<div class="pc anim">
  <div class="pc-ban" style="background:${b.color}">
    <div class="pc-init">${esc(init)}</div>
    <div class="pc-meta">
      <div class="pc-name">${esc(b.name)}</div>
    </div>
  </div>
  <div class="pc-body">

    ${batch
                ? `<div class="ready-box">
           <div class="ready-info">
             <div class="ready-dot"></div>
             <div>
               <div class="ready-title">Ready to post</div>
               <div class="ready-sub">Your content has been generated</div>
             </div>
           </div>
           <button class="btn btn-red btn-sm" onclick="downloadBatch('${b.path}',this)">⬇ Download</button>
         </div>`
                : `<div class="bi-box"><div class="bt" style="color:var(--mu);text-align:center">⚠️ No batches found.</div></div>`}
    <div class="pc-act">
      ${total > 1 ? `<button class="btn btn-rr btn-sm" onclick="nextBatch('${b.path}',this)">🎲 Generate Post</button>` : ''}
      <button class="btn btn-rr btn-sm" onclick="confirmLeave('${b.path}','${esc(b.name)}')">👋 Leave</button>
    </div>
  </div>
</div>`;
    }).join('');
}

/* ── RENDER: ALL BRANDS ── */
function rBrands() {
    const data = load();
    const grid = document.getElementById('brands-grid');
    document.getElementById('hb').textContent = allBrands.length;

    if (allBrands.length === 0) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ei">🏷️</span><p>No brands found in /Brands folder.</p></div>`;
        return;
    }

    grid.innerHTML = allBrands.map(b => {
        const d = data[b.path] || {};
        const joined = !!d.joined;
        const total = (d.batches || []).length;
        const init = ini(b.name);

        return `<div class="bc anim">
  <div class="bc-img" style="background:${b.color}">
    <span class="bi">${esc(init)}</span>
    ${joined ? '<div class="jb">✓ Joined</div>' : ''}
  </div>
  <div class="bc-info">
    <div class="bc-name" title="${esc(b.name)}">${esc(b.name)}</div>

    <div class="bc-btns">
      ${joined
                ? `<button class="btn btn-rr btn-sm" onclick="confirmLeave('${b.path}','${esc(b.name)}')">👋 Leave</button>`
                : `<button class="btn btn-gr btn-sm" onclick="joinBrand('${b.path}',this)">Join</button>`}
    </div>
  </div>
</div>`;
    }).join('');
}

/* ── HELPERS ── */
function updateHdr() {
    const data = load();
    const joined = Object.values(data).filter(d => d.joined).length;
    document.getElementById('hj').textContent = joined;
    document.getElementById('hb').textContent = allBrands.length;
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ini(name) {
    const w = String(name).trim().split(/\s+/);
    return w.length === 1 ? w[0].slice(0, 2).toUpperCase() : w[0][0].toUpperCase() + w[1][0].toUpperCase();
}

let ttT;
function toast(msg, type = 'gr') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(ttT);
    ttT = setTimeout(() => el.className = '', 2700);
}

function sw(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('p-' + name).classList.add('active');
    document.getElementById('t-' + name).classList.add('active');
    if (name === 'posts') rPosts();
    if (name === 'brands' && allBrands.length === 0) loadBrands();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCon(); });

/* ── BOOT ── */
(function () {
    rPosts();
    loadBrands();
})();
