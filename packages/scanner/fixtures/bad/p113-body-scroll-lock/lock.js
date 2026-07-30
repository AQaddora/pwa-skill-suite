export function openModal() {
  // Unconditional body scroll lock — breaks iOS Safari momentum scroll under the modal.
  document.body.style.overflow = 'hidden';
}
export function closeModal() {
  document.body.style.overflow = '';
}
