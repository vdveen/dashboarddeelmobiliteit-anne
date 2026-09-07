import React from 'react';
import { popupColor, popupElement } from '../../helpers/popupDom';

interface ProviderLabelProps {
  label: string;
  color: string;
  /** When false, only the colored dot is shown (operator prestaties cards/popups). */
  showTitle?: boolean;
}

export interface ProviderLabelOptions {
  /** When false, only the provider dot is shown. */
  showTitle?: boolean;
}

export const createProviderLabel = (label: string, color: string, options?: ProviderLabelOptions): HTMLElement => {
  const heading = popupElement('h1', 'mb-2');
  const dot = popupElement('span', 'rounded-full inline-block w-4 h-4');
  dot.style.backgroundColor = popupColor(color);
  dot.style.position = 'relative';
  dot.addEventListener('click', () => {
    if (typeof window['showConfetti'] === 'function') window['showConfetti']();
  });
  heading.append(dot);
  if (options?.showTitle !== false) {
    const title = popupElement('span', 'Map-popup-title ml-2', label);
    title.style.color = popupColor(color);
    heading.append(title);
  }
  return heading;
};

/**
 * Provider label styled to match the map popup title (colored dot + colored title text).
 * Used inside React components (cards etc.).
 */
const ProviderLabel: React.FC<ProviderLabelProps> = ({
  label,
  color,
  showTitle = true,
}) => {
  const handleConfettiClick = () => {
    // Only trigger if the global confetti helper exists (it is registered in map popups)
    if (typeof window !== 'undefined' && (window as any).showConfetti) {
      (window as any).showConfetti();
    }
  };

  return (
    <div className="permits-card-label flex items-center">
      <span
        className="rounded-full inline-block w-4 h-4"
        style={{ backgroundColor: color, position: 'relative' }}
        onClick={handleConfettiClick}
      />
      {showTitle && (
        <span className="Map-popup-title ml-2" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ProviderLabel;

