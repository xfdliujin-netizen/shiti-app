// View transforms never change the crop's source-pixel coordinate system.
function touchPair(points) {
  const [a,b]=[...points.values()];
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
}
function boundedZoom(value){return Math.max(1,Math.min(8,value))}
function bindZoomImage(dialog,img) {
  if(!dialog||!img||img.dataset.zoomBound)return;
  img.dataset.zoomBound='true';img.draggable=false;
  const stage=document.createElement('div');stage.className='image-view-stage';img.before(stage);stage.append(img);
  const tools=document.createElement('div');tools.className='image-zoom-tools';tools.innerHTML='<button type="button" data-image-zoom="out" aria-label="缩小图片">−</button><button type="button" data-image-zoom="reset">适应屏幕</button><button type="button" data-image-zoom="in" aria-label="放大图片">＋</button>';dialog.append(tools);
  let z=1,x=0,y=0,start=null;const points=new Map();
  const draw=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${z})`;img.dataset.zoom=String(z)};
  const reset=()=>{z=1;x=y=0;draw()};dialog.resetImageView=reset;img.onload=reset;dialog.addEventListener('close',()=>{points.clear();start=null;reset()});
  const begin=()=>{if(!points.size){start=null;return}const p=points.size===2?touchPair(points):[...points.values()][0];start={clientX:p.x,clientY:p.y,distance:p.distance,z,x,y}};
  stage.onpointerdown=e=>{e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);begin()};
  stage.onpointermove=e=>{if(!points.has(e.pointerId)||!start)return;e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=points.size===2?touchPair(points):{x:e.clientX,y:e.clientY};z=points.size===2?boundedZoom(start.z*p.distance/start.distance):z;x=start.x+p.x-start.clientX;y=start.y+p.y-start.clientY;draw()};
  stage.onpointerup=stage.onpointercancel=e=>{points.delete(e.pointerId);begin()};
  stage.ondblclick=()=>{z=z>1?1:2;x=y=0;draw()};
  stage.onwheel=e=>{e.preventDefault();z=boundedZoom(z*Math.exp(-e.deltaY*.002));draw()};
  tools.querySelectorAll('[data-image-zoom]').forEach(b=>b.onclick=()=>{if(b.dataset.imageZoom==='reset')reset();else{z=boundedZoom(z*(b.dataset.imageZoom==='in'?1.4:1/1.4));draw()}});
}
let releaseCropEditor=null;
async function bindCropEditor() {
  releaseCropEditor?.();
  const canvas=$('#crop-canvas');if(!canvas)return;
  const stage=$('#crop-stage');
  const source=image,fresh=cropState.source!==source;
  if(fresh)cropState={source,rotation:0,rect:null};
  const img=new Image();img.src=source;try{await img.decode()}catch{toast('图片解码失败，请重新选图');return}if(!canvas.isConnected||image!==source)return;
  cropOriginal={source,img};
  const base=document.createElement('canvas'),baseScale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  base.width=Math.max(1,Math.round(img.naturalWidth*baseScale));base.height=Math.max(1,Math.round(img.naturalHeight*baseScale));base.getContext('2d').drawImage(img,0,0,base.width,base.height);
  const rotated=document.createElement('canvas');cropCanvas=rotated;
  const ctx=canvas.getContext('2d'),points=new Map();let gesture=null,pair=null,view={z:1,x:0,y:0},previewAngle=0,frame=0,needsPaint=false;
  function queue(paint=false){needsPaint ||= paint;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;transform();if(needsPaint){needsPaint=false;draw()}})}
  function fit(){const w=stage.clientWidth,k=w/canvas.width;canvas.style.width=Math.max(1,w)+'px';canvas.style.height=Math.max(1,canvas.height*k)+'px';stage.style.height=Math.max(1,canvas.height*k)+'px';transform()}
  function transform(){canvas.style.transform=`translate3d(${view.x}px,${view.y}px,0) scale(${view.z}) rotate(${previewAngle}deg)`;canvas.dataset.zoom=String(view.z)}
  function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(rotated,0,0);const r=cropState.rect;if(!r)return;const p=cropPixels(r,canvas.width,canvas.height),scale=canvas.width/(parseFloat(canvas.style.width)*view.z||canvas.width);ctx.fillStyle='#0008';ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.rect(p.x,p.y,p.width,p.height);ctx.fill('evenodd');ctx.strokeStyle='#3478f6';ctx.lineWidth=2.5*scale;ctx.strokeRect(p.x,p.y,p.width,p.height);ctx.fillStyle='#fff';for(const [x,y]of[[p.x,p.y],[p.x+p.width,p.y],[p.x,p.y+p.height],[p.x+p.width,p.y+p.height]])ctx.fillRect(x-6*scale,y-6*scale,12*scale,12*scale)}
  function rotate(degrees){cropState.rotation=degrees;const size=rotatedSize(img.naturalWidth,img.naturalHeight,degrees),k=Math.min(1,1600/Math.max(size.width,size.height));rotated.width=canvas.width=Math.max(1,Math.round(size.width*k));rotated.height=canvas.height=Math.max(1,Math.round(size.height*k));const c=rotated.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,rotated.width,rotated.height);c.translate(rotated.width/2,rotated.height/2);c.scale(k,k);c.rotate(degrees*Math.PI/180);c.drawImage(base,-img.naturalWidth/2,-img.naturalHeight/2,img.naturalWidth,img.naturalHeight);fit();draw()}
  function commitGesture(){if(!pair)return;const center=canvas.getBoundingClientRect(),delta=previewAngle,old=rotatedSize(img.naturalWidth,img.naturalHeight,pair.rotation),pixelScale=parseFloat(canvas.style.width)/old.width,r=cropState.rect;previewAngle=0;if(Math.abs(delta)>.05){const next=rotatedSize(img.naturalWidth,img.naturalHeight,pair.rotation+delta);if(r)cropState.rect=rotateCropRect(r,old,next,delta);rotate(pair.rotation+delta);view.z=boundedZoom(view.z*pixelScale/(parseFloat(canvas.style.width)/next.width))}pair=null;transform();const nextCenter=canvas.getBoundingClientRect();view.x+=(center.left+center.width/2)-(nextCenter.left+nextCenter.width/2);view.y+=(center.top+center.height/2)-(nextCenter.top+nextCenter.height/2);transform();draw()}
  const point=e=>{const b=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))}};
  canvas.onpointerdown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();if(points.size>=2)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
    if(points.size===2){pair={...touchPair(points),view:{...view},rotation:cropState.rotation};gesture=null;return}
    const p=point(e),r=cropState.rect,b=canvas.getBoundingClientRect();let handle=null;
    if(r)for(const [name,x,y]of[['nw',r.x,r.y],['ne',r.x+r.w,r.y],['sw',r.x,r.y+r.h],['se',r.x+r.w,r.y+r.h]])if(Math.abs(p.x-x)*b.width<(e.pointerType==='touch'?28:16)&&Math.abs(p.y-y)*b.height<(e.pointerType==='touch'?28:16))handle=name;
    gesture={start:p,client:{x:e.clientX,y:e.clientY},view:{...view},old:r?{...r}:null,kind:handle||(r&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h?'move':'new')};
  };
  canvas.onpointermove=e=>{
    if(!points.has(e.pointerId))return;e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size>=2&&pair){const p=touchPair(points);previewAngle=((p.angle-pair.angle+540)%360)-180;view={z:boundedZoom(pair.view.z*p.distance/pair.distance),x:pair.view.x+p.x-pair.x,y:pair.view.y+p.y-pair.y};queue();return}
    if(!gesture)return;const p=point(e),g=gesture;
    if(g.kind==='pan'){view.x=g.view.x+e.clientX-g.client.x;view.y=g.view.y+e.clientY-g.client.y;queue();return}
    if(g.kind==='move'){const r=g.old;cropState.rect={...r,x:Math.max(0,Math.min(1-r.w,r.x+p.x-g.start.x)),y:Math.max(0,Math.min(1-r.h,r.y+p.y-g.start.y))}}
    else{let a=g.start;if(g.kind!=='new'){const r=g.old;a={x:g.kind.includes('w')?r.x+r.w:r.x,y:g.kind.includes('n')?r.y+r.h:r.y}}cropState.rect={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)}}queue(true);
  };
  const release=e=>{points.delete(e.pointerId);if(points.size<2)commitGesture();gesture=null;if(cropState.rect&&(cropState.rect.w<.01||cropState.rect.h<.01))cropState.rect=null;queue(true)};
  canvas.onpointerup=canvas.onpointercancel=release;canvas.onlostpointercapture=e=>{if(points.has(e.pointerId))release(e)};
  canvas.onwheel=e=>{e.preventDefault();view.z=boundedZoom(view.z*Math.exp(-e.deltaY*.002));queue()};
  const turn=delta=>{commitGesture();const old=rotatedSize(img.naturalWidth,img.naturalHeight,cropState.rotation),next=rotatedSize(img.naturalWidth,img.naturalHeight,cropState.rotation+delta);if(cropState.rect)cropState.rect=rotateCropRect(cropState.rect,old,next,delta);view={z:1,x:0,y:0};rotate(cropState.rotation+delta)};
  $('#rotate-left').onclick=()=>turn(-90);$('#rotate-right').onclick=()=>turn(90);
  $('#crop-reset').onclick=()=>{commitGesture();points.clear();gesture=null;cropState.rect=null;draw()};
  $('#crop-full').onclick=()=>{cropState.rect={x:.02,y:.02,w:.96,h:.96};draw()};
  $('#crop-reselect').onclick=()=>{$('#photo').click()};
  const resize=()=>{if(canvas.isConnected){fit();queue(true)}};window.addEventListener('resize',resize);releaseCropEditor=()=>{window.removeEventListener('resize',resize);if(frame)cancelAnimationFrame(frame)};
  cropDraw=draw;cropCommit=()=>{commitGesture();points.clear();gesture=null};rotate(cropState.rotation);

}
