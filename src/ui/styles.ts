export const styles = `
:host{--bg:#214f84;--ink:#fff;--muted:rgba(255,255,255,.58);--accent:#fff;--border:rgba(255,255,255,.18);display:block;color-scheme:dark;color:var(--ink);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}
section{position:relative;isolation:isolate;background:var(--bg);border-radius:12px;overflow:hidden;min-width:0;transition:background-color .5s ease}
header{position:relative;padding:18px 54px 12px 22px;min-height:62px}
h2{font-size:17px;line-height:1.3;letter-spacing:-.35px;font-weight:750;margin:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.status{font-size:11px;color:rgba(255,255,255,.74);margin:6px 0 0}
.viewport{position:relative;height:292px;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-width:none;padding:66px 22px 136px;outline-offset:-3px}.viewport::-webkit-scrollbar{display:none}
.line{margin:0 0 19px;color:rgba(255,255,255,.46);font-size:22px;line-height:1.4;font-weight:750;letter-spacing:-.6px;overflow-wrap:anywhere;transform:translateX(0);transform-origin:left center;transition:font-size 360ms cubic-bezier(.22,.8,.25,1),color 320ms ease,transform 420ms cubic-bezier(.22,.8,.25,1);}
button.line{display:block;width:100%;text-align:left;border:0;background:transparent;border-radius:4px;padding:0;min-height:0}button.line:hover{background:transparent;color:#fff}button.line:focus-visible{outline-offset:5px}
.timing-stepper{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0}.timing-stepper input[type=number]{margin:0;width:78px}.timing-stepper button{padding:5px 9px}button:disabled,input:disabled{opacity:.4;cursor:default}.timing-hint{font-size:10px;color:var(--muted);margin:4px 0 12px}
.fullscreen-divider,.fullscreen-toggle{display:none}
:host([fullscreen]){position:fixed!important;inset:16px 16px 76px auto!important;width:var(--lyrics-width,360px)!important;height:calc(100dvh - 92px)!important;margin:0!important;z-index:2147483646;overflow:visible}
:host([fullscreen]) section{height:100%;display:flex;flex-direction:column;box-shadow:0 8px 32px #0004}
:host([fullscreen]) header{flex:none;padding-right:94px}
:host([fullscreen]) .viewport{height:auto;min-height:0;flex:1;padding-top:clamp(50px,16vh,150px);padding-bottom:40vh}
:host([fullscreen]) .menu{max-height:calc(100% - 68px)}
:host([fullscreen]) .fullscreen-divider{display:block;position:absolute;left:-12px;top:0;bottom:0;width:18px;cursor:ew-resize;touch-action:none;z-index:5;outline-offset:-3px}
.fullscreen-divider::after{content:'';position:absolute;top:calc(50% - 30px);left:6px;width:4px;height:60px;border-radius:4px;background:#ffffff70}.fullscreen-divider:hover::after,.fullscreen-divider:focus-visible::after{background:#fff}
:host([fullscreen]) .fullscreen-toggle{display:grid;place-items:center;position:absolute;right:50px;top:12px;z-index:5;width:34px;height:34px;min-height:34px;padding:0;border:0;border-radius:50%;background:transparent;font-size:24px}
:host([fullscreen][collapsed]){width:82px!important;height:40px!important;bottom:auto!important}
:host([fullscreen][collapsed]) section,:host([fullscreen][collapsed]) .fullscreen-divider{display:none}
:host([fullscreen][collapsed]) .fullscreen-toggle{right:0;top:0;width:82px;background:#18211fec;font-size:13px;border:1px solid #ffffff50}
.viewport[data-timed=false] .line{color:rgba(255,255,255,.9)}.line.past{color:rgba(255,255,255,.7)}.line.active{color:#fff;font-size:26px;transform:translateX(2px);text-shadow:0 1px 12px rgba(0,0,0,.08)}
.section{display:none}.message{font-size:15px;font-weight:550;line-height:1.6;color:rgba(255,255,255,.86);margin:0 0 18px;max-width:30ch}
.viewport:has(.message),.viewport:has(.candidate),.viewport:has(.genius-search){padding-top:22px;padding-bottom:24px}
.genius-search{display:grid;gap:8px;margin:0 0 18px;padding-bottom:16px;border-bottom:1px solid var(--border)}.genius-search label{margin:0}.genius-search input{min-width:0;margin:5px 0 0}.genius-search button{justify-self:start}
button,summary,input,select{font:inherit}button,summary{cursor:pointer}button{border:1px solid var(--border);border-radius:7px;color:#fff;background:rgba(255,255,255,.06);padding:8px 11px;min-height:34px}button:hover{background:rgba(255,255,255,.14)}
button:focus-visible,summary:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,.viewport:focus-visible,::slotted(input:focus-visible){outline:2px solid #fff;outline-offset:3px}
.settings{position:static}.settings>summary{position:absolute;right:12px;top:12px;list-style:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:0;z-index:4}.settings>summary::-webkit-details-marker{display:none}.settings>summary::after{content:'\u2022\u2022\u2022';font-size:16px;letter-spacing:2px}.settings>summary:hover,.settings[open]>summary{background:rgba(0,0,0,.14)}
.menu{position:absolute;top:52px;right:10px;left:10px;max-height:290px;overflow:auto;z-index:3;background:#17201f;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:15px;box-shadow:0 14px 30px rgba(0,0,0,.3)}
.menu-title{font-size:12px;font-weight:700;margin:0 0 9px}.controls{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}label{display:block;font-size:11px;color:rgba(255,255,255,.7);margin:12px 0 5px}input[type=text],input[type=search],input[type=url],select{width:100%;padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:5px;background:#202c2b;color:#fff;margin:5px 0 7px}input[type=number]{width:66px;padding:5px;margin-left:8px;background:#202c2b;border:1px solid var(--border);border-radius:5px;color:#fff}input[type=file]{max-width:100%;font-size:11px}
a{color:inherit;text-decoration:underline;text-underline-offset:3px}.provenance{font-size:10px;line-height:1.55;color:rgba(255,255,255,.6);margin:12px 0 0}.source{display:block;font-size:11px;margin-top:12px}
.follow{position:absolute;right:15px;bottom:15px;z-index:2;border:0;border-radius:20px;background:#fff;color:#17201f;font-size:11px;font-weight:750;box-shadow:0 3px 14px #0003;padding:8px 13px}
.candidate{display:block;width:100%;text-align:left;font-weight:650;margin:0 0 10px}.candidate small{display:block;color:rgba(255,255,255,.62);font-weight:400;margin-top:3px;font-size:10px}
.skeleton{height:20px;width:88%;margin:0 0 23px;background:rgba(255,255,255,.12);border-radius:4px;animation:breathe 1.4s ease-in-out infinite alternate}.skeleton:nth-child(2){width:70%}.skeleton:nth-child(3){width:94%}@keyframes breathe{to{opacity:.4}}
.no-motion .line{transition:none;transform:none}.no-motion .skeleton{animation:none}
@media(prefers-reduced-motion:reduce){.line,section{transition:none!important;transform:none!important}.skeleton{animation:none}}
@media(max-width:650px){.viewport{height:270px}.menu{max-height:260px}}
`;
