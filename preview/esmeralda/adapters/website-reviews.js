(function (root) {
  'use strict';
  function nextBatch(ids, previous, size, random) {
    random = random || Math.random;
    ids = Array.from(new Set(ids));
    var known = new Set(ids), state = previous || {}, seen = new Set((state.seen || []).filter(id => known.has(id)));
    var queue = (state.queue || []).filter((id, i, a) => known.has(id) && !seen.has(id) && a.indexOf(id) === i);
    var added = ids.filter(id => !seen.has(id) && !queue.includes(id));
    function shuffle(a) { for (var i=a.length-1;i>0;i--) { var j=Math.floor(random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
    queue = queue.concat(shuffle(added));
    if (!queue.length && ids.length) {
      seen.clear(); queue = shuffle(ids.slice());
      // Keep the last cards away from the start of the next round where possible.
      var last = new Set(state.last || []);
      queue = queue.filter(id=>!last.has(id)).concat(queue.filter(id=>last.has(id)));
    }
    var batch = queue.splice(0, Math.max(1,size)); batch.forEach(id=>seen.add(id));
    return {batch:batch, state:{queue:queue,seen:Array.from(seen),last:batch}};
  }
  if (typeof module !== 'undefined') module.exports = {nextBatch:nextBatch};
  if (!root.document) return;
  var section=document.getElementById('es-customer-reviews'); if(!section)return;
  var list=section.querySelector('[data-review-cards]'), next=section.querySelector('[data-review-next]'), pause=section.querySelector('[data-review-pause]');
  var key='esmeralda-review-rotation-v1', state, reviews=[], timer, inView=false, started=false, paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {state=JSON.parse(sessionStorage.getItem(key)||'null');} catch (_) {}
  function node(tag,cls,text) {var el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function card(r) {
    var article=node('article','es-review-card'), header=node('div','es-review-header'), avatar=node('span','es-review-avatar',(r.displayName||'G').slice(0,1));
    if(r.photoUrl && /^https:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com\//i.test(r.photoUrl)) {var img=node('img','');img.src=r.photoUrl;img.alt='';img.width=48;img.height=48;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=function(){this.remove();};avatar.append(img);}
    var who=node('div','es-review-who');who.append(node('h3','',r.displayName||'Anonym kunde'));
    if(r.receivedAt){var date=new Date(r.receivedAt);if(!isNaN(date)){var time=node('time','',(r.dateApproximate?'ca. ':'')+date.toLocaleDateString('da-DK'));time.dateTime=date.toISOString();who.append(time);}}
    header.append(avatar,who,node('span','es-review-source',r.source==='google'?'Google':'Esmeralda'));article.append(header);
    article.append(node('div','es-review-stars','★★★★★'));article.lastChild.setAttribute('aria-label','5 ud af 5 stjerner');
    article.append(node('p','es-review-text',r.comment||'5 stjerner'));
    if(r.source==='google' && /^https:\/\/www\.google\.com\/maps\//.test(r.reviewUrl||'')){var link=node('a','es-review-link','Se på Google');link.href=r.reviewUrl;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}
    return article;
  }
  function show(){var result=nextBatch(reviews.map(r=>r.id),state,matchMedia('(max-width: 767px)').matches?1:3);state=result.state;list.replaceChildren(...result.batch.map(id=>card(reviews.find(r=>r.id===id))));try{sessionStorage.setItem(key,JSON.stringify(state));}catch(_){} }
  function schedule(){clearInterval(timer);pause.textContent=paused?'Start rotation':'Pause rotation';pause.setAttribute('aria-pressed',String(paused));if(inView && !paused && !document.hidden && !section.matches(':hover') && !section.contains(document.activeElement))timer=setInterval(show,8000);}
  next.addEventListener('click',function(){show();schedule();});pause.addEventListener('click',function(){paused=!paused;schedule();});
  section.addEventListener('mouseenter',()=>clearInterval(timer));section.addEventListener('mouseleave',schedule);section.addEventListener('focusin',()=>clearInterval(timer));section.addEventListener('focusout',()=>setTimeout(schedule,0));document.addEventListener('visibilitychange',schedule);
  fetch('/_reviews/customer-reviews.json',{credentials:'omit',cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
    reviews=Array.isArray(data.reviews)?data.reviews.filter(r=>r && typeof r.id==='string' && r.rating===5):[];
    if(!reviews.length)return;section.hidden=false;
    if(reviews.length<=1){next.hidden=true;pause.hidden=true;paused=true;}
    var observer=new IntersectionObserver(function(entries){inView=entries[0].isIntersecting;if(inView&&!started){started=true;show();}schedule();},{threshold:0.1});observer.observe(section);
  }).catch(()=>{section.hidden=true;});
})(typeof window !== 'undefined' ? window : globalThis);
