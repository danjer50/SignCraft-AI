import { useId } from 'react';
import type { SignType } from '../domain/sign';

const WORD = 'NOOR';
const FONT = "Manrope, 'DM Sans', sans-serif";

interface SignTypeArtProps {
  type: SignType;
}

/**
 * Decorative, honest illustration of what each supported sign type looks like on a facade.
 * Pure SVG (no photos): the card communicates the construction principle — relief, halo light,
 * lightbox face, neon tube, flat cut vinyl — without pretending to be a real project.
 */
export function SignTypeArt({ type }: SignTypeArtProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '');
  const wall = `${uid}w`;
  const glass = `${uid}g`;
  const metal = `${uid}m`;
  const face = `${uid}f`;
  const glow = `${uid}gl`;
  const pink = `${uid}p`;

  const signText = (props: React.SVGAttributes<SVGTextElement>) => (
    <text x="66" y="26" textAnchor="middle" fontFamily={FONT} fontWeight="800" fontSize="14.5" letterSpacing="2.4" {...props}>{WORD}</text>
  );

  let sign: React.ReactNode = null;
  switch (type) {
    case 'threeD':
      sign = (
        <>
          <text x="69" y="29" textAnchor="middle" fontFamily={FONT} fontWeight="800" fontSize="14.5" letterSpacing="2.4" fill="#04070a">{WORD}</text>
          {signText({ fill: `url(#${metal})` })}
          <rect x="30" y="14.5" width="72" height="1.1" fill="rgba(255,255,255,.5)" />
        </>
      );
      break;
    case 'alucobond':
      sign = (
        <>
          <rect x="18" y="10" width="96" height="21" rx="2" fill={`url(#${metal})`} opacity=".82" />
          {signText({ fill: '#0c1116' })}
        </>
      );
      break;
    case 'led':
      sign = (
        <>
          {signText({ fill: '#0a0e12', stroke: '#ffd9a1', strokeWidth: '.9', filter: `url(#${glow})` })}
          {[34, 46, 58, 70, 82, 94].map((x) => <circle key={x} cx={x} cy="31.5" r=".9" fill="#ffe7c2" />)}
        </>
      );
      break;
    case 'lightbox':
      sign = (
        <>
          <rect x="22" y="9.5" width="88" height="22" rx="3" fill={`url(#${face})`} />
          {signText({ fill: '#0b0f13' })}
        </>
      );
      break;
    case 'acrylic':
      sign = (
        <>
          {signText({ fill: 'rgba(236,246,252,.9)' })}
          <rect x="30" y="16.5" width="72" height="1.6" fill="rgba(255,255,255,.55)" />
          <rect x="30" y="26" width="72" height="1" fill="rgba(120,190,235,.5)" />
        </>
      );
      break;
    case 'channelLetters':
      sign = (
        <>
          {signText({ fill: '#f3b877', filter: `url(#${glow})`, opacity: '.95' })}
          {signText({ fill: '#e8eef1' })}
        </>
      );
      break;
    case 'vinyl':
      sign = (
        <text x="45" y="57" textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="9.5" letterSpacing="1.6" fill="rgba(240,247,244,.92)">{WORD}</text>
      );
      break;
    case 'neonStyle':
      sign = (
        <>
          {signText({ fill: 'none', stroke: '#ff6fae', strokeWidth: '1.5', filter: `url(#${pink})`, fontStyle: 'italic' })}
          <rect x="38" y="30" width="56" height="1.4" rx=".7" fill="#7fe3ff" filter={`url(#${pink})`} />
        </>
      );
      break;
    case 'illuminated':
      sign = (
        <>
          <ellipse cx="66" cy="21" rx="46" ry="12" fill="#f6c98b" opacity=".28" filter={`url(#${glow})`} />
          {signText({ fill: '#fff6e8' })}
        </>
      );
      break;
    default:
      sign = (
        <>
          <rect x="26" y="9" width="80" height="23" rx="3" fill="none" stroke="rgba(240,244,242,.55)" strokeWidth="1" strokeDasharray="4 3" />
          <path d="M66 14.5l2.1 4.4 4.8.7-3.5 3.4.8 4.8-4.2-2.3-4.2 2.3.8-4.8-3.5-3.4 4.8-.7z" fill="#f0b878" />
        </>
      );
  }

  return (
    <svg className="sign-art" viewBox="0 0 132 72" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={wall} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#232a31" /><stop offset="1" stopColor="#12171c" />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3b877" stopOpacity=".75" /><stop offset="1" stopColor="#8a5a33" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f7f8" /><stop offset=".45" stopColor="#9aa6ad" /><stop offset=".7" stopColor="#dfe6e9" /><stop offset="1" stopColor="#7d8990" />
        </linearGradient>
        <radialGradient id={face} cx=".5" cy=".42" r=".75">
          <stop offset="0" stopColor="#fff3dd" /><stop offset=".65" stopColor="#f2d3a0" /><stop offset="1" stopColor="#caa06a" />
        </radialGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <filter id={pink} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.7" /></filter>
      </defs>
      <rect width="132" height="72" fill={`url(#${wall})`} />
      <rect x="0" y="36" width="132" height="1.2" fill="rgba(255,255,255,.09)" />
      <rect x="14" y="42" width="62" height="24" rx="1.5" fill={`url(#${glass})`} />
      <rect x="82" y="42" width="34" height="24" rx="1.5" fill="#0d1216" />
      <rect x="82" y="42" width="34" height="24" rx="1.5" fill="none" stroke="rgba(255,255,255,.12)" />
      <rect x="0" y="66" width="132" height="6" fill="#0a0d10" />
      <rect x="14" y="66" width="62" height="6" fill="#f3b877" opacity=".14" />
      <rect x="6" y="8" width="120" height="26" rx="2.5" fill="#0b1014" />
      <rect x="6" y="8" width="120" height="26" rx="2.5" fill="none" stroke="rgba(255,255,255,.1)" />
      {sign}
    </svg>
  );
}
