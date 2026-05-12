/* Carousel */
const bg=document.getElementById('heroBg'),dots=document.querySelectorAll('.hero-dot');
let cur=0,N=3,tmr;
function go(i){cur=((i%N)+N)%N;bg.style.transform=`translateX(-${cur*100}%)`;dots.forEach((d,j)=>d.classList.toggle('active',j===cur))}
function auto(){clearInterval(tmr);tmr=setInterval(()=>go(cur+1),5000)}
dots.forEach(d=>d.addEventListener('click',()=>{go(+d.dataset.i);auto()}));
let tx=0;const heroEl=document.getElementById('hero');
heroEl.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
heroEl.addEventListener('touchend',e=>{const d=tx-e.changedTouches[0].clientX;if(Math.abs(d)>50){go(cur+(d>0?1:-1));auto()}},{passive:true});
auto();

/* Header */
const hdr=document.getElementById('hdr');
function checkHdr(){hdr.classList.toggle('hdr--top',scrollY<80);hdr.classList.toggle('hdr--scroll',scrollY>=80)}
checkHdr();
window.addEventListener('scroll',checkHdr,{passive:true});

/* Back top */
const btt=document.getElementById('btt');
window.addEventListener('scroll',()=>btt.classList.toggle('show',scrollY>600),{passive:true});
btt.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));

/* Mobile nav */
const mn=document.getElementById('mn');
document.getElementById('menuT').addEventListener('click',()=>mn.classList.add('open'));
document.getElementById('mnBk').addEventListener('click',()=>mn.classList.remove('open'));
document.getElementById('mnCl').addEventListener('click',()=>mn.classList.remove('open'));
mn.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>mn.classList.remove('open')));

/* Active nav */
const secs=document.querySelectorAll('[id]'),navAs=document.querySelectorAll('.nav a');
window.addEventListener('scroll',()=>{let c='';secs.forEach(s=>{if(scrollY>=s.offsetTop-140)c=s.id});navAs.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+c))},{passive:true});

/* Reveal */
const ro=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');ro.unobserve(e.target)}}),{threshold:.06,rootMargin:'0px 0px -40px'});
document.querySelectorAll('.rv').forEach(el=>ro.observe(el));

/* Stagger */
document.querySelectorAll('.pgrid,.alt-grid,.top-grid,.card-grid,.gallery-grid').forEach(g=>{
  const ob=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){
    [...e.target.children].forEach((c,i)=>{c.style.cssText=`opacity:0;transform:translateY(18px);transition:opacity .5s var(--ease) ${i*.07}s,transform .5s var(--ease) ${i*.07}s`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{c.style.opacity='1';c.style.transform='none'}))});ob.unobserve(e.target)}}),{threshold:.04});ob.observe(g)});

/* ══════ STAMP CARD ══════ */
(function(){
  var API_BASE = 'https://eia-application.jimhankliang.workers.dev';
  var TOTAL_SHOPS = 5, REQUIRED_STAMPS = 3, COOKIE_DAYS = 30;

  var modal    = document.getElementById('stampModal');
  var openBtn  = document.getElementById('stampBtn');
  var closeBtn = document.getElementById('smClose');
  var bk       = document.getElementById('smBk');
  var stampsEl = document.getElementById('smStamps');
  var contentEl= document.getElementById('smContent');
  var badge    = document.getElementById('stampBadge');

  // ── Generic cookie helpers ────────────────────────────────────────────────

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days) {
    var exp = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  // ── Card identity (8-char alphanumeric, 30-day limit per browser) ───────────

  function generateCardId() {
    // Uses crypto.getRandomValues for uniform distribution across 36 chars.
    // 36^8 ≈ 2.8 trillion combinations — collision probability is negligible.
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    var id = '';
    for (var i = 0; i < 8; i++) id += chars[bytes[i] % 36];
    return id;
  }

  function getOrCreateCardId() {
    var existing  = getCookie('card_id');
    var createdAt = getCookie('card_created_at');

    if (existing && createdAt) {
      var age = Date.now() - new Date(createdAt).getTime();
      // Reuse the card as long as it's within the 30-day window.
      // Past 30 days the user implicitly gets a fresh card next visit.
      if (age < COOKIE_DAYS * 24 * 60 * 60 * 1000) return existing;
    }

    var newId = generateCardId();
    setCookie('card_id', newId, COOKIE_DAYS);
    setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
    return newId;
  }

  // ── Local stamp cache (display only; Cloudflare KV is authoritative) ──────

  function getStampData() {
    var m = document.cookie.match(new RegExp('(?:^|; )stamp_data=([^;]*)'));
    if (!m) return {};
    try { return JSON.parse(atob(decodeURIComponent(m[1]))); } catch(e) { return {}; }
  }
  function saveStampData(d) {
    var enc = encodeURIComponent(btoa(JSON.stringify(d)));
    var exp = new Date(Date.now() + COOKIE_DAYS * 86400000).toUTCString();
    document.cookie = 'stamp_data=' + enc + '; expires=' + exp + '; path=/; SameSite=Lax';
  }
  function countStamps(d) {
    // KV stamps format: {shop_1: "ISO timestamp"} — any truthy value = stamped
    var c = 0;
    for (var k in d) if (d[k]) c++;
    return c;
  }
  function updateBadge() {
    var c = countStamps(getStampData());
    if (c > 0) { badge.textContent = c; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderStamps(d, curId) {
    stampsEl.innerHTML = '';
    for (var i = 1; i <= TOTAL_SHOPS; i++) {
      var el = document.createElement('div');
      el.className = 'sm-stamp';
      var k = 'shop_' + i;
      if (d[k]) {
        el.className += curId === i ? ' current' : ' collected';
        el.textContent = '✓';
      } else {
        el.textContent = i;
      }
      stampsEl.appendChild(el);
    }
  }

  // renderRedeem re-attaches button listeners every time it injects HTML,
  // because innerHTML replacement destroys old listeners.
  function renderRedeem(html) {
    contentEl.innerHTML = html;
    var r  = document.getElementById('smRedeem');  if (r)  r.addEventListener('click', redeem);
    var rt = document.getElementById('smRetry');   if (rt) rt.addEventListener('click', redeem);
  }

  function renderStatus() {
    var d = getStampData();
    renderStamps(d, null);
    var c = countStamps(d);
    if (c >= REQUIRED_STAMPS) {
      renderRedeem('<p class="sm-msg sm-msg-ready">已集滿 ' + c + ' 家，可以兌換了！</p>' +
        '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>');
    } else if (c > 0) {
      contentEl.innerHTML = '<p class="sm-progress">目前進度：' + c + ' / ' + REQUIRED_STAMPS + ' 家</p>';
    } else {
      contentEl.innerHTML = '<p class="sm-empty">掃描店家 QR Code 開始集點吧！</p>';
    }
  }

  // ── Stamp flow ────────────────────────────────────────────────────────────
  // New: write to KV first, then update local cache from server response.
  // KV is the source of truth; local cookie is only for instant UI display.

  function applyStamp(shopId) {
    var cardId  = getOrCreateCardId();
    var shopKey = 'shop_' + shopId;
    var d       = getStampData();

    // If the local cache already marks this shop, show "already stamped"
    // without hitting the API. (Idempotent if cache is wrong; user can retry.)
    if (d[shopKey]) {
      var c = countStamps(d);
      renderStamps(d, null);
      var h = '<p class="sm-msg sm-msg-already">店家 #' + shopId + ' 已集點</p>' +
              '<p class="sm-progress">目前進度：' + c + ' / ' + REQUIRED_STAMPS + ' 家</p>';
      if (c >= REQUIRED_STAMPS) h += '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>';
      renderRedeem(h);
      return;
    }

    contentEl.innerHTML = '<div class="sm-spinner"></div><p class="sm-loading">集點中...</p>';

    fetch(API_BASE + '/api/stamp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({card_id: cardId, shop_id: shopKey})
    })
    .then(function(r) { if (!r.ok) throw 0; return r.json(); })
    .then(function(j) {
      // Mirror the server's state into the local cache so the badge stays accurate
      d[shopKey] = new Date().toISOString();  // matches KV format: timestamp string
      saveStampData(d);
      var c = j.stamped_count;
      renderStamps(d, shopId);
      if (c >= REQUIRED_STAMPS) {
        renderRedeem(
          '<p class="sm-msg sm-msg-success">店家 #' + shopId + ' 集點成功！</p>' +
          '<p class="sm-progress">已集滿 ' + c + ' 家，可以兌換了！</p>' +
          '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>'
        );
      } else {
        contentEl.innerHTML =
          '<p class="sm-msg sm-msg-success">店家 #' + shopId + ' 集點成功！</p>' +
          '<p class="sm-progress">目前進度：' + c + ' / ' + REQUIRED_STAMPS + ' 家</p>';
      }
      updateBadge();
    })
    .catch(function() {
      contentEl.innerHTML = '<p class="sm-msg sm-msg-error">集點失敗，請稍後再試</p>';
    });
  }

  // ── Redeem flow ───────────────────────────────────────────────────────────
  // New: pass card_id only; backend fetches stamps from KV.
  // Showing the card_id lets users screenshot it for cross-browser recovery.

  function redeem() {
    var cardId = getOrCreateCardId();
    contentEl.innerHTML =
      '<div class="sm-spinner"></div><p class="sm-loading">正在產生兌換 QR Code，請稍候...</p>';

    fetch(API_BASE + '/api/sign', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({card_id: cardId})
    })
    .then(function(r) { if (!r.ok) throw 0; return r.json(); })
    .then(function(j) {
      contentEl.innerHTML =
        '<div id="sm-qr"></div>' +
        '<p class="sm-qr-hint">QR Code 5 分鐘內有效，請儘速出示給扭蛋機掃描</p>' +
        '<p style="font-size:11px;color:#888;margin-top:12px;line-height:1.6">' +
          '您的集點卡編號（換瀏覽器可恢復進度）：<br>' +
          '<code style="font-size:10px;word-break:break-all">' + cardId + '</code>' +
        '</p>';
      new QRCode(document.getElementById('sm-qr'), {text: j.qr_payload, width: 240, height: 240});
    })
    .catch(function() {
      renderRedeem(
        '<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>' +
        '<button class="sm-btn sm-btn-primary" id="smRetry">重新兌換</button>'
      );
    });
  }

  // ── Modal open/close ──────────────────────────────────────────────────────

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderStatus();
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    updateBadge();
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  bk.addEventListener('click', closeModal);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // ── Cross-browser card recovery UI (injected dynamically) ─────────────────
  // Injected via JS to avoid touching index.html structure.
  // Small, low-contrast entry point so it doesn't distract main users.

  var smPanel = modal.querySelector('.sm-panel');
  var restoreDiv = document.createElement('div');
  restoreDiv.style.cssText = 'padding:8px 24px 18px;text-align:center';
  restoreDiv.innerHTML =
    '<button id="smRestoreToggle" style="background:none;border:none;' +
      'color:#aaa;font-size:11px;cursor:pointer;text-decoration:underline;padding:0">' +
      '我有集點卡編號' +
    '</button>' +
    '<div id="smRestoreForm" style="display:none;margin-top:10px">' +
      '<input id="smRestoreInput" type="text"' +
        ' placeholder="請輸入集點卡編號（8 字元，例如 X3K9P2WQ）"' +
        ' style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;' +
               'font-size:12px;box-sizing:border-box;outline:none">' +
      '<button id="smRestoreSubmit"' +
        ' style="margin-top:8px;padding:8px 20px;background:#2c6e49;color:#fff;' +
               'border:none;border-radius:6px;cursor:pointer;font-size:13px">' +
        '恢復進度' +
      '</button>' +
      '<p id="smRestoreMsg" style="font-size:12px;margin:6px 0 0;min-height:16px"></p>' +
    '</div>';
  smPanel.appendChild(restoreDiv);

  document.getElementById('smRestoreToggle').addEventListener('click', function() {
    var form = document.getElementById('smRestoreForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('smRestoreSubmit').addEventListener('click', function() {
    var input = document.getElementById('smRestoreInput').value.trim();
    var msg   = document.getElementById('smRestoreMsg');

    // Validate 8-char A-Z0-9 format before hitting the API
    if (!/^[A-Z0-9]{8}$/i.test(input)) {
      msg.style.color = '#c00';
      msg.textContent = '格式不正確，請輸入 8 字元英數字編號（例如 X3K9P2WQ）';
      return;
    }

    msg.style.color = '#888';
    msg.textContent = '查詢中...';

    fetch(API_BASE + '/api/get_card', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({card_id: input})
    })
    .then(function(r) {
      // Distinguish 404 (card not found) from other errors for a clear message
      if (r.status === 404) { throw {notFound: true}; }
      if (!r.ok) { throw {}; }
      return r.json();
    })
    .then(function(j) {
      // Overwrite local identity cookies with the restored card.
      // Use current time for card_created_at so the 30-day window restarts,
      // preventing getOrCreateCardId() from immediately issuing a new card.
      setCookie('card_id', j.card_id, COOKIE_DAYS);
      setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
      // Sync local stamp cache from KV data
      saveStampData(j.stamps || {});

      msg.style.color = '#2c6e49';
      msg.textContent = '已恢復進度！';

      setTimeout(function() {
        document.getElementById('smRestoreForm').style.display = 'none';
        document.getElementById('smRestoreMsg').textContent = '';
        renderStatus();
        updateBadge();
      }, 900);
    })
    .catch(function(err) {
      msg.style.color = '#c00';
      msg.textContent = (err && err.notFound)
        ? '找不到這張集點卡，請確認編號正確'
        : '系統忙碌，請稍後再試';
    });
  });

  updateBadge();

  // ── Handle shop QR scan on page load ──────────────────────────────────────

  var token = new URLSearchParams(location.search).get('shop');
  if (token) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderStamps(getStampData(), null);
    contentEl.innerHTML = '<div class="sm-spinner"></div><p class="sm-loading">驗證中...</p>';
    fetch(API_BASE + '/api/shop?token=' + encodeURIComponent(token))
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (!j.shop_id) {
          contentEl.innerHTML = '<p class="sm-msg sm-msg-error">無效的店家 QR Code</p>';
          return;
        }
        var shopId = parseInt(j.shop_id.replace('shop_', ''), 10);
        applyStamp(shopId);
        if (history.replaceState) {
          history.replaceState({}, '', location.pathname + location.hash);
        }
      })
      .catch(function() {
        contentEl.innerHTML = '<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>';
      });
  }
})();
