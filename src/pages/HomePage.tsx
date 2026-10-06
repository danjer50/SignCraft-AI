import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Check, CircleDot, Frame, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { TransformationSlider } from '../components/TransformationSlider';
import { useLanguage } from '../context/LanguageContext';
import { useQuoteDialog } from '../components/QuoteDialogContext';
import { WhatsAppContactButton } from '../components/WhatsAppContactButton';

/** One honest illustrative combination, matching the spec's "Alucobond + Acrylic + LED". */
const SHOWCASE_COMBO = ['aluminiumComposite', 'acrylic', 'ledModules'] as const;

export function HomePage() {
  const { t } = useLanguage();
  const openQuote = useQuoteDialog();

  return (
    <>
      <Seo title="Atelier d’enseignes sur mesure" description="Concevez une enseigne sur mesure à partir de la photo réelle de votre façade, puis préparez une demande de devis claire." />
      <section className="home-hero">
        <div className="page-container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow"><span className="eyebrow-line" />{t('home.eyebrow')}</div>
            <h1>{t('home.heroTitle')}</h1>
            <p className="hero-lead">{t('home.heroLead')}</p>
            <div className="hero-actions">
              <Link className="button button-primary button-large" to="/studio">{t('home.heroCta')} <ArrowUpRight size={18} /></Link>
              <a className="button button-ghost button-large" href="#method">{t('home.heroSecondary')} <ArrowDown size={16} /></a>
            </div>
            <p className="hero-proof"><ShieldCheck size={15} />{t('home.heroProof')}</p>
          </div>
          <div className="hero-visual-wrap">
            <figure className="hero-transform">
              <TransformationSlider
                variant="hero"
                beforeImage="/images/hero-facade-plain.jpg"
                afterImage="/images/hero-sign-illuminated.jpg"
                beforeLabel={t('home.transformBefore')}
                afterLabel={t('home.transformAfter')}
              />
              <figcaption>{t('home.transformCaption')}</figcaption>
            </figure>
          </div>
        </div>
        <div className="page-container hero-metrics">
          <div className="metric-item"><span className="metric-number">01</span><span>{t('home.metricOne')}</span></div>
          <div className="metric-item"><span className="metric-number">02</span><span>{t('home.metricTwo')}</span></div>
          <div className="metric-item"><span className="metric-mark"><BadgeCheck size={19} /></span><span>{t('home.metricThree')}</span></div>
        </div>
      </section>

      <section className="process-section section-pad" id="method">
        <div className="page-container">
          <div className="section-heading split-heading">
            <div><span className="eyebrow">{t('home.processEyebrow')}</span><h2>{t('home.processTitle')}</h2></div>
            <p>{t('home.processLead')}</p>
          </div>
          <div className="process-grid">
            <article className="process-card">
              <div className="process-card-top"><span>01</span><div className="process-icon"><Frame size={21} /></div></div>
              <h3>{t('home.stepPhoto')}</h3><p>{t('home.stepPhotoBody')}</p>
              <div className="process-card-rule" />
            </article>
            <article className="process-card process-card-featured">
              <div className="process-card-top"><span>02</span><div className="process-icon"><Sparkles size={21} /></div></div>
              <h3>{t('home.stepDesign')}</h3><p>{t('home.stepDesignBody')}</p>
              <div className="process-card-rule" />
            </article>
            <article className="process-card">
              <div className="process-card-top"><span>03</span><div className="process-icon"><CircleDot size={21} /></div></div>
              <h3>{t('home.stepQuote')}</h3><p>{t('home.stepQuoteBody')}</p>
              <div className="process-card-rule" />
            </article>
          </div>
        </div>
      </section>

      <section className="showroom-section section-pad">
        <div className="page-container showroom-grid">
          <figure className="showroom-visual">
            <img src="/images/materials-macro.jpg" alt={t('home.imageAltMaterials')} loading="lazy" />
            <figcaption><span className="showroom-visual-tag">SIGNCRAFT · ATELIER</span></figcaption>
          </figure>
          <div className="showroom-copy">
            <span className="eyebrow"><span className="eyebrow-line" />{t('home.showroomEyebrow')}</span>
            <h2>{t('home.showroomTitle')}</h2>
            <p>{t('home.showroomBody')}</p>
            <div className="showroom-combo" aria-label={t('home.showroomCta')}>
              {SHOWCASE_COMBO.map((material, index) => (
                <span className="showroom-combo-chip" key={material}>
                  {index > 0 && <span className="showroom-combo-plus" aria-hidden="true">+</span>}
                  <i className={`showroom-swatch showroom-swatch--${material}`} aria-hidden="true" />
                  {t(`material.${material}`)}
                </span>
              ))}
            </div>
            <div className="material-checks">
              <span><Check size={15} /> {t('sign.threeD')}</span>
              <span><Check size={15} /> {t('sign.alucobond')}</span>
              <span><Check size={15} /> {t('sign.illuminated')}</span>
            </div>
            <Link className="button button-outline" to="/studio?step=5">{t('home.showroomCta')} <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="demo-section section-pad">
        <div className="page-container demo-panel">
          <div className="demo-panel-mark"><ShieldCheck size={23} /></div>
          <div className="demo-panel-copy">
            <span className="eyebrow">{t('home.demoKicker')}</span>
            <h2>{t('home.demoTitle')}</h2>
            <p>{t('home.demoBody')}</p>
            <Link className="demo-link" to="/studio">{t('home.demoLink')} <ArrowUpRight size={15} /></Link>
          </div>
          <div className="demo-panel-side"><span>AI STATUS</span><strong><span className="status-offline-dot" /> DEMO MODE</strong><div className="demo-status-rule" /><span>IMAGE EDITING</span><strong>NOT CONFIGURED</strong></div>
        </div>
      </section>

      <section className="closing-cta section-pad">
        <div className="page-container closing-cta-inner">
          <div><span className="eyebrow">SIGNCRAFT AI · TUNIS</span><h2>{t('home.heroCta')}</h2></div>
          <div className="closing-actions">
            <Link className="button button-primary button-large" to="/studio">{t('home.heroCta')} <ArrowUpRight size={17} /></Link>
            <WhatsAppContactButton />
            <button className="button button-ghost button-large" onClick={openQuote} type="button">{t('quote.open')}</button>
          </div>
        </div>
      </section>
    </>
  );
}
