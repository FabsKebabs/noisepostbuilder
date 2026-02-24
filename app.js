/* ── CONSTANTS ── */
const PAL = ['#FF3300', '#E8390E', '#FF6B35', '#ff9500', '#FFCC00', '#34c759', '#00a876', '#32ade6', '#5856d6', '#af52de', '#ff2d55', '#1c1c1e', '#0a84ff', '#30d158', '#e17055', '#fd9644'];
const STORE = 'noise_v8';

/* ── STORAGE ── */
// shape: { [brandName]: { joined, postIdx, batches:[{name,files:[]}], color } }
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = d => localStorage.setItem(STORE, JSON.stringify(d));

let allBrands = []; // [{ name, batches:[{name,files:[]}], color }]

/* ── LOAD MANIFEST ── */
async function loadBrands() {
    const grid = document.getElementById('brands-grid');
    const btn = document.getElementById('refresh-btn');

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
        const res = await fetch('brands.json?_=' + Date.now());
        if (!res.ok) throw new Error('brands.json not found (' + res.status + ')');
        const manifest = await res.json();

        const data = load();
        allBrands = (manifest.brands || []).map((b, i) => {
            if (!data[b.name]) {
                data[b.name] = { joined: false, postIdx: 0, batches: b.batches, color: PAL[i % PAL.length] };
            } else {
                // Always sync batches from manifest so new batches appear
                data[b.name].batches = b.batches;
                if (!data[b.name].color) data[b.name].color = PAL[i % PAL.length];
            }
            return { name: b.name, batches: b.batches, color: data[b.name].color };
        });
        save(data);
        rBrands();
        updateHdr();
    } catch (e) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ei">❌</span><p>Failed to load brands.<br><small>${e.message}</small></p></div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔄 Refresh';
    }
}

async function refreshBrands() { await loadBrands(); }

/* ── JOIN ── */
function joinBrand(brandName, btn) {
    const brand = allBrands.find(b => b.name === brandName);
    if (!brand) return;

    const data = load();
    if (!data[brandName]) data[brandName] = { color: brand.color };
    data[brandName].joined = true;
    data[brandName].name = brand.name;
    data[brandName].postIdx = 0;
    data[brandName].batches = brand.batches;
    save(data);

    rBrands(); rPosts(); updateHdr();
    const count = brand.batches.length;
    toast(`✅ Joined ${brand.name}! ${count} batch${count !== 1 ? 'es' : ''} ready.`, 'gr');
}

/* ── LEAVE ── */
function confirmLeave(brandName, displayName) {
    document.getElementById('c-title').textContent = 'Leave ' + displayName + '?';
    document.getElementById('c-msg').textContent = 'You can always rejoin later.';
    document.getElementById('c-ok').onclick = () => {
        const data = load();
        if (data[brandName]) data[brandName].joined = false;
        save(data);
        closeCon(); rBrands(); rPosts(); updateHdr();
        toast('👋 Left ' + displayName, 'rd');
    };
    document.getElementById('c-ov').classList.add('open');
}
function closeCon() { document.getElementById('c-ov').classList.remove('open'); }

/* ── GENERATE (slot-machine) ── */
async function nextBatch(brandName, btn) {
    const data = load();
    if (!data[brandName]) return;
    const batches = data[brandName].batches || [];
    if (batches.length < 2) return;

    const orig = btn.innerHTML;
    btn.disabled = true;

    const names = batches.map(b => b.name);
    const total = 14;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    for (let i = 0; i < total; i++) {
        const rnd = names[Math.floor(Math.random() * names.length)];
        const wait = 60 + Math.floor((i / total) ** 2 * 260);
        btn.innerHTML = `<span class="spin"></span> ${rnd}`;
        await delay(wait);
    }

    const cur = data[brandName].postIdx || 0;
    let pick = Math.floor(Math.random() * batches.length);
    if (batches.length > 1 && pick === cur) pick = (pick + 1) % batches.length;

    data[brandName].postIdx = pick;
    save(data);
    rPosts();
    btn.innerHTML = orig;
    btn.disabled = false;
    toast('✨ Generated!', 'gr');
}

/* ── GALLERY OVERLAY ── */
function openGallery(brandName) {
    const data = load();
    const entry = data[brandName];
    if (!entry) return;
    const batch = (entry.batches || [])[entry.postIdx || 0];
    if (!batch) { toast('No batch found', 'rd'); return; }

    const files = batch.files || [];
    if (files.length === 0) { toast('This batch has no images yet.', 'rd'); return; }

    const basePath = `Brands/${encodeURIComponent(brandName)}/${encodeURIComponent(batch.name)}/`;

    const ov = document.getElementById('gallery-ov');
    const grid = document.getElementById('gallery-grid');
    const hint = document.getElementById('gallery-hint');

    hint.textContent = `${batch.name}  ·  ${files.length} photo${files.length !== 1 ? 's' : ''}`;

    grid.innerHTML = files.map(f => {
        const src = basePath + encodeURIComponent(f);
        return `<div class="gal-item">
  <img src="${src}" alt="${esc(f)}" loading="lazy" />
  <button class="btn btn-red btn-sm gal-dl" onclick="dlSingle('${esc(src)}','${esc(f)}',this)">⬇ Save</button>
</div>`;
    }).join('');

    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeGallery() {
    document.getElementById('gallery-ov').classList.remove('open');
    document.body.style.overflow = '';
}

async function dlSingle(src, fileName, btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>';
    btn.disabled = true;
    try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast('📥 Saved!', 'gr');
    } catch (e) { toast('Error: ' + e.message, 'rd'); }
    btn.innerHTML = orig;
    btn.disabled = false;
}

/* ── RENDER: MY POSTS ── */
function rPosts() {
    const data = load();
    const joined = Object.entries(data)
        .filter(([, d]) => d.joined)
        .map(([key, d]) => ({ key, name: d.name || key, color: d.color || '#FF3300' }));
    document.getElementById('jchip').textContent = joined.length + ' joined';

    const el = document.getElementById('posts-list');
    if (joined.length === 0) {
        el.innerHTML = `<div class="empty anim"><span class="ei">🎯</span><p>You haven't joined any brands yet.<br>Go to <span class="go" onclick="sw('brands')">All Brands</span> to browse and join.</p></div>`;
        return;
    }

    el.innerHTML = joined.map(b => {
        const d = data[b.key] || {};
        const batches = d.batches || [];
        const idx = d.postIdx || 0;
        const total = batches.length;
        const batch = total > 0 ? batches[idx] : null;
        const fileCount = batch ? (batch.files || []).length : 0;
        const desc = batch ? (batch.description || '') : '';
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
               <div class="ready-sub">${fileCount} photo${fileCount !== 1 ? 's' : ''} ready</div>
             </div>
           </div>
           <button class="btn btn-red btn-sm" onclick="openGallery('${esc(b.key)}')">🖼 View Photos</button>
         </div>
         ${desc ? `<div class="desc-box">
           <div class="desc-label">📋 Caption</div>
           <div class="desc-text">${esc(desc)}</div>
           <button class="btn btn-ic btn-sm desc-copy" onclick="copyDesc(this,'${esc(desc)}')">Copy</button>
         </div>` : ''}`
                : `<div class="bi-box"><div class="bt" style="color:var(--mu);text-align:center">⚠️ No batches found.</div></div>`}
    <div class="pc-act">
      <button class="btn btn-rr btn-sm" onclick="nextBatch('${esc(b.key)}',this)">🎲 Generate Post</button>
      <button class="btn btn-rr btn-sm" onclick="confirmLeave('${esc(b.key)}','${esc(b.name)}')">👋 Leave</button>
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
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ei">🏷️</span><p>No brands found in brands.json.</p></div>`;
        return;
    }

    grid.innerHTML = allBrands.map(b => {
        const d = data[b.name] || {};
        const joined = !!d.joined;
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
                ? `<button class="btn btn-rr btn-sm" onclick="confirmLeave('${esc(b.name)}','${esc(b.name)}')">👋 Leave</button>`
                : `<button class="btn btn-gr btn-sm" onclick="joinBrand('${esc(b.name)}',this)">Join</button>`}
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

async function copyDesc(btn, text) {
    // Unescape HTML entities before copying
    const raw = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    try {
        await navigator.clipboard.writeText(raw);
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = 'var(--gr)';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
    } catch (e) {
        toast('Could not copy — try manually selecting text.', 'rd');
    }
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

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCon(); closeGallery(); } });

/* ── BOOT ── */
(async function () {
    rPosts();
    await loadBrands();
})();
