// ─────────────────────────────────────────────────────────────────────────────
// Attention cues — a reusable in-page toolkit for Playwright UX recordings and
// screenshots. Injects a `window.__demo` controller that steers the viewer's
// eye while you record beats or capture screens:
//
//   • caption HUD        — a floating subtitle pill at bottom-center
//   • magnetised ring    — an accent outline that tracks a target every frame
//   • spotlight scrim    — dims the rest of the page so the target pops
//   • label badge        — a small tag above the target naming what it is
//   • synthetic click     — a realistic pointer/mouse sequence (toggles actuate)
//   • smooth scroll       — centers a target before highlighting it
//
// Usage (ESM):
//   import { installAttentionCues, cues } from './attention-cues.mjs';
//   await installAttentionCues(context);   // BEFORE first navigation (re-installs
//                                           // on every document via addInitScript)
//   const ui = cues(page);
//   await ui.scrollTo({ selector: '#task' });
//   await ui.hlStart({ selector: '#task' }, 'Task = Select gate prompt');
//   await ui.caption('Start with the task — the Select gate prompt', 3200);
//   await ui.hlStop();
//
// Selector spec (the `resolve` engine — every cue takes one):
//   { selector }                              CSS selector (first visible match)
//   { selector, nth }                         pick the nth visible match
//   { selector, text }                        CSS match whose text matches /text/i
//   { text }                                  smallest visible element matching /text/i
//   { ..., closest: '.card' }                 climb to nearest ancestor matching css
//   { ..., climb: 2 }                         climb N parentElements (frame a wrapper)
//   { scopeText, scopeClosest, selector }     scope the search to a region first
//
// Theme: pass { accent, hudBg } to installAttentionCues to override the colors.
// Defaults: amber accent (#f59e0b) + dark translucent HUD — legible on light AND
// dark themes thanks to the backdrop blur and the dimming scrim.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the in-page toolkit source. Injected verbatim via addInitScript so it is
 * re-installed on every navigation/SPA document.
 * @param {{accent?: string, accentText?: string, hudBg?: string, scrim?: number}} [theme]
 */
export function attentionToolkit(theme = {}) {
  const accent = theme.accent ?? "rgba(245,158,11,0.95)"; // amber
  const accentSolid = theme.accentSolid ?? "rgba(245,158,11,0.97)";
  const accentText = theme.accentText ?? "#1a1205";
  const hudBg = theme.hudBg ?? "rgba(15,15,17,0.82)";
  const scrim = theme.scrim ?? 0.2; // 0..1 — how much to dim the rest of the page
  return `
window.__demo = (function () {
  var ACCENT = ${JSON.stringify(accent)};
  var ACCENT_SOLID = ${JSON.stringify(accentSolid)};
  var ACCENT_TEXT = ${JSON.stringify(accentText)};
  var HUD_BG = ${JSON.stringify(hudBg)};
  var SCRIM = ${JSON.stringify(scrim)};

  function vis(el){ if(!el) return false; var r=el.getBoundingClientRect(); var s=getComputedStyle(el); return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'; }
  function byText(src, root){
    var re = new RegExp(src, 'i');
    root = root || document.body;
    var cands = [].slice.call(root.querySelectorAll('*')).filter(function(el){ return vis(el) && re.test((el.textContent||'').trim()); });
    cands.sort(function(a,b){ return (a.textContent||'').length-(b.textContent||'').length; });
    return cands[0] || null;
  }
  function resolve(spec){
    if (!spec) return null;
    var root = document.body;
    if (spec.scopeText){ var s = byText(spec.scopeText, document.body); if (s && spec.scopeClosest) { root = s.closest(spec.scopeClosest) || s; } else if (s) { root = s; } }
    if (spec.selector){
      var els = [].slice.call(root.querySelectorAll(spec.selector)).filter(vis);
      if (spec.text){ var re=new RegExp(spec.text,'i'); els = els.filter(function(e){ return re.test((e.textContent||'').trim()); }); }
      var el = els[spec.nth||0] || null;
      if (el && spec.closest) el = el.closest(spec.closest) || el;
      if (el && spec.climb) for (var i=0;i<spec.climb;i++) el = el.parentElement || el;
      return el;
    }
    if (spec.text){
      var el2 = byText(spec.text, root);
      if (el2 && spec.closest) el2 = el2.closest(spec.closest) || el2;
      if (el2 && spec.climb) for (var j=0;j<spec.climb;j++) el2 = el2.parentElement || el2;
      return el2;
    }
    return null;
  }

  // ── caption HUD ────────────────────────────────────────────────────────────
  function ensureHud(){
    var el = document.getElementById('__hud');
    if (el) return el;
    el = document.createElement('div'); el.id='__hud';
    Object.assign(el.style,{position:'fixed',left:'50%',bottom:'40px',transform:'translateX(-50%)',padding:'11px 20px',background:HUD_BG,color:'#fff',font:'600 15px/1.4 -apple-system,BlinkMacSystemFont,Inter,sans-serif',borderRadius:'999px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',boxShadow:'0 8px 28px rgba(0,0,0,0.4)',zIndex:'2147483647',pointerEvents:'none',opacity:'0',transition:'opacity 220ms ease',maxWidth:'74vw',textAlign:'center'});
    document.body.appendChild(el); return el;
  }
  function caption(t){ var el=ensureHud(); el.textContent=t; el.style.opacity='1'; }
  function hideCaption(){ var el=document.getElementById('__hud'); if(el) el.style.opacity='0'; }

  // ── magnetised highlight ring + spotlight scrim + label badge ───────────────
  var raf=null;
  function hlStop(){ if(raf) cancelAnimationFrame(raf); raf=null; ['__hl','__hlBadge'].forEach(function(id){var e=document.getElementById(id); if(e) e.remove();}); }
  function hlStart(spec, label){
    hlStop();
    var target = resolve(spec);
    if (!target) return false;
    var box=document.createElement('div'); box.id='__hl';
    Object.assign(box.style,{position:'fixed',border:'2px solid '+ACCENT,borderRadius:'10px',boxShadow:'0 0 0 9999px rgba(0,0,0,'+SCRIM+'), 0 0 12px 2px rgba(245,158,11,0.45)',zIndex:'2147483646',pointerEvents:'none',transition:'opacity 160ms ease',opacity:'0'});
    document.body.appendChild(box);
    var badge=document.createElement('div'); badge.id='__hlBadge';
    Object.assign(badge.style,{position:'fixed',zIndex:'2147483647',pointerEvents:'none',background:ACCENT_SOLID,color:ACCENT_TEXT,font:'600 12.5px/1.2 -apple-system,BlinkMacSystemFont,Inter,sans-serif',padding:'6px 10px',borderRadius:'8px',boxShadow:'0 4px 14px rgba(0,0,0,0.35)',whiteSpace:'nowrap',opacity:'0',transition:'opacity 160ms ease'});
    badge.textContent = label||'';
    document.body.appendChild(badge);
    function frame(){
      var r = target.getBoundingClientRect();
      var onScreen = r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth;
      box.style.opacity = onScreen ? '1':'0';
      badge.style.opacity = (onScreen && label) ? '1':'0';
      var pad=6;
      box.style.left=(r.left-pad)+'px'; box.style.top=(r.top-pad)+'px';
      box.style.width=(r.width+pad*2)+'px'; box.style.height=(r.height+pad*2)+'px';
      var bw=badge.offsetWidth||120, bh=badge.offsetHeight||26;
      var bx=r.left + r.width/2 - bw/2; bx=Math.max(8, Math.min(innerWidth-bw-8, bx));
      var by=r.top-pad-bh-8; if (by<8) by=r.bottom+pad+8;
      badge.style.left=bx+'px'; badge.style.top=by+'px';
      raf=requestAnimationFrame(frame);
    }
    frame();
    return true;
  }

  // ── synthetic click (toggles/checkboxes visibly actuate on camera) ──────────
  function clickEl(spec){
    var el=resolve(spec); if(!el) return false;
    el.scrollIntoView({block:'center'});
    ['pointerover','pointerenter','pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t){
      var Ev = t.indexOf('pointer')===0 ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ev(t,{bubbles:true,cancelable:true,view:window}));
    });
    return true;
  }
  function scrollTo(spec){ var el=resolve(spec); if(el) el.scrollIntoView({block:'center'}); return !!el; }

  return { caption: caption, hideCaption: hideCaption, hlStart: hlStart, hlStop: hlStop, clickEl: clickEl, scrollTo: scrollTo, resolve: function(s){ return !!resolve(s); } };
})();
`;
}

/**
 * Install the toolkit so it is (re)injected on every document. Call on the
 * BrowserContext (preferred) or a Page, BEFORE the first navigation.
 * @param {import('playwright').BrowserContext | import('playwright').Page} target
 * @param {Parameters<typeof attentionToolkit>[0]} [theme]
 */
export async function installAttentionCues(target, theme) {
  await target.addInitScript({ content: attentionToolkit(theme) });
}

/**
 * Node-side ergonomic wrappers around the in-page controller for one Page.
 * @param {import('playwright').Page} page
 */
export function cues(page) {
  return {
    /** Show a subtitle, then dwell `ms` (set ms=0 to not wait). */
    caption: async (text, ms = 1800) => {
      await page.evaluate((t) => window.__demo.caption(t), text);
      if (ms) await page.waitForTimeout(ms);
    },
    hideCaption: async () => {
      await page.evaluate(() => window.__demo.hideCaption());
      await page.waitForTimeout(180);
    },
    /** Draw the magnetised ring + scrim + (optional) label badge on a target. */
    hlStart: (spec, label) =>
      page.evaluate(([s, l]) => window.__demo.hlStart(s, l), [spec, label]),
    /** Remove the ring/badge. Always call before highlighting the next target. */
    hlStop: () => page.evaluate(() => window.__demo.hlStop()),
    /** Dispatch a realistic click sequence so toggles actuate visibly. */
    clickEl: (spec) => page.evaluate((s) => window.__demo.clickEl(s), spec),
    /** Center a target in the viewport. */
    scrollTo: (spec) => page.evaluate((s) => window.__demo.scrollTo(s), spec),
    /** Does the spec resolve to a visible element? (probe before highlighting.) */
    resolves: (spec) => page.evaluate((s) => window.__demo.resolve(s), spec),
  };
}

/**
 * VS Code puts our editor two frames down (iframe.webview -> #active-frame), and
 * an overlay installed in the top document draws in *top-document* coordinates,
 * so it cannot ring anything inside the webview.
 *
 * The answer is to install the toolkit in both documents and route by target:
 * captions go to the top document so they float over the whole window, and rings
 * on editor content go to the webview, where they are clipped to it — which is
 * fine, because everything we ring there is editor content.
 *
 * addInitScript does not reach an already-loaded webview frame, so this
 * evaluates the toolkit directly and is safe to call again after a reload.
 */
export async function installInFrame(frame, theme) {
  // The toolkit ends by assigning an object of functions; without a trailing
  // literal Playwright tries to serialise that back and fails.
  await frame.evaluate(`${attentionToolkit(theme)}\n;true`);
}

/** Same, for an already-loaded top-level document. */
export async function installInPage(page, theme) {
  await installInFrame(page, theme);
}

/**
 * The same wrappers as `cues`, but against any frame. Frames have `evaluate`
 * and no `waitForTimeout`, so the page is passed in for waiting.
 */
export function cuesIn(frame, page) {
  const has = () => frame.evaluate(() => typeof window.__demo !== "undefined");
  return {
    caption: async (text, ms = 1800) => {
      await frame.evaluate((t) => window.__demo.caption(t), text);
      if (ms) await page.waitForTimeout(ms);
    },
    hideCaption: async () => {
      await frame.evaluate(() => window.__demo.hideCaption());
      await page.waitForTimeout(180);
    },
    hlStart: (spec, label) => frame.evaluate(([s, l]) => window.__demo.hlStart(s, l), [spec, label]),
    hlStop: () => frame.evaluate(() => window.__demo.hlStop()),
    scrollTo: (spec) => frame.evaluate((s) => window.__demo.scrollTo(s), spec),
    installed: has,
  };
}
