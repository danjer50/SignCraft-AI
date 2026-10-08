import { readImageDimensions } from '../http/imageDimensions.js';

export interface DecoderModules { jpeg: WebAssembly.Module; png: WebAssembly.Module; webp: WebAssembly.Module }
export interface Raster { width: number; height: number; data: Uint8ClampedArray }
export const MAX_DECODED_IMAGE_PIXELS=8_000_000;
let initialized:Promise<void>|undefined;
async function initialize(modules?:DecoderModules):Promise<void> {
  if(initialized) return initialized;
  initialized=(async()=>{
    if(typeof ImageData==='undefined') Object.defineProperty(globalThis,'ImageData',{configurable:true,value:class {colorSpace='srgb';constructor(public data:Uint8ClampedArray,public width:number,public height:number){}}});
    const jpeg=await import('@jsquash/jpeg/decode.js');const png=await import('@jsquash/png/decode.js');const webp=await import('@jsquash/webp/decode.js');
    let codecs=modules;
    if(!codecs) {
      if(typeof process==='undefined' || !process.versions?.node) throw new Error('Image decoder bindings are not configured.');
      const {readFile}=await import('node:fs/promises');
      const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
      const load=async(spec:string)=>WebAssembly.compile(await readFile(require.resolve(spec)));
      codecs={jpeg:await load('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),png:await load('@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),webp:await load('@jsquash/webp/codec/dec/webp_dec.wasm')};
    }
    await Promise.all([jpeg.init(codecs.jpeg),png.init(codecs.png),webp.init(codecs.webp)]);
  })();
  try{await initialized;}catch(error){initialized=undefined;throw error;}
}
export async function decodeRaster(bytes:Uint8Array,mime:string,modules?:DecoderModules,maxPixels=MAX_DECODED_IMAGE_PIXELS):Promise<Raster|null> {
  const dimensions=readImageDimensions(mime,bytes);
  if(!dimensions || dimensions.width*dimensions.height>Math.min(24_000_000,maxPixels) || dimensions.width>8192 || dimensions.height>8192) return null;
  try {
    await initialize(modules);
    const buffer=bytes.slice().buffer;
    const decoded=mime==='image/jpeg'?await (await import('@jsquash/jpeg/decode.js')).default(buffer):mime==='image/png'?await (await import('@jsquash/png/decode.js')).default(buffer):mime==='image/webp'?await (await import('@jsquash/webp/decode.js')).default(buffer):null;
    if(!decoded || decoded.width!==dimensions.width || decoded.height!==dimensions.height || decoded.data.length!==decoded.width*decoded.height*4) return null;
    return {width:decoded.width,height:decoded.height,data:decoded.data};
  }catch {return null;}
}
