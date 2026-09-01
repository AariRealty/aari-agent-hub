/* Aari Realty — shared behavior. Kept deliberately small: no framework, no build step. */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.nav-right');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Menu';
    });
  }

  /* Mark the current page in the nav without hand-editing every file. */
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
})();
