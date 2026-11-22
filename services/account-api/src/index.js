import { gatewayGuard } from './gateway-guard.js';
import { createApi } from './app.js';
import { waitUntil } from '@neon/functions';
const service = createApi({ schedule: waitUntil });
export default { fetch(request) { if (process.env.NEON_BRANCH_ID === 'br-sweet-band-azhwai4r') {
    const blocked = gatewayGuard(request, '/api/v1/health');
    if (blocked) return blocked;
  }
  return service.app.fetch(request); } };
