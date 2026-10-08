import { handleRuntime } from '../../server/http/studio.js';
import type { StudioEnvironment } from '../../server/http/studio.js';
export function onRequest(context:{request:Request;env:StudioEnvironment}):Promise<Response>{return handleRuntime(context.request,{...context.env,REQUIRE_DURABLE_SESSIONS:'true'});}
