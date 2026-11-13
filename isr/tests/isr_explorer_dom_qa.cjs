#!/usr/bin/env node
// Local VM + minimal DOM stub + real Canvas2D. This is NOT a browser layout test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const base=path.resolve(__dirname,'..');
const htmlPath=process.argv[2]||path.join(base,fs.existsSync(path.join(base,'output'))?'output/isr_pattern_explorer.html':'../isr_pattern_explorer.html');
const html=fs.readFileSync(htmlPath,'utf8');
const out=path.join(__dirname,'isr_explorer_qa');fs.mkdirSync(out,{recursive:true});
const allScripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const scripts=[
 allScripts.find(s=>/root\.ISRModel\s*=\s*api/.test(s[2])),
 allScripts.find(s=>/global\.ISRExport\s*=\s*Object\.freeze/.test(s[2])),
 allScripts.find(s=>/window\.ISRApp\s*=\s*\{get state/.test(s[2])),
];
const report={htmlPath,method:'Node VM, minimal DOM stub, real @napi-rs/canvas; no browser layout or touch verification',checks:[],failures:[],renders:[],errors:[]};
function check(ok,name,detail){report.checks.push({ok:!!ok,name,detail});if(!ok)report.failures.push({name,detail});}
function attrs(s){const a={};for(const m of s.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))a[m[1]]=m[2]??m[3]??m[4]??'';return a;}
function makeHarness(viewport){
 const ids={},classes={},raf=[],timers=new Map(),downloads=[];let timerId=0;
 const mapWidth=viewport<=800?366:990,mapHeight=viewport<=800?350:465;
 function element(tag,attributes={}){
  const el=tag==='canvas'?createCanvas(300,150):{};
  el.tagName=tag.toUpperCase();el.id=attributes.id||'';el.attributes={...attributes};el.children=[];el.style={};el.listeners={};
  let value=String(attributes.value??'');Object.defineProperty(el,'value',{configurable:true,get:()=>value,set:v=>value=String(v)});
  el.min=attributes.min||'';el.max=attributes.max||'';el.step=attributes.step||'';el.type=attributes.type||'';
  el.checked='checked'in attributes;el.disabled='disabled'in attributes;el.hidden='hidden'in attributes;el.open='open'in attributes;el.textContent='';
  const cl=new Set((attributes.class||'').split(/\s+/).filter(Boolean));
  el.classList={add:(...cs)=>cs.forEach(c=>cl.add(c)),remove:(...cs)=>cs.forEach(c=>cl.delete(c)),contains:c=>cl.has(c),toggle:(c,f)=>{const on=f===undefined?!cl.has(c):!!f;on?cl.add(c):cl.delete(c);return on;}};
  el.append=(...els)=>{for(const child of els){el.children.push(child);child.parentElement=el;}};
  el.replaceChildren=(...els)=>{el.children=[];el.append(...els);};
  el.setAttribute=(k,v)=>{el.attributes[k]=String(v);};el.getAttribute=k=>el.attributes[k]??null;
  el.addEventListener=(type,fn)=>{(el.listeners[type]??=[]).push(fn);};
  el.dispatch=(type,extra={})=>{for(const fn of el.listeners[type]||[])fn({target:el,preventDefault(){},...extra});};
  el.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:el.id==='timelineCanvas'?mapWidth-42:mapWidth,height:el.id==='timelineCanvas'?38:mapHeight});
  el.parentElement={getBoundingClientRect:()=>({width:mapWidth-42,height:38})};
  if(el.id)ids[el.id]=el;for(const c of cl)classes[c]=el;
  return el;
 }
 for(const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){const a=attrs(m[2]);if(a.id||a.class)element(m[1].toLowerCase(),a);}
 const document={getElementById:id=>ids[id],querySelector:s=>s.startsWith('.')?classes[s.slice(1)]:s.startsWith('#')?ids[s.slice(1)]:null,
  createElement:tag=>element(tag),body:{insertAdjacentHTML:(_p,v)=>report.errors.push(v),append(){}}};
 const context={document,innerWidth:viewport,devicePixelRatio:1,Blob,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,DataView,
  console:{log(){},warn(){},error:e=>report.errors.push(String(e))},performance:{now:()=>1000},
  matchMedia:()=>({matches:false}),setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>raf.push(fn),ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}},
  fetch:()=>{throw new Error('External network was attempted');}};
 context.window=context;vm.createContext(context);
 vm.runInContext(scripts[0][2],context,{timeout:10000});vm.runInContext(scripts[1][2],context,{timeout:10000});
 context.ISRExport={...context.ISRExport,download:(filename,data,mime)=>downloads.push({filename,data,mime})};
 vm.runInContext(scripts[2][2],context,{timeout:20000});
 const flush=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
 const trigger=(id,type,value,extra={})=>{const e=ids[id];if(value!==undefined){if(e.type==='checkbox')e.checked=value;else e.value=value;}e.dispatch(type,extra);flush();};
 const frame=now=>{const fn=raf.shift();if(fn)fn(now);};
 const options=e=>e.children.flatMap(c=>c.tagName==='OPTION'?[c.value]:options(c));
 const render=name=>{const p=path.join(out,name+'.png');fs.writeFileSync(p,ids.mapCanvas.toBuffer('image/png'));report.renders.push(p);};
 return {context,ids,classes,trigger,frame,options,render,downloads,flush};
}
function metricCheck(h,label){const s=h.context.ISRApp.state;check(!!s.scenario,label+': scenario exists');const m=s.scenario.metrics;check(Number.isFinite(m.observedFraction)&&m.observedFraction>=0&&m.observedFraction<=1,label+': finite displayed metric');check(h.ids.observedFraction.textContent===(100*m.observedFraction).toFixed(1)+'%',label+': displayed metric matches model');return s;}
try{
 check(scripts.every(Boolean)&&allScripts.every(s=>!/\bsrc\s*=/.test(s[1])),'Original three modules remain inline with no external script source');
 check(!/<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']https?:/i.test(html)&&!/@import\b|url\(\s*["']?https?:/i.test(html),'No remote rendering dependency in static markup');
 check(/name="viewport"\s+content="width=device-width, initial-scale=1"/.test(html),'Responsive viewport metadata exists');
 check(/@media\(max-width:520px\)/.test(html)&&/@media\(max-width:800px\)/.test(html),'Mobile responsive CSS breakpoints exist');
 const h=makeHarness(1440);metricCheck(h,'Desktop initialization');
 h.context.ISRApp.setPlaying(false);h.context.ISRApp.setTime(0);h.render('offscreen_endurance_circle');
 check(h.options(h.ids.assetSelect).length===4,'Four asset controls populated');
 const menus=[];
 for(const p of h.context.ISRModel.profiles){
  h.trigger('assetSelect','change',p.id);metricCheck(h,p.id);
  const options=h.options(h.ids.patternSelect);menus.push(options.join('|'));
  check(options.length===p.supportedPatterns.length&&options.every(id=>p.supportedPatterns.includes(id)),p.id+': correct dynamic pattern menu');
  check(h.ids.sensorMode.disabled===(p.sensorModes.length===1),p.id+': sensor control restriction');
  for(const pat of options){h.trigger('patternSelect','change',pat);metricCheck(h,p.id+'/'+pat);}
 }
 check(new Set(menus).size>1,'Asset selection changes pattern choices');
 h.trigger('assetSelect','change','endurance');h.trigger('patternSelect','change','ellipse');
 const bindings={altitudeInput:'altitudeM',speedInput:'speedMps',scaleInput:'scaleM',aspectInput:'aspect',headingInput:'headingDeg',fovInput:'fovDeg',rangeInput:'maxRangeM'};
 for(const [id,key]of Object.entries(bindings)){const original=h.context.ISRApp.config[key],e=h.ids[id];const v=Number(e.min)+(Number(e.max)-Number(e.min))*.4;h.trigger(id,'input',v);check(Math.abs(h.context.ISRApp.config[key]-v)<.0001,id+': event updates configuration');metricCheck(h,id);h.trigger(id,'input',original);}
 h.trigger('sensorMode','change','nadir');check(h.context.ISRApp.config.sensorMode==='nadir','Sensor task change updates model');h.trigger('sensorMode','change','track');
 h.trigger('directionInput','change',false);check(h.context.ISRApp.config.clockwise===false,'Direction checkbox changes route configuration');
 h.trigger('resetProfileBtn','click');check(h.context.ISRApp.config.pattern==='circle','Reset asset restores default pattern');
 h.trigger('playBtn','click');const start=h.context.ISRApp.state.timeS;h.frame(1100);check(h.context.ISRApp.state.timeS>start,'Playback advances using actual frame callback');
 h.trigger('playBtn','click');const pause=h.context.ISRApp.state.timeS;h.frame(1200);check(h.context.ISRApp.state.timeS===pause,'Pause stops actual frame callback');
 h.trigger('scrubber','input',500);check(Math.abs(h.context.ISRApp.state.timeS-h.context.ISRApp.scenario.durationS/2)<.0001,'Scrubber positions timeline halfway');
 h.trigger('resetTimeBtn','click');check(h.context.ISRApp.state.timeS===0,'Restart returns time to zero');
 h.trigger('playbackRate','change',60);check(h.context.ISRApp.state.rate===60,'Playback-rate change sets rate');
 h.trigger('obliqueBtn','click');check(h.context.ISRApp.state.view==='oblique'&&h.ids.obliqueBtn.getAttribute('aria-pressed')==='true','Oblique button sets view and accessibility state');
 h.trigger('planBtn','click');check(h.context.ISRApp.state.view==='plan','Plan button restores view');
 h.trigger('zoomInBtn','click');check(h.context.ISRApp.state.zoom>1,'Zoom in changes scale');h.trigger('zoomOutBtn','click');check(Math.abs(h.context.ISRApp.state.zoom-1)<.00001,'Zoom out reverses scale');
 h.trigger('targetToolBtn','click');h.trigger('mapCanvas','click',undefined,{clientX:650,clientY:230});check(Math.hypot(h.context.ISRApp.config.target.x,h.context.ISRApp.config.target.y)>0,'Map placement changes reference point');
 h.trigger('recenterTargetBtn','click');check(h.context.ISRApp.config.target.x===0&&h.context.ISRApp.config.target.y===0,'Center point restores reference');
 h.trigger('showAccessInput','change',false);check(h.context.ISRApp.state.showAccess===false,'Look-color checkbox changes drawing state');h.trigger('showAccessInput','change',true);
 h.trigger('zoomInBtn','click');h.trigger('fitBtn','click');check(h.context.ISRApp.state.zoom===1,'Fit resets zoom');
 h.trigger('exportKmlBtn','click');check(h.ids.exportStatus.classList.contains('error')&&h.downloads.length===0,'Missing geographic anchor is caught before export');
 h.trigger('exportJsonBtn','click');check(h.downloads.at(-1).filename.endsWith('.json'),'JSON button invokes export/download');
 for(const [id,value]of [['latitudeInput',12.345],['longitudeInput',-98.765],['groundElevationInput',123]])h.ids[id].value=value;
 h.trigger('exportKmlBtn','click');h.trigger('exportKmzBtn','click');check(h.downloads.map(d=>d.filename.split('.').at(-1)).join('|')==='json|kml|kmz','Geographic export buttons invoke KML and KMZ builders');
 h.trigger('assetSelect','change','crewed');h.trigger('patternSelect','change','racetrack');h.trigger('obliqueBtn','click');h.context.ISRApp.setTime(h.context.ISRApp.scenario.durationS*.1);h.render('offscreen_crewed_racetrack_oblique');
 h.trigger('assetSelect','change','scout');h.trigger('patternSelect','change','parallel');h.context.ISRApp.setTime(h.context.ISRApp.scenario.durationS-.1);h.context.ISRApp.setPlaying(true);h.frame(1300);check(h.context.ISRApp.state.timeS===h.context.ISRApp.scenario.durationS&&!h.context.ISRApp.state.playing,'Finite search playback stops at end');
 const mobile=makeHarness(390);metricCheck(mobile,'Mobile initialization');check(!mobile.classes['flight-section'].open&&!mobile.classes['advanced-section'].open,'Mobile initializes flight and sensor sections collapsed');mobile.trigger('assetSelect','change','vtol');metricCheck(mobile,'Mobile asset switch');mobile.trigger('obliqueBtn','click');mobile.render('offscreen_mobile_vtol_canvas');
 check(report.errors.length===0,'No runtime errors in control/canvas harness',report.errors);
}catch(e){check(false,'Harness exception',String(e.stack||e));}
fs.writeFileSync(path.join(out,'dom_report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.length,failures:report.failures,renders:report.renders,report:path.join(out,'dom_report.json')},null,2));
process.exitCode=report.failures.length?1:0;
