/** DOM helpers for popups. External values never pass through an HTML parser. */
export function popupElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: unknown): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = String(text ?? '');
  return element;
}

export function popupColor(value: unknown): string {
  const style = document.createElement('span').style;
  if (typeof value === 'string') style.color = value;
  return style.color || '#666';
}

export function popupHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
