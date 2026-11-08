// All titles use Latin letters; the Tamil name stays the site's permanent brand.
const titles = [
  { text: 'Namma Vedi’s', language: 'Tamil' },
  { text: 'Hamare Patakhe', language: 'Hindi' },
  { text: 'Mana Tapakayalu', language: 'Telugu' },
];
const word = document.getElementById('rotatingTitle');
const welcome = document.getElementById('start');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let index = 0, cycle = 0, transition = 0;

function pause() {
  clearInterval(cycle); clearTimeout(transition);
  cycle = 0;
  word.classList.remove('changing');
}
function sync() {
  pause();
  if (document.hidden || welcome.hidden) return;
  cycle = setInterval(() => {
    word.classList.add('changing');
    transition = setTimeout(() => {
      index = (index + 1) % titles.length;
      word.textContent = titles[index].text;
      word.dataset.language = titles[index].language;
      word.classList.remove('changing');
    }, reducedMotion.matches ? 0 : 240);
  }, 3600);
}
new MutationObserver(sync).observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('visibilitychange', sync);
addEventListener('pagehide', pause);
addEventListener('pageshow', sync);
sync();
