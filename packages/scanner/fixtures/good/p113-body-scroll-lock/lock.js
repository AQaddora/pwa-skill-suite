export function openModal() {
  // Only lock on desktop where the overlay covers a scroll container; mobile keeps native scroll.
  if (window.matchMedia('(min-width: 1024px)').matches) {
    document.body.style.overflow = 'hidden';
  }
}
