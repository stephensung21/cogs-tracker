// Logo, bill icons and illustrations. All inline SVG so there are no image files to host.
import type { FC } from "hono/jsx";
import { raw } from "hono/html";

// ---------- logo ----------

/** Path for a cog with rounded-ish teeth, centred on (cx, cy). */
function gearPath(cx: number, cy: number, rOut: number, rIn: number, teeth: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const angles: [number, number][] = [
      [a - step * 0.5, rIn],
      [a - step * 0.22, rIn],
      [a - step * 0.14, rOut],
      [a + step * 0.14, rOut],
      [a + step * 0.22, rIn],
    ];
    for (const [ang, r] of angles) {
      pts.push(`${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`);
    }
  }
  return `M${pts.join(" L")} Z`;
}

const GEAR = gearPath(32, 32, 30, 23.5, 9);

/** The mark: a friendly orange cog with a coin face. */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path d="${GEAR}" fill="#FF6B3D" stroke="#23201C" stroke-width="2.5" stroke-linejoin="round"/>
<circle cx="32" cy="32" r="15" fill="#FFC83D" stroke="#23201C" stroke-width="2.5"/>
<circle cx="26.5" cy="29.5" r="2" fill="#23201C"/>
<circle cx="37.5" cy="29.5" r="2" fill="#23201C"/>
<path d="M25.5 35.5 Q32 41.5 38.5 35.5" fill="none" stroke="#23201C" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="23" cy="34.5" r="2" fill="#FF6B3D" opacity=".55"/>
<circle cx="41" cy="34.5" r="2" fill="#FF6B3D" opacity=".55"/>
</svg>`;

export const LogoMark: FC<{ size?: number; spin?: boolean }> = ({ size = 34, spin }) => (
  <span
    class={`logo-mark${spin ? " spin" : ""}`}
    style={`width:${size}px;height:${size}px`}>{raw(LOGO_SVG)}</span>
);

export const Logo: FC<{ size?: number }> = ({ size = 34 }) => (
  <span class="logo">
    <LogoMark size={size} />
    <span class="logo-word">
      cogs<span class="logo-dot">.</span>
      <span class="logo-tag">bills</span>
    </span>
  </span>
);

// ---------- bill icons ----------

export const BILL_ICONS = {
  power: { label: "Electricity", tint: "sun" },
  wifi: { label: "Internet", tint: "sky" },
  rent: { label: "Rent", tint: "peach" },
  water: { label: "Water", tint: "aqua" },
  gas: { label: "Gas", tint: "rose" },
  phone: { label: "Phone", tint: "lilac" },
  stream: { label: "Streaming", tint: "rose" },
  food: { label: "Groceries", tint: "mint" },
  other: { label: "Other", tint: "stone" },
} as const;

export type BillIcon = keyof typeof BILL_ICONS;

export function isBillIcon(v: unknown): v is BillIcon {
  return typeof v === "string" && v in BILL_ICONS;
}

/** Guess an icon from the bill's name/code when none was picked. */
export function guessIcon(name: string, code: string): BillIcon {
  const s = `${name} ${code}`.toLowerCase();
  const rules: [BillIcon, RegExp][] = [
    ["power", /elec|power|energy|agl|origin/],
    ["wifi", /wifi|internet|nbn|broadband/],
    ["rent", /rent|lease|strata/],
    ["water", /water/],
    ["gas", /\bgas\b/],
    ["phone", /phone|mobile/],
    ["stream", /netflix|spotify|stream|disney|stan|youtube|subscr/],
    ["food", /grocer|food|woolies|coles|aldi|shop/],
  ];
  return rules.find(([, re]) => re.test(s))?.[0] ?? "other";
}

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

const ICON_PATHS: Record<BillIcon, string> = {
  power: `<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" fill="currentColor" fill-opacity=".18"/><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>`,
  wifi: `<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19.3" r="1.3" fill="currentColor"/>`,
  rent: `<path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" fill="currentColor" fill-opacity=".18"/><path d="M10 20v-5.5h4V20"/>`,
  water: `<path d="M12 3s6.5 7 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z" fill="currentColor" fill-opacity=".18"/><path d="M9 14.5a3 3 0 0 0 3 3"/>`,
  gas: `<path d="M12 2.5s5.5 5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.5 1.5-4 1.5-4s.5 2.5 2.5 2.5c0-4 1.5-6.5 1.5-9Z" fill="currentColor" fill-opacity=".18"/>`,
  phone: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="currentColor" fill-opacity=".18"/><path d="M10.5 18.5h3"/>`,
  stream: `<rect x="2.5" y="5" width="19" height="13" rx="2.5" fill="currentColor" fill-opacity=".18"/><path d="m10 9 5 2.5-5 2.5Z" fill="currentColor"/><path d="M8 21h8"/>`,
  food: `<path d="M3 4h2.5l2.2 11h10.6L20.5 7.5H6.5" /><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>`,
  other: `<path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z" fill="currentColor" fill-opacity=".18"/><path d="M9 8h6M9 12h6M9 16h3"/>`,
};

export const BillIconTile: FC<{ icon: BillIcon; size?: "sm" | "md" | "lg" }> = ({ icon, size = "md" }) => (
  <span class={`icon-tile tint-${BILL_ICONS[icon].tint} ${size}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" {...stroke}>{raw(ICON_PATHS[icon])}</svg>
  </span>
);

// ---------- UI icons (nav etc.) ----------

const UI = {
  bills: `<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M7.5 9h9M7.5 13h5"/>`,
  swap: `<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  sync: `<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>`,
  logout: `<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>`,
  copy: `<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>`,
  back: `<path d="M15 5l-7 7 7 7"/>`,
};
export type UiIconName = keyof typeof UI;

export const UiIcon: FC<{ name: UiIconName; size?: number }> = ({ name, size = 20 }) => (
  <svg class="ui-icon" width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">{raw(UI[name])}</svg>
);

// ---------- illustrations ----------

/** A money jar that fills to `pct` percent. The hero image on the dashboard. */
export const Jar: FC<{ pct: number }> = ({ pct }) => {
  const p = Math.max(0, Math.min(100, pct));
  const top = 34, bottom = 112;
  const level = bottom - ((bottom - top) * p) / 100;
  return (
    <svg class="jar" viewBox="0 0 120 124" role="img" aria-label={`Bills pot ${p}% full`}>
      <defs>
        <clipPath id="jar-inside">
          <path d="M30 30h60v8c8 4 12 12 12 22v40c0 9-7 14-16 14H34c-9 0-16-5-16-14V60c0-10 4-18 12-22Z" />
        </clipPath>
      </defs>
      <g clip-path="url(#jar-inside)">
        <rect x="0" y={level} width="120" height="124" class="jar-fill" style={`--jar-y:${level}px`} />
        <path class="jar-wave" d={`M0 ${level} q15 -6 30 0 t30 0 t30 0 t30 0 V124 H0Z`} />
        {p > 15 && (
          <g class="jar-coins">
            <ellipse cx="48" cy={Math.min(104, level + 18)} rx="9" ry="4" />
            <ellipse cx="68" cy={Math.min(106, level + 26)} rx="9" ry="4" />
            <ellipse cx="58" cy={Math.min(100, level + 10)} rx="9" ry="4" />
          </g>
        )}
      </g>
      <path class="jar-glass" d="M30 30h60v8c8 4 12 12 12 22v40c0 9-7 14-16 14H34c-9 0-16-5-16-14V60c0-10 4-18 12-22Z" />
      <rect class="jar-lid" x="26" y="16" width="68" height="16" rx="5" />
      <path class="jar-shine" d="M30 62v30" />
      <rect class="jar-label" x="38" y="66" width="44" height="26" rx="6" />
      <text x="60" y="84" text-anchor="middle" class="jar-label-text">$</text>
    </svg>
  );
};

/** Empty state: a little receipt with a face waiting for bills. */
export const EmptyBills: FC = () => (
  <svg class="illo" viewBox="0 0 160 120" aria-hidden="true">
    <ellipse cx="80" cy="110" rx="46" ry="6" class="illo-shadow" />
    <path d="M52 16h56v84l-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5Z" class="illo-paper" />
    <circle cx="70" cy="46" r="3" class="illo-ink-fill" />
    <circle cx="90" cy="46" r="3" class="illo-ink-fill" />
    <path d="M72 58q8 6 16 0" class="illo-ink" />
    <path d="M64 74h32M64 84h20" class="illo-ink faint" />
    <g class="illo-float">
      <circle cx="126" cy="30" r="10" class="illo-coin" />
      <text x="126" y="34.5" text-anchor="middle" class="illo-coin-text">$</text>
    </g>
    <path d="M30 34l4 4M34 34l-4 4M128 76l4 4M132 76l-4 4" class="illo-ink faint" />
  </svg>
);

/** Celebration for "all sorted". */
export const AllSorted: FC = () => (
  <svg class="illo" viewBox="0 0 160 120" aria-hidden="true">
    <ellipse cx="80" cy="110" rx="40" ry="6" class="illo-shadow" />
    <circle cx="80" cy="62" r="34" class="illo-ok" />
    <path d="m64 62 11 11 22-23" class="illo-check" />
    <g class="illo-confetti">
      <rect x="28" y="22" width="8" height="4" rx="2" transform="rotate(-30 32 24)" />
      <rect x="126" y="28" width="8" height="4" rx="2" transform="rotate(25 130 30)" />
      <circle cx="40" cy="88" r="3" />
      <circle cx="122" cy="84" r="3" />
      <rect x="112" y="10" width="6" height="6" rx="1.5" transform="rotate(20 115 13)" />
    </g>
  </svg>
);

/** Login page hero: the cog mascot waving next to a coin stack. */
export const LoginHero: FC = () => (
  <div class="login-hero">
    <LogoMark size={88} spin />
    <svg class="coin-stack" viewBox="0 0 60 70" aria-hidden="true">
      <ellipse cx="30" cy="58" rx="22" ry="7" class="coin" />
      <ellipse cx="30" cy="48" rx="22" ry="7" class="coin" />
      <ellipse cx="30" cy="38" rx="22" ry="7" class="coin" />
      <ellipse cx="30" cy="28" rx="22" ry="7" class="coin top" />
    </svg>
  </div>
);

// ---------- avatars ----------

const AVATAR_TINTS = ["sun", "sky", "peach", "aqua", "rose", "lilac", "mint"];

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export const Avatar: FC<{ name: string }> = ({ name }) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span class={`avatar tint-${AVATAR_TINTS[h % AVATAR_TINTS.length]}`} title={name}>
      {initials(name)}
    </span>
  );
};
