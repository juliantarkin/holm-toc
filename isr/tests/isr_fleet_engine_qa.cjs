#!/usr/bin/env node
// Independent deterministic fleet tests. No browser, sockets, or real aircraft data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.argv[2]||path.join(__dirname,fs.existsSync(path.join(__dirname,'isr_explorer_src'))?'isr_explorer_src':'../src'));
const out=path.join(__dirname,'isr_fleet_qa');fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],cases:[],started:new Date().toISOString()};
function check(ok,name,detail){report.checks.push({ok:!!ok,name,detail});if(!ok)report.failures.push({name,detail});}
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b,eps=1e-5)=>Math.abs(a-b)<=eps;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function finiteWalk(x,p='',bad=[],seen=new Set()){
 if(typeof x==='number'&&!Number.isFinite(x))bad.push(p);
 if(x&&typeof x==='object'&&!seen.has(x)){seen.add(x);for(const[k,v]of Object.entries(x))finiteWalk(v,p+'.'+k,bad,seen);}
 return bad;
}
const context={console,setTimeout,clearTimeout,performance,Blob,TextEncoder,TextDecoder};context.window=context;vm.createContext(context);
for(const file of ['model.js','fleet-engine.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),context,{filename:file,timeout:20000});
const F=context.ISRFleet;
function plan(config,strategy){context.__qaConfig=config;context.__qaStrategy=strategy;return vm.runInContext('ISRFleet.plan(__qaConfig,__qaStrategy)',context,{timeout:25000});}
function single(profile='scout',count=2,overrides={}){
 const c=clone(F.defaults());c.profiles.forEach(p=>p.count=p.profileId===profile?count:0);
 Object.assign(c,{durationMin:60,baseDistanceKm:0,handoverMin:0,setupMin:0,slots:1,allowPrelaunch:true},overrides);return c;
}
function profile(c,id){return c.profiles.find(p=>p.profileId===id);}
function audit(p,label){
 report.cases.push({label,metrics:p.metrics,resolution:p.resolution,sorties:p.sorties.length,issues:p.issues});
 const invalid=finiteWalk(p);check(!invalid.length,label+': all numeric outputs finite',invalid.slice(0,8));
 check(p.metrics.satisfiedFraction>=0&&p.metrics.satisfiedFraction<=1,label+': satisfaction fraction bounded');
 check(near(p.metrics.totalGapS,(1-p.metrics.satisfiedFraction)*p.durationS,.01),label+': gap time and satisfaction agree');
 check(p.samples.length<=2880,label+': analysis sample cap',p.samples.length);
 check(p.resolution.effectiveStepS+1e-7>=p.resolution.requestedStepS,label+': effective resolution reported');
 check(p.samples.length>0&&near(p.samples[0].startS,0)&&near(p.samples.at(-1).endS,p.durationS),label+': samples span requested task');
 check(p.samples.every((s,i)=>near(s.timeS,(s.startS+s.endS)/2)&&s.endS>s.startS&&(!i||near(s.startS,p.samples[i-1].endS))),label+': contiguous midpoint bins');
 const byAsset=new Map(p.assets.map(a=>[a.id,a]));
 for(const a of p.assets){
  const sorties=p.sorties.filter(s=>s.assetId===a.id).sort((x,y)=>x.launchS-y.launchS);
  check(sorties.every((s,i)=>!i||s.launchS+1e-6>=sorties[i-1].readyS),label+'/'+a.id+': no airframe reuse before ready');
 }
 for(const s of p.sorties){
  const a=byAsset.get(s.assetId);check(!!a,label+'/'+s.id+': sortie has known asset');if(!a)continue;
  check(s.launchS<=s.arrivalS&&s.arrivalS<=s.stationStartS&&s.stationStartS<=s.departS&&s.departS<=s.landS&&s.landS<=s.readyS,label+'/'+s.id+': event order');
  check(near(s.arrivalS-s.launchS,s.outboundS)&&near(s.departS-s.stationStartS,s.stationS)&&near(s.landS-s.departS,s.returnS),label+'/'+s.id+': sortie durations consistent');
  check(near(s.readyS-s.landS,a.turnaroundS),label+'/'+s.id+': turnaround starts at landing');
  check(near(s.reserveAtLandingS,a.enduranceS-(s.landS-s.launchS),.01)&&s.reserveAtLandingS+1e-5>=a.reserveS,label+'/'+s.id+': landing reserve preserved');
  check(near(distance(p.base,s.entryPosition)/a.transitSpeedMps,s.outboundS,.01),label+'/'+s.id+': outbound reaches actual route entry');
  check(near(distance(p.base,s.exitPosition)/a.transitSpeedMps,s.returnS,.01)&&s.returnS<=s.returnBudgetS+.01,label+'/'+s.id+': actual return within budget');
  check(s.departS<=p.durationS+1e-6,label+'/'+s.id+': station work stops by task end');
  if(!a.scenario.route.periodic&&a.pattern!=='hover')check(s.stationS<=a.scenario.durationS+1e-6,label+'/'+s.id+': finite search is one pass');
  if(!p.config.allowPrelaunch)check(s.launchS>=-1e-6,label+'/'+s.id+': no unauthorized prelaunch');
  for(const t of [s.launchS+.001,(s.launchS+s.arrivalS)/2,(s.stationStartS+s.departS)/2,(s.departS+s.landS)/2]){
   const snap=F.snapshot(p,t,{footprints:false}),x=snap.assets.find(x=>x.id===a.id);
   check(x&&x.enduranceRemainingS>=a.reserveS-.02&&x.returnMarginS>=-.02,label+'/'+s.id+': reserve feasible during flight',{timeS:t,state:x?.state,margin:x?.returnMarginS});
   if(x){
    check(near(x.enduranceRemainingS,a.enduranceS-(t-s.launchS),.02),label+'/'+s.id+': endurance follows elapsed flight');
    check(near(x.flightTimeToLandingS,s.landS-t,.02)&&near(x.flightElapsedS,t-s.launchS,.02),label+'/'+s.id+': scheduled flight time is distinct from endurance');
    check(near(x.distanceToBaseM,distance(x.position,p.base),.02)&&near(x.distanceToTargetM,Math.hypot(x.position.x,x.position.y,x.position.z),.02),label+'/'+s.id+': tracker distance fields follow shared position');
   }
  }
  if(a.turnaroundS>1){const t=s.landS+Math.min(a.turnaroundS/2,60),x=F.snapshot(p,t,{footprints:false}).assets.find(x=>x.id===a.id);check(x?.state==='TURNAROUND'&&near(x.enduranceRemainingS,s.reserveAtLandingS,.02),label+'/'+s.id+': ground servicing retains landing budget until ready');}
 }
 if(p.sorties.length)check(p.timelineStartS<=Math.min(...p.sorties.map(s=>s.launchS))+.01&&p.timelineEndS>=Math.max(...p.sorties.map(s=>s.readyS))-.01,label+': timeline contains prelaunch and full recovery');
 else check(p.metrics.minLandingReserveS===null,label+': absent landing reserve is null');
 for(const sample of p.samples.filter((_,i)=>i%Math.max(1,Math.floor(p.samples.length/5))===0)){
  const s=F.snapshot(p,sample.timeS,{footprints:false});check(s.met===sample.met&&near(s.coveredFraction,sample.coveredFraction,.00001),label+': snapshot matches analysis at same time');
 }
 return p;
}

(async()=>{
 const fresh1=F.defaults(),fresh2=F.defaults();fresh1.profiles[0].reserveMin=-999;check(fresh2.profiles[0].reserveMin!==-999,'defaults returns independent nested configuration');
 const defaultConfig=clone(F.defaults()),defaultBefore=JSON.stringify(defaultConfig);const baseline=audit(plan(defaultConfig),'Default point fleet');
 check(JSON.stringify(defaultConfig)===defaultBefore,'Planning does not mutate submitted configuration');
 check(baseline.metrics.satisfiedFraction>.99,'Default example provides persistent point coverage');
 check(baseline.sorties.some(s=>s.launchS<0),'Prelaunch schedule starts aircraft before task');
 const noPre=clone(defaultConfig);noPre.allowPrelaunch=false;const noPrePlan=audit(plan(noPre),'No prelaunch');check(noPrePlan.metrics.totalGapS>0,'Outbound transit creates initial uncovered time without prelaunch');
 const zero=clone(defaultConfig);zero.profiles.forEach(p=>p.count=0);const zp=audit(plan(zero),'Zero aircraft');check(zp.sorties.length===0&&near(zp.metrics.totalGapS,zp.durationS)&&zp.metrics.satisfiedFraction===0,'Zero fleet yields full task gap');
 const far=single('scout',1,{baseDistanceKm:500});const fp=audit(plan(far),'Unreachable task');check(fp.sorties.length===0&&fp.metrics.satisfiedFraction===0&&fp.issues.length>0,'Too-far task is rejected with full gap');
 const badReserve=single('vtol',1);profile(badReserve,'vtol').enduranceMin=10;profile(badReserve,'vtol').reserveMin=20;const br=audit(plan(badReserve),'Reserve exceeds endurance');check(!br.sorties.length&&br.issues.length>0,'Invalid reserve reported without dispatch');check(profile(br.config,'vtol').reserveMin===20,'Invalid reserve is not silently reduced');
 const badOverlap=single('vtol',1,{handoverMin:25});profile(badOverlap,'vtol').enduranceMin=30;const bo=audit(plan(badOverlap),'Overlap exceeds station capacity');check(bo.issues.some(i=>/overlap|handover/i.test(i.message)),'Infeasible overlap explicitly reported');
 const bank=single('scout',1);profile(bank,'scout').routeOverrides={speedMps:180,scaleM:100};const bp=audit(plan(bank),'Infeasible bank');check(!bp.sorties.length&&bp.issues.some(i=>/bank|turn/i.test(i.message)),'Bank-infeasible route is excluded');
 const finite=single('scout',1,{durationMin:120});profile(finite,'scout').pattern='parallel';const finitePlan=audit(plan(finite),'Finite parallel search');check(finitePlan.sorties.length>0&&finitePlan.sorties.every(s=>s.stationS<=finitePlan.assets.find(a=>a.id===s.assetId).scenario.durationS+.001),'Finite paths never silently restart');
 const hover=single('vtol',1,{durationMin:30});profile(hover,'vtol').pattern='hover';const hoverPlan=audit(plan(hover),'Extended stationary hover');check(hoverPlan.sorties.some(s=>s.stationS>600),'Fleet hover not limited to original ten-minute demo');
 const area=single('vtol',1,{durationMin:30,mode:'area',areaWidthKm:1,areaHeightKm:1,gridSize:11,coverageThresholdPct:90});
 profile(area,'vtol').pattern='hover';profile(area,'vtol').routeOverrides={altitudeM:250,fovDeg:45,maxRangeM:2500,sensorMode:'track'};
 const areaPlan=audit(plan(area),'One-boresight area grid');const areaSnap=F.snapshot(areaPlan,900,{footprints:true});
 check(areaPlan.cells.length===121,'11 by 11 grid contains 121 equal-weight cells');
 check(near(areaSnap.coveredFraction,5/121,.000001),'Fixed hover covers five cells, not independently repointed cells',areaSnap.coveredFraction);
 check(areaPlan.metrics.neverObservedCount===116,'Area model identifies 116 never-observed cells');
 const two=clone(area);profile(two,'vtol').count=2;two.slots=2;two.phaseMode='aligned';const twoPlan=audit(plan(two),'Duplicate footprint union');
 check(near(F.snapshot(twoPlan,900,{footprints:false}).coveredFraction,5/121,.000001),'Coincident footprints are not double-counted');
 two.requiredObservers=2;const twoRequired=audit(plan(two),'Two observers per cell');check(near(F.snapshot(twoRequired,900,{footprints:false}).coveredFraction,5/121,.000001),'Two observers requirement uses cell counts');
 const coarse=single('scout',0,{durationMin:1440,sampleStepS:15,mode:'area',gridSize:15});const cp=audit(plan(coarse),'Analysis cap');check(cp.samples.length===2880&&near(cp.resolution.effectiveStepS,30),'24h at requested 15s reports effective 30s');
 check(cp.gaps.length===1&&near(cp.gaps[0].durationS,cp.durationS)&&cp.gaps[0].edgeCensored,'Full-window gap is explicitly edge-censored');
 for(const field of ['durationMin','baseDistanceKm','sampleStepS']){const invalid=clone(defaultConfig);invalid[field]=NaN;try{const p=plan(invalid);check(!finiteWalk(p).length&&p.issues.length>0,'Invalid '+field+' is diagnosed');}catch(e){check(true,'Invalid '+field+' is rejected',e.message);}}
 const optConfig=single('crewed',2,{durationMin:30,phaseMode:'aligned',slots:1,sampleStepS:60});const optBaseline=plan(optConfig);let progressCalls=0;
 const best=await F.optimize(optConfig,{onProgress:()=>progressCalls++});audit(best,'Bounded optimizer result');
 const a=optBaseline.metrics,b=best.metrics;let nonWorse=b.satisfiedFraction>a.satisfiedFraction+1e-9;
 if(near(a.satisfiedFraction,b.satisfiedFraction,1e-9)){nonWorse=b.longestGapS<a.longestGapS-1e-7;if(near(a.longestGapS,b.longestGapS,1e-7))nonWorse=b.meanAreaCoverage>=a.meanAreaCoverage-1e-9;}
 check(nonWorse,'Optimizer never worsens baseline rank',{baseline:a,best:b});
 check(best.resolution.effectiveStepS===optBaseline.resolution.effectiveStepS&&best.resolution.cellCount===optBaseline.resolution.cellCount,'Optimizer compares equal analysis resolution');
 check(JSON.stringify(best.config.profiles)===JSON.stringify(optConfig.profiles),'Optimizer does not change endurance, reserve, or profile settings');
 check(best.optimization&&Number.isFinite(best.optimization.tested)&&best.optimization.tested>=1&&best.optimization.tested<=best.optimization.total,'Optimization reports bounded candidate count',best.optimization);
 check(progressCalls>0,'Optimizer emits progress');
 const cancelled=await F.optimize(optConfig,{shouldCancel:()=>true});check(cancelled.optimization?.cancelled===true&&cancelled.metrics.satisfiedFraction>=optBaseline.metrics.satisfiedFraction-1e-9,'Cancelled optimization retains tested baseline');
 const exported=JSON.parse(F.exportJSON(areaPlan));check(exported.cells?.length===areaPlan.cells.length&&exported.samples?.length===areaPlan.samples.length&&exported.gaps?.length===areaPlan.gaps.length,'Schedule JSON retains complete coverage analysis');check(!finiteWalk(exported).length,'Exported schedule has finite numbers');
})().catch(e=>check(false,'Fleet QA exception',String(e.stack||e))).finally(()=>{
 report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'engine_report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:report.checks.length,failures:report.failures,cases:report.cases.length,report:path.join(out,'engine_report.json')},null,2));process.exitCode=report.failures.length?1:0;
});
