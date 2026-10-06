import { useLanguage } from '../context/LanguageContext';

interface TextProofProps {
  text: string;
  color: string;
  businessName: string;
}

export function TextProof({ text, color, businessName }: TextProofProps) {
  const { t, locale } = useLanguage();
  const visibleText = text.trim() || businessName.trim() || '—';
  return (
    <section className="text-proof-card" aria-labelledby="text-proof-title">
      <div className="text-proof-heading">
        <div>
          <span className="eyebrow">{t('result.exactProofTag')}</span>
          <h2 id="text-proof-title">{t('result.exactProofTitle')}</h2>
        </div>
        <span className="proof-vector-badge">SVG / TEXTE</span>
      </div>
      <div className="proof-board" style={{ '--proof-color': color } as React.CSSProperties}>
        <span className="proof-board-edge" aria-hidden="true" />
        <div className="proof-sign-text" dir="auto" lang={locale}>{visibleText}</div>
        <span className="proof-board-caption">SIGNCRAFT · TYPOGRAPHIE</span>
      </div>
      <p>{t('result.exactProofBody')}</p>
    </section>
  );
}
