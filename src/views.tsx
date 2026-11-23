import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import {
  AllSorted,
  Avatar,
  BILL_ICONS,
  BillIconTile,
  EmptyBills,
  guessIcon,
  isBillIcon,
  Jar,
  LoginHero,
  Logo,
  UiIcon,
  type BillIcon,
} from "./art";
import type { Role } from "./auth";
import type { Bill, BillEntry, BillWithTotals, TxnWithAllocations } from "./db";
import { billStatus, formatCents, percent } from "./matching";
import { FREQUENCIES, FREQUENCY_LABELS, isFrequency } from "./periods";
import type { UpAccount, UpWebhook } from "./up";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap";

const CSS = `
:root{
  --bg:#FBF7F0;--bg-dot:#EFE6D6;--card:#FFFFFF;--ink:#23201C;--muted:#7A7268;--line:#ECE4D6;
  --accent:#FF6B3D;--accent-press:#E85A2E;--accent-soft:#FFE6DA;--on-accent:#fff;
  --ok:#1E9E68;--ok-soft:#DDF5EA;--blue:#3D74F5;--blue-soft:#E2EBFF;--sun:#FFC83D;--warn-soft:#FFF1CF;--warn:#8A5A00;
  --danger:#D2452B;--track:#F1EADF;--shadow:0 1px 0 rgba(35,32,28,.04),0 8px 24px -12px rgba(35,32,28,.18);
  --t-sun:#FFF0C2;--t-sun-i:#B57A00;--t-sky:#DDEBFF;--t-sky-i:#2F63D6;--t-peach:#FFE3D4;--t-peach-i:#D8551F;
  --t-aqua:#D7F4F4;--t-aqua-i:#11847F;--t-rose:#FFE0E6;--t-rose-i:#C93A5B;--t-lilac:#ECE3FF;--t-lilac-i:#6A48D4;
  --t-mint:#DCF5E6;--t-mint-i:#1F8A55;--t-stone:#EEE9E1;--t-stone-i:#6E665B;
  --display:"Bricolage Grotesque",system-ui,sans-serif;
}
/* Dark theme: only when picked with the header toggle (data-theme on <html>). Light is the default. */
:root[data-theme=dark]{color-scheme:dark;
  --bg:#16130F;--bg-dot:#231F19;--card:#201C17;--ink:#F6EFE5;--muted:#A99F91;--line:#332D25;
  --accent-soft:#45261A;--ok-soft:#173A2B;--blue-soft:#1C2A4A;--warn-soft:#3A2E12;--warn:#F2C25B;--danger:#FF8A70;--track:#2D2820;
  --shadow:0 1px 0 rgba(0,0,0,.3),0 10px 28px -14px rgba(0,0,0,.7);
  --t-sun:#3B3013;--t-sun-i:#FFCF5A;--t-sky:#1B2948;--t-sky-i:#8DB2FF;--t-peach:#40251A;--t-peach-i:#FF9B6E;
  --t-aqua:#123532;--t-aqua-i:#5FD6CF;--t-rose:#3E1E27;--t-rose-i:#FF8FA8;--t-lilac:#2A2145;--t-lilac-i:#B9A2FF;
  --t-mint:#163526;--t-mint-i:#6FD9A0;--t-stone:#2E2922;--t-stone-i:#BDB3A5;
}
:root[data-theme=light]{color-scheme:light}
.theme-btn .sun{display:none}
:root[data-theme=dark] .theme-btn .sun{display:inline-flex}
:root[data-theme=dark] .theme-btn .moon{display:none}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background-image:radial-gradient(var(--bg-dot) 1.2px,transparent 1.2px);background-size:22px 22px;min-height:100vh}
a{color:inherit}
h1,h2,.display{font-family:var(--display);letter-spacing:-.02em}
h1{font-size:28px;line-height:1.1;margin:0;font-weight:800}
h2{font-size:19px;margin:0;font-weight:700}
.tnum{font-variant-numeric:tabular-nums}

/* header */
.top{position:sticky;top:0;z-index:5;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--line)}
.top-in{max-width:820px;margin:0 auto;display:flex;align-items:center;gap:18px;padding:10px 16px}
.logo{display:inline-flex;align-items:center;gap:9px;text-decoration:none}
.logo-mark{display:inline-block;flex:none}.logo-mark svg{width:100%;height:100%;display:block}
a.home:hover .logo-mark{animation:wiggle .6s ease}
.logo-word{font-family:var(--display);font-weight:800;font-size:22px;letter-spacing:-.03em;line-height:1}
.logo-dot{color:var(--accent)}
.logo-tag{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--ink);color:var(--bg);
  padding:3px 7px;border-radius:99px;margin-left:6px;vertical-align:4px}
.top nav{display:flex;gap:4px;flex:1}
.top nav a{text-decoration:none;color:var(--muted);font-weight:600;padding:7px 12px;border-radius:99px}
.top nav a.on{background:var(--card);color:var(--ink);box-shadow:var(--shadow)}
.top .right{margin-left:auto;display:flex;align-items:center;gap:8px}
.chip{font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:var(--blue-soft);color:var(--blue);display:inline-flex;gap:5px;align-items:center}
.icon-btn{border:none;background:none;color:var(--muted);padding:8px;border-radius:10px;cursor:pointer;display:inline-flex}
.icon-btn:hover{background:var(--track);color:var(--ink)}

/* bottom nav (phones, admin only) */
.tabbar{display:none}
@media (max-width:640px){
  .top nav{display:none}
  .tabbar{display:flex;position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:6;
    background:var(--ink);border-radius:22px;padding:6px;box-shadow:0 12px 30px -10px rgba(0,0,0,.45)}
  .tabbar a{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0 6px;border-radius:16px;
    text-decoration:none;color:color-mix(in srgb,var(--bg) 60%,transparent);font-size:11px;font-weight:700}
  .tabbar a.on{background:color-mix(in srgb,var(--bg) 14%,transparent);color:var(--bg)}
  body.has-tabbar main{padding-bottom:110px}
}

main{max-width:820px;margin:0 auto;padding:22px 16px 60px}
.section-head{display:flex;align-items:center;gap:10px;margin:28px 0 12px}
.section-head .spacer{flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow)}
.stack{display:grid;gap:12px}
.muted{color:var(--muted)}
.hint{color:var(--muted);font-size:13px;margin:6px 0 0}

/* buttons & forms */
button,.btn{font:inherit;font-weight:650;border:1.5px solid var(--line);background:var(--card);color:var(--ink);padding:9px 15px;
  border-radius:14px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;line-height:1.2;
  transition:transform .12s ease,background .15s}
button:active,.btn:active{transform:translateY(1px) scale(.98)}
.primary{background:var(--accent)!important;border-color:var(--accent)!important;color:var(--on-accent)!important;box-shadow:0 3px 0 var(--accent-press)}
.primary:active{box-shadow:0 1px 0 var(--accent-press)}
button:disabled{opacity:.45;cursor:not-allowed}
button.danger{color:var(--danger)}
button.link{border:none;background:none;padding:0;color:var(--muted);text-decoration:underline;font-weight:500}
form.inline{display:inline}
.row>form.inline{display:flex}
label{display:block;font-weight:700;font-size:13px;margin:16px 0 6px}
input,select{font:inherit;width:100%;padding:11px 13px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink)}
input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

.flash{display:flex;gap:10px;align-items:center;background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:11px 14px;margin-bottom:16px;box-shadow:var(--shadow);animation:pop .35s ease}
.flash::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none}
.notice{background:var(--warn-soft);color:var(--warn);border-radius:16px;padding:12px 15px;margin-bottom:16px;font-weight:550}

/* hero */
.hero{display:flex;gap:18px;align-items:center;padding:20px 22px;background:linear-gradient(135deg,var(--accent-soft),var(--card) 70%)}
.hero .jar{width:104px;flex:none}
.hero .kicker{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.hero .big{font-family:var(--display);font-size:40px;font-weight:800;line-height:1;margin:6px 0 4px;letter-spacing:-.03em}
.hero .big small{font-size:18px;color:var(--muted);font-weight:600;letter-spacing:0}
.hero-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pill{font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.pill.ok{background:var(--ok-soft);border-color:transparent;color:var(--ok)}
.pill.blue{background:var(--blue-soft);border-color:transparent;color:var(--blue)}
@media (max-width:420px){.hero{padding:16px}.hero .jar{width:84px}.hero .big{font-size:32px}}

/* jar */
.jar-glass{fill:color-mix(in srgb,var(--card) 55%,transparent);stroke:var(--ink);stroke-width:3}
.jar-lid{fill:var(--accent);stroke:var(--ink);stroke-width:3}
.jar-fill{fill:var(--sun);animation:jarfill 1.1s cubic-bezier(.2,.8,.2,1) both}
.jar-wave{fill:var(--sun);animation:jarfill 1.1s cubic-bezier(.2,.8,.2,1) both}
.jar-coins ellipse{fill:#F2AE1C;stroke:var(--ink);stroke-width:2}
.jar-shine{stroke:#fff;stroke-width:4;stroke-linecap:round;opacity:.55}
.jar-label{fill:var(--card);stroke:var(--ink);stroke-width:2.5}
.jar-label-text{font:800 18px var(--display);fill:var(--ink)}
@keyframes jarfill{from{transform:translateY(80px)}to{transform:none}}

/* bill cards */
.bill{display:block;text-decoration:none;position:relative;transition:transform .15s ease,box-shadow .15s}
a.bill:hover{transform:translateY(-2px) rotate(-.25deg)}
.bill-top{display:flex;gap:13px;align-items:center}
.bill-title{flex:1;min-width:0}
.bill-name{font-family:var(--display);font-weight:700;font-size:18px;line-height:1.2;letter-spacing:-.01em}
.bill-sub{color:var(--muted);font-size:13px;margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;background:var(--track);padding:2px 8px;border-radius:7px;letter-spacing:.05em;color:var(--ink)}
.icon-tile{display:inline-grid;place-items:center;border-radius:14px;flex:none;transform:rotate(-4deg)}
.icon-tile.md{width:46px;height:46px}.icon-tile.md svg{width:24px;height:24px}
.icon-tile.lg{width:64px;height:64px;border-radius:18px}.icon-tile.lg svg{width:32px;height:32px}
.icon-tile.sm{width:34px;height:34px;border-radius:11px}.icon-tile.sm svg{width:19px;height:19px}
${["sun", "sky", "peach", "aqua", "rose", "lilac", "mint", "stone"]
  .map((t) => `.tint-${t}{background:var(--t-${t});color:var(--t-${t}-i)}`)
  .join("\n")}
.badge{font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px;background:var(--track);color:var(--muted);white-space:nowrap;position:relative}
.badge.funded{background:var(--blue-soft);color:var(--blue)}
.badge.paid{background:var(--ok-soft);color:var(--ok)}
.badge.funded::after,.badge.paid::after{content:"✦";position:absolute;top:-9px;right:-6px;font-size:13px;color:var(--sun);animation:twinkle 1.8s ease-in-out infinite}

.bar{height:16px;border-radius:99px;background:var(--track);overflow:hidden;margin:16px 0 10px;position:relative}
.bar>span{display:block;height:100%;border-radius:99px;background:var(--accent);position:relative;
  animation:grow 1s cubic-bezier(.2,.8,.2,1) both;
  background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.22) 0 8px,transparent 8px 16px);background-size:22.6px 22.6px}
.bar.open>span{animation:grow 1s cubic-bezier(.2,.8,.2,1) both,stripes 1.2s linear infinite}
.bar.funded>span{background-color:var(--blue)}
.bar.paid>span{background-color:var(--ok);background-image:none}
.bar>span::after{content:"";position:absolute;right:3px;top:3px;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.75)}
.bar>span[style*="width:0%"]::after{display:none}
@keyframes grow{from{width:0}}
@keyframes stripes{to{background-position:22.6px 0}}

.bill-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.amount{font-size:14px;color:var(--muted)}
.amount strong{font-family:var(--display);font-size:20px;color:var(--ink);font-weight:800;letter-spacing:-.02em}
.avatars{display:flex;align-items:center}
.avatar{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;font-weight:800;border:2px solid var(--card);margin-left:-7px}
.avatars .avatar:first-child{margin-left:0}
.right-meta{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px}

/* empty states */
.empty{text-align:center;color:var(--muted);padding:26px 18px}
.illo{width:170px;display:block;margin:0 auto 6px}
.illo-shadow{fill:var(--track)}
.illo-paper{fill:var(--card);stroke:var(--ink);stroke-width:3;stroke-linejoin:round}
.illo-ink{fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round}.illo-ink.faint{opacity:.35}
.illo-ink-fill{fill:var(--ink)}
.illo-coin{fill:var(--sun);stroke:var(--ink);stroke-width:2.5}
.illo-coin-text{font:800 13px var(--display);fill:var(--ink)}
.illo-float{animation:float 2.6s ease-in-out infinite}
.illo-ok{fill:var(--ok-soft);stroke:var(--ok);stroke-width:3}
.illo-check{fill:none;stroke:var(--ok);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;animation:draw .7s .2s ease both}
.illo-confetti>*{fill:var(--accent)}.illo-confetti>*:nth-child(2n){fill:var(--sun)}.illo-confetti>*:nth-child(3n){fill:var(--blue)}
.illo-confetti{animation:float 3s ease-in-out infinite}

/* how to pay (viewer) */
.howto{display:flex;gap:14px;align-items:flex-start;background:var(--ink);color:var(--bg);border:none}
.howto .num{font-family:var(--display);font-weight:800;background:var(--sun);color:#23201C;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;transform:rotate(-6deg)}
.howto .code{background:color-mix(in srgb,var(--bg) 16%,transparent);color:var(--bg)}

/* payments list */
.pay{display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px dashed var(--line)}
.pay:last-child{border-bottom:none}
.pay .who{flex:1;min-width:0}
.pay .who strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pay .sub{color:var(--muted);font-size:13px;word-break:break-word}
.pay .avatar{width:36px;height:36px;font-size:12.5px;margin:0;border:none}
.money{font-family:var(--display);font-weight:800;font-size:17px;white-space:nowrap;letter-spacing:-.01em}
.money.in{color:var(--ok)}.money.out{color:var(--danger)}
.out-dot{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--ok-soft);color:var(--ok);flex:none;font-weight:800}

.assign{display:flex;gap:6px;margin-top:10px}.assign select{flex:1}

/* bill form icon picker */
.icon-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px}
.icon-pick label{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;border:1.5px solid var(--line);border-radius:16px;cursor:pointer;font-size:12px;font-weight:650;background:var(--bg)}
.icon-pick input{position:absolute;opacity:0;width:0;height:0}
.icon-pick label:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft);background:var(--card)}
.icon-pick label:has(input:focus-visible){outline:2px solid var(--accent)}

/* setup */
.step{display:flex;gap:14px}
.step .n{font-family:var(--display);font-weight:800;width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.step .n.done{background:var(--ok-soft);color:var(--ok)}
.step .body{flex:1;min-width:0}
table{width:100%;border-collapse:collapse;font-size:14px}
td{padding:9px 4px;border-bottom:1px solid var(--line);vertical-align:middle}
code{font-size:12.5px;background:var(--track);padding:1px 6px;border-radius:6px;word-break:break-all}

/* login */
.login{max-width:380px;margin:7vh auto 0;text-align:center}
.login-hero{display:flex;align-items:flex-end;justify-content:center;gap:4px;margin-bottom:16px}
.coin-stack{width:58px;margin-bottom:4px}
.coin{fill:var(--sun);stroke:var(--ink);stroke-width:2.5}
.logo-mark.spin svg{animation:spin 14s linear infinite}
.login h1{font-size:34px}
.login .tag{color:var(--muted);margin:6px 0 22px}
.login form{text-align:left}


/* overrides */
.tag-manual{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:1px 7px;border-radius:99px;background:var(--t-lilac);color:var(--t-lilac-i)}
.note{font-style:italic}
.mini{font-size:12.5px;color:var(--muted)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.tag-est{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:1px 7px;border-radius:99px;background:var(--warn-soft);color:var(--warn)}
.tag-repeat{font-size:11px;font-weight:700;padding:1px 7px;border-radius:99px;background:var(--blue-soft);color:var(--blue)}
.short-banner{display:flex;gap:14px;align-items:flex-start;border:2px solid var(--danger);border-radius:20px;padding:16px 18px;margin-bottom:16px;background:var(--card, transparent)}
.short-banner .big{font-size:44px;line-height:1}
.short-banner h2{margin:0 0 6px;color:var(--danger);font-size:20px}
.short-banner .rows{display:flex;flex-direction:column;gap:6px}
.short-banner .r{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.short-banner .r a{color:inherit;font-weight:700}
.chips:empty{display:none}
.chip-s{font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--accent-soft);color:var(--accent)}
.chip-s.out{background:var(--ok-soft);color:var(--ok)}
.chip-s.warn{background:var(--warn-soft);color:var(--warn)}
.chip-s.muted-chip{background:var(--track);color:var(--muted)}
.split-row{display:grid;grid-template-columns:1fr 110px 140px;gap:8px;margin-bottom:8px}
@media (max-width:520px){.split-row{grid-template-columns:1fr 1fr;padding-bottom:10px;border-bottom:1px dashed var(--line)}.split-row select[name=bill]{grid-column:1/-1}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
@media (max-width:420px){.grid2{grid-template-columns:1fr}}
details>summary{cursor:pointer;list-style:none}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"+";display:inline-grid;place-items:center;width:22px;height:22px;border-radius:7px;background:var(--accent-soft);color:var(--accent);font-weight:800;margin-right:8px}
details[open]>summary::before{content:"−"}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}60%{transform:rotate(10deg)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes twinkle{0%,100%{opacity:.35;transform:scale(.8) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(20deg)}}
@keyframes pop{from{opacity:0;transform:translateY(-6px) scale(.98)}}
@keyframes draw{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}
.stagger>*{animation:pop .45s cubic-bezier(.2,.8,.2,1) both}
${Array.from({ length: 8 }, (_, i) => `.stagger>*:nth-child(${i + 1}){animation-delay:${i * 60}ms}`).join("")}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

/** Runs in <head> so the page never flashes the wrong theme. Choice is saved per device. */
const THEME_HEAD_JS = `(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}
if(t!=='dark')t='light';
document.documentElement.setAttribute('data-theme',t);
if(t==='dark'){var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content','#16130F')}})();`;

const THEME_TOGGLE_JS = `document.addEventListener('click',function(e){var b=e.target.closest('[data-theme-toggle]');if(!b)return;
var r=document.documentElement,t=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',t);
try{localStorage.setItem('theme',t)}catch(e){}
var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='dark'?'#16130F':'#FBF7F0');});`;

const COPY_JS = `document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;e.preventDefault();
navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy).then(()=>{const t=b.querySelector('.copy-label');if(t){const o=t.textContent;t.textContent='Copied!';setTimeout(()=>t.textContent=o,1200)}})});`;

type Nav = "home" | "txns" | "setup";

export const Layout: FC<{ title: string; role?: Role; nav?: Nav; children?: Child; flash?: string | null }> = (p) => {
  const admin = p.role === "admin";
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#FBF7F0" />
        <title>{p.title} · cogs.bills</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS} />
        <style>{raw(CSS)}</style>
        <script>{raw(THEME_HEAD_JS)}</script>
      </head>
      <body class={admin ? "has-tabbar" : ""}>
        {p.role && (
          <header class="top">
            <div class="top-in">
              <a class="home" href="/" style="text-decoration:none" aria-label="Home">
                <Logo size={32} />
              </a>
              {admin && (
                <nav>
                  <a href="/" class={p.nav === "home" ? "on" : ""}>Bills</a>
                  <a href="/transactions" class={p.nav === "txns" ? "on" : ""}>Payments</a>
                  <a href="/setup" class={p.nav === "setup" ? "on" : ""}>Setup</a>
                </nav>
              )}
              <div class="right">
                {!admin && (
                  <span class="chip"><UiIcon name="eye" size={14} /> View only</span>
                )}
                <button type="button" class="icon-btn theme-btn" data-theme-toggle title="Switch light / dark" aria-label="Switch between light and dark mode">
                  <span class="moon"><UiIcon name="moon" /></span>
                  <span class="sun"><UiIcon name="sun" /></span>
                </button>
                <form class="inline" method="post" action="/logout">
                  <button class="icon-btn" title="Log out" aria-label="Log out"><UiIcon name="logout" /></button>
                </form>
              </div>
            </div>
          </header>
        )}
        <main>
          {p.flash && <div class="flash">{p.flash}</div>}
          {p.children}
        </main>
        {admin && (
          <nav class="tabbar" aria-label="Main">
            <a href="/" class={p.nav === "home" ? "on" : ""}><UiIcon name="bills" size={22} />Bills</a>
            <a href="/transactions" class={p.nav === "txns" ? "on" : ""}><UiIcon name="swap" size={22} />Payments</a>
            <a href="/setup" class={p.nav === "setup" ? "on" : ""}><UiIcon name="gear" size={22} />Setup</a>
          </nav>
        )}
        <script>{raw(COPY_JS)}</script>
        <script>{raw(THEME_TOGGLE_JS)}</script>
      </body>
    </html>
  );
};

export const LoginPage: FC<{ error?: boolean }> = ({ error }) => (
  <Layout title="Log in">
    <div class="login">
      <LoginHero />
      <h1>cogs<span class="logo-dot">.</span>bills</h1>
      <p class="tag">Who's paid what, minus the awkward chats.</p>
      <div class="card">
        {error && <div class="notice">Hmm, that password didn't work.</div>}
        <form method="post" action="/login">
          <label for="pw" style="margin-top:0">Password</label>
          <input id="pw" type="password" name="password" autofocus required autocomplete="current-password" />
          <button class="primary" type="submit" style="width:100%;justify-content:center;margin-top:16px;padding:12px">
            Let me in
          </button>
        </form>
      </div>
    </div>
  </Layout>
);

function billIcon(b: { icon: string | null; name: string; code: string }): BillIcon {
  return isBillIcon(b.icon) ? b.icon : guessIcon(b.name, b.code);
}

function payerNames(b: BillWithTotals): string[] {
  return (b.payers ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

const StatusBadge: FC<{ b: BillWithTotals }> = ({ b }) => {
  const s = billStatus(b.collected, b.amount_due, b.paid_out, b.marked_paid_at);
  const label = s === "paid" ? "Paid" : s === "funded" ? "Ready to pay" : "Collecting";
  return <span class={`badge ${s}`}>{label}</span>;
};

export const BillCard: FC<{ b: BillWithTotals; link?: boolean }> = ({ b, link = true }) => {
  const s = billStatus(b.collected, b.amount_due, b.paid_out, b.marked_paid_at);
  const pct = s === "paid" ? 100 : percent(b.collected, b.amount_due);
  const payers = payerNames(b);
  const inner = (
    <>
      <div class="bill-top">
        <BillIconTile icon={billIcon(b)} />
        <div class="bill-title">
          <div class="bill-name">{b.name}</div>
          <div class="bill-sub">
            <span class="code">{b.code}</span>
            {isFrequency(b.frequency) && <span class="tag-repeat">Repeats {FREQUENCY_LABELS[b.frequency].toLowerCase()}</span>}
            {!link && b.period_start && b.due_date && <span>{fmtRange(b.period_start, b.due_date)}</span>}
            {s === "paid" && (b.paid_at || b.marked_paid_at) ? <span>Paid {fmtDate((b.paid_at || b.marked_paid_at)!)}</span> : b.due_date ? <span>Due {fmtDate(b.due_date)}</span> : null}
          </div>
        </div>
        <StatusBadge b={b} />
      </div>
      <div class={`bar ${s}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={`width:${pct}%`} />
      </div>
      <div class="bill-foot">
        <span class="amount tnum">
          <strong>{formatCents(b.collected)}</strong> of {estimate(b) ? "~" : ""}{formatCents(b.amount_due)}
          {estimate(b) && <> <span class="tag-est">estimate</span></>}
        </span>
        <span class="right-meta">
          {s === "open" && <span class="tnum">{formatCents(b.amount_due - b.collected)} to go</span>}
          {b.collected > b.amount_due && <span class="tnum">{formatCents(b.collected - b.amount_due)} extra</span>}
          {payers.length > 0 && (
            <span class="avatars">{payers.slice(0, 4).map((n) => <Avatar name={n} />)}</span>
          )}
        </span>
      </div>
    </>
  );
  return link ? (
    <a class="card bill" href={`/bills/${b.id}`}>{inner}</a>
  ) : (
    <div class="card bill">{inner}</div>
  );
};

const ShortBanner: FC<{ bills: BillWithTotals[]; admin: boolean }> = ({ bills, admin }) => (
  <div class="short-banner" role="alert">
    <span class="big" aria-hidden="true">⚠️</span>
    <div style="flex:1">
      <h2>Not fully paid</h2>
      <div class="rows">
        {bills.map((b) => (
          <div class="r">
            <a href={`/bills/${b.id}`}>
              {b.name} ({b.period_start ? fmtRange(b.period_start, b.due_date!) : `due ${fmtDate(b.due_date!)}`})
            </a>
            <span class="tnum">
              {formatCents(b.collected)} of {formatCents(b.amount_due)} · <strong>{formatCents(b.amount_due - b.collected)} short</strong>
            </span>
            {admin && (
              <form class="inline" method="post" action={`/bills/${b.id}/dismiss-shortfall`}>
                <button type="submit">Dismiss</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const Hero: FC<{ bills: BillWithTotals[] }> = ({ bills }) => {
  const unpaid = bills.filter((b) => billStatus(b.collected, b.amount_due, b.paid_out, b.marked_paid_at) !== "paid");
  const collected = unpaid.reduce((s, b) => s + Math.min(b.collected, b.amount_due), 0);
  const due = unpaid.reduce((s, b) => s + b.amount_due, 0);
  const ready = unpaid.filter((b) => b.collected >= b.amount_due).length;
  const paid = bills.length - unpaid.length;
  const pct = due ? percent(collected, due) : bills.length ? 100 : 0;
  return (
    <div class="card hero">
      <Jar pct={pct} />
      <div>
        <div class="kicker">The bills pot</div>
        <div class="big tnum">
          {formatCents(collected)} <small>/ {formatCents(due)}</small>
        </div>
        <div class="muted">
          {due === 0
            ? bills.length ? "Everything's paid. Legends." : "Add a bill to get started."
            : collected >= due ? "Fully stocked, time to pay up!" : `${formatCents(due - collected)} still to come in`}
        </div>
        <div class="hero-stats">
          {ready > 0 && <span class="pill blue">{ready} ready to pay</span>}
          {paid > 0 && <span class="pill ok">{paid} paid</span>}
          <span class="pill">{unpaid.length} open</span>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: FC<{
  role: Role;
  bills: BillWithTotals[];
  unmatched: number;
  accountName: string | null;
  lastSync: string | null;
  flash?: string | null;
  short: BillWithTotals[];
}> = (p) => {
  const admin = p.role === "admin";
  return (
    <Layout title="Bills" role={p.role} nav="home" flash={p.flash}>
      {p.short.length > 0 && <ShortBanner bills={p.short} admin={admin} />}
      {admin && !p.accountName && (
        <div class="notice">No Up account connected yet. <a href="/setup">Head to Setup</a>.</div>
      )}
      {admin && p.unmatched > 0 && (
        <div class="notice">
          {p.unmatched} payment{p.unmatched === 1 ? "" : "s"} didn't match a bill. <a href="/transactions">Sort them out →</a>
        </div>
      )}
      <Hero bills={p.bills} />

      {!admin && p.bills.length > 0 && (
        <div class="card howto" style="margin-top:12px">
          <span class="num">?</span>
          <div>
            <strong>How to pay</strong>
            <div style="opacity:.8;font-size:14px;margin-top:2px">
              Transfer to cogs's bills account and put the bill's code in the <em>reference</em>, e.g.{" "}
              <span class="code">{p.bills[0].code}</span>. The bar fills up automatically.
            </div>
          </div>
        </div>
      )}

      <div class="section-head">
        <h2>Bills</h2>
        <span class="spacer" />
        {admin && (
          <>
            <form class="inline" method="post" action="/sync">
              <button type="submit" title="Pull latest from Up"><UiIcon name="sync" size={17} />Sync</button>
            </form>
            <a class="btn primary" href="/bills/new"><UiIcon name="plus" size={17} />New bill</a>
          </>
        )}
      </div>
      {p.bills.length === 0 ? (
        <div class="card empty">
          <EmptyBills />
          <strong style="color:var(--ink)">No bills yet</strong>
          <div>{admin ? "Add one, then tell your roommate its code for the transfer reference." : "Nothing to pay right now."}</div>
        </div>
      ) : (
        <div class="stack stagger">{p.bills.map((b) => <BillCard b={b} />)}</div>
      )}
      <p class="hint" style="margin-top:18px">
        {p.accountName ? <>Watching <strong>{p.accountName}</strong>. </> : null}
        {admin && p.lastSync ? `Last full sync ${fmtDateTime(p.lastSync)}. ` : ""}
        <a href="/bills/archived">Past bills</a>
      </p>
    </Layout>
  );
};

export const ArchivedPage: FC<{ role: Role; bills: BillWithTotals[] }> = ({ role, bills }) => (
  <Layout title="Past bills" role={role} nav="home">
    <a class="btn" href="/" style="margin-bottom:14px"><UiIcon name="back" size={16} />Bills</a>
    <h1 style="margin-bottom:16px">Past bills</h1>
    {bills.length === 0 ? (
      <div class="card empty"><EmptyBills /><div>Nothing archived yet.</div></div>
    ) : (
      <div class="stack stagger">{bills.map((b) => <BillCard b={b} />)}</div>
    )}
  </Layout>
);

export const BillForm: FC<{
  bill?: {
    id?: number;
    name: string;
    code: string;
    amount: string;
    due_date: string;
    icon?: string | null;
    frequency?: string;
    approximate?: boolean;
    usual_amount?: string;
  };
  error?: string | null;
}> = ({ bill, error }) => {
  const editing = bill?.id !== undefined;
  const repeats = isFrequency(bill?.frequency);
  const chosen = isBillIcon(bill?.icon) ? bill!.icon : "";
  return (
    <Layout title={editing ? "Edit bill" : "New bill"} role="admin" nav="home">
      <a class="btn" href={editing ? `/bills/${bill!.id}` : "/"} style="margin-bottom:14px"><UiIcon name="back" size={16} />Back</a>
      <h1 style="margin-bottom:16px">{editing ? "Edit bill" : "New bill"}</h1>
      {error && <div class="notice">{error}</div>}
      <form class="card" method="post" action={editing ? `/bills/${bill!.id}` : "/bills"}>
        <label style="margin-top:0">Pick an icon</label>
        <div class="icon-pick">
          <label>
            <input type="radio" name="icon" value="" checked={!chosen} />
            <span class="icon-tile sm tint-stone" style="font-weight:800">✨</span>Auto
          </label>
          {(Object.keys(BILL_ICONS) as BillIcon[]).map((k) => (
            <label>
              <input type="radio" name="icon" value={k} checked={chosen === k} />
              <BillIconTile icon={k} size="sm" />
              {BILL_ICONS[k].label}
            </label>
          ))}
        </div>
        <label for="name">Name</label>
        <input id="name" name="name" required maxlength={80} value={bill?.name ?? ""} placeholder="Electricity" />
        <label for="code">Reference code</label>
        <input id="code" name="code" required maxlength={18} value={bill?.code ?? ""} placeholder="ELEC"
          style="text-transform:uppercase;font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:.06em" />
        <p class="hint">What your roommate types in the transfer reference. Short is best: ELEC, WIFI, RENT-DEC.</p>
        <label for="frequency">Repeats</label>
        <select id="frequency" name="frequency">
          <option value="" selected={!repeats}>Doesn't repeat</option>
          {FREQUENCIES.map((f) => (
            <option value={f} selected={bill?.frequency === f}>{FREQUENCY_LABELS[f]}</option>
          ))}
        </select>
        <label>Amount is</label>
        <div class="row" style="gap:18px">
          <label style="margin:0;font-weight:600"><input type="radio" name="approximate" value="0" checked={!bill?.approximate} /> Exact</label>
          <label style="margin:0;font-weight:600"><input type="radio" name="approximate" value="1" checked={!!bill?.approximate} /> Approximate (estimate)</label>
        </div>
        <label for="amount">{editing && repeats ? "Amount this period" : "Amount to collect"}</label>
        <input id="amount" name="amount" required inputmode="decimal" value={bill?.amount ?? ""} placeholder="$200.00" />
        {editing && repeats && (
          <>
            <p class="hint">Change this when the real bill arrives. Only this period changes.</p>
            <label for="usual_amount">Usual amount</label>
            <input id="usual_amount" name="usual_amount" inputmode="decimal" value={bill?.usual_amount ?? ""} placeholder="$200.00" />
            <p class="hint">Used for next periods.</p>
          </>
        )}
        <label for="due">Due date <span class="muted" style="font-weight:500">(required if the bill repeats)</span></label>
        <input id="due" name="due_date" type="date" value={bill?.due_date ?? ""} />
        <p class="hint">Next periods are worked out from this date.</p>
        <div class="row" style="margin-top:20px">
          <button class="primary" type="submit">{editing ? "Save changes" : "Create bill"}</button>
        </div>
      </form>
    </Layout>
  );
};

const BillOptions: FC<{ bills: Bill[]; selected?: number | null }> = ({ bills, selected }) => {
  const active = bills.filter((b) => !b.archived);
  const past = bills.filter((b) => b.archived);
  const opt = (b: Bill) => <option value={String(b.id)} selected={selected === b.id}>{b.name} ({b.code})</option>;
  return (
    <>
      <option value="">— No bill —</option>
      {active.length > 0 && <optgroup label="Current bills">{active.map(opt)}</optgroup>}
      {past.length > 0 && <optgroup label="Past bills">{past.map(opt)}</optgroup>}
    </>
  );
};

const ManualTag: FC = () => <span class="tag-manual" title="Set by the admin">manual</span>;

export const BillDetail: FC<{ role: Role; b: BillWithTotals; entries: BillEntry[]; flash?: string | null }> = ({
  role, b, entries, flash,
}) => {
  const admin = role === "admin";
  const stopsSeries = b.frequency !== null && !b.archived;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Layout title={b.name} role={role} nav="home" flash={flash}>
      <a class="btn" href="/" style="margin-bottom:14px"><UiIcon name="back" size={16} />Bills</a>
      <BillCard b={b} link={false} />
      {b.marked_paid_at && (
        <p class="hint" style="margin:8px 4px 0">Marked as paid by hand on {fmtDate(b.marked_paid_at)}.</p>
      )}
      <div class="row" style="margin-top:12px">
        <button type="button" data-copy={b.code} title="Copy reference code">
          <UiIcon name="copy" size={16} /><span class="copy-label">Copy code {b.code}</span>
        </button>
        {admin && (
          <>
            <form class="inline" method="post" action={`/bills/${b.id}/paid`}>
              <input type="hidden" name="paid" value={b.marked_paid_at ? "0" : "1"} />
              <button type="submit">{b.marked_paid_at ? "Undo mark as paid" : "Mark as paid"}</button>
            </form>
            <a class="btn" href={`/bills/${b.id}/edit`}>Edit</a>
            <form class="inline" method="post" action={`/bills/${b.id}/archive`}
              onsubmit={stopsSeries ? `return confirm(${JSON.stringify(`This stops ${b.name} repeating. Continue?`)})` : undefined}>
              <input type="hidden" name="archived" value={b.archived ? "0" : "1"} />
              <button type="submit">{b.archived ? "Unarchive" : "Archive"}</button>
            </form>
            <form class="inline" method="post" action={`/bills/${b.id}/delete`}
              onsubmit={`return confirm(${JSON.stringify(
                (stopsSeries ? `This stops ${b.name} repeating. ` : "") +
                  "Delete this bill? Its payments go back to Unmatched and manual entries are removed.",
              )})`}>
              <button class="danger" type="submit">Delete</button>
            </form>
          </>
        )}
      </div>

      {admin && (
        <details class="card" style="margin-top:14px">
          <summary><strong>Add a manual entry</strong> <span class="muted">· cash, another account, a correction</span></summary>
          <form method="post" action={`/bills/${b.id}/entries`} style="margin-top:4px">
            <div class="grid2">
              <div>
                <label for="me-kind">Type</label>
                <select id="me-kind" name="kind">
                  <option value="in">Money towards this bill</option>
                  <option value="out">Bill payment (paid out)</option>
                </select>
              </div>
              <div>
                <label for="me-amount">Amount</label>
                <input id="me-amount" name="amount" required inputmode="decimal" placeholder="$50.00" />
              </div>
              <div>
                <label for="me-payer">Who</label>
                <input id="me-payer" name="payer" maxlength={60} placeholder="Roommate, cogs, AGL…" />
              </div>
              <div>
                <label for="me-date">Date</label>
                <input id="me-date" name="date" type="date" value={today} />
              </div>
            </div>
            <label for="me-note">Note <span class="muted" style="font-weight:500">(optional, shown to your roommate)</span></label>
            <input id="me-note" name="note" maxlength={140} placeholder="Paid in cash at dinner" />
            <button class="primary" type="submit" style="margin-top:14px">Add entry</button>
          </form>
        </details>
      )}

      <div class="section-head"><h2>Payments</h2></div>
      {entries.length === 0 ? (
        <div class="card empty">
          <EmptyBills />
          <div>Nothing yet. Transfers with <span class="code">{b.code}</span> in the reference land here.</div>
        </div>
      ) : (
        <div class="card" style="padding:4px 18px">
          {entries.map((e) => {
            const who = e.payer || e.description || (e.txn_id ? "Unknown" : "Manual entry");
            const split = e.txn_amount !== null && Math.abs(e.txn_amount) !== e.amount_cents;
            return (
              <div class="pay">
                {e.kind === "in" ? <Avatar name={who} /> : <span class="out-dot">✓</span>}
                <div class="who">
                  <strong>{e.kind === "in" ? who : `Paid to ${who}`}</strong>
                  <div class="sub">
                    {fmtDate(e.created_at)}
                    {e.message ? ` · “${e.message}”` : ""}
                    {split ? ` · part of ${formatCents(Math.abs(e.txn_amount!))}` : ""}
                    {!e.txn_id ? " · not from the bank" : ""}
                    {e.source === "manual" && <> · <ManualTag /></>}
                  </div>
                  {e.note && <div class="sub note">“{e.note}”</div>}
                </div>
                <div style="text-align:right">
                  <span class={`money tnum ${e.kind === "in" ? "in" : "out"}`}>
                    {e.kind === "in" ? "+" : "−"}{formatCents(e.amount_cents)}
                  </span>
                  {admin && (
                    <div style="margin-top:2px">
                      {e.txn_id ? (
                        <a class="mini" href={`/transactions/${encodeURIComponent(e.txn_id)}`}>Edit</a>
                      ) : (
                        <form class="inline" method="post" action={`/entries/${e.id}/delete`}
                          onsubmit="return confirm('Delete this manual entry?')">
                          <button class="link mini">Delete</button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
};

const AllocationChips: FC<{ t: TxnWithAllocations }> = ({ t }) => {
  const total = Math.abs(t.amount_cents);
  const left = total - t.allocated;
  return (
    <div class="chips">
      {t.ignored ? <span class="chip-s muted-chip">Ignored</span> : null}
      {t.allocations.map((a) => (
        <span class={`chip-s ${a.kind}`}>
          {a.kind === "out" ? "Paid " : "→ "}{a.bill_name}
          {t.allocations.length > 1 || a.amount_cents !== total ? ` · ${formatCents(a.amount_cents)}` : ""}
          {a.source === "manual" ? " · manual" : ""}
        </span>
      ))}
      {!t.ignored && left > 0 && t.allocated > 0 && <span class="chip-s warn">{formatCents(left)} not assigned</span>}
    </div>
  );
};

export const TransactionsPage: FC<{
  txns: TxnWithAllocations[];
  bills: Bill[];
  view: "unmatched" | "all";
  flash?: string | null;
}> = ({ txns, bills, view, flash }) => (
  <Layout title="Payments" role="admin" nav="txns" flash={flash}>
    <div class="section-head" style="margin-top:0">
      <h1>{view === "unmatched" ? "Unmatched" : "All payments"}</h1>
      <span class="spacer" />
      <a class="btn" href={view === "unmatched" ? "/transactions?view=all" : "/transactions"}>
        {view === "unmatched" ? "Show all" : "Unmatched only"}
      </a>
    </div>
    <p class="hint" style="margin:-4px 0 16px">
      {view === "unmatched"
        ? "Payments that aren't (fully) assigned to a bill: typos, your own top-ups, that kind of thing. Pick a bill, split it, or ignore it."
        : "Everything on the bills account. Change any payment's bill, split it, or switch it between money-in and bill payment."}
    </p>
    {txns.length === 0 ? (
      <div class="card empty">
        {view === "unmatched" ? <AllSorted /> : <EmptyBills />}
        <strong style="color:var(--ink)">{view === "unmatched" ? "All sorted!" : "No payments yet"}</strong>
        <div>{view === "unmatched" ? "Every payment found its bill." : "Hit Sync on the Bills page."}</div>
      </div>
    ) : (
      <div class="stack stagger">
        {txns.map((t) => {
          const simple = t.allocations.length <= 1 && (t.allocations.length === 0 || t.allocated === Math.abs(t.amount_cents));
          const editUrl = `/transactions/${encodeURIComponent(t.id)}`;
          return (
            <div class="card" style="padding:14px 16px">
              <div class="pay" style="padding:0;border:none">
                <Avatar name={t.description ?? "?"} />
                <div class="who">
                  <strong>{t.description}</strong>
                  <div class="sub">
                    {fmtDateTime(t.created_at)}
                    {t.message ? <> · ref <span class="code">{t.message}</span></> : " · no reference"}
                    {t.transfer_account_id ? " · from your own account" : ""}
                    {t.status === "HELD" ? " · pending" : ""}
                  </div>
                </div>
                <span class={`money tnum ${t.amount_cents > 0 ? "in" : "out"}`}>
                  {t.amount_cents > 0 ? "+" : ""}{formatCents(t.amount_cents)}
                </span>
              </div>
              <AllocationChips t={t} />
              {simple && !t.ignored ? (
                <form class="assign" method="post" action={`${editUrl}/assign`}>
                  <input type="hidden" name="back" value={view} />
                  <select name="bill_id" aria-label="Assign to bill">
                    <BillOptions bills={bills} selected={t.allocations[0]?.bill_id ?? null} />
                  </select>
                  <button type="submit">Save</button>
                  <a class="btn" href={editUrl}>Split</a>
                  {view === "unmatched" && (
                    <button type="submit" class="link" formaction={`${editUrl}/ignore`} name="ignored" value="1"
                      style="padding:0 4px">Ignore</button>
                  )}
                </form>
              ) : (
                <div class="assign"><a class="btn" href={editUrl}>Edit</a></div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </Layout>
);

const SPLIT_JS = `document.addEventListener('click',e=>{if(!e.target.closest('[data-add-row]'))return;e.preventDefault();
const rows=document.getElementById('split-rows');const t=rows.querySelector('.split-row:last-child');const n=t.cloneNode(true);
n.querySelectorAll('input').forEach(i=>i.value='');n.querySelectorAll('select[name=bill]').forEach(s=>s.value='');rows.appendChild(n);});`;

export const TransactionEdit: FC<{ t: TxnWithAllocations; bills: Bill[]; error?: string | null; flash?: string | null }> = ({
  t, bills, error, flash,
}) => {
  const total = Math.abs(t.amount_cents);
  const defaultKind = t.amount_cents >= 0 ? "in" : "out";
  const rows: { bill_id: number | null; amount: string; kind: string }[] = t.allocations.map((a) => ({
    bill_id: a.bill_id,
    amount: (a.amount_cents / 100).toFixed(2),
    kind: a.kind,
  }));
  while (rows.length < 2) rows.push({ bill_id: null, amount: "", kind: defaultKind });
  const note = t.allocations.find((a) => a.note)?.note ?? "";
  return (
    <Layout title="Edit payment" role="admin" nav="txns" flash={flash}>
      <a class="btn" href="/transactions?view=all" style="margin-bottom:14px"><UiIcon name="back" size={16} />Payments</a>
      <div class="card">
        <div class="pay" style="padding:0;border:none">
          <Avatar name={t.description ?? "?"} />
          <div class="who">
            <strong>{t.description}</strong>
            <div class="sub">
              {fmtDateTime(t.created_at)}
              {t.message ? <> · ref <span class="code">{t.message}</span></> : " · no reference"}
              {t.transfer_account_id ? " · from your own account" : ""}
            </div>
          </div>
          <span class={`money tnum ${t.amount_cents > 0 ? "in" : "out"}`}>
            {t.amount_cents > 0 ? "+" : ""}{formatCents(t.amount_cents)}
          </span>
        </div>
        <AllocationChips t={t} />
      </div>

      <div class="section-head"><h2>Assign to bills</h2></div>
      {error && <div class="notice">{error}</div>}
      <form class="card" method="post" action={`/transactions/${encodeURIComponent(t.id)}/split`}>
        <p class="hint" style="margin-top:0">
          One row = whole payment to one bill (leave the amount blank). Add rows to split it. Anything left over stays
          in Unmatched. "Bill payment" marks the bill as paid.
        </p>
        <div id="split-rows">
          {rows.map((r) => (
            <div class="split-row">
              <select name="bill" aria-label="Bill"><BillOptions bills={bills} selected={r.bill_id} /></select>
              <input name="amount" inputmode="decimal" placeholder={formatCents(total)} value={r.amount} aria-label="Amount" />
              <select name="kind" aria-label="Type">
                <option value="in" selected={r.kind === "in"}>Towards bill</option>
                <option value="out" selected={r.kind === "out"}>Bill payment</option>
              </select>
            </div>
          ))}
        </div>
        <button type="button" class="link" data-add-row style="margin-top:8px">+ Add another row</button>
        <label for="note">Note <span class="muted" style="font-weight:500">(optional, shown on the bill)</span></label>
        <input id="note" name="note" maxlength={140} value={note} placeholder="Split between electricity and wifi" />
        <div class="row" style="margin-top:16px">
          <button class="primary" type="submit">Save</button>
        </div>
      </form>

      <div class="section-head"><h2>Other options</h2></div>
      <div class="row">
        <form class="inline" method="post" action={`/transactions/${encodeURIComponent(t.id)}/reset`}>
          <button type="submit" title="Forget manual changes and match by reference again">Reset to automatic</button>
        </form>
        <form class="inline" method="post" action={`/transactions/${encodeURIComponent(t.id)}/ignore`}>
          <input type="hidden" name="ignored" value={t.ignored ? "0" : "1"} />
          <button type="submit">{t.ignored ? "Stop ignoring" : "Ignore this payment"}</button>
        </form>
      </div>
      <p class="hint">Manual changes stick: syncing with Up won't undo them. "Reset to automatic" hands control back.</p>
      <script>{raw(SPLIT_JS)}</script>
    </Layout>
  );
};

const Step: FC<{ n: number; done: boolean; title: string; children?: Child }> = ({ n, done, title, children }) => (
  <div class="card step">
    <span class={`n${done ? " done" : ""}`}>{done ? "✓" : n}</span>
    <div class="body">
      <h2 style="margin:4px 0 8px">{title}</h2>
      {children}
    </div>
  </div>
);

export const SetupPage: FC<{
  tokenSet: boolean;
  tokenError: string | null;
  viewerSet: boolean;
  accounts: UpAccount[];
  accountId: string | null;
  webhooks: UpWebhook[];
  webhookId: string | null;
  webhookUrl: string;
  lastPing: string | null;
  lastWebhook: string | null;
  lastSync: string | null;
  flash?: string | null;
}> = (p) => (
  <Layout title="Setup" role="admin" nav="setup" flash={p.flash}>
    <h1 style="margin-bottom:16px">Setup</h1>
    <div class="stack">
      <Step n={1} done={p.tokenSet && !p.tokenError} title="Connect Up">
        {!p.tokenSet ? (
          <p style="margin:0">
            Run <code>npx wrangler secret put UP_TOKEN</code> with a Personal Access Token from{" "}
            <a href="https://api.up.com.au" target="_blank" rel="noreferrer">api.up.com.au</a>.
          </p>
        ) : p.tokenError ? (
          <p style="margin:0;color:var(--danger)">Token is set but Up said no: {p.tokenError}</p>
        ) : (
          <p style="margin:0">Connected to Up. ⚡</p>
        )}
      </Step>

      <Step n={2} done={!!p.accountId} title="Pick the bills account">
        {p.accounts.length === 0 ? (
          <p class="muted" style="margin:0">Connect a token first.</p>
        ) : (
          <form method="post" action="/setup/account">
            <select name="account_id" aria-label="Account to watch">
              {p.accounts.map((a) => (
                <option value={a.id} selected={a.id === p.accountId}>
                  {a.attributes.displayName} · {a.attributes.accountType.toLowerCase()} · {formatCents(a.attributes.balance.valueInBaseUnits)}
                </option>
              ))}
            </select>
            <p class="hint">The Saver your roommate pays into. Switching deletes stored payments from the old account (bills stay).</p>
            <button class="primary" type="submit" style="margin-top:12px">Use this account</button>
          </form>
        )}
      </Step>

      <Step n={3} done={!!p.webhookId} title="Hook up live updates">
        <p class="hint" style="margin-top:0">Up will send new transactions to <code>{p.webhookUrl}</code></p>
        {p.webhookId ? (
          <>
            <p style="margin:10px 0 4px">Registered.</p>
            <p class="hint">Last ping: {p.lastPing ? fmtDateTime(p.lastPing) : "never"} · Last event: {p.lastWebhook ?? "none yet"}</p>
            <form method="post" action="/setup/webhook/ping" style="margin-top:10px"><button>Send test ping</button></form>
          </>
        ) : (
          <form method="post" action="/setup/webhook" style="margin-top:10px">
            <button class="primary" type="submit" disabled={!p.tokenSet || !p.accountId}>Register webhook</button>
          </form>
        )}
        {p.webhooks.length > 0 && (
          <table style="margin-top:14px">
            <tbody>
              {p.webhooks.map((w) => (
                <tr>
                  <td>
                    <code>{w.attributes.url}</code>
                    {w.id === p.webhookId && <span class="badge paid" style="margin-left:6px">this app</span>}
                  </td>
                  <td style="text-align:right">
                    <form class="inline" method="post" action={`/setup/webhook/${encodeURIComponent(w.id)}/delete`}
                      onsubmit="return confirm('Delete this webhook from Up?')">
                      <button class="danger">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Step>

      <Step n={4} done={!!p.lastSync} title="Pull in past payments">
        <p class="hint" style="margin-top:0">
          Also runs daily for the last 14 days, in case a webhook goes missing.
          {p.lastSync ? ` Last sync ${fmtDateTime(p.lastSync)}.` : ""}
        </p>
        <form class="row" method="post" action="/sync" style="margin-top:10px">
          <select name="days" style="width:auto">
            <option value="14">Last 14 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          <input type="hidden" name="back" value="/setup" />
          <button type="submit" disabled={!p.accountId}>Sync now</button>
        </form>
      </Step>

      <Step n={5} done={p.viewerSet} title="Roommate access">
        {p.viewerSet ? (
          <p style="margin:0">
            Viewer password is set. Your roommate logs in with it and can see bills and payments, but can't change anything.
          </p>
        ) : (
          <p style="margin:0">
            Run <code>npx wrangler secret put VIEWER_PASSWORD</code> to give your roommate a view-only login.
          </p>
        )}
      </Step>
    </div>
  </Layout>
);

/** Shown as "~$180 estimate" until the admin sets this period's real amount. */
function estimate(b: Bill): boolean {
  return b.approximate === 1 && b.amount_confirmed !== 1;
}

function fmtRange(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function fmtDate(s: string): string {
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney",
  });
}
