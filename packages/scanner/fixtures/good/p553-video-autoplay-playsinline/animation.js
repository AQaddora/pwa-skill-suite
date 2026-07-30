// A GSAP-style animation timeline's .play() has nothing to do with <video> autoplay
// policy and must not be flagged.
export function revealHero(tl) {
  tl.play();
}
