/** Internal rollout switch for the complete working-cache path. The existing
 * exact-pair auditions remain the default until migration checks are complete.
 * This is not a second operator cache mode; remove the switch before release.
 */
import { envEnum } from '../util/env.js';
export function regularStemWorkingMode(): boolean {
  return envEnum('SUBWAVE_REGULAR_STEMS_ROLLOUT', ['audition', 'working'], 'audition') === 'working';
}
