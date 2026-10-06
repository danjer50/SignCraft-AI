import { ArrowRight, Box, CircleDot, ClipboardList, FileCog, Lightbulb, PanelsTopLeft, Ruler, Scissors, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useLanguage } from '../context/LanguageContext';

const workflowKeys = ['pro.workflow.1', 'pro.workflow.2', 'pro.workflow.3', 'pro.workflow.4', 'pro.workflow.5', 'pro.workflow.6', 'pro.workflow.7', 'pro.workflow.8'];
const moduleCards = [
  { title: 'pro.module.material', body: 'pro.module.materialBody', icon: Box },
  { title: 'pro.module.cutting', body: 'pro.module.cuttingBody', icon: Scissors },
  { title: 'pro.module.templates', body: 'pro.module.templatesBody', icon: PanelsTopLeft },
  { title: 'pro.module.led', body: 'pro.module.ledBody', icon: Lightbulb },
  { title: 'pro.module.cnc', body: 'pro.module.cncBody', icon: FileCog },
  { title: 'pro.module.install', body: 'pro.module.installBody', icon: Wrench },
] as const;

export function ProfessionalPage() {
  const { t } = useLanguage();
  return (
    <div className="professional-page page-container page-pad">
      <Seo title="Espace professionnel" description="Espace de préparation métier pour relier le concept approuvé aux plans, matériaux, découpes, devis et à l’installation." noIndex />
      <header className="professional-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('pro.eyebrow')}</span><h1>{t('pro.title')}</h1><p>{t('pro.lead')}</p></div>
        <span className="professional-ready-pill"><CircleDot size={14} />{t('pro.previewBadge')}</span>
      </header>

      <section className="workflow-panel">
        <div className="workflow-panel-heading"><div><span className="eyebrow">SIGNCRAFT · WORKFLOW</span><h2>{t('pro.workflowTitle')}</h2></div><span className="workflow-panel-index">01—08</span></div>
        <div className="workflow-track">
          {workflowKeys.map((key, index) => (
            <div className={`workflow-stage${index === 0 ? ' is-start' : ''}`} key={key}>
              <span className="workflow-stage-index">0{index + 1}</span><span className="workflow-stage-node">{index === 0 ? <CircleDot size={15} /> : <span />}</span><strong>{t(key)}</strong>
            </div>
          ))}
        </div>
        <div className="workflow-note"><Ruler size={16} /><span>{t('pro.quoteCalculatorBody')}</span></div>
      </section>

      <div className="professional-subheading"><div><span className="eyebrow">MODULES · V1</span><h2>{t('pro.modulesTitle')}</h2></div><span className="module-count">06 MODULES</span></div>
      <div className="professional-module-grid">
        {moduleCards.map(({ title, body, icon: Icon }, index) => (
          <article className="professional-module-card" key={title}>
            <div className="module-icon"><Icon size={19} strokeWidth={1.7} /></div>
            <span className="module-card-index">0{index + 1}</span>
            <h3>{t(title)}</h3><p>{t(body)}</p>
            <span className="module-status"><span className="module-status-dot" />{t('pro.comingSoon')}</span>
          </article>
        ))}
      </div>

      <section className="quote-calculator-card">
        <div className="calculator-mark"><ClipboardList size={21} /></div>
        <div><span className="eyebrow">PRODUCTION · QUOTE</span><h2>{t('pro.quoteCalculator')}</h2><p>{t('pro.quoteCalculatorBody')}</p></div>
        <Link className="button button-outline" to="/admin">{t('nav.admin')}<ArrowRight size={15} /></Link>
      </section>
    </div>
  );
}
