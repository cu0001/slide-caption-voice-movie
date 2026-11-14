// Random-access writes are needed when WebM updates its duration and seek index.
// Blob slices retain prior chunks without copying the whole file into an ArrayBuffer.
export function createBlobOutput() {
  let blob = new Blob([], {type:'video/webm'});
  const stream = new WritableStream<{data:Uint8Array<ArrayBuffer>;position:number}>({
    write({data,position}) {
      const gap = Math.max(0,position-blob.size);
      blob = new Blob([blob.slice(0,position), new Uint8Array(gap), data, blob.slice(position+data.byteLength)], {type:'video/webm'});
    },
  });
  return {stream,getBlob:()=>blob};
}
