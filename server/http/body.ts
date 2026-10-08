export class BodyError extends Error {constructor(readonly code:'BODY_SIZE'|'BODY_TIMEOUT'|'INVALID_JSON'){super(code);}}
export async function boundedBytes(body:ReadableStream<Uint8Array>|null,maxBytes:number,timeoutMs=8000,signal?:AbortSignal):Promise<Uint8Array>{
 if(!body)return new Uint8Array();const reader=body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const work=(async()=>{const chunks:Uint8Array[]=[];let size=0;for(;;){if(signal?.aborted)throw new DOMException('Request aborted.','AbortError');const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new BodyError('BODY_SIZE');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;})();
  return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new BodyError('BODY_TIMEOUT'));},timeoutMs);})]);
 }finally{if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{ /* cancellation may still be settling */ }}
}
export async function boundedJson(request:Request,maxBytes=1100*1024):Promise<Record<string,unknown>>{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new BodyError('INVALID_JSON');
 const bytes=await boundedBytes(request.body,maxBytes,8000,request.signal);try{const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value as Record<string,unknown>;}catch{throw new BodyError('INVALID_JSON');}
}
