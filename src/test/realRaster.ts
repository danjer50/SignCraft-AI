import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';

export function rasterPixels(width:number,height:number,edited=false):Uint8Array{
 const bytes=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;bytes[i]=80+Math.floor(x/width*80);bytes[i+1]=80+Math.floor(y/height*90);bytes[i+2]=110;bytes[i+3]=255;if(edited&&x>width*.28&&x<width*.72&&y>height*.2&&y<height*.4){bytes[i]=230;bytes[i+1]=185;bytes[i+2]=80;}}
 return bytes;
}
function crc(bytes:Uint8Array):number{let value=0xffffffff;for(const b of bytes){value^=b;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array):Uint8Array{const result=new Uint8Array(data.length+12);const view=new DataView(result.buffer);view.setUint32(0,data.length);result.set(new TextEncoder().encode(type),4);result.set(data,8);view.setUint32(data.length+8,crc(result.subarray(4,data.length+8)));return result;}
export function validPngBytes(width=96,height=54,edited=true):Uint8Array{
 const header=new Uint8Array(13);const view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const pixels=rasterPixels(width,height,edited);const scanlines=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)scanlines.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',new Uint8Array())];const output=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){output.set(c,offset);offset+=c.length;}return output;
}
export function validJpegBytes(width=96,height=54,edited=false):Uint8Array{return jpeg.encode({width,height,data:rasterPixels(width,height,edited)},90).data;}
