// Image preprocessing stays in a worker. Small projection search corrects mild skew.
self.onmessage=async(event:MessageEvent<{blob:Blob}>)=>{
 try{
  const bitmap=await createImageBitmap(event.data.blob);
  const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const image=ctx.getImageData(0,0,w,h),hist=new Uint32Array(256);
  for(let i=0;i<image.data.length;i+=4){const g=Math.round(.299*image.data[i]+.587*image.data[i+1]+.114*image.data[i+2]);image.data[i]=image.data[i+1]=image.data[i+2]=g;hist[g]++;}
  let total=0;for(let i=0;i<256;i++)total+=i*hist[i];let leftN=0,leftSum=0,best=0,threshold=160;
  for(let i=0;i<256;i++){leftN+=hist[i];if(!leftN)continue;const rightN=w*h-leftN;if(!rightN)break;leftSum+=i*hist[i];const delta=leftSum/leftN-(total-leftSum)/rightN;const score=leftN*rightN*delta*delta;if(score>best){best=score;threshold=i;}}
  for(let i=0;i<image.data.length;i+=4){const v=image.data[i]>threshold?255:0;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}ctx.putImageData(image,0,0);
  let angle=0,bestProjection=0;const stride=Math.max(2,Math.round(w/600));
  for(let degrees=-4;degrees<=4;degrees+=.5){const rows=new Uint32Array(h+200);const slope=Math.tan(degrees*Math.PI/180);for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){if(image.data[(y*w+x)*4]<128){const row=Math.round(y+slope*(x-w/2))+100;if(row>=0&&row<rows.length)rows[row]++;}}let score=0;for(const n of rows)score+=n*n;if(score>bestProjection){bestProjection=score;angle=degrees;}}
  const out=new OffscreenCanvas(w+100,h+100),o=out.getContext('2d')!;o.fillStyle='white';o.fillRect(0,0,out.width,out.height);o.translate(out.width/2,out.height/2);o.rotate(angle*Math.PI/180);o.drawImage(canvas,-w/2,-h/2);
  const blob=await out.convertToBlob({type:'image/png'});self.postMessage({blob,angle});
 }catch{self.postMessage({error:'Image preprocessing failed. Try a clearer image or enter lines manually.'});}
};
