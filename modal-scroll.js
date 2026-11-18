// Lock the page, while allowing scroll inside the active dialog and its children.
const modalNotifications = (() => {
  const root = document.documentElement;
  const toast = document.getElementById('toast');
  const supportsPopover = typeof toast?.showPopover === 'function';
  if (supportsPopover) toast.setAttribute('popover', 'manual');

  let dialogs = [];
  let locked = false;
  let scrollX = 0;
  let scrollY = 0;
  let messageTimer;

  function collectDialogs() {
    dialogs = dialogs.filter(dialog => dialog.isConnected && dialog.open);
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      if (!dialogs.includes(dialog)) dialogs.push(dialog);
    }
    return dialogs.at(-1);
  }

  function placeToast(active) {
    if (!toast?.classList.contains('show')) return;
    const host = active || document.body;
    if (toast.parentElement === host && (!supportsPopover || toast.matches(':popover-open'))) return;
    if (supportsPopover && toast.matches(':popover-open')) toast.hidePopover();
    host.append(toast);
    if (supportsPopover) toast.showPopover();
  }

  function update() {
    const active = collectDialogs();
    const open = Boolean(active);
    if (open && !locked) {
      scrollX = window.scrollX;
      scrollY = window.scrollY;
      root.style.setProperty('--modal-scroll-top', `${-scrollY}px`);
      root.classList.add('modal-open');
    } else if (!open && locked) {
      root.classList.remove('modal-open');
      root.style.removeProperty('--modal-scroll-top');
      window.scrollTo(scrollX, scrollY);
    }
    locked = open;
    placeToast(active);
  }

  new MutationObserver(update).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open']
  });
  document.addEventListener('close', update, true);
  document.addEventListener('touchmove', event => {
    if (locked && !event.target.closest('dialog[open]')) event.preventDefault();
  }, { passive: false });
  update();

  return {
    show(message) {
      if (!toast) return;
      clearTimeout(messageTimer);
      toast.classList.add('show');
      placeToast(collectDialogs());
      toast.textContent = message;
      messageTimer = setTimeout(() => {
        toast.classList.remove('show');
        if (supportsPopover && toast.matches(':popover-open')) toast.hidePopover();
        document.body.append(toast);
      }, 3200);
    }
  };
})();
