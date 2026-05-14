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

/* ══════ NFC TRACKING ══════ */
(function(){
  var source = new URLSearchParams(location.search).get('source');
  if (source && /^nfc_[a-z0-9_]+$/.test(source)) {
    fetch('https://eia-application.jimhankliang.workers.dev/api/track', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ source: source })
    }).catch(function(){});
  }
})();

/* ══════ STAMP CARD ══════ */
(function(){
  // 原本是寫死的 但為了做本地端測試
  // var API_BASE = 'https://eia-application.jimhankliang.workers.dev';

  // 自動判斷是否為本地開發環境
  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // 動態切換 API 基礎路徑
  var API_BASE = isLocal ? 'http://127.0.0.1:8787' : 'https://eia-application.jimhankliang.workers.dev';
  
  var REQUIRED_STAMPS = 3, COOKIE_DAYS = 30;

  // ── 店家設定（集中在這裡，方便修改）────────────────────────────────────────
  // pos: 百分比座標，x=左右(0左~100右)，y=上下(0上~100下)
  // icon: 填入圖片路徑 'images/icons/shop1.png'，null = 顯示名稱縮寫
  /* 分東南西北
  var SHOP_CONFIG = {
    shop_1: { name: '店家 A', pos: { x: 50, y: 18 }, icon: null },
    shop_2: { name: '店家 B', pos: { x: 82, y: 48 }, icon: null },
    shop_3: { name: '店家 C', pos: { x: 50, y: 80 }, icon: null },
    shop_4: { name: '店家 D', pos: { x: 18, y: 48 }, icon: null },
    shop_5: { name: '店家 E', pos: { x: 50, y: 48 }, icon: null },
  };
  */
  var SHOP_CONFIG = {
    // y 全部設為 50 (垂直置中)，x 從 10 到 90 等距散佈
    shop_1: { name: '店家 A', pos: { x: 10, y: 50 }, icon: null },
    shop_2: { name: '店家 B', pos: { x: 30, y: 50 }, icon: null },
    shop_3: { name: '店家 C', pos: { x: 50, y: 50 }, icon: null },
    shop_4: { name: '店家 D', pos: { x: 70, y: 50 }, icon: null },
    shop_5: { name: '店家 E', pos: { x: 90, y: 50 }, icon: null },
  };

  // ── 地圖底圖設定 ───────────────────────────────────────────────────────────
  // background: 填入 'images/dongao-map.png'，null = 使用預設漸層色
  // aspect_ratio: 地圖容器的寬高比
  var MAP_CONFIG = {
    background: null,
    aspect_ratio: '4 / 3',
  };

  var modal    = document.getElementById('stampModal');
  var openBtn  = document.getElementById('stampBtn');
  var closeBtn = document.getElementById('smClose');
  var bk       = document.getElementById('smBk');
  var stampsEl = document.getElementById('smStamps');
  var contentEl= document.getElementById('smContent');
  var badge    = document.getElementById('stampBadge');

  // ── Cookie helpers ────────────────────────────────────────────────────────

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days) {
    var exp = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  // ── Card identity ─────────────────────────────────────────────────────────
  // Cookie 只記 card_id，章的狀態完全從 DB 讀取

  function generateCardId() {
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
      if (age < COOKIE_DAYS * 24 * 60 * 60 * 1000) return existing;
    }
    var newId = generateCardId();
    setCookie('card_id', newId, COOKIE_DAYS);
    setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
    return newId;
  }

  // ── Badge ─────────────────────────────────────────────────────────────────
  // 預設關閉：避免每次開頁面都打一次 DB
  badge.classList.remove('show');

  // ── Option 1：啟用 Badge ──────────────────────────────────────────────────
  // 若要在右上角顯示集章數，把下面 loadBadge() 整個取消註解即可。
  // 注意：每次使用者開啟頁面都會多一次 /api/get_card DB 請求。
  //
  // (function loadBadge() {
  //   var id = getCookie('card_id');
  //   if (!id) return;                       // 還沒有集點卡，不查詢
  //   fetch(API_BASE + '/api/get_card', {
  //     method: 'POST',
  //     headers: {'Content-Type': 'application/json'},
  //     body: JSON.stringify({card_id: id})
  //   })
  //   .then(function(r) { return r.ok ? r.json() : null; })
  //   .then(function(j) {
  //     if (j && j.stamped_count > 0) {
  //       badge.textContent = j.stamped_count;
  //       badge.classList.add('show');
  //     }
  //   })
  //   .catch(function() {});                 // 靜默失敗，badge 不顯示
  // })();
  // ── End Option 1 ─────────────────────────────────────────────────────────

  // ── In-memory stamp state ─────────────────────────────────────────────────
  var currentStamps = {};
  var firstVisitPending = false;

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderMap(stamps, curShopId) {
    stampsEl.innerHTML = '';

    var mapEl = document.createElement('div');
    mapEl.className = 'sm-map';
    mapEl.style.aspectRatio = MAP_CONFIG.aspect_ratio;

    // 背景層（overflow:hidden 只作用在此），圖釘層在外面可以溢出
    var bgEl = document.createElement('div');
    bgEl.className = 'sm-map-bg';
    if (MAP_CONFIG.background) {
      bgEl.style.backgroundImage = 'url(' + MAP_CONFIG.background + ')';
      bgEl.style.backgroundSize = 'cover';
      bgEl.style.backgroundPosition = 'center';
    }
    mapEl.appendChild(bgEl);

    for (var key in SHOP_CONFIG) {
      var cfg = SHOP_CONFIG[key];
      var num = parseInt(key.replace('shop_', ''), 10);
      var stamped = !!stamps[key];
      var isCurrent = (curShopId === num);

      var pin = document.createElement('div');
      pin.className = 'sm-pin' +
        (isCurrent ? ' sm-pin--current' : (stamped ? ' sm-pin--collected' : ' sm-pin--empty'));
      pin.style.left = cfg.pos.x + '%';
      pin.style.top  = cfg.pos.y + '%';

      var iconEl = document.createElement('span');
      iconEl.className = 'sm-pin-icon';

      if (cfg.icon) {
        var img = document.createElement('img');
        img.src = cfg.icon;
        img.alt = cfg.name;
        img.className = 'sm-pin-icon-img';
        iconEl.appendChild(img);
      } else {
        var inner = document.createElement('span');
        inner.className = 'sm-pin-icon-inner';
        inner.textContent = cfg.name.slice(0, 2);
        iconEl.appendChild(inner);
      }

      var checkEl = document.createElement('span');
      checkEl.className = 'sm-pin-check';
      checkEl.textContent = '✓';
      if (!stamped) checkEl.style.display = 'none';

      var label = document.createElement('span');
      label.className = 'sm-pin-label';
      label.textContent = cfg.name;

      pin.appendChild(iconEl);
      pin.appendChild(checkEl);
      pin.appendChild(label);
      mapEl.appendChild(pin);
    }

    stampsEl.appendChild(mapEl);

    var legend = document.createElement('div');
    legend.className = 'sm-map-legend';
    legend.innerHTML =
      '<span><i class="sm-legend-dot sm-legend-dot--empty"></i>未集章</span>' +
      '<span><i class="sm-legend-dot sm-legend-dot--collected"></i>已集章</span>' +
      '<span><i class="sm-legend-dot sm-legend-dot--current"></i>本次</span>';
    stampsEl.appendChild(legend);
  }

  function renderRedeem(html) {
    contentEl.innerHTML = html;
    var r  = document.getElementById('smRedeem');  if (r)  r.addEventListener('click', redeem);
    var rt = document.getElementById('smRetry');   if (rt) rt.addEventListener('click', redeem);
  }

  function showCardId() {
    var el = document.getElementById('smCardId');
    if (!el) return;
    var id = getOrCreateCardId();
    el.innerHTML =
      '<div class="sm-cid-label">你的集點卡編號</div>' +
      '<div class="sm-cid-row">' +
        '<div class="sm-cid-code" id="smCidCode">' + id + '</div>' +
        '<button class="sm-cid-copy" id="smCidCopy" aria-label="複製編號">' +
          '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="sm-cid-hint">截圖保存此編號，換瀏覽器時輸入可恢復集點進度</div>';

    document.getElementById('smCidCopy').addEventListener('click', function() {
      var btn = this;
      var svgEl = btn.querySelector('svg');
      function showCopied() {
        btn.classList.add('copied');
        svgEl.style.display = 'none';
        btn.insertAdjacentHTML('beforeend', '<span class="sm-cid-copied-txt">已複製 ✓</span>');
        setTimeout(function() {
          btn.classList.remove('copied');
          svgEl.style.display = '';
          var txt = btn.querySelector('.sm-cid-copied-txt');
          if (txt) txt.remove();
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(showCopied).catch(function() { fallbackCopy(id); showCopied(); });
      } else {
        fallbackCopy(id); showCopied();
      }
    });
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }

  // ── Load from DB and render ───────────────────────────────────────────────
  // 每次開 modal 都從 DB 拿最新狀態，確保顯示與 DB 一致

  function loadAndRender() {
    var cardId = getOrCreateCardId();
    renderMap({}, null);
    contentEl.innerHTML = '<div class="sm-spinner"></div><p class="sm-loading">載入中...</p>';

    fetch(API_BASE + '/api/get_card', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({card_id: cardId})
    })
    .then(function(r) {
      // 404 = 還沒有任何集點紀錄，當作空卡處理
      if (r.status === 404) return {stamps: {}, stamped_count: 0};
      if (!r.ok) throw 0;
      return r.json();
    })
    .then(function(j) {
      currentStamps = j.stamps || {};
      var c = j.stamped_count || 0;
      renderMap(currentStamps, null);
      if (c >= REQUIRED_STAMPS) {
        renderRedeem(
          '<p class="sm-msg sm-msg-ready">已集滿 ' + c + ' 家，可以兌換了！</p>' +
          '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>'
        );
      } else if (c > 0) {
        contentEl.innerHTML = '<p class="sm-progress">目前進度：' + c + ' / ' + REQUIRED_STAMPS + ' 家</p>';
      } else {
        contentEl.innerHTML = '<p class="sm-empty">掃描店家 QR Code 開始集點吧！</p>';
      }
    })
    .catch(function() {
      contentEl.innerHTML = '<p class="sm-msg sm-msg-error">載入失敗，請稍後再試</p>';
    });
  }

  // ── Stamp flow ────────────────────────────────────────────────────────────
  // 蓋章後用後端回傳的 stamped_count + in-memory currentStamps 更新畫面
  // 不需要再打一次 get_card，也不寫 cookie

  function applyStamp(shopId) {
    var cardId  = getOrCreateCardId();
    var shopKey = 'shop_' + shopId;

    contentEl.innerHTML = '<div class="sm-spinner"></div><p class="sm-loading">集點中...</p>';

    fetch(API_BASE + '/api/stamp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({card_id: cardId, shop_id: shopKey})
    })
    .then(function(r) { if (!r.ok) throw 0; return r.json(); })
    .then(function(j) {
      currentStamps[shopKey] = new Date().toISOString();
      var c = j.stamped_count;
      renderMap(currentStamps, shopId);
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
    })
    .catch(function() {
      contentEl.innerHTML = '<p class="sm-msg sm-msg-error">集點失敗，請稍後再試</p>';
    });
  }

  // ── Redeem flow ───────────────────────────────────────────────────────────

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
        '<p class="sm-qr-hint">QR Code 5 分鐘內有效，請儘速出示給扭蛋機掃描</p>';
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
    loadAndRender();
    showCardId();
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ── First-visit helpers ───────────────────────────────────────────────────

  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    return /\bLine\b/i.test(ua) || /FBAN|FBAV|FB_IAB/i.test(ua);
  }

  function renderFirstVisit() {
    var inApp = isInAppBrowser();
    contentEl.innerHTML =
      '<div class="sm-fv">' +
        '<p class="sm-fv-title">歡迎來到東澳集點！</p>' +
        '<p class="sm-fv-sub">你還沒有集點卡，請選擇繼續：</p>' +
        // PRIMARY：我有集點卡編號（主視覺，長輩跨瀏覽器需求多）
        '<button class="sm-btn sm-btn-primary sm-fv-restore-btn" id="smFvRestore" disabled>我有集點卡編號</button>' +
        '<div class="sm-fv-restore-wrap" id="smFvRestoreWrap" style="display:none">' +
          '<input id="smFvRestoreInput" type="text" class="sm-fv-input"' +
            ' placeholder="輸入 8 字元編號，例如 X3K9P2WQ">' +
          '<button class="sm-btn sm-btn-primary sm-fv-submit" id="smFvSubmit">確認恢復</button>' +
          '<p class="sm-fv-err" id="smFvErr"></p>' +
        '</div>' +
        '<div class="sm-fv-divider">── 或 ──</div>' +
        // SECONDARY：建立新的（小字連結，新建只發生一次）
        '<button class="sm-fv-new" id="smFvNew" disabled>第一次來？建立新的集點卡</button>' +
        (inApp
          ? '<p class="sm-fv-inapp-warn">💡 從 LINE 等 App 進來會跟瀏覽器分開，記得保存集點卡編號</p>'
          : '') +
      '</div>';
  }

  function wireFirstVisitHandlers(shopId) {
    var newBtn     = document.getElementById('smFvNew');
    var restoreBtn = document.getElementById('smFvRestore');
    if (!newBtn || !restoreBtn) return;
    newBtn.disabled     = false;
    restoreBtn.disabled = false;

    newBtn.addEventListener('click', function() {
      newBtn.disabled = true;
      firstVisitPending = false;
      var newId = generateCardId();
      setCookie('card_id', newId, COOKIE_DAYS);
      setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
      if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
      showCardId();
      applyStamp(shopId);
    });

    restoreBtn.addEventListener('click', function() {
      var wrap = document.getElementById('smFvRestoreWrap');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('smFvSubmit').addEventListener('click', function() {
      var input = document.getElementById('smFvRestoreInput').value.trim().toUpperCase();
      var errEl = document.getElementById('smFvErr');
      var submitBtn = document.getElementById('smFvSubmit');
      if (!/^[A-Z0-9]{8}$/.test(input)) {
        errEl.style.color = '#c00';
        errEl.textContent = '格式不正確，請輸入 8 字元英數字編號';
        return;
      }
      errEl.style.color = '#888';
      errEl.textContent = '查詢中...';
      submitBtn.disabled = true;

      fetch(API_BASE + '/api/get_card', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({card_id: input})
      })
      .then(function(r) {
        if (r.status === 404) throw {notFound: true};
        if (!r.ok) throw {};
        return r.json();
      })
      .then(function(j) {
        firstVisitPending = false;
        setCookie('card_id', j.card_id, COOKIE_DAYS);
        setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
        currentStamps = j.stamps || {};
        if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
        showCardId();
        applyStamp(shopId);
      })
      .catch(function(err) {
        submitBtn.disabled = false;
        errEl.style.color = '#c00';
        errEl.textContent = (err && err.notFound)
          ? '找不到這張集點卡，請確認編號正確'
          : '系統忙碌，請稍後再試';
      });
    });
  }

  function handleFirstVisitAbandoned() {
    firstVisitPending = false;
    if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
    contentEl.innerHTML =
      '<div class="sm-fv-warn">' +
        '<p class="sm-msg sm-msg-error">你這次的集點未完成</p>' +
        '<p class="sm-fv-warn-hint">若需繼續集點，請重新掃描 QR Code。</p>' +
        '<button class="sm-btn sm-btn-primary" id="smFvWarnClose">關閉</button>' +
      '</div>';
    document.getElementById('smFvWarnClose').addEventListener('click', closeModal);
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', function() {
    if (firstVisitPending) { handleFirstVisitAbandoned(); } else { closeModal(); }
  });
  bk.addEventListener('click', function() {
    if (firstVisitPending) { handleFirstVisitAbandoned(); } else { closeModal(); }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      if (firstVisitPending) { handleFirstVisitAbandoned(); } else { closeModal(); }
    }
  });

  // ── Cross-browser card recovery UI ───────────────────────────────────────

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
    var input = document.getElementById('smRestoreInput').value.trim().toUpperCase();
    var msg   = document.getElementById('smRestoreMsg');

    if (!/^[A-Z0-9]{8}$/.test(input)) {
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
      if (r.status === 404) { throw {notFound: true}; }
      if (!r.ok) { throw {}; }
      return r.json();
    })
    .then(function(j) {
      setCookie('card_id', j.card_id, COOKIE_DAYS);
      setCookie('card_created_at', new Date().toISOString(), COOKIE_DAYS);
      currentStamps = j.stamps || {};

      msg.style.color = '#2c6e49';
      msg.textContent = '已恢復進度！';

      setTimeout(function() {
        document.getElementById('smRestoreForm').style.display = 'none';
        document.getElementById('smRestoreMsg').textContent = '';
        loadAndRender();
        showCardId();
      }, 900);
    })
    .catch(function(err) {
      msg.style.color = '#c00';
      msg.textContent = (err && err.notFound)
        ? '找不到這張集點卡，請確認編號正確'
        : '系統忙碌，請稍後再試';
    });
  });

  // ── Handle shop QR scan on page load ─────────────────────────────────────

  var token = new URLSearchParams(location.search).get('shop');
  if (token) {
    var hasCookie = !!getCookie('card_id');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderMap({}, null);

    if (!hasCookie) {
      // ── 首次訪問：無 cookie，先讓使用者選擇建立新卡或輸入舊卡 ───────────────
      firstVisitPending = true;
      renderFirstVisit();

      // 同時驗證 shop token，token 有效後才啟用按鈕
      fetch(API_BASE + '/api/shop?token=' + encodeURIComponent(token))
        .then(function(r) { return r.json(); })
        .then(function(shopData) {
          if (!shopData.shop_id) {
            firstVisitPending = false;
            contentEl.innerHTML = '<p class="sm-msg sm-msg-error">無效的店家 QR Code</p>';
            if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
            return;
          }
          var shopId = parseInt(shopData.shop_id.replace('shop_', ''), 10);
          wireFirstVisitHandlers(shopId);
        })
        .catch(function() {
          firstVisitPending = false;
          contentEl.innerHTML = '<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>';
          if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
        });

    } else {
      // ── 已有 cookie：直接載入舊卡資料再蓋章（原本的邏輯）────────────────────
      showCardId();
      contentEl.innerHTML = '<div class="sm-spinner"></div><p class="sm-loading">驗證中...</p>';
      var qrCardId = getOrCreateCardId();
      Promise.all([
        fetch(API_BASE + '/api/shop?token=' + encodeURIComponent(token))
          .then(function(r) { return r.json(); }),
        fetch(API_BASE + '/api/get_card', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({card_id: qrCardId})
        }).then(function(r) {
          if (r.status === 404) return {stamps: {}};
          if (!r.ok) return {stamps: {}};
          return r.json();
        })
      ])
      .then(function(results) {
        var shopData = results[0];
        var cardData = results[1];
        if (!shopData.shop_id) {
          contentEl.innerHTML = '<p class="sm-msg sm-msg-error">無效的店家 QR Code</p>';
          return;
        }
        currentStamps = cardData.stamps || {};
        var shopId = parseInt(shopData.shop_id.replace('shop_', ''), 10);
        applyStamp(shopId);
        if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
      })
      .catch(function() {
        contentEl.innerHTML = '<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>';
      });
    }
  }
})();

/* ══════ STAMP HINT TOOLTIP ══════ */
(function(){
  var params = new URLSearchParams(location.search);
  if (params.get('shop')) return;
  function gc(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:null;}
  if (gc('card_id') || gc('seen_hint')) return;

  setTimeout(function() {
    var hint = document.createElement('div');
    hint.id = 'stampHint';
    hint.className = 'stamp-hint';
    hint.innerHTML =
      '<button class="stamp-hint-close" id="stampHintClose" aria-label="關閉">×</button>' +
      '<p class="stamp-hint-msg">走訪 3 家店即可兌換扭蛋好禮！</p>' +
      '<p class="stamp-hint-sub">點擊右上角集點卡開始 ↗</p>';
    document.body.appendChild(hint);

    requestAnimationFrame(function(){ requestAnimationFrame(function(){ hint.classList.add('show'); }); });

    document.getElementById('stampHintClose').addEventListener('click', function() {
      hint.classList.remove('show');
      setTimeout(function(){ if (hint.parentNode) hint.parentNode.removeChild(hint); }, 320);
      var exp = new Date(Date.now() + 30*86400000).toUTCString();
      document.cookie = 'seen_hint=1; expires=' + exp + '; path=/; SameSite=Lax';
    });
  }, 1500);
})();

/* ══════ MASCOT ══════ */
(function(){
  function gc(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:null;}
  if (gc('mascot_seen')) return;

  // 這邊是根據使用者的電腦設定來看要不要跳出 因為一些眼睛不好的人不喜歡飛出來的東西
  //var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  //var exp = new Date(Date.now() + 30*86400000).toUTCString();
  //if (reduced) {
  //  document.cookie = 'mascot_seen=1; expires=' + exp + '; path=/; SameSite=Lax';
  //  return;
  //}

  setTimeout(function() {
    var wrap = document.createElement('div');
    wrap.id = 'mascotWrap';
    wrap.className = 'mascot-wrap';

    var bubble = document.createElement('div');
    bubble.className = 'mascot-bubble';
    bubble.id = 'mascotBubble';
    bubble.textContent = '嗨！我是東澳的小精靈～';

    var body = document.createElement('div');
    body.className = 'mascot-body';
    body.textContent = '小精靈';
    var img = new Image();
    img.alt = '東澳小精靈';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:50%';
    img.onload = function(){ body.innerHTML = ''; body.appendChild(img); body.style.cssText = 'background:transparent;box-shadow:none'; };
    //img.src = 'images/mascot.png';
    img.src = 'images/mascot_test2.png'

    wrap.appendChild(bubble);
    wrap.appendChild(body);
    document.body.appendChild(wrap);

    wrap.classList.add('entering');

    // 顯示第一句對話
    setTimeout(function(){ bubble.classList.add('show'); }, 1000);

    // 換第二句
    setTimeout(function() {
      bubble.style.opacity = '0';
      setTimeout(function() {
        bubble.textContent = '右上角是集點卡，記得來玩喔！';
        bubble.style.opacity = '1';
      }, 300);
    }, 4000);

    // 飛離 + 淡出
    setTimeout(function() {
      bubble.classList.remove('show');
      setTimeout(function() {
        wrap.classList.remove('entering');
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ wrap.classList.add('leaving'); }); });
      }, 400);
    }, 7000);

    // 清除 DOM + 寫 cookie
    setTimeout(function() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.cookie = 'mascot_seen=1; expires=' + exp + '; path=/; SameSite=Lax';
    }, 9500);

  }, 2000);
})();
