/**
 * Premier League Analytics - charts.js
 * Lightweight (<10KB) SVG Tactical Pitch & Stat Visualizations
 * Zero external libraries, brutalist sharp 0px geometry.
 */
(function(root) {
  'use strict';

  var PLCharts = {};

  // Pitch Zone definitions with SVG coordinates for standard 680x450 pitch
  var PITCH_ZONES = {
    'Central Box & Penalty Area': {
      x: 520, y: 145, width: 140, height: 160,
      label: 'CENTRAL BOX & SIX-YARD'
    },
    'Right Wing Attacking': {
      x: 460, y: 310, width: 200, height: 120,
      label: 'RIGHT WING FLANK'
    },
    'Left Wing Attacking': {
      x: 460, y: 20, width: 200, height: 120,
      label: 'LEFT WING FLANK'
    },
    'Attacking Midfield / Half-Space': {
      x: 400, y: 120, width: 120, height: 210,
      label: 'ATTACKING HALF-SPACE / ZONE 14'
    },
    'Central Engine Room': {
      x: 260, y: 120, width: 140, height: 210,
      label: 'CENTRAL ENGINE ROOM'
    },
    'Defensive Midfield Pivot': {
      x: 160, y: 120, width: 100, height: 210,
      label: 'DEFENSIVE MIDFIELD PIVOT'
    },
    'Right Fullback / Overlap': {
      x: 160, y: 320, width: 220, height: 110,
      label: 'RIGHT FULLBACK CHANNEL'
    },
    'Left Fullback / Overlap': {
      x: 160, y: 20, width: 220, height: 110,
      label: 'LEFT FULLBACK CHANNEL'
    },
    'Central Defense Stopper': {
      x: 70, y: 130, width: 110, height: 190,
      label: 'CENTRAL DEFENSE CORE'
    },
    'Goalkeeping Penalty Box': {
      x: 20, y: 155, width: 60, height: 140,
      label: 'GOALKEEPING CREASE'
    }
  };

  /**
   * Render Tactical Pitch Zone Visualizer (SVG)
   */
  PLCharts.renderTacticalPitch = function(containerId, activeZoneName, playerName, playerClub) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var zone = PITCH_ZONES[activeZoneName] || PITCH_ZONES['Attacking Midfield / Half-Space'];
    var pName = playerName || 'SELECTED SQUAD MEMBER';
    var pClub = playerClub || 'PREMIER LEAGUE';

    var svgHtml = [
      '<svg class="pitch-svg" viewBox="0 0 680 450" xmlns="http://www.w3.org/2000/svg">',
      '  <defs>',
      '    <pattern id="pitchGrassPattern" width="60" height="450" patternUnits="userSpaceOnUse">',
      '      <rect x="0" y="0" width="30" height="450" fill="#240028" />',
      '      <rect x="30" y="0" width="30" height="450" fill="#1b001e" />',
      '    </pattern>',
      '    <linearGradient id="neonGlow" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" stop-color="#00ff85" stop-opacity="0.65" />',
      '      <stop offset="100%" stop-color="#05f0ff" stop-opacity="0.85" />',
      '    </linearGradient>',
      '    <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">',
      '      <path d="M0,0 L0,6 L8,3 z" fill="#05f0ff" />',
      '    </marker>',
      '  </defs>',
      
      '  <!-- Pitch Turf Background -->',
      '  <rect x="0" y="0" width="680" height="450" fill="url(#pitchGrassPattern)" />',
      
      '  <!-- Outer Pitch Boundary -->',
      '  <rect x="20" y="20" width="640" height="410" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      
      '  <!-- Halfway Line & Center Circle -->',
      '  <line x1="340" y1="20" x2="340" y2="430" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <circle cx="340" cy="225" r="55" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <circle cx="340" cy="225" r="3" fill="rgba(255,255,255,0.6)" />',

      '  <!-- Left Penalty Box & Goal -->',
      '  <rect x="20" y="115" width="105" height="220" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <rect x="20" y="165" width="40" height="120" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <rect x="10" y="195" width="10" height="60" fill="none" stroke="#ff2882" stroke-width="2" />',
      '  <path d="M 125,185 A 55 55 0 0 1 125,265" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',

      '  <!-- Right Penalty Box & Goal -->',
      '  <rect x="555" y="115" width="105" height="220" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <rect x="620" y="165" width="40" height="120" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',
      '  <rect x="660" y="195" width="10" height="60" fill="none" stroke="#00ff85" stroke-width="2" />',
      '  <path d="M 555,185 A 55 55 0 0 0 555,265" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />',

      '  <!-- Tactical Grid Guidelines -->',
      '  <line x1="160" y1="20" x2="160" y2="430" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />',
      '  <line x1="520" y1="20" x2="520" y2="430" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />',
      '  <line x1="20" y1="140" x2="660" y2="140" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />',
      '  <line x1="20" y1="310" x2="660" y2="310" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />',

      '  <!-- HIGHLIGHTED TACTICAL ACTIVE ZONE -->',
      '  <g class="active-zone-group">',
      '    <rect x="' + zone.x + '" y="' + zone.y + '" width="' + zone.width + '" height="' + zone.height + '"',
      '          fill="url(#neonGlow)" stroke="#00ff85" stroke-width="3" />',
      '    <rect x="' + (zone.x + 4) + '" y="' + (zone.y + 4) + '" width="' + (zone.width - 8) + '" height="' + (zone.height - 8) + '"',
      '          fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="6,4" opacity="0.6" />',
      '  </g>',

      '  <!-- Key Pass Vector Lanes (Cyan) -->',
      '  <line x1="' + (zone.x + zone.width/2) + '" y1="' + (zone.y + zone.height/2) + '" x2="610" y2="210"',
      '        stroke="#05f0ff" stroke-width="2.5" stroke-dasharray="5,3" marker-end="url(#arrowHead)" />',
      '  <line x1="' + (zone.x + zone.width/2) + '" y1="' + (zone.y + zone.height/2) + '" x2="600" y2="250"',
      '        stroke="#05f0ff" stroke-width="2" stroke-dasharray="3,3" marker-end="url(#arrowHead)" opacity="0.75" />',

      '  <!-- Overlay Label Badges -->',
      '  <rect x="' + (zone.x + 8) + '" y="' + (zone.y + 12) + '" width="180" height="24" fill="#37003c" stroke="#00ff85" stroke-width="1" />',
      '  <text x="' + (zone.x + 14) + '" y="' + (zone.y + 28) + '" fill="#00ff85" font-family="monospace" font-size="10" font-weight="bold" letter-spacing="1">',
      '    ' + zone.label,
      '  </text>',

      '  <!-- Direction of Attack Banner -->',
      '  <text x="340" y="442" fill="rgba(255,255,255,0.5)" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="2">',
      '    DIRECTION OF ATTACK >>>',
      '  </text>',

      '  <!-- Player Name Monogram -->',
      '  <rect x="28" y="28" width="220" height="42" fill="rgba(36, 0, 40, 0.9)" stroke="#d1d1d6" stroke-width="1" />',
      '  <rect x="28" y="28" width="6" height="42" fill="#00ff85" />',
      '  <text x="44" y="46" fill="#ffffff" font-family="Arial, sans-serif" font-size="12" font-weight="900">',
      '    ' + escapeXml(pName.toUpperCase()),
      '  </text>',
      '  <text x="44" y="62" fill="#00ff85" font-family="monospace" font-size="10" font-weight="bold">',
      '    ' + escapeXml(pClub.toUpperCase()) + ' // ' + escapeXml(activeZoneName.toUpperCase()),
      '  </text>',
      '</svg>'
    ].join('\n');

    container.innerHTML = svgHtml;
  };

  /**
   * Render Side-by-Side Sharp Player Comparison Bars
   */
  PLCharts.renderPlayerComparison = function(containerId, pA, pB) {
    var container = document.getElementById(containerId);
    if (!container || !pA || !pB) return;

    var metrics = [
      { key: 'goals', label: 'GOALS', maxVal: 35 },
      { key: 'assists', label: 'ASSISTS', maxVal: 20 },
      { key: 'xg', label: 'EXPECTED GOALS (xG)', maxVal: 30 },
      { key: 'xa', label: 'EXPECTED ASSISTS (xA)', maxVal: 16 },
      { key: 'key_passes', label: 'KEY PASSES', maxVal: 100 },
      { key: 'pass_accuracy', label: 'PASS ACCURACY %', maxVal: 100 },
      { key: 'minutes', label: 'MINUTES PLAYED', maxVal: 3420 }
    ];

    var html = [
      '<div class="compare-header" style="display:flex; justify-content:space-between; margin-bottom:18px; border-bottom:2px solid var(--pl-purple); padding-bottom:12px;">',
      '  <div style="border-left:4px solid var(--pl-green); padding-left:10px;">',
      '    <div style="font-family:var(--font-display); font-size:1.1rem; color:var(--pl-purple);">' + escapeXml(pA.name) + '</div>',
      '    <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--pl-text-muted);">' + escapeXml(pA.club) + ' (' + pA.position + ')</div>',
      '  </div>',
      '  <div style="text-align:right; border-right:4px solid var(--pl-magenta); padding-right:10px;">',
      '    <div style="font-family:var(--font-display); font-size:1.1rem; color:var(--pl-magenta);">' + escapeXml(pB.name) + '</div>',
      '    <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--pl-text-muted);">' + escapeXml(pB.club) + ' (' + pB.position + ')</div>',
      '  </div>',
      '</div>',
      '<div class="compare-bars-list" style="display:flex; flex-direction:column; gap:16px;">'
    ];

    metrics.forEach(function(m) {
      var valA = Number(pA[m.key]) || 0;
      var valB = Number(pB[m.key]) || 0;
      var maxPossible = Math.max(valA, valB, m.maxVal * 0.7);
      var pctA = Math.min(100, Math.round((valA / maxPossible) * 100));
      var pctB = Math.min(100, Math.round((valB / maxPossible) * 100));

      html.push(
        '<div class="metric-row">',
        '  <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:0.75rem; font-weight:bold; margin-bottom:4px;">',
        '    <span style="color:var(--pl-purple);">' + valA + (m.key === 'pass_accuracy' ? '%' : '') + '</span>',
        '    <span style="color:var(--pl-text-muted); letter-spacing:1px;">' + m.label + '</span>',
        '    <span style="color:var(--pl-magenta);">' + valB + (m.key === 'pass_accuracy' ? '%' : '') + '</span>',
        '  </div>',
        '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; height:12px; background:#e5e5ea;">',
        '    <!-- Left bar for Player A (aligned right) -->',
        '    <div style="display:flex; justify-content:flex-end; background:#e5e5ea;">',
        '      <div style="width:' + pctA + '%; background:var(--pl-green); height:100%;"></div>',
        '    </div>',
        '    <!-- Right bar for Player B (aligned left) -->',
        '    <div style="display:flex; justify-content:flex-start; background:#e5e5ea;">',
        '      <div style="width:' + pctB + '%; background:var(--pl-magenta); height:100%;"></div>',
        '    </div>',
        '  </div>',
        '</div>'
      );
    });

    html.push('</div>');
    container.innerHTML = html.join('');
  };

  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe).replace(/[<>&'"]/g, function(c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  root.PLCharts = PLCharts;
})(typeof window !== 'undefined' ? window : this);
