declare module 'bidi-js' {
  export default function bidiFactory(): {
    getEmbeddingLevels(text:string,direction?:'ltr'|'rtl'): {levels:Uint8Array;paragraphs:{start:number;end:number;level:number}[]};
    getReorderedIndices(text:string,levels:{levels:Uint8Array;paragraphs:{start:number;end:number;level:number}[]}): number[];
  };
}
