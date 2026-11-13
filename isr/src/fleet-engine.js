/* Offline illustrative resource scheduler. All aircraft/sensor budgets are invented. */
(function(root){
  'use strict';
  const Model=root.ISRModel||(typeof require==='function'?require('./model.js'):null);
  if(!Model)throw new Error('ISRModel must load before ISRFleet.');
  // A sortie cap also leaves enough analysis bins to retain every station event.
  const EPS=1e-7, MAX_SAMPLES=2880, MAX_SORTIES=1200;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mod=(x,n)=>((x%n)+n)%n;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const lerp=(a,b,f)=>({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f});
  const heading=(a,b)=>mod(Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI,360);
  const COLORS={scout:'#43c8a4',endurance:'#6baaff',crewed:'#d49afb',vtol:'#ffc66a'};
  const scenarioCache=new Map();
  function defaults(){return {
    startMinutes:480,durationMin:480,baseDistanceKm:30,mode:'point',
    areaWidthKm:4,areaHeightKm:4,coverageThresholdPct:90,requiredObservers:1,
    gridSize:11,sampleStepS:30,handoverMin:10,setupMin:0,allowPrelaunch:true,
    slots:1,phaseMode:'spread',profiles:[
      {profileId:'scout',count:2,enduranceMin:180,reserveMin:20,turnaroundMin:45,transitSpeedMps:28,pattern:'circle',routeOverrides:{}},
      {profileId:'endurance',count:0,enduranceMin:480,reserveMin:40,turnaroundMin:60,transitSpeedMps:65,pattern:'circle',routeOverrides:{}},
      {profileId:'crewed',count:0,enduranceMin:300,reserveMin:30,turnaroundMin:60,transitSpeedMps:110,pattern:'racetrack',routeOverrides:{}},
      {profileId:'vtol',count:0,enduranceMin:60,reserveMin:10,turnaroundMin:20,transitSpeedMps:12,pattern:'hover',routeOverrides:{}}
    ]
  };}
  function normalize(input={},strategy={}){
    const d=defaults(),issues=[],c={...d};
    // Preserve nonfinite inputs until validation; JSON cloning would turn NaN into null/zero.
    for(const key of Object.keys(d))if(input&&Object.prototype.hasOwnProperty.call(input,key))c[key]=input[key];
    const issue=(message,severity='warning')=>issues.push({severity,message});
    function numeric(key,fallback,min=-Infinity,max=Infinity,integer=false){
      let v=c[key]===null||c[key]===''||typeof c[key]==='boolean'?NaN:Number(c[key]);
      if(!Number.isFinite(v)){issue(key+' was not finite; using '+fallback+'.');v=fallback;}
      const adjusted=clamp(integer?Math.floor(v):v,min,max);
      if(adjusted!==v)issue(key+' adjusted from '+v+' to '+adjusted+' to meet interface bounds.');
      c[key]=adjusted;
    }
    numeric('startMinutes',480,0,1439,true);numeric('durationMin',480,30,1440);
    numeric('baseDistanceKm',30,0,500);numeric('coverageThresholdPct',90,0,100);
    numeric('requiredObservers',1,1,12,true);numeric('slots',1,1,12,true);
    numeric('handoverMin',10,0,1440);numeric('setupMin',0,0,1440);
    for(const key of ['areaWidthKm','areaHeightKm']){numeric(key,4);if(c[key]<=0){issue(key+' must be positive; using 4 km.','error');c[key]=4;}}
    c.mode=c.mode==='area'?'area':'point';c.phaseMode=c.phaseMode==='aligned'?'aligned':'spread';
    c.allowPrelaunch=c.allowPrelaunch!==false;
    function discrete(key,allowed,fallback){
      let v=c[key]===null||c[key]===''||typeof c[key]==='boolean'?NaN:Number(c[key]);if(!Number.isFinite(v)){issue(key+' was not finite; using '+fallback+'.');v=fallback;}
      if(!allowed.includes(v)){const chosen=allowed.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);issue(key+' adjusted to supported value '+chosen+'.');v=chosen;}c[key]=v;
    }
    discrete('gridSize',[7,11,15],11);discrete('sampleStepS',[15,30,60,120],30);
    const given=Array.isArray(input.profiles)?input.profiles:d.profiles;
    let remaining=12;
    c.profiles=d.profiles.map(def=>{
      const raw=given.find(p=>p&&p.profileId===def.profileId);
      const row={...def,...(raw||{}),count:raw?raw.count:0};
      const originalCount=Number(row.count),count=Number.isFinite(originalCount)?Math.max(0,Math.floor(originalCount)):0;
      row.count=Math.min(count,remaining);remaining-=row.count;
      if(row.count!==originalCount)issue(def.profileId+' count adjusted to '+row.count+' (whole aircraft; maximum fleet 12).');
      for(const key of ['enduranceMin','reserveMin','turnaroundMin','transitSpeedMps']){
        const v=row[key]===null||row[key]===''||typeof row[key]==='boolean'?NaN:Number(row[key]);row[key]=Number.isFinite(v)?v:def[key];
        if(!Number.isFinite(v))issue(def.profileId+' '+key+' was not finite; using its illustrative default.');
      }
      const profile=Model.profiles.find(p=>p.id===def.profileId);
      if(!profile.supportedPatterns.includes(row.pattern)){issue(def.profileId+' pattern is outside its curated demonstration menu; using '+def.pattern+'.');row.pattern=def.pattern;}
      const overrides=row.routeOverrides&&typeof row.routeOverrides==='object'&&!Array.isArray(row.routeOverrides)?row.routeOverrides:{};
      row.routeOverrides={};
      for(const key of ['scaleM','aspect','headingDeg','altitudeM','speedMps','fovDeg','maxRangeM'])if(Object.prototype.hasOwnProperty.call(overrides,key)){
        const value=overrides[key]===null||overrides[key]===''?NaN:Number(overrides[key]);
        if(Number.isFinite(value))row.routeOverrides[key]=value;else issue(def.profileId+' route '+key+' is not finite; the illustrative default is retained.');
      }
      if(typeof overrides.clockwise==='boolean')row.routeOverrides.clockwise=overrides.clockwise;
      if(overrides.sensorMode==='track'||overrides.sensorMode==='nadir')row.routeOverrides.sensorMode=overrides.sensorMode;
      return row;
    });
    for(const p of given)if(p&&!d.profiles.some(v=>v.profileId===p.profileId))issue('Unknown profile '+String(p.profileId)+' ignored.');
    const slotsValue=Number(strategy.slots),offsetValue=Number(strategy.phaseOffset);
    const effective={slots:Number.isFinite(slotsValue)?clamp(Math.floor(slotsValue),1,12):c.slots,phaseMode:strategy.phaseMode==='aligned'?'aligned':strategy.phaseMode==='spread'?'spread':c.phaseMode,phaseOffset:Number.isFinite(offsetValue)?mod(offsetValue,1):0};
    c.slots=effective.slots;c.phaseMode=effective.phaseMode;
    return {config:c,strategy:effective,issues};
  }
  function scenarioFor(row){
    const allowed=['scaleM','aspect','headingDeg','clockwise','altitudeM','speedMps','sensorMode','fovDeg','maxRangeM'];
    const options=Model.defaultsFor(row.profileId,row.pattern);
    for(const key of allowed)if(Object.prototype.hasOwnProperty.call(row.routeOverrides,key))options[key]=row.routeOverrides[key];
    options.profileId=row.profileId;options.pattern=row.pattern;options.target={x:0,y:0,z:0};
    const key=JSON.stringify(options);if(scenarioCache.has(key))return scenarioCache.get(key);
    const scenario=Model.buildScenario(options);scenarioCache.set(key,scenario);
    if(scenarioCache.size>48)scenarioCache.delete(scenarioCache.keys().next().value);
    return scenario;
  }
  function grid(config){
    if(config.mode==='point')return [{id:'reference',x:0,y:0,z:0}];
    const cells=[],n=config.gridSize,w=config.areaWidthKm*1000,h=config.areaHeightKm*1000;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)cells.push({id:'cell-'+y+'-'+x,x:-w/2+(x+.5)*w/n,y:-h/2+(y+.5)*h/n,z:0});
    return cells;
  }
  function indexPlan(result){
    const byAsset=new Map(result.assets.map(a=>[a.id,[]])),eventsByAsset=new Map(result.assets.map(a=>[a.id,[]]));
    for(const s of result.sorties)byAsset.get(s.assetId).push(s);
    for(const list of byAsset.values())list.sort((a,b)=>a.launchS-b.launchS);
    for(const e of result.events)eventsByAsset.get(e.assetId).push(e);
    Object.defineProperties(result,{_byAsset:{value:byAsset},_eventsByAsset:{value:eventsByAsset}});
  }
  function precedingSortie(list,t){
    let lo=0,hi=list.length;
    while(lo<hi){const m=(lo+hi)>>1;if(list[m].launchS<=t)lo=m+1;else hi=m;}
    return lo-1;
  }
  function activeSensors(result,t,footprints=false){
    const active=[];
    for(const asset of result.assets){
      const list=result._byAsset.get(asset.id),index=precedingSortie(list,t);if(index<0)continue;
      const s=list[index];if(t<s.stationStartS||t>=s.departS)continue;
      const reading=asset.scenario.sampleAtTime(s.phaseS+t-s.stationStartS,footprints);
      active.push({asset,sortie:s,reading});
    }
    return active;
  }
  function cellCounts(active,cells){
    const counts=new Array(cells.length).fill(0),contributing=[];
    for(const item of active){
      const {position,sensor}=item.reading,config=item.asset.scenario.config,b=sensor.boresight;
      const range2=config.maxRangeM*config.maxRangeM,cosHalf=Math.cos(config.fovDeg*Math.PI/360);let seen=0;
      for(let k=0;k<cells.length;k++){
        const q=cells[k],x=q.x-position.x,y=q.y-position.y,z=q.z-position.z,r2=x*x+y*y+z*z;
        if(r2<=range2+1e-6&&r2>0&&x*b.x+y*b.y+z*b.z>=Math.sqrt(r2)*cosHalf-1e-7){counts[k]++;seen++;}
      }
      item.observedCellCount=seen;if(seen)contributing.push(item.asset.id);
    }
    return {counts,contributing};
  }
  function requirement(config,counts){
    let covered=0;for(const n of counts)if(n>=config.requiredObservers)covered++;
    const coveredFraction=covered/counts.length;
    return {coveredFraction,met:config.mode==='point'?covered===1:coveredFraction*100+1e-9>=config.coverageThresholdPct};
  }
  function stationBoundaries(result){
    const {durationS}=result;
    const eventTimes=[0,durationS];
    for(const s of result.sorties)for(const t of [s.stationStartS,s.departS])if(t>0&&t<durationS)eventTimes.push(t);
    eventTimes.sort((a,b)=>a-b);
    return eventTimes.filter((v,i)=>i===0||v-eventTimes[i-1]>EPS);
  }
  function analyze(result,stepFloorS=0){
    const {config,durationS,cells}=result,mandatory=stationBoundaries(result);
    const regularBudget=Math.max(1,MAX_SAMPLES-(mandatory.length-2));
    const step=Math.max(config.sampleStepS,durationS/regularBudget,stepFloorS),edges=mandatory.slice();
    const regularBins=Math.ceil(durationS/step-1e-12);
    for(let j=1;j<regularBins;j++)edges.push(j*step);
    edges.sort((a,b)=>a-b);
    const boundaries=edges.filter((v,i)=>i===0||v-edges[i-1]>EPS);
    result.resolution={requestedStepS:config.sampleStepS,effectiveStepS:step,gridSize:config.mode==='point'?1:config.gridSize,cellCount:cells.length,eventAligned:true,binCount:boundaries.length-1};
    const acc=cells.map(()=>({covered:0,observed:0,gapStart:null,maxGap:0,gaps:[]}));
    const samples=[],gaps=[];let currentGap=null,weightedCoverage=0,totalGapS=0,minAreaCoverage=1;
    const bins=boundaries.length-1;
    for(let j=0;j<bins;j++){
      const startS=boundaries[j],endS=boundaries[j+1],timeS=(startS+endS)/2,dt=endS-startS;
      const active=activeSensors(result,timeS),{counts,contributing}=cellCounts(active,cells),r=requirement(config,counts),onStationCount=active.length;
      const reason=r.met?'Coverage requirement met':onStationCount===0?'No aircraft on station':onStationCount<config.requiredObservers?'Insufficient aircraft on station':'Sensor footprint, range, or pointing shortfall';
      samples.push({startS,endS,timeS,onStationCount,coveredFraction:r.coveredFraction,met:r.met,reason,observingAssetIds:contributing});
      weightedCoverage+=r.coveredFraction*dt;minAreaCoverage=Math.min(minAreaCoverage,r.coveredFraction);
      if(!r.met){
        totalGapS+=dt;
        if(!currentGap)currentGap={startS,endS,durationS:dt,reasons:[reason],minCoveredFraction:r.coveredFraction,maxOnStation:onStationCount,edgeCensored:startS<=EPS};
        else{currentGap.endS=endS;currentGap.durationS=endS-currentGap.startS;currentGap.minCoveredFraction=Math.min(currentGap.minCoveredFraction,r.coveredFraction);currentGap.maxOnStation=Math.max(currentGap.maxOnStation,onStationCount);if(!currentGap.reasons.includes(reason))currentGap.reasons.push(reason);}
      }else if(currentGap){gaps.push(currentGap);currentGap=null;}
      for(let k=0;k<cells.length;k++){
        const a=acc[k];if(counts[k]>0)a.observed+=dt;
        if(counts[k]>=config.requiredObservers){a.covered+=dt;if(a.gapStart!==null){const gap={startS:a.gapStart,endS:startS,durationS:startS-a.gapStart,edgeCensored:a.gapStart<=EPS};a.maxGap=Math.max(a.maxGap,gap.durationS);a.gaps.push(gap);a.gapStart=null;}}
        else if(a.gapStart===null)a.gapStart=startS;
      }
    }
    if(currentGap){currentGap.edgeCensored=true;gaps.push(currentGap);}
    for(let k=0;k<cells.length;k++){
      const a=acc[k];if(a.gapStart!==null){const gap={startS:a.gapStart,endS:durationS,durationS:durationS-a.gapStart,edgeCensored:true};a.maxGap=Math.max(a.maxGap,gap.durationS);a.gaps.push(gap);}
      Object.assign(cells[k],{coveredFraction:a.covered/durationS,observedFraction:a.observed/durationS,longestGapS:a.maxGap,neverObserved:a.observed===0,gapIntervals:a.gaps});
    }
    result.samples=samples;result.gaps=gaps;
    result.metrics={satisfiedFraction:clamp(1-totalGapS/durationS,0,1),totalGapS,longestGapS:gaps.reduce((m,g)=>Math.max(m,g.durationS),0),meanAreaCoverage:weightedCoverage/durationS,minAreaCoverage,neverObservedCount:cells.filter(c=>c.neverObserved).length,sortieCount:result.sorties.length,totalFlightS:result.sorties.reduce((s,q)=>s+q.landS-q.launchS,0),minLandingReserveS:result.sorties.length?Math.min(...result.sorties.map(s=>s.reserveAtLandingS)):null};
  }
  function plan(input={},strategyOverride={},internal={}){
    const normalized=normalize(input,strategyOverride),config=normalized.config,strategy=normalized.strategy,issues=normalized.issues;
    const durationS=config.durationMin*60,base={x:-config.baseDistanceKm*1000,y:0,z:0},assets=[],sorties=[],events=[];
    const overlapS=config.handoverMin*60,setupS=config.setupMin*60;
    for(const row of config.profiles){
      if(!row.count)continue;const profile=Model.profiles.find(p=>p.id===row.profileId),scenario=scenarioFor(row);
      const commonIssues=[];
      if(row.enduranceMin<=0)commonIssues.push('Endurance must be positive.');
      if(row.reserveMin<0)commonIssues.push('Reserve must not be negative.');
      if(row.reserveMin>=row.enduranceMin)commonIssues.push('Reserve is at least the full endurance budget; no sortie is dispatchable.');
      if(row.turnaroundMin<0)commonIssues.push('Turnaround must not be negative.');
      if(row.transitSpeedMps<=0)commonIssues.push('Transit speed must be positive.');
      if(!scenario.metrics.withinBankLimit)commonIssues.push('Requested route exceeds this illustrative profile bank limit and is excluded from dispatch.');
      for(let n=1;n<=row.count;n++){
        const asset={id:row.profileId+'-'+n,label:profile.name+' '+String(n).padStart(2,'0'),profileId:row.profileId,profileName:profile.name,color:COLORS[row.profileId],enduranceS:row.enduranceMin*60,reserveS:row.reserveMin*60,turnaroundS:row.turnaroundMin*60,transitSpeedMps:row.transitSpeedMps,pattern:row.pattern,scenario,issues:commonIssues.slice()};
        const templates=[];
        if(!commonIssues.length){
          const returnBudgetS=Math.max(...scenario.route.points.map(p=>distance(p,base)))/asset.transitSpeedMps;
          for(let slot=0;slot<strategy.slots;slot++){
            const fraction=mod(strategy.phaseOffset+(strategy.phaseMode==='spread'?slot/strategy.slots:0),1),phaseS=scenario.route.periodic?fraction*scenario.durationS:0;
            const entryPosition=scenario.sampleAtTime(phaseS,false).position,outboundS=distance(base,entryPosition)/asset.transitSpeedMps;
            const budgetStationS=asset.enduranceS-asset.reserveS-outboundS-setupS-returnBudgetS;
            const stationS=scenario.route.periodic||row.pattern==='hover'?budgetStationS:Math.min(budgetStationS,scenario.durationS);
            let failure=null;
            if(stationS<=EPS)failure='Outbound, setup, conservative return and reserve leave no positive station time.';
            else if(overlapS>=stationS-EPS)failure='Requested handover overlap is at least the feasible station window.';
            templates.push(failure?{failure}:{phaseS,entryPosition,outboundS,returnBudgetS,stationS});
          }
          const failures=templates.filter(t=>t.failure);
          if(failures.length===templates.length)asset.issues.push(...new Set(failures.map(t=>t.failure)));
          else if(failures.length)asset.issues.push('Some slot entry phases do not meet the stated endurance/overlap constraints.');
        }
        const eligible=!commonIssues.length&&templates.some(t=>!t.failure);
        Object.defineProperties(asset,{_templates:{value:templates},_eligible:{value:eligible},_readyS:{value:0,writable:true},_used:{value:false,writable:true}});
        for(const message of asset.issues)issues.push({severity:eligible?'warning':'error',assetId:asset.id,message});
        assets.push(asset);
      }
    }
    const slotState=Array.from({length:strategy.slots},(_,slot)=>({slot,neededS:0,done:false}));
    let capReached=false;
    while(sorties.length<MAX_SORTIES){
      const next=slotState.filter(s=>!s.done).sort((a,b)=>a.neededS-b.neededS||a.slot-b.slot)[0];if(!next)break;
      let best=null;
      for(const asset of assets){
        if(!asset._eligible)continue;const tpl=asset._templates[next.slot];if(!tpl||tpl.failure)continue;
        const desiredLaunch=next.neededS-tpl.outboundS-setupS;
        const launchS=asset._used?Math.max(asset._readyS,desiredLaunch):config.allowPrelaunch?desiredLaunch:Math.max(0,desiredLaunch);
        const arrivalS=launchS+tpl.outboundS,stationStartS=arrivalS+setupS;
        if(stationStartS>=durationS-EPS)continue;
        const candidate={asset,tpl,launchS,arrivalS,stationStartS};
        if(!best||candidate.stationStartS<best.stationStartS-EPS||Math.abs(candidate.stationStartS-best.stationStartS)<=EPS&&(tpl.stationS>best.tpl.stationS+EPS||Math.abs(tpl.stationS-best.tpl.stationS)<=EPS&&asset.id<best.asset.id))best=candidate;
      }
      if(!best){next.done=true;continue;}
      const {asset,tpl,launchS,arrivalS,stationStartS}=best,departS=Math.min(durationS,stationStartS+tpl.stationS),stationS=departS-stationStartS;
      const exitPosition=asset.scenario.sampleAtTime(tpl.phaseS+stationS,false).position,returnS=distance(exitPosition,base)/asset.transitSpeedMps,landS=departS+returnS,readyS=landS+asset.turnaroundS,reserveAtLandingS=asset.enduranceS-(landS-launchS);
      if(reserveAtLandingS+1e-5<asset.reserveS){issues.push({severity:'error',assetId:asset.id,message:'A proposed sortie failed the reserve check and was not dispatched.'});next.done=true;continue;}
      const sortie={id:'sortie-'+String(sorties.length+1).padStart(4,'0'),assetId:asset.id,slot:next.slot+1,launchS,arrivalS,stationStartS,departS,landS,readyS,phaseS:tpl.phaseS,outboundS:tpl.outboundS,returnS,returnBudgetS:tpl.returnBudgetS,stationS,reserveAtLandingS,entryPosition:{...tpl.entryPosition},exitPosition:{...exitPosition}};
      sorties.push(sortie);asset._used=true;asset._readyS=readyS;
      for(const [type,timeS,label] of [['LAUNCH',launchS,'Launch'],['ARRIVE',arrivalS,'Arrive at route entry'],['ON_STATION',stationStartS,'Begin assigned collection'],['RETURN',departS,'Return to base'],['LANDED',landS,'Land with reserve'],['READY',readyS,'Turnaround complete']])events.push({timeS,assetId:asset.id,sortieId:sortie.id,type,label});
      if(departS>=durationS-EPS)next.done=true;else next.neededS=departS-overlapS;
    }
    capReached=sorties.length>=MAX_SORTIES&&slotState.some(s=>!s.done);
    if(capReached)issues.push({severity:'warning',message:'Incomplete planning: the demonstrator stopped at '+MAX_SORTIES+' sorties. The unplanned remainder remains visible and is not proof that the requested service is infeasible.'});
    if(!assets.length)issues.push({severity:'error',message:'The fleet contains no aircraft; coverage cannot be supplied.'});
    else if(!sorties.length)issues.push({severity:'error',message:'No aircraft can provide a useful assignment within the stated budgets and timing.'});
    if(strategy.slots>assets.length)issues.push({severity:'warning',message:'Requested station slots exceed the number of aircraft. Slots are desired assignments, not additional aircraft.'});
    events.sort((a,b)=>a.timeS-b.timeS||a.assetId.localeCompare(b.assetId)||a.type.localeCompare(b.type));
    const result={config,strategy,durationS,base,timelineStartS:Math.min(0,...sorties.map(s=>s.launchS)),timelineEndS:Math.max(durationS,...sorties.map(s=>s.readyS)),planningComplete:!capReached,assets,sorties,events,cells:grid(config),samples:[],gaps:[],metrics:{},resolution:{},issues,assumptions:[
      'All aircraft, sensor and endurance values are invented demonstrator settings; curated menus are not operating restrictions.',
      'Flat clear ground, no wind, weather, terrain, threats, aircraft dynamics, or flight-control integration.',
      'Endurance is a uniform airborne time budget, not a physical fuel or battery model. Reserve is subtracted once.',
      'Transit follows a straight three-dimensional line at configured speed. Direct joins do not model launch, climb, landing or turning dynamics.',
      'Setup is an abstract stationary accounting allowance at the route entry; no fixed-wing holding maneuver is modeled.',
      'Return planning reserves the maximum direct distance from any sampled route point to base. Actual departure uses the current route position.',
      'Turnaround holds the landing budget until READY, when a full budget is restored; no charging curve is implied.',
      'Collection is enabled only during assigned station intervals. One actual sensor boresight is evaluated against all grid cells.',
      'Periodic routes may repeat during an assignment. Finite search routes execute one pass; hover duration is set by the resource budget.',
      'Coverage is a midpoint-sampled estimate with whole-bin gaps at the reported time/grid resolution; it is not an exact continuous guarantee. Bins split at every station start/departure so scheduling gaps are retained.',
      'Per-cell adequate-coverage fractions/gaps use requiredObservers. Never-observed means no sensor saw that cell at any sampled time.',
      'Start and end horizon gaps are retained; no wrap-around is assumed for the task or for aircraft availability.'
    ]};
    indexPlan(result);
    if(!internal.deferAnalysis){analyze(result);resolutionIssue(result);}
    return result;
  }
  function resolutionIssue(result){
    if(result.resolution.effectiveStepS>result.config.sampleStepS+EPS)result.issues.push({severity:'info',message:'Analysis maximum time step increased to '+result.resolution.effectiveStepS.toFixed(2)+' s to retain station boundaries within '+MAX_SAMPLES+' bins.'});
  }
  function telemetry(result,asset,t,footprints){
    const list=result._byAsset.get(asset.id),ix=precedingSortie(list,t),previous=ix>=0?list[ix]:null,next=list[ix+1]||null;
    let state='READY',position={...result.base},headingDeg=0,bankDeg=0,speedMps=0,sensor=null,observingReference=false,currentSortie=null;
    let remaining=asset.enduranceS,flightElapsedS=0,flightTimeToLandingS=0,turnaroundProgress=null,timeToReadyS=0;
    if(!asset._eligible)state='UNAVAILABLE';
    else if(previous&&t<previous.landS){
      currentSortie=previous;flightElapsedS=Math.max(0,t-previous.launchS);remaining=asset.enduranceS-flightElapsedS;flightTimeToLandingS=Math.max(0,previous.landS-t);
      if(t<previous.arrivalS){state='OUTBOUND';position=lerp(result.base,previous.entryPosition,clamp((t-previous.launchS)/Math.max(EPS,previous.outboundS),0,1));headingDeg=heading(result.base,previous.entryPosition);speedMps=asset.transitSpeedMps;}
      else if(t<previous.stationStartS){state='SETUP';position={...previous.entryPosition};headingDeg=asset.scenario.sampleAtTime(previous.phaseS,false).headingDeg;}
      else if(t<previous.departS){state='ON_STATION';const r=asset.scenario.sampleAtTime(previous.phaseS+t-previous.stationStartS,footprints);position=r.position;headingDeg=r.headingDeg;bankDeg=r.bankDeg;sensor=r.sensor;observingReference=r.observable;speedMps=asset.pattern==='hover'?0:asset.scenario.config.speedMps;}
      else{state='RETURN';position=lerp(previous.exitPosition,result.base,clamp((t-previous.departS)/Math.max(EPS,previous.returnS),0,1));headingDeg=heading(previous.exitPosition,result.base);speedMps=asset.transitSpeedMps;}
    }else if(previous&&t<previous.readyS){state='TURNAROUND';currentSortie=previous;remaining=previous.reserveAtLandingS;turnaroundProgress=clamp((t-previous.landS)/Math.max(EPS,asset.turnaroundS),0,1);timeToReadyS=previous.readyS-t;}
    else if(next)state='QUEUED';
    const distanceToBaseM=distance(position,result.base),returnTimeS=distanceToBaseM>EPS&&asset.transitSpeedMps>0?distanceToBaseM/asset.transitSpeedMps:0;
    const nextEvent=(result._eventsByAsset.get(asset.id)||[]).find(e=>e.timeS>t+EPS)||null;
    const names={READY:'Available',QUEUED:'Awaiting scheduled launch',OUTBOUND:'Transit to collection area',SETUP:'Collection setup',ON_STATION:'Slot '+(currentSortie?currentSortie.slot:'')+' · '+asset.scenario.pattern.name,RETURN:'Recovery transit',TURNAROUND:'Ground turnaround',UNAVAILABLE:'Not dispatchable'};
    return {id:asset.id,label:asset.label,profileId:asset.profileId,profileName:asset.profileName,color:asset.color,state,position,headingDeg,bankDeg,speedMps,distanceToTargetM:distance(position,{x:0,y:0,z:0}),distanceToBaseM,enduranceRemainingS:remaining,energyPct:asset.enduranceS>0?clamp(100*remaining/asset.enduranceS,0,100):0,reserveS:asset.reserveS,returnTimeS,returnMarginS:remaining-returnTimeS-asset.reserveS,flightElapsedS,flightTimeToLandingS,sortieId:currentSortie?currentSortie.id:null,currentSortie,nextEvent:nextEvent?{timeS:nextEvent.timeS,type:nextEvent.type,label:nextEvent.label}:null,sensor,observingReference,observedCellCount:0,taskLabel:names[state],issues:asset.issues.slice(),turnaroundProgress,timeToReadyS};
  }
  function snapshot(result,timeS,{footprints=true}={}){
    const t=Number.isFinite(Number(timeS))?Number(timeS):0,assets=result.assets.map(a=>telemetry(result,a,t,footprints));
    const active=[];
    for(let i=0;i<assets.length;i++)if(assets[i].state==='ON_STATION')active.push({asset:result.assets[i],reading:{position:assets[i].position,sensor:assets[i].sensor},telemetry:assets[i]});
    const {counts}=cellCounts(active,result.cells);for(const item of active)item.telemetry.observedCellCount=item.observedCellCount;
    const r=requirement(result.config,counts);return {timeS:t,coveredFraction:r.coveredFraction,met:r.met,counts,assets};
  }
  function better(a,b){
    const ma=a.metrics,mb=b.metrics;
    const keys=[['satisfiedFraction',1],['longestGapS',-1],['meanAreaCoverage',1],['totalFlightS',-1],['sortieCount',-1]];
    for(const [key,direction]of keys){const delta=(ma[key]-mb[key])*direction;if(Math.abs(delta)>1e-8)return delta>0;}return false;
  }
  async function optimize(input,{onProgress,shouldCancel,baselineStrategy}={}){
    const normalized=normalize(input,baselineStrategy||{}),config=normalized.config,totalAssets=config.profiles.reduce((n,p)=>n+p.count,0);
    const candidates=[],seen=new Set();
    const add=s=>{const key=JSON.stringify(s);if(!seen.has(key)){seen.add(key);candidates.push(s);}};
    add({...normalized.strategy});
    if(totalAssets){
      const counts=[...new Set([1,config.slots,Math.min(2,totalAssets),Math.min(3,totalAssets),Math.min(4,totalAssets)])];
      for(const slots of counts)for(const phaseMode of ['spread','aligned'])add({slots,phaseMode,phaseOffset:0});
      for(const offset of [.25,.5,.75]){add({slots:config.slots,phaseMode:'spread',phaseOffset:offset});add({slots:1,phaseMode:'spread',phaseOffset:offset});}
      if(totalAssets>4)add({slots:totalAssets,phaseMode:'spread',phaseOffset:0});
    }
    let best=null,baseline=null,tested=0,cancelled=false;
    // Prepare resource timelines first so every comparison uses one common maximum
    // geometry-sampling step, even when candidates have different event counts.
    const prepared=[];
    for(const strategy of candidates){
      if(prepared.length&&shouldCancel&&shouldCancel()){cancelled=true;break;}
      const candidate=plan(config,strategy,{deferAnalysis:true});
      candidate.issues.unshift(...normalized.issues.map(i=>({...i})));prepared.push(candidate);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const commonStepS=Math.max(config.sampleStepS,...prepared.map(p=>p.durationS/Math.max(1,MAX_SAMPLES-(stationBoundaries(p).length-2))));
    for(const candidate of prepared){
      if(tested&&shouldCancel&&shouldCancel()){cancelled=true;break;}
      analyze(candidate,commonStepS);resolutionIssue(candidate);
      if(!baseline)baseline=candidate;if(!best||better(candidate,best))best=candidate;tested++;
      if(onProgress)onProgress({tested,total:candidates.length,bestSatisfiedFraction:best.metrics.satisfiedFraction,bestLongestGapS:best.metrics.longestGapS,description:'Testing bounded slot/entry-phase alternatives at fixed analysis resolution.'});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    best.optimization={tested,total:candidates.length,cancelled,baselineSatisfiedFraction:baseline.metrics.satisfiedFraction,baselineLongestGapS:baseline.metrics.longestGapS,baselineStrategy:{...baseline.strategy},effectiveStepS:commonStepS,description:'Best tested, not global optimum. Baseline first; bounded slot counts up to four plus the configured/full-fleet count, aligned/spread starts, and selected quarter-cycle entry offsets. Budgets, reserve, fleet, area and sensor settings are unchanged. All tested candidates share one grid and maximum sampling step, with each schedule station boundary retained.'};
    return best;
  }
  function exportJSON(result){
    const plain={...result,engineVersion:'2.0.0',geometryModelVersion:Model.version,assets:result.assets.map(a=>({id:a.id,label:a.label,profileId:a.profileId,profileName:a.profileName,color:a.color,enduranceS:a.enduranceS,reserveS:a.reserveS,turnaroundS:a.turnaroundS,transitSpeedMps:a.transitSpeedMps,pattern:a.pattern,issues:a.issues,scenario:{config:a.scenario.config,patternId:a.scenario.pattern.id,routePeriodic:a.scenario.route.periodic,routeDurationS:a.scenario.durationS,totalLengthM:a.scenario.route.totalLengthM}}))};
    return JSON.stringify(plain,(key,value)=>typeof value==='function'?undefined:value,2);
  }
  const api={defaults,plan,optimize,snapshot,exportJSON,version:'2.0.0'};root.ISRFleet=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
