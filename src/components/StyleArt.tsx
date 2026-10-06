import type { SignStyle } from '../domain/sign';

const STYLE_WORDS: Record<SignStyle, string> = {
  modern: 'CAFÉ',
  luxury: 'MAISON',
  minimal: 'café',
  industrial: 'ATELIER',
  bold: 'CAFÉ',
  elegant: 'Café',
  classic: 'CAFÉ',
  colorful: 'CAFÉ',
  dark: 'CAFÉ',
  premium: 'CAFÉ',
  arabic: 'مقهى',
  french: 'Café',
  arabicFrench: 'مقهى · CAFÉ',
};

interface StyleArtProps {
  style: SignStyle;
}

/**
 * Decorative preview of a visual style: a miniature sign board whose palette, weight and
 * letterforms express the style, so the customer chooses by feel instead of reading.
 */
export function StyleArt({ style }: StyleArtProps) {
  return (
    <span className={`style-art style-art--${style}`} aria-hidden="true">
      <i>{STYLE_WORDS[style]}</i>
    </span>
  );
}
