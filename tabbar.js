/* Phone tab bar: sliding glass highlight that follows the finger. UI only, no data or app logic. */
(function(){
 var nav=document.getElementById('nav');
 if(!nav||!window.MutationObserver)return;
 var mq=window.matchMedia('(max-width:760px)');
 var reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 var ind=document.createElement('i');ind.className='tab-glass';ind.setAttribute('aria-hidden','true');
 var lastX=null,drag=null,raf=0;
 function baseLeft(){var prev=ind.style.transform,pt=ind.style.transition;ind.style.transition='none';ind.style.transform='translateX(0px)';var l=ind.getBoundingClientRect().left;ind.style.transform=prev;ind.style.transition=pt;return l}
 function xFor(btn,base){return btn.getBoundingClientRect().left-base}
 function active(){return nav.querySelector('.nav-item.active')}
 function place(btn,animate){
  if(!btn||!mq.matches){ind.style.opacity='0';return}
  var x=xFor(btn,baseLeft()),w=btn.offsetWidth;
  ind.style.transition=(animate&&!reduce.matches)?'':'none';
  ind.style.width=w+'px';ind.style.transform='translateX('+x+'px)';ind.style.opacity='1';
  lastX=x;
 }
 function sync(){
  if(ind.parentNode!==nav)nav.appendChild(ind);
  var b=active();
  if(!b){ind.style.opacity='0';return}
  if(lastX!==null&&ind.style.opacity!=='0'&&!drag){
   ind.style.transition='none';ind.style.transform='translateX('+lastX+'px)';void ind.offsetWidth;
  }
  place(b,lastX!==null);
 }
 function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;sync()})}
 new MutationObserver(function(m){
  for(var i=0;i<m.length;i++){if(m[i].target===nav&&!(m[i].addedNodes.length===1&&m[i].addedNodes[0]===ind)){schedule();return}}
 }).observe(nav,{childList:true});
 nav.addEventListener('click',function(){schedule()});
 window.addEventListener('resize',schedule);
 if(mq.addEventListener)mq.addEventListener('change',schedule);
 // Drag the highlight: grab the active tab and slide to another; release to open it.
 function itemAt(clientX){
  var items=nav.querySelectorAll('.nav-item'),best=null,bd=1e9;
  var r=nav.getBoundingClientRect();
  items.forEach(function(b){var br=b.getBoundingClientRect();var c=br.left+br.width/2;var d=Math.abs(c-clientX);if(d<bd){bd=d;best=b}});
  return best;
 }
 nav.addEventListener('pointerdown',function(e){
  if(!mq.matches)return;
  var b=e.target.closest&&e.target.closest('.nav-item.active');
  if(!b||b.dataset.tab==='mobile-more')return;
  var bl=baseLeft();drag={id:e.pointerId,startX:e.clientX,bl:bl,base:xFor(b,bl),w:b.offsetWidth,moved:false,over:b};
 });
 nav.addEventListener('pointermove',function(e){
  if(!drag||e.pointerId!==drag.id)return;
  var dx=e.clientX-drag.startX;
  if(!drag.moved&&Math.abs(dx)<6)return;
  if(!drag.moved){drag.moved=true;try{nav.setPointerCapture(e.pointerId)}catch(_){}nav.classList.add('tab-dragging')}
  var lo=1e9,hi=-1e9;
  nav.querySelectorAll('.nav-item').forEach(function(b){var v=xFor(b,drag.bl);lo=Math.min(lo,v);hi=Math.max(hi,v)});
  var x=Math.max(lo,Math.min(hi,drag.base+dx));
  ind.style.transition='none';ind.style.transform='translateX('+x+'px) scale(1.08)';
  var o=itemAt(e.clientX);
  if(o!==drag.over){if(drag.over)drag.over.classList.remove('tab-hover');drag.over=o;if(o)o.classList.add('tab-hover')}
 });
 function end(e){
  if(!drag||e.pointerId!==drag.id)return;
  var d=drag;drag=null;nav.classList.remove('tab-dragging');
  nav.querySelectorAll('.tab-hover').forEach(function(b){b.classList.remove('tab-hover')});
  if(!d.moved)return;
  try{nav.releasePointerCapture(e.pointerId)}catch(_){}
  var t=e.type==='pointercancel'?null:d.over;
  if(t&&t!==active()&&t.dataset.tab!=='mobile-more'){
   place(t,true);ind.style.transform=ind.style.transform.replace(' scale(1.08)','');
   t.click();
  }else{place(active(),true)}
 }
 nav.addEventListener('pointerup',end);nav.addEventListener('pointercancel',end);
 sync();
})();
