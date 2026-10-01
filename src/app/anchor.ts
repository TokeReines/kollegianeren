// Scrolls to the element with this id and flashes it (styles.scss, .flash). Linked from a
// notification: the list it is in may still be loading, so it tries again a few times.
export function showAnchor(id: string, tries = 15) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({behavior: 'smooth', block: 'center'});
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2500);
  } else if (tries > 0) {
    setTimeout(() => showAnchor(id, tries - 1), 200);
  }
}
