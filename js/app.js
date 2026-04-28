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
  const API_BASE='https://eia-application.onrender.com';
  const TOTAL_SHOPS=5,REQUIRED_STAMPS=3,COOKIE_NAME='stamp_data',COOKIE_DAYS=30;
  const modal=document.getElementById('stampModal');
  const openBtn=document.getElementById('stampBtn');
  const closeBtn=document.getElementById('smClose');
  const bk=document.getElementById('smBk');
  const stampsEl=document.getElementById('smStamps');
  const contentEl=document.getElementById('smContent');
  const badge=document.getElementById('stampBadge');

  function getStampData(){
    const m=document.cookie.match(new RegExp('(?:^|; )'+COOKIE_NAME+'=([^;]*)'));
    if(!m)return{};
    try{return JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){return{}}
  }
  function saveStampData(d){
    const enc=encodeURIComponent(btoa(JSON.stringify(d)));
    const exp=new Date(Date.now()+COOKIE_DAYS*86400000).toUTCString();
    document.cookie=COOKIE_NAME+'='+enc+'; expires='+exp+'; path=/; SameSite=Lax';
  }
  function countStamps(d){let c=0;for(const k in d)if(d[k]&&d[k].stamped===true)c++;return c}
  function updateBadge(){
    const c=countStamps(getStampData());
    if(c>0){badge.textContent=c;badge.classList.add('show')}else{badge.classList.remove('show')}
  }
  function renderStamps(d,curId){
    stampsEl.innerHTML='';
    for(let i=1;i<=TOTAL_SHOPS;i++){
      const el=document.createElement('div');
      el.className='sm-stamp';
      const k='shop_'+i;
      if(d[k]&&d[k].stamped){
        el.className+=curId===i?' current':' collected';
        el.textContent='✓';
      }else el.textContent=i;
      stampsEl.appendChild(el);
    }
  }
  function renderRedeem(html){
    contentEl.innerHTML=html;
    const r=document.getElementById('smRedeem');if(r)r.addEventListener('click',redeem);
    const rt=document.getElementById('smRetry');if(rt)rt.addEventListener('click',redeem);
  }
  function renderStatus(){
    const d=getStampData();
    renderStamps(d,null);
    const c=countStamps(d);
    if(c>=REQUIRED_STAMPS){
      renderRedeem('<p class="sm-msg sm-msg-ready">已集滿 '+c+' 家，可以兌換了！</p>'+
        '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>');
    }else if(c>0){
      contentEl.innerHTML='<p class="sm-progress">目前進度：'+c+' / '+REQUIRED_STAMPS+' 家</p>';
    }else{
      contentEl.innerHTML='<p class="sm-empty">掃描店家 QR Code 開始集點吧！</p>';
    }
  }
  function applyStamp(shopId){
    const d=getStampData();
    const k='shop_'+shopId;
    if(d[k]&&d[k].stamped===true){
      renderStamps(d,null);
      const c=countStamps(d);
      let h='<p class="sm-msg sm-msg-already">店家 #'+shopId+' 已集點</p>'+
            '<p class="sm-progress">目前進度：'+c+' / '+REQUIRED_STAMPS+' 家</p>';
      if(c>=REQUIRED_STAMPS)h+='<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>';
      renderRedeem(h);
      return;
    }
    d[k]={stamped:true,timestamp:new Date().toISOString()};
    saveStampData(d);
    const c=countStamps(d);
    renderStamps(d,shopId);
    if(c>=REQUIRED_STAMPS){
      renderRedeem('<p class="sm-msg sm-msg-success">店家 #'+shopId+' 集點成功！</p>'+
        '<p class="sm-progress">已集滿 '+c+' 家，可以兌換了！</p>'+
        '<button class="sm-btn sm-btn-primary" id="smRedeem">兌換扭蛋</button>');
    }else{
      contentEl.innerHTML='<p class="sm-msg sm-msg-success">店家 #'+shopId+' 集點成功！</p>'+
        '<p class="sm-progress">目前進度：'+c+' / '+REQUIRED_STAMPS+' 家</p>';
    }
  }
  function redeem(){
    contentEl.innerHTML='<div class="sm-spinner"></div><p class="sm-loading">正在產生兌換 QR Code，請稍候...</p>';
    fetch(API_BASE+'/api/sign',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stamps:getStampData()})
    }).then(r=>{if(!r.ok)throw 0;return r.json()})
      .then(j=>{
        contentEl.innerHTML='<div id="sm-qr"></div><p class="sm-qr-hint">QR Code 5 分鐘內有效，請儘速出示給扭蛋機掃描</p>';
        new QRCode(document.getElementById('sm-qr'),{text:j.qr_payload,width:240,height:240});
      })
      .catch(()=>renderRedeem('<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>'+
        '<button class="sm-btn sm-btn-primary" id="smRetry">重新兌換</button>'));
  }
  function openModal(){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    renderStatus();
  }
  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    updateBadge();
  }

  openBtn.addEventListener('click',openModal);
  closeBtn.addEventListener('click',closeModal);
  bk.addEventListener('click',closeModal);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))closeModal()});

  updateBadge();

  const token=new URLSearchParams(location.search).get('shop');
  if(token){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    renderStamps(getStampData(),null);
    contentEl.innerHTML='<div class="sm-spinner"></div><p class="sm-loading">驗證中...</p>';
    fetch(API_BASE+'/api/shop?token='+encodeURIComponent(token))
      .then(r=>r.json())
      .then(j=>{
        if(!j.shop_id){contentEl.innerHTML='<p class="sm-msg sm-msg-error">無效的店家 QR Code</p>';return}
        const shopId=parseInt(j.shop_id.replace('shop_',''),10);
        applyStamp(shopId);
        updateBadge();
        if(history.replaceState){
          history.replaceState({},'',location.pathname+location.hash);
        }
      })
      .catch(()=>{contentEl.innerHTML='<p class="sm-msg sm-msg-error">系統忙碌，請稍後再試</p>'});
  }
})();
