// Separate Neon Function entrypoint. Never include in the citizen Function bundle.
import { createStagingOperator } from './staging-operator.js';
const operator = createStagingOperator();
export default { fetch(request) { return operator.app.fetch(request); } };
