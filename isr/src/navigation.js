(function () {
  'use strict';
  const pages = {
    patterns: document.getElementById('patternsPage'),
    schedule: document.getElementById('schedulePage'),
    tracker: document.getElementById('trackerPage'),
    mission: document.getElementById('missionPage')
  };
  const titles = {
    patterns: 'ISR Pattern Explorer',
    schedule: 'Fleet & Schedule · ISR Explorer',
    tracker: 'Asset Tracker · ISR Explorer',
    mission: 'Mission · ISR Explorer'
  };
  const links = [...document.querySelectorAll('.page-tabs a[data-page]')];
  let current = null;
  let patternPlaying = window.ISRApp ? window.ISRApp.state.playing : false;
  function activate() {
    let name = location.hash.slice(1);
    if (!Object.prototype.hasOwnProperty.call(pages, name)) name = 'patterns';
    if (name === current) return;
    if (current === 'patterns' && name !== 'patterns' && window.ISRApp) {
      patternPlaying = window.ISRApp.state.playing;
      window.ISRApp.setPlaying(false);
    }
    if (current === 'mission' && name !== 'mission' && window.ISRMissionUI) {
      window.ISRMissionUI.setPlaying(false);
    }
    for (const [id, element] of Object.entries(pages)) {
      if (element) element.hidden = id !== name;
    }
    for (const link of links) {
      const active = link.dataset.page === name;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (name === 'patterns') {
      if (window.ISRFleetUI) window.ISRFleetUI.setPlaying(false);
      if (window.ISRApp) {
        window.ISRApp.setPlaying(patternPlaying);
        requestAnimationFrame(() => window.ISRApp.resize ? window.ISRApp.resize() : window.ISRApp.draw());
      }
    } else if (name === 'mission') {
      if (window.ISRApp) window.ISRApp.setPlaying(false);
      if (window.ISRFleetUI) window.ISRFleetUI.setPlaying(false);
      if (window.ISRMissionUI) requestAnimationFrame(() => window.ISRMissionUI.activate());
    } else {
      if (window.ISRApp) window.ISRApp.setPlaying(false);
      if (window.ISRFleetUI) requestAnimationFrame(() => window.ISRFleetUI.activate());
    }
    if (current && current !== name) window.scrollTo({top: 0, behavior: 'auto'});
    current = name;
    document.dispatchEvent(new CustomEvent('isr:page', {detail: {page: name}}));
    document.title = titles[name];
  }
  window.addEventListener('hashchange', activate);
  window.ISRNavigation = {activate, get page() { return current; }};
  activate();
})();
