/* vena-kodama viewer v02 (C3-E4, lane VK): venation patterns as a surface texture on the landform regions of an Observatory.
   A new light viewer. It draws a height grid with WebGL, uses the pattern engine (vena-engine.js: grow, cells) and the shared shell
   (vena-shell.js). It loads no kodama file; its data files are made from the kodama v18 pages by C3-E4_vk_data-build_v02.py.
   One global: VK. No storage APIs. Coordinates: metres in the data window, x east, y down from the north edge. */
(function(){
'use strict';
const $=id=>document.getElementById(id);const FT=3.28084;
const mft=(v,d,sg)=>{d=d==null?2:d;const s=sg&&v>0?'+':'';return s+v.toFixed(d)+' m ('+s+(v*FT).toFixed(1)+' ft)'};
const TEXS=[{k:'wing',name:'wing cells',src:'VS03-04'},{k:'leaf',name:'leaf veins',src:'VS02-04'},{k:'radial',name:'radial veins',src:'VS02-10'},{k:'cells',name:'cells',src:'VS02-16'}];
const TYPS=[{k:'berm',name:'berm',land:'berm or channel',dir:['berm (raised)','channel (lowered)'],k1:['crest width',.3,4,1],k2:['side slope 1:n, on the ground',.25,4,1]},
 {k:'wave',name:'waveform mounds',land:'hill or depression',dir:['hill (raised)','depression (lowered)'],k1:['mound height with cell size',.3,3,1],k2:null},
 {k:'pond',name:'pond cells',land:'plateau or basin',dir:['basin (lowered)','plateau (raised)'],k1:['basin depth with cell size',.3,3,1],k2:null},
 {k:'terr',name:'terraces',land:'ridge or valley, stepped',dir:['steps down from the primary veins','steps up from the primary veins'],k1:['tread',.3,4,1],k2:['riser',.3,3,1]}];
const TEX=Object.fromEntries(TEXS.map(t=>[t.k,t])),TYP=Object.fromEntries(TYPS.map(t=>[t.k,t]));
const STUDIES=[];TEXS.forEach((t,i)=>TYPS.forEach((y,j)=>STUDIES.push({id:'VS08-'+String(i*4+j+1).padStart(2,'0'),tex:t.k,typ:y.k})));
const KDEF={berm:{typ:'berm',tex:'leaf',gain:.6},terraces:{typ:'terr',tex:'wing',gain:.8},cells:{typ:'pond',tex:'cells',gain:.5},basin:{typ:'pond',tex:'cells',gain:.3},mound:{typ:'wave',tex:'radial',gain:.6},island:{typ:'wave',tex:'radial',gain:.4}};
const NARROW_M=7;/* a region whose greatest inside width (twice the greatest distance to its edge) is under this reads the same with any texture */
function kdef(R){const k=Object.assign({},KDEF[R.kind]);if(R.dflt){if(R.dflt.typ)k.typ=R.dflt.typ;if(R.dflt.tex)k.tex=R.dflt.tex;if(R.dflt.n)k.n=R.dflt.n;if(R.dflt.why)k.why=R.dflt.why}return k}
const FONAME=['linear','ease-out','smooth','very smooth','cosine','concentrated'];const OVNAME=['blend','highest','lowest'];
/* one list drives the controls, the stored values, the caption and the exports */
const PARAMS=[
 {id:'n',g:'g_top',label:'cell count',min:3,max:600,step:1,def:r=>r.dn||Math.max(8,Math.min(400,Math.round(r.area_m2/12))),hint:'cells (cell textures) or vein sources (vein textures) in the region; default: one per 12 m² of its area, or the region\'s own (a paddy pool run: one per pool)'},
 {id:'pscale',g:'g_top',label:'pattern scale',min:.25,max:20,step:.25,unit:'m',def:r=>Math.max(.5,Math.min(20,Math.round(Math.sqrt(r.area_m2/(r.dn||Math.max(8,Math.min(400,Math.round(r.area_m2/12)))))*4)/4)),hint:'size of the pattern on the ground: vein and wall width, crest width, mound size, growth step. Default: the square root of area over the default cell count. Smaller: a finer pattern in the same region'},
 {id:'gain',g:'g_top',label:'relief gain',min:0,max:3,step:.05,unit:'m',def:r=>KDEF[r.kind].gain,hint:'greatest height of the pattern, before the edge fade; default by region kind'},
 {id:'seed',g:'g_top',label:'seed',min:1,max:99,step:1,def:()=>7},
 {id:'vdens',g:'g_veins',label:'vein density',min:.4,max:2.5,step:.05,def:()=>1,hint:'multiplies the vein sources (vein textures)'},
 {id:'vw',g:'g_veins',label:'vein width',min:.4,max:3,step:.05,def:()=>1,hint:'multiplies crest and dike widths'},
 {id:'vo',g:'g_veins',label:'primary vein share',min:.2,max:.9,step:.05,def:()=>.5,hint:'share of the greatest vein width from which a vein counts as primary'},
 {id:'grad',g:'g_cells',label:'cell gradient',min:0,max:3,step:.1,def:()=>1,hint:'0 even; higher: smaller cells toward one end of the long axis'},
 {id:'lloyd',g:'g_cells',label:'cell relaxing passes',min:0,max:8,step:1,def:()=>3},
 {id:'fo',g:'g_blend',label:'falloff type',sel:FONAME,def:()=>2,hint:'shape of the edge fade'},
 {id:'tb',g:'g_blend',label:'topo blend',min:0,max:1,step:.05,def:()=>1,hint:'0 absolute level (the region mean), 1 follows the designed surface'},
 {id:'ov',g:'g_blend',label:'overlap',sel:OVNAME,def:()=>0,hint:'against the designed surface'},
 {id:'fade',g:'g_blend',label:'edge fade',min:0,max:10,step:.25,unit:'m',def:r=>Math.max(.25,Math.min(2,Math.round((r.dmax||8)*.3*4)/4)),hint:'distance from the region edge over which the texture grows to full height; default 0.3 of the greatest distance to the edge inside the region, 2 m at most'},
 {id:'dir',g:'g_typ',label:'direction',sel:r=>TYP[r.typ].dir,def:()=>0},
 {id:'k1',g:'g_typ',label:r=>TYP[r.typ].k1[0],min:.3,max:4,step:.05,def:()=>1,hint:'multiplies the VS08 rule (1 = as the study)'},
 {id:'k2',g:'g_typ',label:r=>TYP[r.typ].k2?TYP[r.typ].k2[0]:'',min:.25,max:4,step:.05,def:()=>1,hint:'multiplies the VS08 rule',when:r=>!!TYP[r.typ].k2}];
const GLOBALS=[{id:'ve',label:'vertical exaggeration',min:1,max:5,step:.5,def:2,hint:'stretches the plan and axon view only; every readout is true height'},{id:'sve',label:'vertical exaggeration of the section',min:1,max:10,step:.5,def:5,hint:'stretches the section only; every readout is true height'},{id:'ci',label:'contour interval',min:.05,max:2,step:.05,def:.25,unit:'m'}];
const S={o:null,sel:null,view:'axon',show:'after',az:-32,el:38,zoom:1,pan:[0,0],zc:null,ve:2,sve:5,ci:.25,cut:'auto',lv:{},R:{},plines:true};
let O=null,F=null,GLS=null;
function fall(t,k){t=t<0?0:t>1?1:t;switch(+k){case 1:return 1-(1-t)*(1-t);case 2:return t*t*(3-2*t);case 3:return t*t*t*(t*(6*t-15)+10);case 4:return .5-.5*Math.cos(Math.PI*t);case 5:return t*t*t;default:return t}}
/* exact Euclidean distance to the nearest set cell of a w x h mask, in cells */
function edt(mask,w,h){const INF=1e20,N=w*h;const f=new Float64Array(N);let any=false;for(let i=0;i<N;i++){if(mask[i]){f[i]=0;any=true}else f[i]=INF}const out=new Float32Array(N);if(!any){out.fill(1e6);return out}
 const m=Math.max(w,h);const g=new Float64Array(m),v=new Int32Array(m),z=new Float64Array(m+1),d=new Float64Array(m);
 const pass=(off,st,n)=>{for(let q=0;q<n;q++)g[q]=f[off+q*st];let k=-1;for(let q=0;q<n;q++){if(g[q]>=INF)continue;if(k<0){k=0;v[0]=q;z[0]=-INF;z[1]=INF;continue}
   let s;for(;;){const p=v[k];s=((g[q]+q*q)-(g[p]+p*p))/(2*(q-p));if(s<=z[k]&&k>0)k--;else break}if(s<=z[k]){v[k]=q;z[k]=-INF;z[k+1]=INF}else{k++;v[k]=q;z[k]=s;z[k+1]=INF}}
  if(k<0)return;let j=0;for(let q=0;q<n;q++){while(z[j+1]<q)j++;const dq=q-v[j];d[q]=dq*dq+g[v[j]]}for(let q=0;q<n;q++)f[off+q*st]=d[q]};
 for(let x=0;x<w;x++)pass(x,w,h);for(let y=0;y<h;y++)pass(y*w,1,w);for(let i=0;i<N;i++)out[i]=Math.sqrt(f[i]);return out}
function label4(free,w,h){const N=w*h,lab=new Int32Array(N),st=new Int32Array(N);let nl=0;for(let s=0;s<N;s++){if(!free[s]||lab[s])continue;nl++;let sp=0;st[sp++]=s;lab[s]=nl;
  while(sp){const c=st[--sp];const x=c%w,y=(c-x)/w;if(x>0&&free[c-1]&&!lab[c-1]){lab[c-1]=nl;st[sp++]=c-1}if(x<w-1&&free[c+1]&&!lab[c+1]){lab[c+1]=nl;st[sp++]=c+1}if(y>0&&free[c-w]&&!lab[c-w]){lab[c-w]=nl;st[sp++]=c-w}if(y<h-1&&free[c+w]&&!lab[c+w]){lab[c+w]=nl;st[sp++]=c+w}}}return{lab,nl}}
function b64i16(s){const b=atob(s);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Int16Array(u.buffer)}
function toB64(u8){let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s)}

/* ---------------- the field: the data window resampled sub times finer ---------------- */
function loadField(o){const sub=o.sub,nx=o.win.nx,ny=o.win.ny,gw=nx*sub,gh=ny*sub,cs=1/sub;const a0=b64i16(o.z0),a1=b64i16(o.z1);
 const up=a=>{const z=new Float32Array(gw*gh);for(let j=0;j<gh;j++){const y=Math.min(ny-1,(j+.5)*cs),r=Math.min(ny-2,Math.floor(y)),fy=y-r;for(let i=0;i<gw;i++){const x=Math.min(nx-1,(i+.5)*cs),c=Math.min(nx-2,Math.floor(x)),fx=x-c;const k=r*nx+c;
    z[j*gw+i]=o.zoff+((a[k]*(1-fx)+a[k+1]*fx)*(1-fy)+(a[k+nx]*(1-fx)+a[k+nx+1]*fx)*fy)/100}}return z};
 return{sub,cs,gw,gh,W:nx,H:ny,z0:up(a0),z1:up(a1),dl:new Float32Array(gw*gh),rid:new Int16Array(gw*gh).fill(-1)}}
function zAt(z,x,y){const f=F;const i=Math.max(0,Math.min(f.gw-1,Math.floor(x*f.sub))),j=Math.max(0,Math.min(f.gh-1,Math.floor(y*f.sub)));return z[j*f.gw+i]}
function shownZ(){const f=F,N=f.gw*f.gh,z=new Float32Array(N);if(S.show==='before'){z.set(f.z1);return z}
 if(S.show==='after'){for(let i=0;i<N;i++)z[i]=f.z1[i]+f.dl[i];return z}
 const sx=splitX()*f.sub;for(let j=0;j<f.gh;j++)for(let i=0;i<f.gw;i++){const c=j*f.gw+i;z[c]=f.z1[c]+(i>=sx?f.dl[c]:0)}return z}
function splitX(){const r=reg(S.sel);return r?r.cx:F.W/2}

/* ---------------- patterns grown in a region part, in the engine's units ---------------- */
function frameOf(ring){let cx=0,cy=0;ring.forEach(q=>{cx+=q[0];cy+=q[1]});cx/=ring.length;cy/=ring.length;let sxx=0,sxy=0,syy=0;ring.forEach(q=>{const dx=q[0]-cx,dy=q[1]-cy;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy});
 const th=.5*Math.atan2(2*sxy,sxx-syy),c=Math.cos(th),s=Math.sin(th);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;ring.forEach(q=>{const dx=q[0]-cx,dy=q[1]-cy;const u=dx*c+dy*s,v=-dx*s+dy*c;if(u<x0)x0=u;if(u>x1)x1=u;if(v<y0)y0=v;if(v>y1)y1=v});
 const sc=Math.min(900/Math.max(x1-x0,1e-6),560/Math.max(y1-y0,1e-6));
 return{th,sc,len:x1-x0,wid:y1-y0,fwd:q=>[50+((q[0]-cx)*c+(q[1]-cy)*s-x0)*sc,40+(-(q[0]-cx)*s+(q[1]-cy)*c-y0)*sc],inv:p=>{const u=(p[0]-50)/sc+x0,v=(p[1]-40)/sc+y0;return[cx+u*c-v*s,cy+u*s+v*c]}}}
function keyhole(outer,hole){if(Math.sign(area(hole))===Math.sign(area(outer)))hole=hole.slice().reverse();let bi=0,bj=0,bd=1e18;outer.forEach((a,i)=>hole.forEach((b,j)=>{const d=(a[0]-b[0])**2+(a[1]-b[1])**2;if(d<bd){bd=d;bi=i;bj=j}}));
 return outer.slice(0,bi+1).concat(hole.slice(bj),hole.slice(0,bj+1),outer.slice(bi))}
function insideRuns(poly,y,x0,x1,st){const runs=[];let a=null;for(let x=x0;x<=x1+1e-6;x+=st){const inn=inside(poly,x,y)&&!nearOutline(poly,x,y,4);if(inn&&a==null)a=x;if(!inn&&a!=null){runs.push([a,x-st]);a=null}}if(a!=null)runs.push([a,x1]);return runs}
function growPart(ring,holes,tex,n,v,ps){const fr=frameOf(ring);let poly=ring.map(fr.fwd);holes.forEach(h=>{poly=keyhole(poly,h.map(fr.fwd))});
 const A=Math.abs(area(poly));const r=rng(v.seed);const[bx0,by0,bx1,by1]=bbox(poly);const segs=[];let ncells=0;const vein=tex==='leaf'||tex==='radial';
 const push=(a,b,w1,w2)=>{const p=fr.inv(a),q=fr.inv(b);segs.push([p[0],p[1],q[0],q[1],(w1+w2)/2])};
 if(vein){const ns=Math.max(6,Math.round(n*v.vdens)),sp=Math.sqrt(A/ns);
  const p=Object.assign({},DEFAULTS,{shape:'region',mode:'closed',seed:v.seed,nde:0,tipb:0,costb:0,nsrc:ns,birth:.58*sp,kill:.25*sp,step:Math.max(1.2,.17*sp*Math.min(3,Math.max(.2,ps))),iters:200,ana:.4*sp});/* ps: pattern scale over the pitch from the cell count */
  let res;
  if(tex==='leaf'){/* veins start from the long axis: the longest run of the mid line that lies inside the part */
   let best=null;[.5,.4,.6,.3,.7].some(f=>{const y=by0+f*(by1-by0);insideRuns(poly,y,bx0,bx1,4).forEach(q=>{if(!best||q[1]-q[0]>best[1]-best[0])best=[q[0],q[1],y]});return best&&best[1]-best[0]>.5*(bx1-bx0)});
   if(best&&best[1]-best[0]>p.step*3)res=grow(p,poly,r,[{pts:[[best[0],best[2]],[best[1],best[2]]]}]);}
  if(!res){/* radial: one root at the point of the part farthest from its edge */let bp=null,bd=-1;for(let k=0;k<400;k++){const x=bx0+(k%20+.5)/20*(bx1-bx0),y=by0+(Math.floor(k/20)+.5)/20*(by1-by0);if(!inside(poly,x,y))continue;let d=1e9;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];d=Math.min(d,distSeg(x,y,a[0],a[1],b[0],b[1]))}if(d>bd){bd=d;bp=[x,y]}}
   if(!bp)return{segs,ncells:0};p.wingRootStep=1;res=grow(p,poly,r,null,{wingRoot:[bp[0]-16,bp[1]]})}
  const N=res.nodes;const ws=N.map(q=>q.w).sort((a,b)=>a-b);const top=Math.max(1e-6,ws[Math.min(ws.length-1,Math.floor(ws.length*.995))]);const wn=i=>Math.min(1,N[i].w/top);
  N.forEach((q,i)=>{if(q.p>=0)push([q.x,q.y],[N[q.p].x,N[q.p].y],wn(i),wn(q.p))});res.links.forEach(l=>push([N[l[0]].x,N[l[0]].y],[N[l[1]].x,N[l[1]].y],.1,.1));res.fixedEdges.forEach(l=>push([N[l[0]].x,N[l[0]].y],[N[l[1]].x,N[l[1]].y],1,1));ncells=ns}
 else{const p=Object.assign({},DEFAULTS,{shape:'region',mode:'cells',seed:v.seed,ncell:Math.max(3,n),grad:v.grad,costal:0,lloyd:v.lloyd});
  const c=cells(p,poly,r,null,{frame:null,fixed:null,mmPerU:1,preset:PRESETS.none});const ar=c.polys.map(q=>Math.abs(area(q)));const big=ar.slice().sort((a,b)=>a-b)[Math.floor(ar.length*.8)]||0;
  c.polys.forEach((q,ci)=>{const w=(tex==='cells'&&ar[ci]>=big)?.55:.12;for(let i=0;i<q.length;i++)push(q[i],q[(i+1)%q.length],w,w)});ncells=c.polys.length;
  if(tex==='wing'){/* long veins along the long axis, as the named veins of a wing run along the span */[[.5,1],[.27,.7],[.73,.7]].forEach(([f,w])=>{const y=by0+f*(by1-by0);insideRuns(poly,y,bx0,bx1,4).forEach(q=>{if(q[1]-q[0]>12)push([q[0],y],[q[1],y],w,w)})})}}
 return{segs,ncells,len:fr.len,wid:fr.wid,th:fr.th}}
function seededOn(R,rs){return!!(R.seeds&&rs.tex==='cells'&&+rs.v.n===R.seeds.length)}
function patternOf(R,rs){const v=rs.v;const key=[rs.tex,v.n,v.seed,v.vdens,v.grad,v.lloyd,v.pscale].join('|');if(R._pk===key)return R._pat;
 const areas=R.parts.map(p=>Math.abs(area(p)));const tot=areas.reduce((a,b)=>a+b,0)||1;const segs=[];let nc=0;const t0=performance.now();const ps=v.pscale/Math.max(.01,Math.sqrt(R.area_m2/Math.max(1,v.n)));
 if(seededOn(R,rs)){/* one cell per seed (a paddy pool run: one per pool): the walls are the Voronoi edges between the seeds */let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;R.parts.forEach(p=>p.forEach(q=>{x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1])}));
  const vor=d3.Delaunay.from(R.seeds).voronoi([x0-1,y0-1,x1+1,y1+1]);R.seeds.forEach((q,i)=>{const c=vor.cellPolygon(i);if(!c)return;for(let k=0;k+1<c.length;k++)segs.push([c[k][0],c[k][1],c[k+1][0],c[k+1][1],.55])});
  R._pk=key;R._pat={segs,ncells:R.seeds.length,seeded:true,ms:Math.round(performance.now()-t0)};return R._pat}
 R.parts.forEach((ring,pi)=>{if(ring.length<3)return;const holes=R.holes.filter(h=>inside(ring,h[0][0],h[0][1]));const n=Math.max(3,Math.round(v.n*areas[pi]/tot));
  try{const g=growPart(ring,holes,rs.tex,n,v,ps);g.segs.forEach(s=>segs.push(s));nc+=g.ncells}catch(e){console.warn('pattern failed on a part of '+R.id,e)}});
 R._pk=key;R._pat={segs,ncells:nc,ms:Math.round(performance.now()-t0)};return R._pat}

/* ---------------- the four VS08 rules on the region raster, then falloff, topo blend, overlap ---------------- */
let scratch=null;
function regionRaster(R){if(R._ras)return R._ras;const f=F,sub=f.sub;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;R.parts.forEach(p=>p.forEach(q=>{if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1]}));
 const i0=Math.max(0,Math.floor(x0*sub)-2),j0=Math.max(0,Math.floor(y0*sub)-2),i1=Math.min(f.gw-1,Math.ceil(x1*sub)+2),j1=Math.min(f.gh-1,Math.ceil(y1*sub)+2);const w=i1-i0+1,h=j1-j0+1;
 if(!scratch)scratch=document.createElement('canvas');scratch.width=w;scratch.height=h;const c=scratch.getContext('2d',{willReadFrequently:true});c.setTransform(sub,0,0,sub,-i0,-j0);c.fillStyle='#fff';
 const path=p=>{c.beginPath();p.forEach((q,k)=>k?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));c.closePath();c.fill()};R.parts.forEach(path);c.globalCompositeOperation='destination-out';R.holes.forEach(path);c.globalCompositeOperation='source-over';
 const im=c.getImageData(0,0,w,h).data;const ins=new Uint8Array(w*h),out=new Uint8Array(w*h);let n=0,sx=0,sy=0;for(let k=0;k<w*h;k++){if(im[k*4+3]>127){ins[k]=1;n++;sx+=k%w;sy+=(k-k%w)/w}else out[k]=1}
 const dE=edt(out,w,h);for(let k=0;k<w*h;k++)dE[k]*=f.cs;let dmax=0;for(let k=0;k<w*h;k++)if(ins[k]&&dE[k]>dmax)dmax=dE[k];
 R.cx=(i0+sx/Math.max(1,n))*f.cs;R.cy=(j0+sy/Math.max(1,n))*f.cs;R._ras={i0,j0,w,h,ins,dE,n,dmax};return R._ras}
function regionDelta(R){const f=F,rs=S.R[R.id],v=rs.v,ras=regionRaster(R),{i0,j0,w,h,ins,dE}=ras,N=w*h,cs=f.cs;const pat=patternOf(R,rs);
 const mk=[null,new Uint8Array(N),new Uint8Array(N),new Uint8Array(N)],wsum=[0,0,0,0],cnt=[0,0,0,0];const t1=v.vo,t2=v.vo/2;
 pat.segs.forEach(s=>{const o=s[4]>=t1?1:s[4]>=t2?2:3;const ax=s[0]*f.sub-i0,ay=s[1]*f.sub-j0,bx=s[2]*f.sub-i0,by=s[3]*f.sub-j0;const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)*2));
  let lx=-1,ly=-1;for(let k=0;k<=n;k++){const x=Math.floor(ax+(bx-ax)*k/n),y=Math.floor(ay+(by-ay)*k/n);if(x>=0&&y>=0&&x<w&&y<h){mk[o][y*w+x]=1;if(lx>=0&&x!==lx&&y!==ly)mk[o][y*w+lx]=1/* keep the line 4-connected so fields do not leak across it */;lx=x;ly=y}else lx=-1}wsum[o]+=s[4];cnt[o]++});
 const pitch=Math.sqrt(R.area_m2/Math.max(1,v.n));const kmm=v.pscale/4.2;/* metres per tile millimetre: the VS08 tiles hold a cell about every 4.2 mm; the pattern scale is that cell on the ground */
 const dC=[null,null,null,null];for(let o=1;o<=3;o++)if(cnt[o]){dC[o]=edt(mk[o],w,h);for(let k=0;k<N;k++)dC[o][k]*=cs/kmm}
 const dany=new Float32Array(N).fill(1e6);for(let o=1;o<=3;o++)if(dC[o])for(let k=0;k<N;k++)if(dC[o][k]<dany[k])dany[k]=dC[o][k];const dprim=dC[1]||dany;
 const hN=new Float32Array(N);const typ=rs.typ;let info={};
 if(typ==='berm'){for(let k=0;k<N;k++){if(!ins[k])continue;let best=0;for(let o=1;o<=3;o++){if(!dC[o])continue;const wn=wsum[o]/cnt[o];const run=Math.max(dC[o][k]-(.6+1.2*wn)*v.vw*v.k1,0)*kmm;/* metres beyond the crest */const z=(3+15*Math.pow(wn,.7))/18-run/(v.k2*Math.max(v.gain,1e-6));if(z>best)best=z}hN[k]=Math.min(1,best)}}
 else if(typ==='terr'){/* VS08: tread 3 mm, riser 2 mm, nine steps in the tile. Here the nine steps span the region: tread = farthest distance from a primary vein / 9 */let dm=0;for(let k=0;k<N;k++)if(ins[k]&&dprim[k]<1e5&&dprim[k]>dm)dm=dprim[k];const tread=Math.max(1e-6,v.k1*dm/9);info.tread=tread*kmm;info.steps=0;
  for(let k=0;k<N;k++)if(ins[k]){const st=Math.floor(dprim[k]/tread);if(st>info.steps)info.steps=st;hN[k]=-Math.min(1,v.k2*st/9)}}
 else{const free=new Uint8Array(N),blk=new Uint8Array(N);for(let k=0;k<N;k++){if(ins[k]&&dany[k]>=.45*v.vw)free[k]=1;else blk[k]=1}const L=label4(free,w,h);const e=edt(blk,w,h);const em=new Float32Array(L.nl+1);
  for(let k=0;k<N;k++){e[k]*=cs/kmm;const l=L.lab[k];if(l&&e[k]>em[l])em[l]=e[k]}
  for(let k=0;k<N;k++){const l=L.lab[k];if(!l)continue;const m=Math.max(em[l],1e-6),u=Math.min(1,e[k]/m);const A=typ==='wave'?Math.max(1,Math.min(17,3.2*m*v.k1))/17:-Math.max(1,Math.min(16,3.2*m*v.k1))/16;hN[k]=A*(1-Math.cos(Math.PI*u))/2}info.cells=L.nl}
 if(typ!=='terr'){const t=new Float32Array(hN);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=y*w+x;if(!ins[k])continue;hN[k]=(4*t[k]+t[k-1]+t[k+1]+t[k-w]+t[k+w])/8}}
 {let pk=0;for(let k=0;k<N;k++){const a=Math.abs(hN[k]);if(a>pk)pk=a}if(pk>0&&typ!=='terr')for(let k=0;k<N;k++)hN[k]/=pk}/* relief gain is the greatest height of the pattern */
 const sg=+v.dir?-1:1;let sum=0,n=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;if(ins[k]){sum+=f.z1[(j0+y)*f.gw+i0+x];n++}}const datum=sum/Math.max(1,n);
 const d=new Float32Array(N);let mx=0,mn=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;if(!ins[k])continue;const Sg=f.z1[(j0+y)*f.gw+i0+x];const hh=sg*hN[k]*v.gain;const wt=v.fade>0?fall(Math.min(1,dE[k]/v.fade),v.fo):1;
   const T=(1-v.tb)*(datum+hh)+v.tb*(Sg+hh);let C=Sg+wt*(T-Sg);if(+v.ov===1)C=Math.max(Sg,C);else if(+v.ov===2)C=Math.min(Sg,C);d[k]=C-Sg;if(d[k]>mx)mx=d[k];if(d[k]<mn)mn=d[k]}
 R._d=d;R.stat={max:mx,min:mn,largest:Math.max(mx,-mn),pitch,pscale:v.pscale,seeded:!!pat.seeded,narrow:isNarrow(R),kmm,datum,veinSegs:pat.segs.length,patCells:pat.ncells,labels:info.cells||null,tread:info.tread||null,steps:info.steps||null,ms:pat.ms};return R.stat}
function composeDelta(){const f=F;f.dl.fill(0);f.rid.fill(-1);O.regions.forEach((R,ri)=>{const r=R._ras;if(!r||!R._d)return;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){const k=y*r.w+x;if(!r.ins[k])continue;const c=(r.j0+y)*f.gw+r.i0+x;f.dl[c]+=R._d[k];f.rid[c]=ri}})}

/* ---------------- state per region ---------------- */
function isNarrow(R){const r=regionRaster(R);return 2*r.dmax<NARROW_M}
const reg=id=>O&&O.regions.find(r=>r.id===id);
function defState(R){const k=kdef(R);const v={};const t={kind:R.kind,area_m2:R.area_m2,typ:k.typ,dn:k.n,dmax:R._ras?R._ras.dmax:0};PARAMS.forEach(p=>v[p.id]=p.def(t));return{study:null,tex:k.tex,typ:k.typ,v}}
function defVal(R,id){const p=PARAMS.find(q=>q.id===id);return p.def({kind:R.kind,area_m2:R.area_m2,typ:S.R[R.id].typ,dn:kdef(R).n,dmax:R._ras?R._ras.dmax:0})}
function changed(R){const rs=S.R[R.id],k=kdef(R);const out=[];if(rs.tex!==k.tex)out.push({id:'tex',label:'texture',v:TEX[rs.tex].name,was:TEX[k.tex].name,g:'g_top'});if(rs.typ!==k.typ)out.push({id:'typ',label:'typology',v:TYP[rs.typ].name,was:TYP[k.typ].name,g:'g_top'});
 PARAMS.forEach(p=>{if(p.when&&!p.when(rs))return;const d=defVal(R,p.id);if(+rs.v[p.id]!==+d)out.push({id:p.id,label:typeof p.label==='function'?p.label(rs):p.label,v:show(p,rs.v[p.id],rs),was:show(p,d,rs),g:p.g})});return out}
function show(p,val,rs){if(p.sel){const o=typeof p.sel==='function'?p.sel(rs):p.sel;return o[+val]}if(p.unit==='m')return mft(+val);return String(+(+val).toFixed(3))}

/* ---------------- WebGL drawing ---------------- */
function glInit(){const cv=$('gl');const gl=cv.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});if(!gl){$('cap').textContent='This browser has no WebGL 2; the viewer cannot draw.';return null}
 const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
 const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,'#version 300 es\nin vec3 p;in vec4 c;uniform vec4 r;uniform vec4 s;uniform vec3 ctr;uniform float lift;out vec4 vc;void main(){vec3 q=vec3(p.x-ctr.x,-(p.y-ctr.y),(p.z-ctr.z)*s.z+lift);float x1=q.x*r.x-q.y*r.y,y1=q.x*r.y+q.y*r.x;gl_Position=vec4(x1*s.x+s.w*0.0,(y1*r.w+q.z*r.z)*s.y,-(q.z*r.w-y1*r.z)*0.0005,1.0);vc=c;}'));
 gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,'#version 300 es\nprecision mediump float;in vec4 vc;out vec4 o;void main(){o=vc;}'));gl.bindAttribLocation(pr,0,'p');gl.bindAttribLocation(pr,1,'c');gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
 return{gl,cv,pr,u:n=>gl.getUniformLocation(pr,n),mesh:{},lines:{}}}
function hillshade(z){const f=F,gw=f.gw,gh=f.gh,cs=f.cs,sh=new Uint8Array(gw*gh*4);const ex=2.5;const lx=-.55,ly=-.55,lz=.63;const selI=O.regions.findIndex(r=>r.id===S.sel);/* light from the north-west, shading at 2.5x for legibility */
 for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){const c=j*gw+i;const xa=i>0?c-1:c,xb=i<gw-1?c+1:c,ya=j>0?c-gw:c,yb=j<gh-1?c+gw:c;const gx=(z[xb]-z[xa])/((xb-xa)*cs)*ex,gy=(z[yb]-z[ya])/(((yb-ya)/gw)*cs)*ex;const nl=Math.hypot(gx,gy,1);
   let s=Math.max(0,(-gx*lx-gy*ly+lz)/nl);s=Math.max(0,(s-.38)/.62);const ri=f.rid[c];const a=.035+.42*s+(ri<0?0:ri===selI?.085:.025);sh[c*4]=Math.round(255*Math.min(1,a*.62));sh[c*4+1]=Math.round(255*Math.min(1,a*.66));sh[c*4+2]=Math.round(255*Math.min(1,a*.86+.02));sh[c*4+3]=255}return sh}
function contourSegs(z,lv0,step,one){const f=F,gw=f.gw,gh=f.gh,cs=f.cs;const out=[];const ip=(a,b,L)=>(L-a)/(b-a);
 for(let j=0;j<gh-1;j++)for(let i=0;i<gw-1;i++){const c=j*gw+i;const a=z[c],b=z[c+1],d=z[c+gw],e=z[c+gw+1];const lo=Math.min(a,b,d,e),hi=Math.max(a,b,d,e);let k0,k1;if(one!=null){if(one<lo||one>=hi)continue;k0=k1=0}else{k0=Math.ceil((lo-lv0)/step);k1=Math.floor((hi-lv0)/step);if(k1<k0)continue}
   for(let k=k0;k<=k1;k++){const L=one!=null?one:lv0+k*step;if(L===hi)continue;const P=[];const x=(i+.5)*cs,y=(j+.5)*cs;
    if((a<L)!==(b<L))P.push(x+ip(a,b,L)*cs,y);if((b<L)!==(e<L))P.push(x+cs,y+ip(b,e,L)*cs);if((d<L)!==(e<L))P.push(x+ip(d,e,L)*cs,y+cs);if((a<L)!==(d<L))P.push(x,y+ip(a,d,L)*cs);
    for(let q=0;q+3<P.length;q+=4)out.push(P[q],P[q+1],P[q+2],P[q+3],L,one!=null?0:k)}}return out}
function buildScene(){const g=GLS;if(!g)return;const gl=g.gl,f=F,gw=f.gw,gh=f.gh,cs=f.cs;const z=shownZ();F.zs=z;let zmin=1e9,zmax=-1e9;for(let i=0;i<z.length;i++){if(z[i]<zmin)zmin=z[i];if(z[i]>zmax)zmax=z[i]}F.zmin=zmin;F.zmax=zmax;
 const pos=new Float32Array(gw*gh*3);for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){const c=j*gw+i;pos[c*3]=(i+.5)*cs;pos[c*3+1]=(j+.5)*cs;pos[c*3+2]=z[c]}
 const buf=(o,k,data,tgt,usage)=>{if(!o[k])o[k]=gl.createBuffer();gl.bindBuffer(tgt||gl.ARRAY_BUFFER,o[k]);gl.bufferData(tgt||gl.ARRAY_BUFFER,data,usage||gl.DYNAMIC_DRAW)};
 buf(g.mesh,'p',pos);buf(g.mesh,'c',hillshade(z));
 if(g.mesh.key!==gw+'x'+gh){const idx=new Uint32Array((gw-1)*(gh-1)*6);let q=0;for(let j=0;j<gh-1;j++)for(let i=0;i<gw-1;i++){const c=j*gw+i;idx[q++]=c;idx[q++]=c+gw;idx[q++]=c+1;idx[q++]=c+1;idx[q++]=c+gw;idx[q++]=c+gw+1}buf(g.mesh,'i',idx,gl.ELEMENT_ARRAY_BUFFER,gl.STATIC_DRAW);g.mesh.n=idx.length;g.mesh.key=gw+'x'+gh}
 /* lines: contours, element outlines, region outlines, water level lines, the section line */
 const LP=[],LC=[];const seg=(x1,y1,z1,x2,y2,z2,col)=>{LP.push(x1,y1,z1,x2,y2,z2);LC.push(col[0],col[1],col[2],col[3],col[0],col[1],col[2],col[3])};
 const cs_=contourSegs(z,0,S.ci);F.contours=cs_;for(let q=0;q<cs_.length;q+=6){const idx5=((cs_[q+5]%5)+5)%5===0;seg(cs_[q],cs_[q+1],cs_[q+4],cs_[q+2],cs_[q+3],cs_[q+4],idx5?[221,222,228,210]:[150,152,176,105])}
 const drape=(p,closed,col,lift)=>{const n=p.length;for(let k=0;k<(closed?n:n-1);k++){const a=p[k],b=p[(k+1)%n];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const m=Math.max(1,Math.ceil(L/(cs*2)));for(let t=0;t<m;t++){const x1=a[0]+(b[0]-a[0])*t/m,y1=a[1]+(b[1]-a[1])*t/m,x2=a[0]+(b[0]-a[0])*(t+1)/m,y2=a[1]+(b[1]-a[1])*(t+1)/m;seg(x1,y1,zAt(z,x1,y1)+lift,x2,y2,zAt(z,x2,y2)+lift,col)}}};
 O.outlines.forEach(e=>{if(!e.under)drape(e.p,!e.line,[84,94,146,255],.03)});
 O.regions.forEach(R=>{const on=R.id===S.sel;const col=on?[255,255,255,255]:[160,162,186,190];R.parts.forEach(p=>drape(p,true,col,on?.09:.06));R.holes.forEach(p=>drape(p,true,col,on?.09:.06))});
 F.levelSegs={};O.levels.forEach(l=>{if(!S.lv[l.k])return;const w=contourSegs(z,0,1,l.z);F.levelSegs[l.k]=w;for(let q=0;q<w.length;q+=6)seg(w[q],w[q+1],l.z+.04,w[q+2],w[q+3],l.z+.04,[159,200,240,255])});
 if(S.plines&&S.show!=='before'){const R=reg(S.sel);if(R&&R._pat){const col=[240,190,120,235];R._pat.segs.forEach(q=>{const a=[q[0],q[1]],b=[q[2],q[3]];if(F.rid[Math.min(f.gh-1,Math.max(0,Math.floor((a[1]+b[1])/2*f.sub)))*f.gw+Math.min(f.gw-1,Math.max(0,Math.floor((a[0]+b[0])/2*f.sub)))]<0)return;drape([a,b],false,col,.08)})}}/* the pattern of the selected region as hairlines on the surface */
 const cl=cutLine();if(cl)drape([cl.a,cl.b],false,[221,222,228,255],.25);
 if(S.show==='split'){const sx=splitX();drape([[sx,0],[sx,f.H-.01]],false,[230,222,255,255],.3)}
 buf(g.lines,'p',new Float32Array(LP));buf(g.lines,'c',new Uint8Array(LC));g.lines.n=LP.length/3;draw()}
function viewParams(){const g=GLS,f=F;const cw=g.cv.width,ch=g.cv.height;const az=(S.view==='plan'?0:S.az)*Math.PI/180,el=(S.view==='plan'?90:S.el)*Math.PI/180;const diag=Math.hypot(f.W,f.H);
 const base=S.view==='plan'?Math.min(cw/f.W,ch/f.H)*.96:Math.min(cw,ch)/diag*1.08;const k=base*S.zoom;return{az,el,k,cw,ch,ctr:[f.W/2,f.H/2,S.zc!=null?S.zc:(F.zmin+F.zmax)/2]}}
function draw(){const g=GLS;if(!g||!g.mesh.n)return;const gl=g.gl;const cv=g.cv;const dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(2,Math.round(cv.clientWidth*dpr)),h=Math.max(2,Math.round(cv.clientHeight*dpr));if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
 const P=viewParams();gl.viewport(0,0,w,h);gl.clearColor(7/255,9/255,14/255,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(g.pr);
 gl.uniform4f(g.u('r'),Math.cos(P.az),Math.sin(P.az),Math.cos(P.el),Math.sin(P.el));gl.uniform4f(g.u('s'),2*P.k/w,2*P.k/h,S.ve,0);gl.uniform3f(g.u('ctr'),P.ctr[0]-S.pan[0],P.ctr[1]-S.pan[1],P.ctr[2]);
 const bind=(o,n)=>{gl.bindBuffer(gl.ARRAY_BUFFER,o.p);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,o.c);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.UNSIGNED_BYTE,true,0,0)};
 gl.uniform1f(g.u('lift'),0);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.5,2);bind(g.mesh);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.mesh.i);gl.drawElements(gl.TRIANGLES,g.mesh.n,gl.UNSIGNED_INT,0);gl.disable(gl.POLYGON_OFFSET_FILL);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1f(g.u('lift'),.02);bind(g.lines);gl.drawArrays(gl.LINES,0,g.lines.n);gl.disable(gl.BLEND)}
/* a model point to canvas CSS pixels and a depth (greater = nearer the eye) */
function project(x,y,z){const P=viewParams();const qx=x-(P.ctr[0]-S.pan[0]),qy=-(y-(P.ctr[1]-S.pan[1])),qz=(z-P.ctr[2])*S.ve;const x1=qx*Math.cos(P.az)-qy*Math.sin(P.az),y1=qx*Math.sin(P.az)+qy*Math.cos(P.az);const r=GLS.cv.clientWidth/P.cw;
 return[(P.cw/2+x1*P.k)*r,(P.ch/2-(y1*Math.sin(P.el)+qz*Math.cos(P.el))*P.k)*r,qz*Math.sin(P.el)-y1*Math.cos(P.el)]}
function pick(px,py){const f=F;let best=-1,bd=-1e9;const st=Math.max(1,Math.round(f.sub/2));for(let j=0;j<f.gh;j+=st)for(let i=0;i<f.gw;i+=st){const c=j*f.gw+i;const ri=f.rid[c];if(ri<0)continue;const q=project((i+.5)*f.cs,(j+.5)*f.cs,f.zs[c]);if(Math.abs(q[0]-px)<5&&Math.abs(q[1]-py)<5&&q[2]>bd){bd=q[2];best=ri}}return best}

/* ---------------- section ---------------- */
function cutLine(){const f=F;const R=reg(S.sel);let a,b,name;const pc=O.cuts.find(c=>c.name===S.cut);
 if(pc){a=pc.a;b=pc.b;name=pc.name}else if(R){const fr=frameOf(R.parts.reduce((m,p)=>m.concat(p),[]));const along=S.cut==='along';const th=fr.th+(along?0:Math.PI/2);const L=(along?fr.len:fr.wid)/2+12;a=[R.cx-Math.cos(th)*L,R.cy-Math.sin(th)*L];b=[R.cx+Math.cos(th)*L,R.cy+Math.sin(th)*L];if(a[0]>b[0]){const t=a;a=b;b=t}
   name=(along?'along':'across')+' '+R.name+' (through its centre, '+(along?'long':'short')+' axis)'}else return null;
 /* clip to the window */let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];const cl=(p,q)=>{if(Math.abs(p)<1e-12)return q>=0;const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r}else{if(r<t0)return false;if(r<t1)t1=r}return true};
 if(!(cl(-dx,a[0])&&cl(dx,f.W-.01-a[0])&&cl(-dy,a[1])&&cl(dy,f.H-.01-a[1])))return null;return{a:[a[0]+dx*t0,a[1]+dy*t0],b:[a[0]+dx*t1,a[1]+dy*t1],name}}
function autoCut(){const R=reg(S.sel);if(!R)return'across';const hit=O.cuts.find(c=>{for(let t=0;t<=1;t+=.004){const x=c.a[0]+(c.b[0]-c.a[0])*t,y=c.a[1]+(c.b[1]-c.a[1])*t;if(x<0||y<0||x>=F.W||y>=F.H)continue;const ri=F.rid[Math.floor(y*F.sub)*F.gw+Math.floor(x*F.sub)];if(ri>=0&&O.regions[ri].id===R.id)return true}return false});return hit?hit.name:'across'}
function sectionSVG(wpx,hpx){const f=F,cl=cutLine();if(!cl)return'<svg xmlns="http://www.w3.org/2000/svg" width="'+wpx+'" height="'+hpx+'"><text x="20" y="40" fill="#dddee4" font-family="IBM Plex Mono" font-size="16">no section line in this window</text></svg>';
 const L=Math.hypot(cl.b[0]-cl.a[0],cl.b[1]-cl.a[1]),n=Math.max(2,Math.round(L/f.cs));const X=[],E=[],D=[],T=[],RI=[];let lo=1e9,hi=-1e9;
 for(let k=0;k<=n;k++){const x=cl.a[0]+(cl.b[0]-cl.a[0])*k/n,y=cl.a[1]+(cl.b[1]-cl.a[1])*k/n;const c=Math.min(f.gh-1,Math.floor(y*f.sub))*f.gw+Math.min(f.gw-1,Math.floor(x*f.sub));X.push(L*k/n);E.push(f.z0[c]);D.push(f.z1[c]);T.push(f.z1[c]+f.dl[c]);RI.push(f.rid[c]);lo=Math.min(lo,f.z0[c],f.z1[c],f.z1[c]+f.dl[c]);hi=Math.max(hi,f.z0[c],f.z1[c],f.z1[c]+f.dl[c])}
 const VE=S.sve;const lv=O.levels.filter(l=>S.lv[l.k]);const kw=Math.round(Math.min(400,Math.max(250,wpx*.33)));const pad={l:20,r:kw+16,t:72,b:112};const pw=wpx-pad.l-pad.r,ph=hpx-pad.t-pad.b;const sc=Math.min(pw/L,ph/((hi-lo+1)*VE));const ox=pad.l+(pw-L*sc)/2,oy=pad.t+ph-(ph-(hi-lo+1)*VE*sc)/2;
 const px=x=>(ox+x*sc).toFixed(1),py=z=>(oy-(z-lo+.5)*VE*sc).toFixed(1);const path=A=>A.map((z,k)=>(k?'L':'M')+px(X[k])+' '+py(z)).join('');
 let s='<svg xmlns="http://www.w3.org/2000/svg" width="'+wpx+'" height="'+hpx+'" viewBox="0 0 '+wpx+' '+hpx+'" font-family="\'IBM Plex Mono\',monospace" font-size="16"><rect width="100%" height="100%" fill="#07090e"/>';
 s+='<text x="'+pad.l+'" y="26" fill="#dddee4" font-size="19">Section '+esc(cl.name)+'</text><text x="'+pad.l+'" y="48" fill="#8b8ba3">'+esc(O.name)+' · length '+mft(L,1)+' · vertical exaggeration '+VE+'x</text>';
 const LVD=['5 0','8 4','2 3','12 4 2 4'];const lvs=[];lv.forEach((l,i)=>{if(l.z<lo-1||l.z>hi+2)return;const da=LVD[lvs.length%LVD.length];lvs.push([l,da]);s+='<line x1="'+px(0)+'" x2="'+px(L)+'" y1="'+py(l.z)+'" y2="'+py(l.z)+'" stroke="#9fc8f0" stroke-width="1" stroke-dasharray="'+da+'"/>'});
 s+='<path d="'+path(E)+'" fill="none" stroke="#8b8ba3" stroke-width="1" stroke-dasharray="5 4"/><path d="'+path(D)+'" fill="none" stroke="#b0b0c1" stroke-width="1.2"/>';
 if(S.show!=='before')s+='<path d="'+path(T)+'" fill="none" stroke="#ffffff" stroke-width="1.6"/>';
 let run=null,mi=0;const mark=(a,b,ri)=>{const R=O.regions[ri];const y=oy+14;const ty=y+18+(mi++%3)*18;s+='<line x1="'+px(X[a])+'" x2="'+px(X[b])+'" y1="'+y+'" y2="'+y+'" stroke="'+(R.id===S.sel?'#e6deff':'#8b8ba3')+'" stroke-width="3"/><text x="'+px((X[a]+X[b])/2)+'" y="'+ty+'" fill="'+(R.id===S.sel?'#ffffff':'#8b8ba3')+'" text-anchor="middle">'+esc(R.id)+'</text>'};
 for(let k=0;k<=n;k++){if(run&&RI[k]!==run[1]){mark(run[0],k-1,run[1]);run=null}if(!run&&RI[k]>=0)run=[k,RI[k]]}if(run)mark(run[0],n,run[1]);
 const bar=[5,10,20,50,100].find(v=>v*sc>60)||100;const by=hpx-22;s+='<line x1="'+pad.l+'" x2="'+(pad.l+bar*sc).toFixed(1)+'" y1="'+by+'" y2="'+by+'" stroke="#dddee4" stroke-width="2"/><text x="'+(pad.l+bar*sc+8).toFixed(1)+'" y="'+(by+5)+'" fill="#dddee4">'+bar+' m ('+(bar*FT).toFixed(0)+' ft) horizontal · '+(bar/VE).toFixed(1)+' m ('+(bar/VE*FT).toFixed(1)+' ft) vertical</text>';
 /* the key at the side: nothing crosses the profile */const kx=wpx-kw;const cpl=Math.max(14,Math.floor((kw-50)/9.7));const wrapT=t=>{const o=[];let c='';String(t).split(' ').forEach(w=>{const n=(c+' '+w).trim();if(n.length<=cpl||!c)c=n;else{o.push(c);c=w}});if(c)o.push(c);return o};
  let ky=pad.t+4;s+='<g font-size="16"><line x1="'+(kx-8)+'" x2="'+(kx-8)+'" y1="'+pad.t+'" y2="'+(hpx-pad.b+40)+'" stroke="#2c3150"/>';const item=(stroke,dash,wid,txt,col)=>{s+='<line x1="'+kx+'" x2="'+(kx+34)+'" y1="'+(ky-5)+'" y2="'+(ky-5)+'" stroke="'+stroke+'" stroke-width="'+wid+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';wrapT(txt).forEach(t=>{s+='<text x="'+(kx+42)+'" y="'+ky+'" fill="'+col+'">'+esc(t)+'</text>';ky+=19});ky+=6};
  item('#8b8ba3','5 4',1,'Existing Grade (before landform)','#8b8ba3');item('#b0b0c1','',1.2,'Landform Sequence as designed','#b0b0c1');if(S.show!=='before')item('#fff','',1.6,'with the venation texture','#fff');lvs.forEach(([l,da])=>item('#9fc8f0',da,1,l.name,'#9fc8f0'));s+='</g>';
 return s+'</svg>'}
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------------- caption and readouts ---------------- */
function studyTxt(rs){return studyOf(rs)+' · '+TEX[rs.tex].name+' ('+TEX[rs.tex].src+') · '+TYP[rs.typ].name}
function captionParts(){const R=reg(S.sel),rs=R&&S.R[R.id];const showTxt={after:'Landform Sequence with the venation texture',before:'Landform Sequence as designed (before the texture)',split:'split: as designed west of the line, with the texture east of it'}[S.show];
 const a=[O.name];if(R){a.push(R.name+' ['+R.id+', '+R.kind+']');a.push(studyTxt(rs));a.push('cell count '+rs.v.n);a.push('relief gain '+mft(+rs.v.gain));a.push('largest change '+mft(R.stat?R.stat.largest:0))}
 a.push('vertical exaggeration '+(S.view==='section'?S.sve+'x (section)':S.ve+'x'));const b=[showTxt,S.view==='plan'?'plan':S.view==='axon'?'axon':'section','contour interval '+mft(S.ci)+', every fifth line heavier'];if(O.ground_note)b.push(O.ground_note);return{line1:a.join(' · '),line2:b.join(' · ')}}
function caption(){const c=captionParts();$('cap').innerHTML='<div class="c1">'+esc(c.line1)+'</div><div class="c2">'+esc(c.line2)+'</div>'}

/* ---------------- controls ---------------- */
function row(id,label,hint){return'<div class="row" id="row_'+id+'"><label for="'+id+'">'+esc(label)+'</label><input type="number" id="'+id+'_n"><input type="range" id="'+id+'"><span class="was" id="was_'+id+'"></span><span class="hint">'+esc(hint||'')+'</span></div>'}
function selrow(id,label,hint){return'<div class="row" id="row_'+id+'"><label for="'+id+'">'+esc(label)+'</label><select id="'+id+'"></select><span class="was" id="was_'+id+'"></span><span class="hint">'+esc(hint||'')+'</span></div>'}
function buildRail(){const grp=(id,title,body,open,nr)=>'<details class="grp" id="'+id+'"'+(open?' open':'')+(nr?' data-noreset':'')+'><summary>'+esc(title)+'</summary><div class="body">'+body+'</div></details>';
 const pr=g=>PARAMS.filter(p=>p.g===g).map(p=>p.sel?selrow('p_'+p.id,'',p.hint):row('p_'+p.id,'',p.hint)).join('');
 let mx='<table class="mx" id="mx"><tr><th></th>'+TYPS.map(t=>'<th>'+esc(t.name)+'</th>').join('')+'</tr>'+TEXS.map((t,i)=>'<tr><th>'+esc(t.name)+'</th>'+TYPS.map((y,j)=>{const s=STUDIES[i*4+j];return'<td><button type="button" class="st" data-s="'+s.id+'" title="'+s.id+': '+t.name+' ('+t.src+') with '+y.name+'">'+s.id.slice(5)+'</button></td>'}).join('')+'</tr>').join('')+'</table><div class="hint">VS08 study: the number is the study, VS08-01 to VS08-16. Row: texture. Column: typology.</div>';
 const h=grp('g_obs','Observatory and region',selrow('s_obs','Observatory')+'<div class="links"><a id="l_kod" target="_blank" rel="noopener">Kodamas v18 page of this Observatory</a><a id="l_land" target="_blank" rel="noopener" href="https://laserpirate.github.io/venation/land.html">Venation Land page</a></div><div id="rlist" class="rlist"></div><div class="btns"><button type="button" id="b_all">apply to all of this kind</button><button type="button" id="b_rreg">reset region</button><button type="button" id="b_rpage">reset page</button></div><div class="btns"><button type="button" id="b_fitr">fit region</button><button type="button" id="b_fito">fit Observatory</button></div>'+selrow('s_view','view')+selrow('s_show','ground shown')+selrow('s_cut','section line'),true,true)
  +grp('g_top','Study, texture, typology',mx+'<div class="hint nar" id="nar"></div>'+selrow('s_tex','texture')+selrow('s_typ','typology')+pr('g_top')+row('g_ve','vertical exaggeration',GLOBALS[0].hint)+row('g_sve','vertical exaggeration of the section',GLOBALS[1].hint),true)
  +grp('g_veins','Veins',pr('g_veins'))+grp('g_cells','Cells',pr('g_cells'))+grp('g_blend','Falloff, topo blend, overlap, edge fade',pr('g_blend'))+grp('g_typ','Typology',pr('g_typ')+'<div class="hint" id="typhint"></div>')
  +grp('g_cont','Contours and water',row('g_ci','contour interval','')+'<div id="lvlist"></div><div class="hint">Water levels are drawn as lines where the level meets the ground shown.</div>',false,true)
  +grp('g_read','Readouts','<div id="read" class="read"></div>',true,true)
  +grp('g_out','Out','<div class="btns"><button type="button" data-x="delta:region">height difference PNG + JSON, region</button><button type="button" data-x="delta:obs">height difference PNG + JSON, Observatory</button><button type="button" data-x="contours">contours SVG</button><button type="button" data-x="section">section SVG</button><button type="button" data-x="view">view PNG</button><button type="button" data-x="params">parameters JSON</button><button type="button" data-x="contract">relief delta contract JSON</button><button type="button" data-x="chat">Copy for chat</button></div><textarea id="chat" rows="5" readonly></textarea>',false,true)
  +grp('g_key','Key','<label class="ck"><input type="checkbox" id="c_pl" checked> pattern lines</label><div class="hint">Warm line: the veins and cell walls of the pattern in the selected region, drawn on the surface.</div><div class="hint">O-n: Observatory number. VS08-nn: venation land study. VS03-04, VS02-04, VS02-10, VS02-16: the pattern studies behind the four textures. Grey line: region outline; white line and lighter ground: the selected region. Dark blue line: other elements of the Observatory. Pale blue line: water level. Hairlines: contours. The ground is shaded from the north-west at 2.5x for legibility; the shading is not a height.</div>',false,true);
 $('rail').innerHTML=h;
 const fill=(id,opts)=>{$(id).innerHTML=opts.map(o=>'<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>').join('')};
 fill('s_obs',Object.keys(window.VKD).sort().map(k=>[k,window.VKD[k].name]));fill('s_view',[['plan','plan'],['axon','axon (drag to orbit, wheel to zoom)'],['section','section']]);
 fill('s_show',[['after','with the venation texture (after)'],['before','as designed, without the texture (before)'],['split','split: before west, after east']]);fill('s_tex',TEXS.map(t=>[t.k,t.name+' ('+t.src+')']));fill('s_typ',TYPS.map(t=>[t.k,t.name+' ('+t.land+')']));
 $('s_obs').onchange=e=>setObs(e.target.value);$('s_view').onchange=e=>{S.view=e.target.value;refresh(0)};$('s_show').onchange=e=>{S.show=e.target.value;refresh(1)};$('s_cut').onchange=e=>{S.cutSel=e.target.value;refresh(1)};
 $('s_tex').onchange=e=>{const rs=S.R[S.sel];rs.tex=e.target.value;rs.study=studyOf(rs);refresh(2)};$('s_typ').onchange=e=>{const rs=S.R[S.sel];rs.typ=e.target.value;rs.study=studyOf(rs);rs.v.dir=0;refresh(2)};
 document.querySelectorAll('#mx button.st').forEach(b=>b.onclick=()=>loadStudy(S.sel,b.dataset.s,true));
 PARAMS.forEach(p=>{const el=$('p_'+p.id);if(p.sel){el.onchange=()=>{S.R[S.sel].v[p.id]=+el.value;refresh(2)}}else{const nb=$('p_'+p.id+'_n');el.min=nb.min=p.min;el.max=nb.max=p.max;el.step=nb.step=p.step;const set=x=>{S.R[S.sel].v[p.id]=Math.max(p.min,Math.min(p.max,+x));refresh(2)};el.oninput=()=>{nb.value=el.value};el.onchange=()=>set(el.value);nb.onchange=()=>set(nb.value)}});
 GLOBALS.forEach(p=>{const el=$('g_'+p.id),nb=$('g_'+p.id+'_n');el.min=nb.min=p.min;el.max=nb.max=p.max;el.step=nb.step=p.step;const set=x=>{S[p.id]=Math.max(p.min,Math.min(p.max,+x));refresh(p.id==='ve'?0:1)};el.oninput=()=>{nb.value=el.value;if(p.id==='ve'){S.ve=+el.value;draw();caption()}};el.onchange=()=>set(el.value);nb.onchange=()=>set(nb.value)});
 $('b_all').onclick=()=>{const R=reg(S.sel),rs=S.R[R.id];O.regions.forEach(q=>{if(q.kind===R.kind&&q.id!==R.id){const t=S.R[q.id];t.study=rs.study;t.tex=rs.tex;t.typ=rs.typ;PARAMS.forEach(p=>{if(p.id!=='n')t.v[p.id]=rs.v[p.id]});q._dirty=1}});refresh(3)};
 $('b_fitr').onclick=()=>{fitRegion(reg(S.sel));draw()};$('b_fito').onclick=()=>{fitObs();draw()};$('b_rreg').onclick=()=>{S.R[S.sel]=defState(reg(S.sel));refresh(2)};$('b_rpage').onclick=()=>{O.regions.forEach(R=>{S.R[R.id]=defState(R);R._dirty=1});S.ve=2;S.sve=5;S.ci=.25;S.show='after';refresh(3)};
 $('c_pl').onchange=e=>{S.plines=e.target.checked;refresh(1)};document.querySelectorAll('#g_out button').forEach(b=>b.onclick=()=>doExport(b.dataset.x));
 VSHELL.init({groupReset:gid=>{const R=reg(S.sel),rs=S.R[R.id];if(gid==='g_top'){const k=kdef(R);rs.tex=k.tex;rs.typ=k.typ;rs.study=null;S.ve=2;S.sve=5}PARAMS.filter(p=>p.g===gid).forEach(p=>rs.v[p.id]=defVal(R,p.id));refresh(2)},overflow:['g_read','g_out','g_key']})}
function studyOf(rs){const s=STUDIES.find(q=>q.tex===rs.tex&&q.typ===rs.typ);return s?s.id:null}
function loadStudy(rid,sid,go){const s=STUDIES.find(q=>q.id===sid);if(!s)return;const rs=S.R[rid];rs.study=s.id;rs.tex=s.tex;rs.typ=s.typ;rs.v.dir=0;if(go)refresh(2)}
function syncRail(){const R=reg(S.sel),rs=S.R[R.id];$('s_obs').value=O.id;$('c_pl').checked=S.plines;$('s_view').value=S.view;$('s_show').value=S.show;$('l_kod').href=O.kodama_url;$('l_kod').textContent='Kodamas v18 page: '+O.name;
 $('s_cut').innerHTML=[['auto','page cut through the region, else across it']].concat(O.cuts.map(c=>[c.name,c.name]),[['across','across the selected region (short axis)'],['along','along the selected region (long axis)']]).map(o=>'<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>').join('');$('s_cut').value=S.cutSel||'auto';
 $('rlist').innerHTML=O.regions.map(q=>{const t=S.R[q.id];return'<button type="button" class="rg'+(q.id===S.sel?' on':'')+'" data-r="'+esc(q.id)+'"><b>'+esc(q.name)+'</b><span>'+esc(q.kind)+' · '+esc(TEX[t.tex].name)+' · '+esc(TYP[t.typ].name)+(q.stat?' · largest change '+mft(q.stat.largest):'')+'</span></button>'}).join('');
 document.querySelectorAll('#rlist button').forEach(b=>b.onclick=()=>select(b.dataset.r));
 $('s_tex').value=rs.tex;$('s_typ').value=rs.typ;{const nw=isNarrow(R);$('s_tex').disabled=nw;$('nar').textContent=nw?'region is narrow: textures read alike here (greatest inside width '+mft(2*R._ras.dmax,1)+', under '+NARROW_M+' m)':'';$('nar').style.display=nw?'':'none'}document.querySelectorAll('#mx button.st').forEach(b=>b.classList.toggle('on',b.dataset.s===studyOf(rs)));
 const ch=changed(R);const cm={};ch.forEach(c=>cm[c.id]=c);const counts={};ch.forEach(c=>counts[c.g]=(counts[c.g]||0)+1);
 ['tex','typ'].forEach(k=>{$('row_s_'+k).classList.toggle('chg',!!cm[k]);$('was_s_'+k).textContent=cm[k]?'default for this region: '+cm[k].was:''});
 PARAMS.forEach(p=>{const el=$('p_'+p.id),rw=$('row_p_'+p.id);const vis=!p.when||p.when(rs);rw.style.display=vis?'':'none';rw.querySelector('label').textContent=(typeof p.label==='function'?p.label(rs):p.label)+(p.unit==='m'?' · '+mft(+rs.v[p.id]):'');
  if(p.sel){const o=typeof p.sel==='function'?p.sel(rs):p.sel;el.innerHTML=o.map((t,i)=>'<option value="'+i+'">'+i+' '+esc(t)+'</option>').join('');el.value=rs.v[p.id]}else{el.value=rs.v[p.id];$('p_'+p.id+'_n').value=rs.v[p.id]}
  rw.classList.toggle('chg',!!cm[p.id]);$('was_p_'+p.id).textContent=cm[p.id]?'default: '+cm[p.id].was:''});
 GLOBALS.forEach(p=>{$('g_'+p.id).value=S[p.id];$('g_'+p.id+'_n').value=S[p.id];const c=+S[p.id]!==p.def;$('row_g_'+p.id).classList.toggle('chg',c);$('was_g_'+p.id).textContent=c?'default: '+p.def+(p.unit?' m':'x'):'';$('row_g_'+p.id).querySelector('label').textContent=p.label+(p.unit==='m'?' · '+mft(S[p.id]):' · '+S[p.id]+'x')});
 if(+S.ve!==2)counts.g_top=(counts.g_top||0)+1;if(+S.sve!==5)counts.g_top=(counts.g_top||0)+1;['g_top','g_veins','g_cells','g_blend','g_typ'].forEach(g=>{if(!counts[g])counts[g]=0});VSHELL.marks(counts);
 $('lvlist').innerHTML=O.levels.map(l=>'<label class="ck"><input type="checkbox" data-k="'+l.k+'"'+(S.lv[l.k]?' checked':'')+'> '+esc(l.name)+'</label>').join('')+(O.rain?'<div class="hint">'+esc(O.rain)+': named on the kodama page; it has no level line.</div>':'');
 document.querySelectorAll('#lvlist input').forEach(c=>c.onchange=()=>{S.lv[c.dataset.k]=c.checked;refresh(1)});
 const st=R.stat||{};const t=TYP[rs.typ];$('typhint').textContent='Land page rule: '+t.land+'. Distances in the VS08 rule are tile millimetres; one tile millimetre here is '+(st.kmm||0).toFixed(3)+' m, from the pattern pitch.';
 $('read').innerHTML=[['region',R.name+' ['+R.id+']'],['kind and source',R.kind+' · '+R.src],['area',R.area_m2.toFixed(0)+' m² ('+(R.area_m2*10.7639).toFixed(0)+' ft²), counted on the page grid'],['designed ground in the region',mft(R.z1_min)+' to '+mft(R.z1_max)],['design change (existing to designed), mean',mft(R.design_change_mean,2,true)],
  ['largest change by the texture',mft(st.largest||0)+' (up '+mft(st.max||0)+', down '+mft(-(st.min||0))+')'],['pattern pitch',mft(st.pitch||0)+', from the square root of area over cell count'],['pattern scale',mft(rs.v.pscale)+(st.seeded?'; cells seeded on the '+R.seeds.length+' pools':'')],['pattern',(st.veinSegs||0)+' vein or wall segments'+(st.labels?', '+st.labels+' fields between them':'')+(st.tread?', '+st.steps+' steps, tread '+mft(st.tread)+', riser '+mft(rs.v.k2*rs.v.gain/9):'')+', grown in '+(st.ms||0)+' ms'],
  ['grid',O.win.nx+' x '+O.win.ny+' cells of '+mft(O.cell_m,0)+' from the kodama page (grid '+O.grid+'), resampled '+O.sub+' times finer for the texture']].map(q=>'<div><b>'+esc(q[0])+'</b><span>'+esc(q[1])+'</span></div>').join('')}
/* level 0: redraw only; 1: rebuild lines and surface; 2: recompute the selected region; 3: recompute the dirty regions */
function refresh(level){if(!O)return;if(level>=2){O.regions.forEach(R=>{if((level===2&&R.id===S.sel)||R._dirty||!R._d){regionDelta(R);R._dirty=0}});composeDelta()}
 S.cutSel=S.cutSel||'auto';S.cut=S.cutSel==='auto'?autoCut():S.cutSel;
 syncRail();const sec=S.view==='section';$('gl').style.display=sec?'none':'block';$('sec').style.display=sec?'block':'none';
 if(sec){const b=$('draw').getBoundingClientRect();$('sec').innerHTML=sectionSVG(Math.round(b.width),Math.round(b.height))}
 if(level>=1||!F.zs)buildScene();else draw();caption()}
const FIT=.78;/* a framed region fills about 78 % of the drawing in its tighter direction */
function fitRegion(R,fill){const r=regionRaster(R);const f=F;fill=fill||FIT;S.pan=[f.W/2-R.cx,f.H/2-R.cy];S.zc=R.stat?R.stat.datum:null;S.zoom=1;
 const cv=GLS&&GLS.cv;if(!cv||!cv.clientWidth||!F.zmin&&F.zmin!==0){S.zoom=Math.max(1,Math.min(14,Math.hypot(f.W,f.H)/(Math.max(r.w,r.h)*f.cs*1.6)));return}
 let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const z=S.zc!=null?S.zc:(F.zmin+F.zmax)/2;R.parts.forEach(pt=>pt.forEach(q=>{const a=project(q[0],q[1],z);x0=Math.min(x0,a[0]);x1=Math.max(x1,a[0]);y0=Math.min(y0,a[1]);y1=Math.max(y1,a[1])}));
 const ex=Math.max(1,x1-x0),ey=Math.max(1,y1-y0);S.zoom=Math.max(.5,Math.min(40,Math.min(cv.clientWidth*fill/ex,cv.clientHeight*fill/ey)))}
function fitObs(){S.pan=[0,0];S.zoom=1;S.zc=null}
function select(id){S.sel=id;S.cutSel='auto';const R=reg(id);if(R)fitRegion(R);refresh(1)}
function setObs(id){O=window.VKD[id];S.o=id;F=loadField(O);S.R={};S.lv={};O.levels.forEach((l,i)=>S.lv[l.k]=i<3);O.regions.forEach(R=>{R._ras=null;R._d=null;R._pk=null;regionRaster(R);S.R[R.id]=defState(R)});S.sel=O.regions[0].id;fitObs();S.cutSel='auto';if(GLS)GLS.mesh.key=null;refresh(3)}

/* ---------------- exports ---------------- */
function crc32(u8){let t=crc32.t;if(!t){t=crc32.t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}}let c=0xffffffff;for(let i=0;i<u8.length;i++)c=t[(c^u8[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
function png16(w,h,vals){/* 16 bit greyscale PNG, stored (uncompressed) deflate blocks */const raw=new Uint8Array(h*(1+w*2));for(let y=0;y<h;y++){raw[y*(1+w*2)]=0;for(let x=0;x<w;x++){const v=vals[y*w+x];raw[y*(1+w*2)+1+x*2]=v>>8;raw[y*(1+w*2)+2+x*2]=v&255}}
 const nb=Math.ceil(raw.length/65535);const z=new Uint8Array(2+raw.length+nb*5+4);z[0]=0x78;z[1]=1;let o=2,a=1,b=0;for(let i=0;i<nb;i++){const s=raw.subarray(i*65535,Math.min(raw.length,(i+1)*65535));z[o++]=i===nb-1?1:0;z[o++]=s.length&255;z[o++]=s.length>>8;z[o++]=~s.length&255;z[o++]=(~s.length>>8)&255;z.set(s,o);o+=s.length}
 for(let i=0;i<raw.length;i++){a=(a+raw[i])%65521;b=(b+a)%65521}z[o++]=b>>8;z[o++]=b&255;z[o++]=a>>8;z[o++]=a&255;
 const chunk=(t,d)=>{const c=new Uint8Array(12+d.length);const dv=new DataView(c.buffer);dv.setUint32(0,d.length);for(let i=0;i<4;i++)c[4+i]=t.charCodeAt(i);c.set(d,8);dv.setUint32(8+d.length,crc32(c.subarray(4,8+d.length)));return c};
 const ih=new Uint8Array(13);const dv=new DataView(ih.buffer);dv.setUint32(0,w);dv.setUint32(4,h);ih[8]=16;ih[9]=0;const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',z),chunk('IEND',new Uint8Array(0))];
 const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let q=0;parts.forEach(p=>{out.set(p,q);q+=p.length});return out}
function regionParams(R){const rs=S.R[R.id];const v={};PARAMS.forEach(p=>{if(!p.when||p.when(rs))v[p.id]=rs.v[p.id]});return{id:R.id,kind:R.kind,name:R.name,source:R.src,study:studyOf(rs),texture:rs.tex,texture_source:TEX[rs.tex].src,typology:rs.typ,typology_name:TYP[rs.typ].name,values:v,changed:changed(R).map(c=>({id:c.id,value:c.v,default:c.was})),largest_change_m:+(R.stat.largest).toFixed(3),up_m:+R.stat.max.toFixed(3),down_m:+(-R.stat.min).toFixed(3),pattern_pitch_m:+R.stat.pitch.toFixed(3)}}
function stem(scope){return'C3-E4_vk_'+O.id.replace('-','')+(scope==='region'?'_'+S.sel.replace(/[^A-Za-z0-9]+/g,''):'')+'_v02'}
function deltaExport(scope){const f=F;let i0=0,j0=0,w=f.gw,h=f.gh;const R=reg(S.sel);if(scope==='region'){const r=R._ras;i0=r.i0;j0=r.j0;w=r.w;h=r.h}let lo=0,hi=0;const d=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=(j0+y)*f.gw+i0+x;const v=scope==='region'?(f.rid[c]>=0&&O.regions[f.rid[c]].id===R.id?R._d[y*w+x]:0):f.dl[c];d[y*w+x]=v;if(v<lo)lo=v;if(v>hi)hi=v}
 const span=Math.max(1e-6,hi-lo);const u=new Uint16Array(w*h);for(let k=0;k<w*h;k++)u[k]=Math.round((d[k]-lo)/span*65535);const st=stem(scope)+'_height-difference';
 const side={file:st+'.png',what:'height difference: ground with the venation texture minus the designed ground (the proposed ground of the kodama page)',observatory:O.id,name:O.name,scope:scope==='region'?R.id:'all regions',encoding:'16 bit greyscale, 0 = min_m, 65535 = max_m, linear',min_m:+lo.toFixed(4),max_m:+hi.toFixed(4),units:'m',
  grid:{nx:w,ny:h,cell_m:f.cs,rows:'north to south',west_edge_m:O.full.x0+O.win.c0+i0*f.cs,north_edge_m:O.full.y0+(O.full.ny-1-O.win.r0)-j0*f.cs,frame:O.full.crs,kodama_grid:O.grid,kodama_page:O.kodama_file,resampled:O.sub+' times finer than the page grid'},
  regions:(scope==='region'?[R]:O.regions).map(regionParams),ground_note:O.ground_note||null,viewer:'vena-kodama viewer v02'};return{name:st,png:png16(w,h,u),json:JSON.stringify(side,null,1)}}
function contoursSVG(){const f=F;const c=F.contours;let s='<svg xmlns="http://www.w3.org/2000/svg" width="'+f.W+'mm" height="'+f.H+'mm" viewBox="0 0 '+f.W+' '+f.H+'"><title>'+esc(O.id+' contours, interval '+S.ci+' m, 1 unit = 1 m')+'</title><g id="contours" fill="none" stroke="#111" stroke-width="0.08">';
 for(let q=0;q<c.length;q+=6)s+='<line data-z="'+c[q+4].toFixed(2)+'" x1="'+c[q].toFixed(2)+'" y1="'+c[q+1].toFixed(2)+'" x2="'+c[q+2].toFixed(2)+'" y2="'+c[q+3].toFixed(2)+'"/>';
 s+='</g><g id="regions" fill="none" stroke="#a00" stroke-width="0.15">'+O.regions.map(R=>R.parts.concat(R.holes).map(p=>'<polygon data-region="'+esc(R.id)+'" points="'+p.map(q=>q[0]+','+q[1]).join(' ')+'"/>').join('')).join('')+'</g></svg>';return s}
function paramsJSON(){return JSON.stringify({observatory:O.id,name:O.name,kodama_page:O.kodama_file,grid:O.grid,vertical_exaggeration:S.ve,section_vertical_exaggeration:S.sve,vertical_exaggeration_note:'view only; all heights are true',contour_interval_m:S.ci,ground_shown:S.show,regions:O.regions.map(regionParams),viewer:'vena-kodama viewer v02'},null,1)}
function contractJSON(){const f=F,nx=O.full.nx,ny=O.full.ny,sub=f.sub;const d=new Int16Array(nx*ny);let mx=0;
 for(let r=0;r<O.win.ny;r++)for(let c=0;c<O.win.nx;c++){/* a page grid node holds the mean of the fine cells within half a cell of it */let s=0,n=0;for(let j=Math.max(0,Math.round((r-.5)*sub));j<Math.min(f.gh,Math.round((r+.5)*sub));j++)for(let i=Math.max(0,Math.round((c-.5)*sub));i<Math.min(f.gw,Math.round((c+.5)*sub));i++){s+=f.dl[j*f.gw+i];n++}
   const v=n?s/n:0;d[(O.win.r0+r)*nx+O.win.c0+c]=Math.round(v*1000);if(Math.abs(v)>mx)mx=Math.abs(v)}
 return JSON.stringify({format:'C3-E4 vena-kodama relief delta v01',what:'a height difference to add to the proposed ground (KD.z1) of the kodama page: the venation texture of each region. Nothing outside a region is changed.',observatory:O.id,name:O.name,kodama_page:O.kodama_file,kodama_grid:O.grid,
  grid:{nx,ny,cell_m:1,rows:'north to south, as KD.z1',x0:O.full.x0,y0:O.full.y0,frame:O.full.crs},window:O.win,units:'m',encoding:'base64 int16 little endian, millimetres, nx * ny values in the order of KD.z1; zero outside the window and outside the regions',
  largest_change_m:+mx.toFixed(3),largest_change_note:'on the 1 m page grid, after averaging the finer viewer grid ('+sub+' times); the viewer readouts are on the finer grid',regions:O.regions.map(regionParams),ground_note:O.ground_note||null,delta:toB64(new Uint8Array(d.buffer)),written_by:'vena-kodama viewer v02'})}
function chatText(){const R=reg(S.sel),rs=S.R[R.id];const ch=changed(R);return['vena-kodama v02 · '+O.name+' ['+O.id+']','region: '+R.name+' ['+R.id+', '+R.kind+']','study: '+studyTxt(rs),'cell count '+rs.v.n+' · relief gain '+mft(+rs.v.gain)+' · vertical exaggeration '+S.ve+'x · largest change '+mft(R.stat.largest),
  'changed from the defaults: '+(ch.length?ch.map(c=>c.label+' '+c.v+' (default '+c.was+')').join('; '):'nothing'),'note: '].join('\n')}
function save(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function doExport(x){if(x==='delta:region'||x==='delta:obs'){const e=deltaExport(x.split(':')[1]==='region'?'region':'obs');save(e.name+'.png',e.png,'image/png');save(e.name+'.json',e.json,'application/json')}
 else if(x==='contours')save(stem('obs')+'_contours.svg',contoursSVG(),'image/svg+xml');else if(x==='section')save(stem('region')+'_section.svg',sectionSVG(1400,700),'image/svg+xml');
 else if(x==='view'){draw();GLS.cv.toBlob(b=>save(stem('region')+'_view.png',b,'image/png'))}else if(x==='params')save(stem('obs')+'_parameters.json',paramsJSON(),'application/json');
 else if(x==='contract')save('C3-E4_vk_relief-delta_'+O.id+'_v02.json',contractJSON(),'application/json');
 else if(x==='chat'){const t=chatText();$('chat').value=t;if(navigator.clipboard)navigator.clipboard.writeText(t).catch(()=>{})}}

/* ---------------- pointer ---------------- */
function pointer(){const cv=$('gl');let drag=null;cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,az:S.az,el:S.el,pan:S.pan.slice(),moved:0,shift:e.shiftKey||S.view==='plan'};cv.setPointerCapture(e.pointerId)});
 cv.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.abs(dx)+Math.abs(dy));if(drag.moved<4)return;
  if(drag.shift){const P=viewParams();const r=P.cw/cv.clientWidth/P.k;const a=P.az;const u=dx*r,w=-dy*r/Math.max(.2,Math.sin(P.el));S.pan=[drag.pan[0]+(u*Math.cos(a)+w*Math.sin(a)),drag.pan[1]-(-u*Math.sin(a)+w*Math.cos(a))]}
  else{S.az=drag.az+dx*.4;S.el=Math.max(8,Math.min(89,drag.el+dy*.3))}draw()});
 cv.addEventListener('pointerup',e=>{if(drag&&drag.moved<4){const b=cv.getBoundingClientRect();const ri=pick(e.clientX-b.left,e.clientY-b.top);if(ri>=0)select(O.regions[ri].id)}drag=null});
 cv.addEventListener('wheel',e=>{e.preventDefault();S.zoom=Math.max(.5,Math.min(12,S.zoom*(e.deltaY<0?1.12:1/1.12)));draw()},{passive:false});window.addEventListener('resize',()=>refresh(0))}

/* ---------------- start, and the scripted hook for proofs ---------------- */
function start(){GLS=glInit();buildRail();pointer();const q=new URLSearchParams(location.search);const first=q.get('o')&&window.VKD[q.get('o')]?q.get('o'):(window.VKD['O-3']?'O-3':Object.keys(window.VKD)[0]);setObs(first);window.VK_READY=true}
/* VK.apply({o, r, study, tex, typ, v:{...}, all, ve, ci, view, show, az, el, zoom, cut, lv}) sets a state in one call and returns the caption and the numbers */
function apply(a){a=a||{};if(a.o&&a.o!==S.o)setObs(a.o);if(a.reset){O.regions.forEach(R=>{S.R[R.id]=defState(R);R._dirty=1})}if(a.r)S.sel=a.r;const R=reg(S.sel),rs=S.R[R.id];if(a.study)loadStudy(R.id,a.study,false);if(a.tex){rs.tex=a.tex}if(a.typ){rs.typ=a.typ}if(a.tex||a.typ)rs.study=studyOf(rs);if(a.v)Object.assign(rs.v,a.v);R._dirty=1;
 if(a.all)O.regions.forEach(q=>{if(q.kind===R.kind&&q.id!==R.id){const t=S.R[q.id];t.study=rs.study;t.tex=rs.tex;t.typ=rs.typ;PARAMS.forEach(p=>{if(p.id!=='n')t.v[p.id]=rs.v[p.id]});q._dirty=1}});
 ['ve','sve','ci','view','show','az','el','zoom'].forEach(k=>{if(a[k]!=null)S[k]=a[k]});if(a.pan)S.pan=a.pan;if(a.lv)Object.assign(S.lv,a.lv);S.cutSel=a.cut||'auto';
 if(a.fitobs)fitObs();if(a.plines!=null)S.plines=!!a.plines;
 refresh(3);if(a.r&&!a.fitobs&&a.zoom==null&&!a.pan){fitRegion(R,typeof a.fill==='number'?a.fill:FIT);draw()}const c=captionParts();return{caption:c,stat:R.stat,region:{id:R.id,kind:R.kind,name:R.name},study:studyTxt(rs),n:rs.v.n,gain:rs.v.gain,pscale:rs.v.pscale,ve:S.view==='section'?S.sve:S.ve,narrow:isNarrow(R),seeded:seededOn(R,rs),cut:cutLine()&&cutLine().name}}
window.VK={apply,state:S,regions:()=>O.regions.map(R=>({id:R.id,kind:R.kind,name:R.name,area_m2:R.area_m2,stat:R.stat,changed:changed(R).length})),contract:contractJSON,params:paramsJSON,contours:contoursSVG,section:(w,h)=>sectionSVG(w||1400,h||700),
 delta:scope=>{const e=deltaExport(scope);return{name:e.name,png:toB64(e.png),json:e.json}},chat:chatText,studies:STUDIES,PARAMS,obs:()=>O,field:()=>F};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
