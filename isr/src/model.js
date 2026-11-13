/* Generic, invented demonstrator geometry. No operational asset performance data. */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI, D = PI / 180, G = 9.80665;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (v, n) => ((v % n) + n) % n;
  const num = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
  const mul = (a,s) => ({x:a.x*s,y:a.y*s,z:a.z*s});
  const unit = a => {const n=Math.hypot(a.x,a.y,a.z)||1;return mul(a,1/n);};
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
  const p2 = (x,y) => ({x,y,z:0});
  const copy = o => JSON.parse(JSON.stringify(o));

  const patterns = [
    {id:'circle',name:'Circular orbit',description:'A circular route about the route origin; observation depends on sensor geometry.',periodic:true,usesAspect:false,scaleLabel:'Orbit radius',scaleHelp:'Horizontal distance from route origin to aircraft.',defaultSensorMode:'track'},
    {id:'ellipse',name:'Elliptical orbit',description:'A smooth ellipse sampled by distance for constant speed.',periodic:true,usesAspect:true,scaleLabel:'Semimajor axis',scaleHelp:'Half the full length of the ellipse.',aspectLabel:'Length / width',aspectHelp:'Semimajor axis divided by semiminor axis.',defaultSensorMode:'track'},
    {id:'racetrack',name:'Racetrack',description:'Two parallel straight legs with semicircular ends.',periodic:true,usesAspect:true,scaleLabel:'Half overall length',scaleHelp:'Half the outside length, including the turns.',aspectLabel:'Length / width',aspectHelp:'Overall length divided by outside width; turn radius is scale divided by aspect.',defaultSensorMode:'track'},
    {id:'figure8',name:'Figure eight',description:'A smooth mathematical two-lobe path, not an exact doctrinal diagram.',periodic:true,usesAspect:true,scaleLabel:'Half overall length',scaleHelp:'Half the total major-axis extent of the two lobes.',aspectLabel:'Length / width',aspectHelp:'Overall length divided by overall width.',defaultSensorMode:'track'},
    {id:'box',name:'Rounded box',description:'Generic rectangular perimeter with finite-radius corners; not an area sweep.',periodic:true,usesAspect:true,scaleLabel:'Half overall length',scaleHelp:'Half the outside length of the rounded rectangle.',aspectLabel:'Length / width',aspectHelp:'Outside length divided by outside width.',defaultSensorMode:'track'},
    {id:'cloverleaf',name:'Cloverleaf geometry',description:'Smooth four-petal mathematical route; no attack or evasion behavior is modeled.',periodic:true,usesAspect:false,scaleLabel:'Petal radius',scaleHelp:'Greatest distance of a petal from the shared route origin.',defaultSensorMode:'track'},
    {id:'parallel',name:'Parallel-track search',description:'One five-leg area sweep with semicircular turns; no automatic return or repeat.',periodic:false,usesAspect:true,scaleLabel:'Half search-leg length',scaleHelp:'Each straight search leg is twice this length; turn arcs extend beyond its ends.',aspectLabel:'Length / search width',aspectHelp:'Straight leg length divided by total separation between outer tracks.',defaultSensorMode:'nadir'},
    {id:'expanding',name:'Expanding-square search',description:'One outward search using paired increasing legs and rounded corners.',periodic:false,usesAspect:false,scaleLabel:'Leg increment',scaleHelp:'Nominal lengths are S, S, 2S, 2S, and so on for twelve legs.',defaultSensorMode:'nadir'},
    {id:'sector',name:'Sector search',description:'One illustrative radial search pass with rounded outer corners; not an asserted standard procedure.',periodic:false,usesAspect:false,scaleLabel:'Search radius',scaleHelp:'Nominal radial extent before corner smoothing.',defaultSensorMode:'nadir'},
    {id:'hover',name:'Stationary hover',description:'A stationary 10-minute demonstration interval.',periodic:false,usesAspect:false,scaleLabel:'Route scale (unused)',scaleHelp:'Hover remains at the route origin.',defaultSensorMode:'track'}
  ];
  const common = {headingDeg:0,clockwise:true,sensorMode:'track',target:{x:0,y:0,z:0}};
  const profiles = [
    {id:'scout',name:'Scout fixed-wing',subtitle:'Small tactical-style demonstrator',description:'Invented 28 m/s, 600 m example with a steerable downward-looking camera. These are demonstration values, not an aircraft specification.',bankLimitDeg:35,sensor:{azMinDeg:-180,azMaxDeg:180,depMinDeg:5,depMaxDeg:90,description:'Full azimuth pointing; 5–90° body-relative depression.'},sensorModes:['track','nadir'],supportedPatterns:['circle','racetrack','figure8','box','parallel','expanding','sector'],recommendedPatterns:['circle','racetrack','parallel'],defaults:{...common,pattern:'circle',scaleM:1400,aspect:2,altitudeM:600,speedMps:28,fovDeg:35,maxRangeM:4500},patternDefaults:{parallel:{scaleM:1800,aspect:1.6},expanding:{scaleM:550},sector:{scaleM:1600},cloverleaf:{scaleM:1800},figure8:{scaleM:2200,aspect:1.6}}},
    {id:'endurance',name:'Endurance fixed-wing',subtitle:'Persistent observation demonstrator',description:'Invented 65 m/s, 3,200 m example with a steerable camera. Larger geometry and longer travel times illustrate scale, not validated sensor performance.',bankLimitDeg:35,sensor:{azMinDeg:-180,azMaxDeg:180,depMinDeg:5,depMaxDeg:90,description:'Full azimuth pointing; 5–90° body-relative depression.'},sensorModes:['track','nadir'],supportedPatterns:['circle','ellipse','racetrack','figure8','cloverleaf','parallel'],recommendedPatterns:['circle','ellipse','racetrack'],defaults:{...common,pattern:'circle',scaleM:4500,aspect:2,altitudeM:3200,speedMps:65,fovDeg:30,maxRangeM:18000},patternDefaults:{parallel:{scaleM:6000,aspect:1.5},expanding:{scaleM:2500},sector:{scaleM:5000},cloverleaf:{scaleM:6000},figure8:{scaleM:9000,aspect:1.6},box:{scaleM:6000,aspect:1.6}}},
    {id:'crewed',name:'Crewed side-looking',subtitle:'Restricted starboard-view demonstrator',description:'Invented 110 m/s, 2,500 m example. Its optical axis is restricted to a starboard sector, making aircraft heading and bank relevant to observation gaps.',bankLimitDeg:30,sensor:{azMinDeg:45,azMaxDeg:135,depMinDeg:10,depMaxDeg:65,description:'Optical axis: 45–135° to starboard; 10–65° body-relative depression.'},sensorModes:['track'],supportedPatterns:['racetrack','ellipse','circle','figure8','parallel'],recommendedPatterns:['racetrack','ellipse','circle'],defaults:{...common,pattern:'racetrack',scaleM:8500,aspect:3.5,altitudeM:2500,speedMps:110,fovDeg:25,maxRangeM:22000},patternDefaults:{circle:{scaleM:6500,aspect:2},ellipse:{scaleM:10000,aspect:1.6},parallel:{scaleM:15000,aspect:1.4},expanding:{scaleM:9000},sector:{scaleM:13000},cloverleaf:{scaleM:13000},figure8:{scaleM:23000,aspect:1.6},box:{scaleM:15000,aspect:1.5}}},
    {id:'vtol',name:'VTOL observer',subtitle:'Slow flight and stationary-view demonstrator',description:'Invented 12 m/s, 250 m example with a steerable downward-looking camera and a stationary hover preset. It does not model rotorcraft aerodynamics.',bankLimitDeg:30,sensor:{azMinDeg:-180,azMaxDeg:180,depMinDeg:5,depMaxDeg:90,description:'Full azimuth pointing; 5–90° body-relative depression.'},sensorModes:['track','nadir'],supportedPatterns:['hover','circle','box','cloverleaf','parallel','expanding','sector'],recommendedPatterns:['hover','circle','parallel'],defaults:{...common,pattern:'hover',scaleM:600,aspect:1.7,altitudeM:250,speedMps:12,fovDeg:45,maxRangeM:2500},patternDefaults:{parallel:{scaleM:700,aspect:1.5},expanding:{scaleM:180},sector:{scaleM:600},cloverleaf:{scaleM:700},figure8:{scaleM:900,aspect:1.6}}}
  ];
  function getProfile(id){return profiles.find(p=>p.id===id)||profiles[1];}
  function getPattern(id){return patterns.find(p=>p.id===id)||patterns[0];}
  function supportedPatterns(id){const p=getProfile(id);return patterns.filter(x=>p.supportedPatterns.includes(x.id));}
  function defaultsFor(id,patternId){
    const p=getProfile(id), chosen=p.supportedPatterns.includes(patternId)?patternId:p.defaults.pattern;
    const pat=getPattern(chosen), mode=p.sensorModes.includes(pat.defaultSensorMode)?pat.defaultSensorMode:'track';
    return {...copy(p.defaults),...(copy(p.patternDefaults[chosen]||{})),profileId:p.id,pattern:chosen,sensorMode:mode};
  }
  function line(out,a,b,step=60){const n=Math.max(1,Math.ceil(dist(a,b)/step));for(let i=1;i<=n;i++)out.push(p2(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n));}
  function arc(out,c,r,a,b,segments=48){for(let i=1;i<=segments;i++){const q=a+(b-a)*i/segments;out.push(p2(c.x+r*Math.cos(q),c.y+r*Math.sin(q)));}}
  function roundedPolyline(vertices,radius){
    if(vertices.length<3)return vertices.slice();
    const out=[vertices[0]];
    for(let i=1;i<vertices.length-1;i++){
      const p=vertices[i],prev=vertices[i-1],next=vertices[i+1];
      const la=dist(prev,p),lb=dist(p,next);
      if(la<1e-7||lb<1e-7)continue;
      const u=p2((p.x-prev.x)/la,(p.y-prev.y)/la),v=p2((next.x-p.x)/lb,(next.y-p.y)/lb);
      const angle=Math.acos(clamp(u.x*v.x+u.y*v.y,-1,1)),turn=u.x*v.y-u.y*v.x;
      if(angle<1e-5||Math.abs(turn)<1e-6){line(out,out[out.length-1],p);continue;}
      const cut=Math.min(radius*Math.tan(angle/2),la*.35,lb*.35),r=cut/Math.tan(angle/2),sign=Math.sign(turn);
      const a=p2(p.x-u.x*cut,p.y-u.y*cut),b=p2(p.x+v.x*cut,p.y+v.y*cut);
      const c=p2(a.x-sign*u.y*r,a.y+sign*u.x*r),aa=Math.atan2(a.y-c.y,a.x-c.x);
      line(out,out[out.length-1],a);arc(out,c,r,aa,aa+sign*angle,Math.max(16,Math.ceil(angle*24)));
      out[out.length-1]=b;
    }
    line(out,out[out.length-1],vertices[vertices.length-1]);return out;
  }
  function makePath(c){
    const s=c.scaleM, b=s/c.aspect, pat=getPattern(c.pattern);let pts=[];
    const curved=(fn,n=720)=>{for(let i=0;i<=n;i++)pts.push(fn(TAU*i/n));};
    if(c.pattern==='hover')pts=[p2(0,0)];
    else if(c.pattern==='circle')curved(u=>p2(s*Math.sin(u),s*Math.cos(u)));
    else if(c.pattern==='ellipse')curved(u=>p2(b*Math.sin(u),s*Math.cos(u)));
    else if(c.pattern==='figure8')curved(u=>p2(b*Math.sin(2*u),s*Math.sin(u)),1000);
    else if(c.pattern==='cloverleaf')curved(u=>{const r=s*Math.sin(2*u);return p2(r*Math.sin(u),r*Math.cos(u));},1200);
    else if(c.pattern==='racetrack'){
      const r=b,d=Math.max(0,s-r);pts=[p2(r,-d)];line(pts,pts[0],p2(r,d));arc(pts,p2(0,d),r,0,PI,120);line(pts,pts[pts.length-1],p2(-r,-d));arc(pts,p2(0,-d),r,PI,TAU,120);pts.reverse();
    }else if(c.pattern==='box'){
      const r=b*.42,x=b,y=s;pts=[p2(x-r,y)];
      arc(pts,p2(x-r,y-r),r,PI/2,0,48);line(pts,pts[pts.length-1],p2(x,-y+r));
      arc(pts,p2(x-r,-y+r),r,0,-PI/2,48);line(pts,pts[pts.length-1],p2(-x+r,-y));
      arc(pts,p2(-x+r,-y+r),r,-PI/2,-PI,48);line(pts,pts[pts.length-1],p2(-x,y-r));
      arc(pts,p2(-x+r,y-r),r,PI,PI/2,48);line(pts,pts[pts.length-1],pts[0]);
    }else if(c.pattern==='parallel'){
      const spacing=2*b/4,r=spacing/2;pts=[p2(-b,-s)];
      for(let k=0;k<5;k++){
        const x=-b+k*spacing,top=k%2===0;line(pts,pts[pts.length-1],p2(x,top?s:-s));
        if(k<4)arc(pts,p2(x+r,top?s:-s),r,PI,top?0:TAU,72);
      }
    }else if(c.pattern==='expanding'){
      let x=0,y=0;const v=[p2(x,y)];
      for(let k=0;k<12;k++){const len=s*(Math.floor(k/2)+1),a=k*PI/2;x+=Math.sin(a)*len;y+=Math.cos(a)*len;v.push(p2(x,y));}
      pts=roundedPolyline(v,s*.28);
    }else if(c.pattern==='sector'){
      const rad=a=>p2(s*Math.sin(a*D),s*Math.cos(a*D));
      pts=roundedPolyline([p2(0,0),rad(0),rad(60),p2(0,0),rad(240),rad(300),p2(0,0),rad(120),rad(180),p2(0,0)],s*.18);
    }
    if(!c.clockwise&&pat.periodic)pts.reverse();
    if(!c.clockwise&&!pat.periodic)pts=pts.map(p=>p2(-p.x,p.y));
    const angle=c.headingDeg*D,co=Math.cos(angle),si=Math.sin(angle);
    pts=pts.map(p=>({x:p.x*co+p.y*si,y:p.y*co-p.x*si,z:c.altitudeM}));
    const clean=[];for(const p of pts)if(!clean.length||dist(p,clean[clean.length-1])>1e-7)clean.push(p);
    if(pat.periodic&&dist(clean[0],clean[clean.length-1])>1e-7)clean.push({...clean[0]});
    const cumulative=[0];for(let i=1;i<clean.length;i++)cumulative.push(cumulative[i-1]+dist(clean[i-1],clean[i]));
    const route={points:clean,cumulative,totalLengthM:cumulative[cumulative.length-1],periodic:pat.periodic};
    const tangents=[],curvatures=[],uniqueCount=pat.periodic?clean.length-1:clean.length;
    for(let i=0;i<clean.length;i++){
      const k=pat.periodic?i%uniqueCount:i,p=clean[k];
      const prev=clean[pat.periodic?mod(k-1,uniqueCount):Math.max(0,k-1)];
      const next=clean[pat.periodic?(k+1)%uniqueCount:Math.min(clean.length-1,k+1)];
      const a=dist(prev,p),b=dist(p,next),chord=dist(prev,next);
      const incoming=a>1e-8?p2((p.x-prev.x)/a,(p.y-prev.y)/a):p2(0,0);
      const outgoing=b>1e-8?p2((next.x-p.x)/b,(next.y-p.y)/b):p2(0,0);
      tangents.push(unit(add(incoming,outgoing)));
      const signed=(p.x-prev.x)*(next.y-p.y)-(p.y-prev.y)*(next.x-p.x);
      curvatures.push(a*b*chord>1e-8?2*signed/(a*b*chord):0);
    }
    Object.defineProperties(route,{_tangents:{value:tangents},_curvatures:{value:curvatures}});
    return route;
  }
  function distanceSegment(route,s){
    const len=route.totalLengthM;s=route.periodic?mod(s,len):clamp(s,0,len);
    if(s===len)return {index:route.points.length-2,fraction:1};
    let lo=0,hi=route.cumulative.length-1;
    while(lo+1<hi){const m=(lo+hi)>>1;if(route.cumulative[m]<=s)lo=m;else hi=m;}
    return {index:lo,fraction:(s-route.cumulative[lo])/(route.cumulative[lo+1]-route.cumulative[lo])};
  }
  function atDistance(route,s){
    if(route.points.length===1)return {...route.points[0]};
    const seg=distanceSegment(route,s),a=route.points[seg.index],b=route.points[seg.index+1],f=seg.fraction;
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z};
  }
  function poseAt(route,s,c){
    const position=atDistance(route,s);
    if(route.totalLengthM<1e-6)return {position,headingDeg:mod(c.headingDeg,360),bankDeg:0};
    // Interpolate geometric vertex curvature instead of differentiating polygon motion in time.
    // This keeps a circular orbit's required bank constant between distance samples.
    const seg=distanceSegment(route,s),i=seg.index,f=seg.fraction;
    const tangent=add(mul(route._tangents[i],1-f),mul(route._tangents[i+1],f));
    const curvature=route._curvatures[i]*(1-f)+route._curvatures[i+1]*f;
    return {position,headingDeg:mod(Math.atan2(tangent.x,tangent.y)/D,360),bankDeg:-Math.atan(c.speedMps*c.speedMps*curvature/G)/D};
  }
  function groundFootprint(position,boresight,fovDeg,maxRangeM){
    const h=position.z;if(h<=0||maxRangeM<=h)return [];
    const r=Math.sqrt(maxRangeM*maxRangeM-h*h);let poly=[];
    for(let i=0;i<64;i++){const a=TAU*i/64;poly.push({x:position.x+r*Math.cos(a),y:position.y+r*Math.sin(a),z:0});}
    let side=unit(cross(boresight,{x:0,y:0,z:1}));if(Math.hypot(side.x,side.y,side.z)<.5)side={x:1,y:0,z:0};
    const up=unit(cross(side,boresight)),half=fovDeg*D/2;
    for(let k=0;k<32&&poly.length;k++){
      const a=TAU*k/32,radial=add(mul(side,Math.cos(a)),mul(up,Math.sin(a)));
      const n=add(mul(boresight,Math.sin(half)),mul(radial,-Math.cos(half)));
      const val=p=>n.x*(p.x-position.x)+n.y*(p.y-position.y)-n.z*h;
      const next=[];
      for(let j=0;j<poly.length;j++){
        const p=poly[j],q=poly[(j+1)%poly.length],vp=val(p),vq=val(q),ip=vp>=-1e-7,iq=vq>=-1e-7;
        if(ip)next.push(p);
        if(ip!==iq){const f=vp/(vp-vq);next.push({x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f,z:0});}
      }poly=next;
    }
    return poly;
  }
  function observe(pose,c,profile,withFootprint){
    const p=pose.position,h=pose.headingDeg*D,bank=pose.bankDeg*D;
    const forward={x:Math.sin(h),y:Math.cos(h),z:0},right0={x:Math.cos(h),y:-Math.sin(h),z:0},down0={x:0,y:0,z:-1};
    const right=add(mul(right0,Math.cos(bank)),mul(down0,Math.sin(bank)));
    const down=add(mul(down0,Math.cos(bank)),mul(right0,-Math.sin(bank)));
    const delta={x:c.target.x-p.x,y:c.target.y-p.y,z:c.target.z-p.z},rangeM=Math.hypot(delta.x,delta.y,delta.z),toTarget=unit(delta);
    const desired=c.sensorMode==='nadir'?{x:0,y:0,z:-1}:toTarget;
    const df=dot(desired,forward),dr=dot(desired,right),dd=dot(desired,down);
    let az=Math.atan2(dr,df)/D,dep=Math.atan2(dd,Math.hypot(df,dr))/D;
    // Azimuth is undefined at exact body nadir; retain a reachable value there.
    if(Math.hypot(df,dr)<1e-9)az=(profile.sensor.azMinDeg+profile.sensor.azMaxDeg)/2;
    const desiredAzimuthDeg=az,desiredDepressionDeg=dep,env=profile.sensor;
    az=clamp(az,env.azMinDeg,env.azMaxDeg);dep=clamp(dep,env.depMinDeg,env.depMaxDeg);
    const pointingLimited=Math.abs(az-desiredAzimuthDeg)>1e-5||Math.abs(dep-desiredDepressionDeg)>1e-5;
    const boresight=unit(add(add(mul(forward,Math.cos(dep*D)*Math.cos(az*D)),mul(right,Math.cos(dep*D)*Math.sin(az*D))),mul(down,Math.sin(dep*D))));
    const targetInFov=rangeM>0&&dot(toTarget,boresight)>=Math.cos(c.fovDeg*D/2)-1e-9;
    const reasons=[];
    if(rangeM>c.maxRangeM+1e-6)reasons.push('Beyond configured sensor range');
    if(!targetInFov)reasons.push(pointingLimited?'Pointing limit keeps target outside field of view':'Outside actual sensor field of view');
    if(c.target.z<0)reasons.push('Target below modeled ground plane');
    return {rangeM,observable:reasons.length===0,reasons,sensor:{boresight,azimuthDeg:az,depressionDeg:dep,desiredAzimuthDeg,desiredDepressionDeg,pointingLimited,targetInFov,footprint:withFootprint?groundFootprint(p,boresight,c.fovDeg,c.maxRangeM):[]}};
  }
  function buildScenario(options={}){
    const profile=getProfile(options.profileId),initial=defaultsFor(profile.id,options.pattern||options.patternId);
    const c={...initial,...copy(options),target:{...initial.target,...(options.target||{})}};
    c.profileId=profile.id;c.pattern=profile.supportedPatterns.includes(c.pattern)?c.pattern:initial.pattern;
    c.scaleM=clamp(num(c.scaleM,initial.scaleM),30,100000);c.aspect=clamp(num(c.aspect,initial.aspect),1.05,5);
    c.altitudeM=clamp(num(c.altitudeM,initial.altitudeM),20,20000);c.speedMps=clamp(num(c.speedMps,initial.speedMps),1,250);
    c.fovDeg=clamp(num(c.fovDeg,initial.fovDeg),2,100);c.maxRangeM=clamp(num(c.maxRangeM,initial.maxRangeM),30,100000);
    c.headingDeg=mod(num(c.headingDeg,0),360);c.clockwise=c.clockwise!==false;c.sensorMode=c.sensorMode==='nadir'?'nadir':'track';
    for(const k of ['x','y','z'])c.target[k]=num(c.target[k],0);
    const pattern=getPattern(c.pattern),route=makePath(c),durationS=c.pattern==='hover'?600:route.totalLengthM/c.speedMps;
    function evaluate(t,footprint=false){
      const timeS=clamp(num(t,0),0,durationS),s=timeS*c.speedMps;
      const pose=poseAt(route,s,c),reading=observe(pose,c,profile,footprint);
      return {timeS,...pose,...reading};
    }
    const n=Math.max(400,Math.min(2400,Math.ceil(durationS/.8))),samples=[];
    for(let i=0;i<=n;i++)samples.push(evaluate(durationS*i/n));
    let begin=samples[0].observable?0:null;const intervals=[];
    function pushInterval(startS,endS){intervals.push({startS,endS,durationS:endS-startS,wraps:false,censoredStart:startS<1e-7,censoredEnd:endS>durationS-1e-7});}
    for(let i=1;i<samples.length;i++)if(samples[i].observable!==samples[i-1].observable){
      let lo=samples[i-1].timeS,hi=samples[i].timeS;
      for(let k=0;k<13;k++){const mid=(lo+hi)/2;if(evaluate(mid).observable===samples[i-1].observable)lo=mid;else hi=mid;}
      const crossing=(lo+hi)/2;
      if(samples[i].observable)begin=crossing;else{pushInterval(begin,crossing);begin=null;}
    }
    if(begin!==null)pushInterval(begin,durationS);
    const totalObservedS=intervals.reduce((s,i)=>s+i.durationS,0),continuousObservation=intervals.length===1&&intervals[0].durationS>=durationS-1e-6;
    const noObservation=intervals.length===0,continuousLookIntervals=intervals.map(i=>({...i}));
    if(route.periodic&&intervals.length>1&&intervals[0].startS<1e-6&&intervals[intervals.length-1].endS>durationS-1e-6){
      const first=continuousLookIntervals.shift(),last=continuousLookIntervals.pop();
      continuousLookIntervals.push({startS:last.startS,endS:first.endS+durationS,durationS:last.durationS+first.durationS,wraps:true,censoredStart:false,censoredEnd:false});
    }
    if(route.periodic&&!continuousObservation)for(const i of continuousLookIntervals){i.censoredStart=false;i.censoredEnd=false;}
    const gaps=[];
    for(let i=1;i<intervals.length;i++)gaps.push({startS:intervals[i-1].endS,endS:intervals[i].startS,durationS:intervals[i].startS-intervals[i-1].endS,wraps:false,censored:false});
    if(!noObservation){
      const first=intervals[0],last=intervals[intervals.length-1];
      if(route.periodic){const gap=first.startS+durationS-last.endS;if(gap>1e-7)gaps.push({startS:last.endS,endS:first.startS+durationS,durationS:gap,wraps:true,censored:false});}
      else{if(first.startS>1e-7)gaps.push({startS:0,endS:first.startS,durationS:first.startS,wraps:false,censored:true});if(last.endS<durationS-1e-7)gaps.push({startS:last.endS,endS:durationS,durationS:durationS-last.endS,wraps:false,censored:true});}
    }else gaps.push({startS:0,endS:durationS,durationS,wraps:false,censored:true});
    const orderedStarts=continuousLookIntervals.map(i=>i.startS).sort((a,b)=>a-b),startToStartS=[];
    if(!continuousObservation)for(let i=1;i<orderedStarts.length;i++)startToStartS.push(orderedStarts[i]-orderedStarts[i-1]);
    if(route.periodic&&!continuousObservation&&orderedStarts.length)startToStartS.push(orderedStarts[0]+durationS-orderedStarts[orderedStarts.length-1]);
    let maxRequiredBankDeg=0;
    // Check route curvature independently of the temporal integration step.
    for(let i=0;i<route.cumulative.length;i++)maxRequiredBankDeg=Math.max(maxRequiredBankDeg,Math.abs(poseAt(route,route.cumulative[i],c).bankDeg));
    const longestLookS=continuousLookIntervals.reduce((s,i)=>Math.max(s,i.durationS),0),maxGapS=gaps.reduce((s,i)=>Math.max(s,i.durationS),0);
    const longestLookCensored=continuousObservation||continuousLookIntervals.some(i=>Math.abs(i.durationS-longestLookS)<1e-6&&(i.censoredStart||i.censoredEnd));
    const maxGapCensored=gaps.some(i=>Math.abs(i.durationS-maxGapS)<1e-6&&i.censored);
    const metrics={durationS,periodic:route.periodic,totalObservedS,observedFraction:totalObservedS/durationS,longestLookS,maxGapS,meanGapS:gaps.length?gaps.reduce((s,i)=>s+i.durationS,0)/gaps.length:0,startToStartS,timeToFirstObservationS:noObservation?null:intervals[0].startS,observationIntervals:intervals,continuousLookIntervals,gapIntervals:gaps,continuousObservation,noObservation,longestLookCensored,maxGapCensored,maxRequiredBankDeg,withinBankLimit:maxRequiredBankDeg<=profile.bankLimitDeg+.1};
    const all=route.points.concat([c.target]);
    const bounds={minX:Math.min(...all.map(p=>p.x)),maxX:Math.max(...all.map(p=>p.x)),minY:Math.min(...all.map(p=>p.y)),maxY:Math.max(...all.map(p=>p.y)),minZ:0,maxZ:c.altitudeM};
    const warnings=[];
    if(!metrics.withinBankLimit)warnings.push('Requested route needs up to '+maxRequiredBankDeg.toFixed(1)+'° bank; this demonstrator limit is '+profile.bankLimitDeg+'°. Enlarge the route or reduce speed. Observation results use the requested geometry.');
    if(!route.periodic)warnings.push(c.pattern==='hover'?'Hover metrics describe the displayed 10-minute interval.':'This is one finite search pass. Playback restart does not establish repeated coverage.');
    if(c.sensorMode==='nadir'&&!profile.sensorModes.includes('nadir'))warnings.push('Nadir is outside this demonstrator optical-axis envelope; actual pointing is clamped to its limits.');
    if(noObservation)warnings.push('No observation in this analysis interval. The reported blind time is a lower bound, not a predicted next-look time.');
    const assumptions=['All asset and sensor numbers are invented demonstration presets.','Available-pattern menus are curated demonstrator selections, not authoritative airframe capabilities or operating restrictions.','Flat clear ground at z=0; no terrain, structures, weather, Earth curvature, wind or hostile systems.','Ideal instantaneous sensor pointing inside the stated body-relative optical-axis envelope; no slew or acquisition delay.','Circular field of view and a hard illustrative range limit; geometric visibility is not identification or detection probability.','No separate detailed airframe masking model; aircraft bank rotates the stated pointing envelope.'];
    return {config:c,profile,pattern,route,durationS,samples,metrics,bounds,warnings,assumptions,sampleAtTime:(t,withFootprint=true)=>evaluate(route.periodic?mod(num(t,0),durationS):clamp(num(t,0),0,durationS),withFootprint)};
  }
  const api={profiles,patterns,defaultsFor,supportedPatterns,buildScenario,version:'1.0.0'};
  root.ISRModel=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
