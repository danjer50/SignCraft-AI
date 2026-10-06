import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Check, CircleDot, DraftingCompass, Frame, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useLanguage } from '../context/LanguageContext';
import { useQuoteDialog } from '../components/QuoteDialogContext';
import { WhatsAppContactButton } from '../components/WhatsAppContactButton';

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
            <h1>{t('home.title')}</h1>
            <p className="hero-lead">{t('home.lead')}</p>
            <div className="hero-actions">
              <Link className="button button-dark button-large" to="/studio">{t('home.primaryCta')} <ArrowUpRight size={17} /></Link>
              <a className="button button-quiet button-large" href="#method">{t('home.secondaryCta')} <ArrowDown size={16} /></a>
            </div>
            <div className="hero-assurance"><ShieldCheck size={17} /><span>{t('home.heroNote')}</span></div>
          </div>
          <div className="hero-visual-wrap">
            <div className="hero-photo-shell">
              <img src="/images/storefront-example.jpg" alt={t('home.photoCaption')} className="hero-photo" />
              <div className="photo-index">01 <span>/ 01</span></div>
              <div className="hero-photo-label"><span className="photo-label-mark"><Frame size={16} /></span><span>{t('home.photoTag')}</span></div>
            </div>
            <div className="hero-note-card">
              <div className="note-card-top"><span className="mini-green-dot" />{t('home.metricThree')}</div>
              <div className="note-card-title">{t('home.photoCaption')}</div>
              <div className="note-card-footer"><span>SC—01</span><span>PHOTO RÉFÉRENCE</span></div>
            </div>
            <div className="hero-stamp" aria-hidden="true"><DraftingCompass size={18} /><span>ATELIER<br />SUR MESURE</span></div>
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

      <section className="material-section section-pad">
        <div className="page-container material-grid">
          <div className="material-visual">
            <div className="material-photo"><img src="/images/storefront-example.jpg" alt={t('home.photoCaption')} /></div>
            <div className="material-swatch-card">
              <span className="swatch-heading">PALETTE · 04</span>
              <div className="material-swatches"><i /><i /><i /><i /></div>
              <span className="swatch-caption">MATIÈRES & FINITIONS</span>
            </div>
            <span className="material-vertical-note">SIGNALÉTIQUE · TUNIS</span>
          </div>
          <div className="material-copy">
            <span className="eyebrow"><span className="eyebrow-line" />{t('home.materialEyebrow')}</span>
            <h2>{t('home.materialTitle')}</h2>
            <p>{t('home.materialBody')}</p>
            <div className="material-checks">
              <span><Check size={15} /> {t('sign.threeD')}</span>
              <span><Check size={15} /> {t('sign.alucobond')}</span>
              <span><Check size={15} /> {t('sign.illuminated')}</span>
            </div>
            <Link className="text-link" to="/studio">{t('home.materialCta')} <ArrowRight size={16} /></Link>
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
          <div><span className="eyebrow">SIGNCRAFT AI · TUNIS</span><h2>{t('home.primaryCta')}</h2></div>
          <div className="closing-actions"><Link className="button button-light button-large" to="/studio">{t('home.primaryCta')} <ArrowUpRight size={17} /></Link><WhatsAppContactButton /><button className="button button-quiet-on-dark" onClick={openQuote} type="button">{t('quote.open')}</button></div>
        </div>
      </section>
    </>
  );
}
