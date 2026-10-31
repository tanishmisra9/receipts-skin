// YouCam skin-analysis output[] -> {concerns: {name: {raw, ui, maskUrl}}, skin_type, all, skin_age}
export function normalize(output) {
  const s = { concerns: {}, skin_type: {} };
  for (const o of output) {
    if (o.type === 'all') s.all = o.score;
    else if (o.type === 'skin_age') s.skin_age = o.score;
    else if (o.type === 'skin_type') s.skin_type[o.region] = o.skin_type;
    else if (o.raw_score != null) s.concerns[o.type] = { raw: o.raw_score, ui: o.ui_score, maskUrl: o.mask_urls?.[0] ?? null };
  }
  return s;
}

export const ACTIONS = ['wrinkle', 'droopy_upper_eyelid', 'droopy_lower_eyelid', 'firmness', 'acne', 'moisture',
  'eye_bag', 'dark_circle_v2', 'age_spot', 'radiance', 'redness', 'oiliness', 'pore', 'texture',
  'tear_trough', 'skin_type'];
