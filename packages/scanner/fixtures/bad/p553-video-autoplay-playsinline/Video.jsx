export function PromoVideo({ videoRef }) {
  return <video ref={videoRef} src="/promo.mp4" autoPlay />;
}

export function start(videoRef) {
  videoRef.current.play();
}
