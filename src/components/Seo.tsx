import { useEffect } from 'react';
import { clientConfig } from '../services/config';

interface SeoProps {
  title: string;
  description: string;
  noIndex?: boolean;
}

function setMeta(selector: string, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    if (selector.startsWith('meta[property=')) element.setAttribute('property', selector.split('"')[1] ?? '');
    else element.setAttribute('name', selector.split('"')[1] ?? '');
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

export function Seo({ title, description, noIndex = false }: SeoProps) {
  useEffect(() => {
    const fullTitle = `${title} | SignCraft AI`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', noIndex ? 'noindex,nofollow' : 'index,follow');
    if (clientConfig.siteUrl) {
      const canonicalUrl = `${clientConfig.siteUrl}${window.location.pathname}`;
      let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
      setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    }
  }, [title, description, noIndex]);
  return null;
}
