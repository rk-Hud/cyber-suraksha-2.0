import { createApi } from './app.js';
import { waitUntil } from '@neon/functions';
const service = createApi({ schedule: waitUntil });
export default { fetch(request) { return service.app.fetch(request); } };
