// The loading screen's words (runs at once, before the game): Arabic or English, like the visitor's device.
// the words in the phone's / computer's language (Arabic or English), or the language the visitor picked before
(function () {
  window.__ldStart = Date.now();
  var saved = null;
  try { saved = localStorage.getItem('animal-town-visitor-lang'); } catch (e) { /* private mode */ }
  var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  var first = 'en';
  for (var k = 0; k < prefs.length; k++) if (/^(ar|en)/i.test(prefs[k])) { first = prefs[k].slice(0, 2).toLowerCase(); break; }
  if ((saved || first) === 'ar') {
    document.getElementById('loading').dir = 'rtl';
    document.getElementById('ld-text').firstChild.nodeValue = 'جاري التحميل';
    document.getElementById('ld-title').textContent = 'مدينة الحيوانات';
  }
  // never stuck: gone after 25 s whatever happens
  setTimeout(function () { var l = document.getElementById('loading'); if (l) l.classList.add('done'); }, 25000);
})();
