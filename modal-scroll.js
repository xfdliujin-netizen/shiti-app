// Keep the document still while any modal is open, including nested image viewers.
(() => {
  let locked=false,scrollX=0,scrollY=0;
  const root=document.documentElement;
  const update=()=>{
    const open=!!document.querySelector('dialog[open]');
    if(open===locked)return;
    locked=open;
    if(open){scrollX=window.scrollX;scrollY=window.scrollY;root.style.setProperty('--modal-scroll-top',`${-scrollY}px`);root.classList.add('modal-open')}
    else{root.classList.remove('modal-open');root.style.removeProperty('--modal-scroll-top');window.scrollTo(scrollX,scrollY)}
  };
  new MutationObserver(update).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('close',update,true);
  // Avoid browser rubber-band scrolling when a swipe starts on a backdrop.
  document.addEventListener('touchmove',e=>{if(locked&&!e.target.closest('dialog[open]'))e.preventDefault()},{passive:false});
  update();
})();
