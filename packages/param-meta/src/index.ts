import { PARAM_META } from './meta.generated';
import type { ParamMeta } from './meta.generated';
export type { ParamMeta };
export { PARAM_META };
export function paramMeta(name: string): ParamMeta | undefined {
  return PARAM_META[name];
}
