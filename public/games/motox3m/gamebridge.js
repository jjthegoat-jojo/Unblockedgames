window.gamebridge = {
  ready: true,
  version: '1.0.0',
  showStart: function() {},
  showPause: function() {},
  showAd: function(cb) { if (typeof cb === 'function') cb(); },
  showPreroll: function(cb) { if (typeof cb === 'function') cb(); },
  showNext: function() {},
  showBrowse: function() {},
  showReward: function(cb) { if (typeof cb === 'function') cb(true); }
};