export function PromoVideo({ videoRef }) {
  return <video ref={videoRef} src="/promo.mp4" autoPlay muted playsInline />;
}

export async function start(videoRef) {
  try {
    await videoRef.current.play();
  } catch {
    // autoplay blocked; ignore
  }
}
