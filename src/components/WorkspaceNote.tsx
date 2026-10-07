import { Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

/**
 * Marker shown at the top of the professional and admin workspaces. It keeps those tools
 * visibly separate from the simplified customer journey and always offers a way back.
 */
export function WorkspaceNote() {
  const { t } = useLanguage();
  return (
    <div className="workspace-note">
      <span className="workspace-note-mark"><Briefcase size={15} /></span>
      <span className="workspace-note-text">{t('workspace.separatedNote')}</span>
      <Link className="text-link workspace-note-link" to="/studio">{t('workspace.backToSite')}</Link>
    </div>
  );
}
