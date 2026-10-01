import {asHtml, cleanHtml, firstPicture, textOf} from './components/aktuelt/rich-text';

describe('rich text in Forslag', () => {
  const pic = 'https://res.cloudinary.com/egmontkollegiet/image/upload/c_limit,w_1600,q_auto/dev/a.jpg';

  it('keeps text, simple formatting and Cloudinary pictures, nothing else', () => {
    const dirty = `<div style="color:red" onclick="x()">Hej <b>alle</b><script>alert(1)</script></div>`
      + `<img src="${pic}" onerror="x()"><img src="https://evil.example/x.png"><span class="y">tekst</span><a href="https://x">link</a>`;
    expect(cleanHtml(dirty)).toBe(`<div>Hej <b>alle</b>alert(1)</div><img src="${pic}">tekstlink`);
  });

  it('shows older plain proposals with their line breaks, escaped', () => {
    expect(asHtml('3 < 4\nja & nej')).toBe('3 &lt; 4<br>ja &amp; nej');
    expect(asHtml('<div>x</div>')).toBe('<div>x</div>');
  });

  it('gives the cards the text alone and the first picture', () => {
    const html = `<div>Første</div><div>Anden<br>linje</div><img src="${pic}">`;
    expect(textOf(html)).toBe('Første\nAnden\nlinje');
    expect(firstPicture(html)).toBe(pic);
    expect(firstPicture('ingen')).toBeNull();
  });
});
