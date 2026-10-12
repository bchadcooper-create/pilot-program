(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

(function () {
  var links = document.querySelectorAll('a.dfw-c[data-h]');
  for (var i = 0; i < links.length; i++) {
    try {
      links[i].setAttribute('href', atob(links[i].getAttribute('data-h')));
      links[i].textContent = atob(links[i].getAttribute('data-t'));
    } catch (e) {}
  }
})();
