// Rich text in Forslag (the maker's proposals and answers): text with pictures in between, kept as
// a small, cleaned piece of HTML. Pictures are always Cloudinary's; nothing else gets through.
const ALLOWED = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'IMG']);
const PICTURES = /^https:\/\/res\.cloudinary\.com\//;

// The editor's HTML, cleaned: only the tags above, no attributes but a picture's src.
export function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = document.createElement('div');
  const copy = (from: Node, to: Node) => {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(n.textContent ?? ''));
      } else if (n instanceof Element) {
        if (n.tagName === 'IMG') {
          const src = n.getAttribute('src') ?? '';
          if (PICTURES.test(src)) {
            const img = document.createElement('img');
            img.setAttribute('src', src);
            to.appendChild(img);
          }
        } else if (ALLOWED.has(n.tagName)) {
          const el = document.createElement(n.tagName.toLowerCase());
          copy(n, el);
          to.appendChild(el);
        } else {
          copy(n, to);
        }
      }
    }
  };
  copy(doc.body.firstChild ?? doc.body, out);
  return out.innerHTML.replace(/(<div><br><\/div>)+$/, '').trim();
}

// Proposals written before rich text are plain: shown with their line breaks.
export function isHtml(text: string): boolean {
  return /<(p|div|br|img|b|strong|i|em|ul|ol|li)[\s>/]/i.test(text);
}

export function asHtml(text: string): string {
  if (isHtml(text)) {
    return text;
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// For the cards: the text alone, and the first picture.
export function textOf(text: string): string {
  if (!isHtml(text)) {
    return text;
  }
  const doc = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function firstPicture(text: string): string | null {
  return /<img[^>]+src="([^"]+)"/i.exec(text)?.[1] ?? null;
}
