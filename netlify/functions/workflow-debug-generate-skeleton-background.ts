import { getAppServices } from "../../src/backend/app.js";
import { debugSkeletonJobTriggerSchema } from "../../src/shared/contracts.js";

export default async (request: Request) => {
  const payload = debugSkeletonJobTriggerSchema.parse(await request.json());
  const services = getAppServices();
  await services.workflowService.runDebugSkeletonJob(payload);
  return new Response(null, { status: 202 });
};
