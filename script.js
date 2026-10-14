// Existing homepage gallery behavior (shared safely across pages).

  function openCommercialGallery() {
    const gallery = document.getElementById('commercial-gallery');
    gallery.classList.add('active');
    gallery.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCommercialGallery() {
    const gallery = document.getElementById('commercial-gallery');
    gallery.classList.remove('active');
    gallery.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.getElementById('commercial-gallery')?.addEventListener('click', function(event) {
    if (event.target === this) closeCommercialGallery();
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeCommercialGallery();
  });


// Shared ID+EA mobile website navigation.
(function initSiteNavigation(){
  const toggles = [['mobileToggle','mobileLinks'], ['websiteMenu','mobileWebsiteNav']];
  toggles.forEach(([toggleId,navId])=>{
    const btn=document.getElementById(toggleId);
    const nav=document.getElementById(navId);
    if(!btn||!nav)return;
    btn.addEventListener('click',()=>{
      const open=nav.hidden; nav.hidden=!open;
      btn.setAttribute('aria-expanded',String(open));
      btn.textContent=open?'✕':'☰';
    });
    nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
      nav.hidden=true;btn.setAttribute('aria-expanded','false');btn.textContent='☰';
    }));
  });
})();
