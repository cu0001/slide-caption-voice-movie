import {test,expect} from '@playwright/test';
import {createBlobOutput} from '../src/blob-output';

test('chunked output preserves header rewrites, gaps and earlier chunks',async()=>{
 const output=createBlobOutput(),writer=output.stream.getWriter();
 const chunkSize=8*1024*1024;
 // A completed later chunk can arrive before the chunk containing the header.
 await writer.write({position:chunkSize,data:new Uint8Array([4,5,6])});
 await writer.write({position:0,data:new Uint8Array([1,2,3])});
 await writer.write({position:1,data:new Uint8Array([9])});
 await writer.close();
 const blob=output.getBlob();
 expect(blob.size).toBe(chunkSize+3);
 expect(blob.type).toBe('video/webm');
 expect([...new Uint8Array(await blob.slice(0,4).arrayBuffer())]).toEqual([1,9,3,0]);
 expect([...new Uint8Array(await blob.slice(chunkSize).arrayBuffer())]).toEqual([4,5,6]);
});
