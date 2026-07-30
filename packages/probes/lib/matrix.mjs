// The device matrix probes run across: six widths spanning small phones to tablets, each
// in portrait and landscape, times whichever engines actually launch on the host.
//
// Widths and canonical portrait heights are real device sizes (SE, small Android, iPhone
// 12–15, Pro Max, iPad, iPad Pro) rather than round numbers, so overflow/occlusion probes
// exercise realistic aspect ratios.
export const DEVICE_WIDTHS = [320, 360, 390, 430, 768, 1024];

const PORTRAIT_HEIGHT = {
  320: 568,
  360: 780,
  390: 844,
  430: 932,
  768: 1024,
  1024: 1366,
};

export function portraitSize(width) {
  const height = PORTRAIT_HEIGHT[width];
  if (!height) throw new Error(`unknown device width ${width}`);
  return { width, height };
}

/**
 * Yield one cell per engine × width × orientation.
 * @param {{engines: string[]}} opts
 * @returns {Generator<{engine:string,width:number,height:number,orientation:'portrait'|'landscape'}>}
 */
export function* cells({ engines }) {
  for (const engine of engines) {
    for (const w of DEVICE_WIDTHS) {
      const { width, height } = portraitSize(w);
      yield { engine, width, height, orientation: 'portrait' };
      yield { engine, width: height, height: width, orientation: 'landscape' };
    }
  }
}
