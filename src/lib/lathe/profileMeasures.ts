/** Read-only measurements of an already resolved profile, in physical radii. */
export type MeasuredSpan = { zStartMm:number; zEndMm:number } & ({radiusMm:number}|{rStartMm:number;rEndMm:number});
const radii = (span:MeasuredSpan) => 'radiusMm' in span ? [span.radiusMm,span.radiusMm] : [span.rStartMm,span.rEndMm];
function valid(spans:readonly MeasuredSpan[]) {
  if(!spans.length || spans.length>4096) return false;
  let end=spans[0].zStartMm;
  for(const span of spans) {
    const [a,b]=radii(span);
    if(![span.zStartMm,span.zEndMm,a,b].every(Number.isFinite)
      ||span.zStartMm!==end||span.zEndMm<=span.zStartMm||a<0||b<0) return false;
    end=span.zEndMm;
  }
  return true;
}
export function profileVolumeMm3(spans:readonly MeasuredSpan[]):number|null {
  if(!valid(spans)) return null;
  let volume=0;
  for(const span of spans) {
    const [a,b]=radii(span);
    volume+=Math.PI*(span.zEndMm-span.zStartMm)*(a*a+a*b+b*b)/3;
  }
  return Number.isFinite(volume)?volume:null;
}
/** At a shoulder use the smaller neighboring radius; stock faces keep their endpoint. */
export function profileRadiusAt(spans:readonly MeasuredSpan[],zMm:number):number|null {
  if(!Number.isFinite(zMm)||!valid(spans)) return null;
  let radius=Infinity;
  for(const span of spans) {
    if(zMm<span.zStartMm||zMm>span.zEndMm) continue;
    const [a,b]=radii(span);
    const t=(zMm-span.zStartMm)/(span.zEndMm-span.zStartMm);
    const r=zMm===span.zStartMm?a:zMm===span.zEndMm?b:a*(1-t)+b*t;
    radius=Math.min(radius,r);
  }
  return Number.isFinite(radius)?radius:null;
}
