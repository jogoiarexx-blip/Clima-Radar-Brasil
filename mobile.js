/* Navegação mobile sem dependências, orientada a seções reais. */
(() => {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('.mobile-tab'));
  const ids = tabs.map(tab => tab.getAttribute('href').slice(1));
  const setActive = id => tabs.forEach(tab => {
    const active = tab.getAttribute('href') === '#' + id;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'location');
    else tab.removeAttribute('aria-current');
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (entry) setActive(entry.target.id);
    }, { rootMargin: '-12% 0px -58% 0px', threshold: [0, .15, .35] });
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
  }
  tabs.forEach(tab => tab.addEventListener('click', () => setActive(tab.getAttribute('href').slice(1))));
})();
