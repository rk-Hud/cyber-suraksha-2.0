import { gatewayGuard } from './gateway-guard.js';
// Separate Neon Function entrypoint. Never include in the citizen Function bundle.
import { createStagingOperator } from './staging-operator.js';
const operator = createStagingOperator();
export default { fetch(request) { if (process.env.NEON_BRANCH_ID === 'br-sweet-band-azhwai4r') {
    const blocked = gatewayGuard(request, '/operator/v1/health');
    if (blocked) return blocked;
  }
  return operator.app.fetch(request); } };
