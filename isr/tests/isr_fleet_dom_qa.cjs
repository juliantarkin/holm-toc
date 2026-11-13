#!/usr/bin/env node
// Offline integration check: authored scripts + a minimal DOM + real Canvas2D.
// It does not claim browser layout, CSS rendering, focus, or touch verification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const localFile=path.join(root,'output/isr_pattern_explorer_v2.html');
const file=process.argv[2]|| (fs.existsSync(localFile)?localFile:path.join(root,'isr_pattern_explorer.html'));
const source=fs.readFileSync(file,'utf8'),out=path.join(root,'tmp/isr_fleet_qa');
fs.mkdirSync(out,{recursive:true});
const report={file,method:'Node VM + minimal authored-markup DOM + real Canvas2D. Browser layout unverified.',checks:[],failures:[],errors:[],renders:[],evidence:[]};
function check(ok,name,detail){report.checks.push({ok:!!ok,name,detail});if(!ok)report.failures.push({name,detail});}
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;
const decode=s=>String(s).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' '})[x]);
function attrMap(s){const a={};for(const m of s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))a[m[1]]=decode(m[2]??m[3]??m[4]??'');return a;}
function harness(width=1440){
 const ids={},raf=new Map(),timers=new Map(),downloads=[],eventLog=[],objectURLs=new Map();let tid=0,rid=0,now=1000;
 class HarnessURL extends URL{static createObjectURL(blob){const url=URL.createObjectURL(blob);objectURLs.set(url,blob);return url;}static revokeObjectURL(url){objectURLs.delete(url);URL.revokeObjectURL(url);}}
 const windowListeners={},documentListeners={};
 const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 function descendants(el){return el.children.flatMap(c=>[c,...descendants(c)]);}
 function simpleMatch(el,s){
  if(!el.tagName)return false;
  const tag=/^[\w-]+/.exec(s);if(tag&&el.tagName!==tag[0].toUpperCase())return false;
  for(const m of s.matchAll(/#([\w-]+)/g))if(el.id!==m[1])return false;
  for(const m of s.matchAll(/\.([\w-]+)/g))if(!el.classList.contains(m[1]))return false;
  for(const m of s.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)){const v=el.getAttribute(m[1]);if(v===null||(m[2]!==undefined&&v!==m[2]))return false;}
  return true;
 }
 function matches(el,s){return s.split(',').some(part=>{const bits=part.trim().split(/\s+/);if(!simpleMatch(el,bits.pop()))return false;let p=el.parentElement;while(bits.length){const bit=bits.pop();while(p&&!simpleMatch(p,bit))p=p.parentElement;if(!p)return false;p=p.parentElement;}return true;});}
 function removeIds(el){for(const c of descendants(el))if(c.id&&ids[c.id]===c)delete ids[c.id];}
 function element(tag,attributes={}){
  const e=tag==='canvas'?createCanvas(300,150):{};e.tagName=tag.toUpperCase();e.attributes={...attributes};e.children=[];e.parentElement=null;e.listeners={};e.style={setProperty(k,v){this[k]=String(v);}};
  let text='',value=attributes.value===undefined?null:String(attributes.value),classes=new Set((attributes.class||'').split(/\s+/).filter(Boolean));
  e.id=attributes.id||'';if(e.id)ids[e.id]=e;
  Object.defineProperty(e,'className',{configurable:true,get:()=>[...classes].join(' '),set:v=>{classes=new Set(String(v).split(/\s+/).filter(Boolean));e.attributes.class=String(v);}});
  e.classList={contains:c=>classes.has(c),add:(...a)=>a.forEach(c=>classes.add(c)),remove:(...a)=>a.forEach(c=>classes.delete(c)),toggle:(c,f)=>{const on=f===undefined?!classes.has(c):!!f;on?classes.add(c):classes.delete(c);return on;}};
  e.dataset=new Proxy({}, {get:(_,k)=>e.attributes['data-'+String(k).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())],set:(_,k,v)=>{e.attributes['data-'+String(k).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v);return true;}});
  Object.defineProperty(e,'textContent',{configurable:true,get:()=>text+e.children.map(c=>c.textContent).join(''),set:v=>{removeIds(e);e.children=[];text=String(v??'');}});
  Object.defineProperty(e,'value',{configurable:true,get:()=>value??(e.tagName==='SELECT'?(descendants(e).find(c=>c.tagName==='OPTION'&&c.selected)||descendants(e).find(c=>c.tagName==='OPTION'))?.value||'':e.tagName==='OPTION'?e.textContent:''),set:v=>{value=String(v);}});
  Object.defineProperty(e,'innerHTML',{configurable:true,get:()=>e.children.map(c=>c.textContent).join(''),set:v=>{removeIds(e);e.children=[];text='';parse(String(v),e);}});
  for(const key of ['min','max','step','type','href'])e[key]=attributes[key]||'';
  for(const key of ['checked','disabled','hidden','open','selected'])e[key]=key in attributes;
  e.append=(...nodes)=>{for(const n of nodes){n.parentElement=e;e.children.push(n);}};e.appendChild=n=>{e.append(n);return n;};
  e.replaceChildren=(...nodes)=>{removeIds(e);e.children=[];text='';e.append(...nodes);};
  e.remove=()=>{if(e.parentElement)e.parentElement.children=e.parentElement.children.filter(c=>c!==e);removeIds(e);};
  e.getAttribute=k=>k==='class'?e.className:k==='id'?e.id||null:e.attributes[k]??null;
  e.setAttribute=(k,v)=>{e.attributes[k]=String(v);if(k==='class')e.className=v;if(k==='id'){e.id=String(v);ids[e.id]=e;}};e.removeAttribute=k=>delete e.attributes[k];
  e.querySelectorAll=s=>descendants(e).filter(n=>matches(n,s));e.querySelector=s=>e.querySelectorAll(s)[0]||null;e.matches=s=>matches(e,s);e.closest=s=>matches(e,s)?e:e.parentElement?.closest(s)||null;
  e.contains=node=>node===e||descendants(e).includes(node);e.focus=()=>{document.activeElement=e;};
  e.addEventListener=(type,fn)=>(e.listeners[type]??=[]).push(fn);
  e.dispatchEvent=event=>{event.target??=e;event.currentTarget=e;for(const fn of e.listeners[event.type]||[]){const result=fn(event);if(result&&result.catch)result.catch(err=>report.errors.push(String(err.stack||err)));}if(event.bubbles!==false&&e.parentElement)e.parentElement.dispatchEvent(event);return true;};
  e.click=()=>{const event={type:'click',target:e,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};e.dispatchEvent(event);if(!event.defaultPrevented&&e.tagName==='A'&&e.download&&objectURLs.has(e.href)){const blob=objectURLs.get(e.href);downloads.push({filename:e.download,data:blob,mime:blob.type});}};
  e.getBoundingClientRect=()=>{let w=width<=800?366:970,h=420;if(e.id==='timelineCanvas'){w-=42;h=38;}if(e.id==='fleetMapStage'||e.id==='fleetMapCanvas')h=350;if(e.id==='fleetTimelineCanvas'){w=970;h=170;}return {x:0,y:0,left:0,top:0,width:w,height:h};};
  Object.defineProperty(e,'clientWidth',{get:()=>e.getBoundingClientRect().width});Object.defineProperty(e,'clientHeight',{get:()=>e.getBoundingClientRect().height});
  return e;
 }
 function parse(markup,parent){const stack=[parent],voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));for(const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)){const t=token[0];if(t.startsWith('<!'))continue;if(t.startsWith('</')){const name=t.match(/^<\/([\w-]+)/)[1].toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===name){stack.length=i;break;}continue;}if(t[0]==='<'){const m=t.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);if(!m)continue;const n=element(m[1].toLowerCase(),attrMap(m[2]));stack.at(-1).append(n);if(!voids.has(m[1].toLowerCase())&&!t.endsWith('/>'))stack.push(n);}else{const n=element('text');n.textContent=decode(t);stack.at(-1).append(n);}}}
 const tree=element('document');parse(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),tree);
 const document={getElementById:id=>ids[id]||null,querySelector:s=>tree.querySelector(s),querySelectorAll:s=>tree.querySelectorAll(s),createElement:tag=>element(tag),body:tree.querySelector('body'),title:'',hidden:false,visibilityState:'visible',activeElement:null,addEventListener:(type,fn)=>(documentListeners[type]??=[]).push(fn),dispatchEvent:event=>{eventLog.push({type:event.type,timeS:event.detail?.timeS});for(const fn of documentListeners[event.type]||[])fn(event);return true;}};
 document.body.insertAdjacentHTML=(_p,s)=>report.errors.push(s);
 const context={document,innerWidth:width,devicePixelRatio:1,location:{hash:'#patterns'},Blob,TextEncoder,TextDecoder,URL:HarnessURL,Uint8Array,ArrayBuffer,DataView,
  console:{log(){},warn(){},error:e=>report.errors.push(String(e))},performance:{now:()=>now},
  CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;this.bubbles=options.bubbles??false;}},
  addEventListener:(type,fn)=>(windowListeners[type]??=[]).push(fn),scrollTo(){},matchMedia:()=>({matches:false}),
  requestAnimationFrame:fn=>{const id=++rid;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),setTimeout:fn=>{const id=++tid;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}},fetch:()=>{throw new Error('Unexpected network request');}};
 context.window=context;vm.createContext(context);
 const scripts=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 for(let i=0;i<scripts.length;i++){vm.runInContext(scripts[i][2],context,{timeout:30000,filename:'bundled-module-'+i+'.js'});if(context.ISRExport&&!context.ISRExport.__qa){context.ISRExport={...context.ISRExport,__qa:true,download:(filename,data,mime)=>downloads.push({filename,data,mime})};}}
 const flush=()=>{const todo=[...timers.values()];timers.clear();todo.forEach(fn=>fn());};
 const trigger=(id,type,value)=>{const e=ids[id];if(!e)throw new Error('Missing control '+id);if(value!==undefined){if(e.type==='checkbox')e.checked=value;else e.value=value;}e.dispatchEvent({type,target:e,bubbles:true,preventDefault(){}});flush();};
 const frame=delta=>{now+=delta;const todo=[...raf.keys()];todo.forEach(id=>{const fn=raf.get(id);if(fn){raf.delete(id);fn(now);}});};
 const nav=page=>{context.location.hash='#'+page;for(const fn of windowListeners.hashchange||[])fn();frame(16);};
 const render=(id,name)=>{const p=path.join(out,name+'.png');fs.writeFileSync(p,ids[id].toBuffer('image/png'));report.renders.push(p);};
 return {context,ids,trigger,frame,flush,nav,render,downloads,eventLog,advance:delta=>now+=delta,document,async flushAsync(){for(let i=0;i<80;i++){flush();await Promise.resolve();await new Promise(r=>setImmediate(r));if(!context.ISRFleetUI.busy)return;}throw new Error('Async optimizer did not finish in bounded pump');}};
}
async function main(){
 const h=harness(),w=h.context,u=w.ISRFleetUI,ids=h.ids;
 check(!!u?.plan&&!!w.ISRTracker&&!!w.ISRNavigation,'All three page controllers initialize');
 check(w.ISRNavigation.page==='patterns'&&!ids.patternsPage.hidden&&ids.schedulePage.hidden&&ids.trackerPage.hidden,'Initial page visibility');
 check(u.plan.assets.length===2&&ids.trackerCards.querySelectorAll('.asset-card').length===2,'Default fleet produces one tracker card per aircraft');
 check(near(u.plan.metrics.satisfiedFraction,1),'Default applied plan meets point requirement');
 h.nav('schedule');check(w.ISRNavigation.page==='schedule'&&!ids.schedulePage.hidden&&ids.patternsPage.hidden,'Schedule navigation activates correct page');check(!w.ISRApp.state.playing,'Leaving Pattern Explorer pauses its independent animation');
 h.render('fleetMapCanvas','offscreen_default_fleet_map');h.render('fleetTimelineCanvas','offscreen_default_fleet_timeline');
 const original=u.plan;h.trigger('fleetDuration','input',1);check(u.dirty&&u.plan===original&&u.config.durationMin===480,'Editing duration marks dirty and preserves applied plan');check(ids.fleetPlay.disabled&&ids.fleetExport.disabled,'Dirty plan disables playback and export');
 h.nav('tracker');w.ISRTracker.render(true);check(!ids.trackerDirty.hidden&&ids.trackerPlay.disabled,'Tracker visibly flags unapplied edits');
 h.nav('schedule');h.trigger('fleetBuild','click');check(!u.dirty&&u.config.durationMin===60&&u.plan!==original,'Build applies draft hours as minutes');
 check(h.eventLog.some(e=>e.type==='fleet:plan'),'Build emits shared plan event');
 h.nav('tracker');check(ids.trackerCards.querySelectorAll('.asset-card').length===u.plan.assets.length,'Tracker refreshes cards on plan rebuild');
 const p=u.plan,s=p.sorties[0],asset=p.assets.find(a=>a.id===s.assetId),samples=[['OUTBOUND',(s.launchS+s.arrivalS)/2],['ON_STATION',(s.stationStartS+s.departS)/2],['RETURN',(s.departS+s.landS)/2],['TURNAROUND',(s.landS+s.readyS)/2]];
 for(const [expected,t]of samples){u.setTime(t);w.ISRTracker.render(true);const snap=u.snapshot.assets.find(a=>a.id===asset.id),card=ids.trackerCards.querySelector('[data-asset-id="'+asset.id+'"]');
  check(snap.state===expected,'Snapshot lifecycle '+expected);check(card.querySelector('[data-field="state"]').dataset.state===expected,'Tracker state matches shared snapshot '+expected);
  check(ids.trackerClock.textContent===u.formatClock(u.timeS),'Tracker clock matches schedule '+expected);
  check(card.querySelector('[data-field="energy"]').textContent===snap.energyPct.toFixed(0)+'%','Tracker energy matches shared snapshot '+expected);
  if(expected!=='TURNAROUND')check(card.querySelector('[data-detail="landing"]').textContent===u.formatClock(s.landS),'Tracker landing cue is sortie-specific '+expected);
  report.evidence.push({state:expected,timeS:t,clock:ids.trackerClock.textContent,energy:card.querySelector('[data-field="energy"]').textContent,returnMargin:card.querySelector('[data-field="returnMargin"]').textContent});
 }
 h.trigger('trackerScrubber','input',500);check(near(u.timeS,(p.timelineStartS+p.timelineEndS)/2),'Tracker scrubber sets the shared full-window time');
 h.trigger('trackerBack','click');const before=u.timeS;h.trigger('trackerForward','click');check(near(u.timeS,Math.min(before+300,p.timelineEndS)),'Tracker time buttons change shared controller');
 h.trigger('trackerFilter','change','airborne');const visible=ids.trackerCards.querySelectorAll('.asset-card').filter(c=>!c.hidden).length;check(visible===u.snapshot.assets.filter(a=>['OUTBOUND','SETUP','ON_STATION','RETURN'].includes(a.state)).length,'Tracker airborne filter respects snapshot states');h.trigger('trackerFilter','change','all');
 u.setTime(0);h.trigger('trackerPlay','click');const t0=u.timeS;h.frame(200);h.frame(200);check(u.playing&&u.timeS>t0,'Tracker play advances shared simulation');h.nav('schedule');check(u.playing,'Schedule and tracker navigation preserve shared playback');h.trigger('fleetPlay','click');check(!u.playing,'Schedule pause stops shared playback');
 h.trigger('fleetRate','change',30);u.setTime(0);h.trigger('fleetPlay','click');h.frame(200);h.frame(200);check(u.timeS>0&&u.timeS<=15,'Rate control changes simulation time step');h.trigger('fleetPlay','click');
 u.setTime(p.timelineEndS-1);u.setPlaying(true);h.frame(200);h.frame(200);check(!u.playing&&near(u.timeS,p.timelineEndS),'Shared playback stops at recovery horizon');
 h.trigger('fleetRestart','click');check(u.timeS===0&&!u.playing,'Restart returns to task start');
 h.trigger('fleetBaseDistance','input','');check(ids.fleetBuild.disabled&&!ids.fleetValidation.hidden&&u.dirty,'Empty numerical form value is rejected');const beforeInvalid=u.plan;u.rebuild();check(u.plan===beforeInvalid,'Invalid rebuild preserves last applied plan');h.trigger('fleetBaseDistance','input',30);h.trigger('fleetBuild','click');
 h.nav('patterns');w.ISRApp.setAsset('vtol');w.ISRApp.setPattern('hover');h.nav('schedule');h.trigger('fleetCopyExplorer','click');check(u.dirty&&/Copied/.test(ids.fleetCopyStatus.textContent),'Copy Explorer marks route draft pending');check(ids['fleetProfile-vtol-pattern'].value==='hover','Copy Explorer preserves chosen profile route');h.trigger('fleetBuild','click');check(u.config.profiles.find(x=>x.profileId==='vtol').routeOverrides.altitudeM===w.ISRApp.config.altitudeM,'Copy applies sensor/flight overrides without changing counts');
 for(const entry of u.config.profiles)h.trigger('fleetProfile-'+entry.profileId+'-count','input',0);h.trigger('fleetBuild','click');check(u.plan.assets.length===0&&u.plan.metrics.totalGapS===u.plan.durationS,'Zero-fleet UI builds honest full gap');h.nav('tracker');w.ISRTracker.render(true);check(ids.trackerCards.querySelectorAll('.asset-card').length===0&&!ids.trackerEmpty.hidden,'Zero-fleet tracker handles empty cards');
 h.nav('schedule');h.trigger('fleetProfile-vtol-count','input',2);h.trigger('fleetBaseDistance','input',0);h.trigger('fleetDuration','input',.5);h.trigger('fleetHandover','input',0);h.trigger('fleetMode','change','area');check(!ids.fleetAreaControls.hidden&&!ids.fleetGrid.disabled,'Area mode reveals area controls');h.trigger('fleetAreaWidth','input',1);h.trigger('fleetAreaHeight','input',1);h.trigger('fleetSlots','change',2);h.trigger('fleetGrid','change',11);h.trigger('fleetStep','change',60);h.trigger('fleetBuild','click');
 check(u.config.mode==='area'&&u.plan.cells.length===121,'Area UI uses configured cell grid');check(u.plan.metrics.meanAreaCoverage<1,'Area union does not report entire box from continuous center observation');
 h.trigger('fleetCumulative','change',true);check(/Cumulative/.test(ids.fleetMapCoverage.textContent),'Cumulative map toggle changes legend');
 const cellButton=ids.fleetWorstCells.querySelector('[data-fleet-cell]');cellButton?.click();check(/longest gap/.test(ids.fleetMapSelection.textContent),'Worst-cell selection updates map inspection');
 h.trigger('fleetFullView','click');check(ids.fleetFullView.getAttribute('aria-pressed')==='true','Full-route view state is accessible');h.trigger('fleetTaskView','click');check(ids.fleetTaskView.getAttribute('aria-pressed')==='true','Task map view restores correctly');
 h.render('fleetMapCanvas','offscreen_area_fleet_map');h.render('fleetTimelineCanvas','offscreen_area_fleet_timeline');
 const gapButton=ids.fleetGapList.querySelector('[data-fleet-gap]');if(gapButton){const gap=u.plan.gaps[Number(gapButton.dataset.fleetGap)];gapButton.click();check(near(u.timeS,(gap.startS+gap.endS)/2),'Gap inspector seeks shared time');}
 h.trigger('fleetExport','click');const dl=h.downloads.at(-1);check(dl?.filename==='isr_fleet_schedule.json','Schedule export button downloads applied plan');const saved=JSON.parse(dl.data);check(saved.plan?.config?.mode==='area'||saved.config?.mode==='area','Export records applied area configuration');
 const baseline=u.plan.metrics.satisfiedFraction;h.trigger('fleetOptimize','click');check(u.busy&&ids.fleetBuild.disabled,'Optimizer starts with form disabled');h.nav('tracker');w.ISRTracker.render(true);check(ids.trackerPlay.disabled&&ids.trackerScrubber.disabled,'Tracker playback locks while optimizer is busy');await h.flushAsync();check(!u.busy&&!u.dirty&&u.plan.metrics.satisfiedFraction+1e-9>=baseline,'Optimizer finishes and keeps baseline or improves');
 h.nav('schedule');h.trigger('fleetOptimize','click');h.trigger('fleetCancel','click');await h.flushAsync();check(!u.busy&&!!u.plan&&u.plan.metrics.satisfiedFraction+1e-9>=baseline,'Optimizer cancellation leaves usable nonworse result');
 h.nav('tracker');u.setPlaying(true);h.nav('patterns');check(!u.playing,'Returning to Pattern Explorer pauses fleet');check(!ids.patternsPage.hidden&&ids.trackerPage.hidden&&w.ISRNavigation.page==='patterns','Final navigation visibility');
 check(report.errors.length===0,'No authored-script exceptions or network access in integration harness',report.errors);
 const mobile=harness(390);check(!mobile.ids.fleetTaskDetails.open&&!mobile.ids.fleetAssetsDetails.open,'Mobile starts fleet editing sections collapsed');mobile.nav('tracker');check(!mobile.ids.trackerPage.hidden&&mobile.ids.trackerCards.querySelectorAll('.asset-card').length===2,'Mobile initialization creates tracker cards');
}
module.exports={harness,report,check,near};
if(require.main===module)main().catch(e=>check(false,'Integration harness exception',String(e.stack||e))).finally(()=>{fs.writeFileSync(path.join(out,'dom_report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,failures:report.failures,errors:report.errors,renders:report.renders,report:path.join(out,'dom_report.json')},null,2));process.exitCode=report.failures.length?1:0;});
