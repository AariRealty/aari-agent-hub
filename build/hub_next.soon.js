/* === Coming soon =========================================================
   Screens that are not wired yet must not show 18 August data, so their
   literals are emptied at build time. An emptied screen would still draw its
   cards, just blank, which reads as broken rather than unfinished. These
   overrides replace the page function outright.

   The page functions are hoisted declarations in this same scope, so
   reassigning the binding is enough. No design markup was edited.

   As each screen is wired its entry comes out of SOON and the original
   function takes over again.                                               */
function __soonCard(title, line){
  return '<div class="card" style="grid-area:1/1/2/3">'+
    '<div class="chead"><div class="ctitle">'+title+'</div>'+
    '<span class="chip">coming soon</span></div>'+
    '<div class="fill" style="display:flex;flex-direction:column;justify-content:center;'+
      'align-items:center;text-align:center;padding:34px 22px;gap:8px">'+
      '<div style="font-family:var(--serif);font-size:22px;font-weight:500;letter-spacing:-.01em">'+
        'Not connected yet</div>'+
      '<div style="font-size:13px;color:var(--mute);line-height:1.5;max-width:32ch">'+line+'</div>'+
    '</div></div>';
}
