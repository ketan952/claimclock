import qrcode from 'qrcode-generator';
/** Draws a QR code for text into a canvas; used for private transfer and recovery links. */
export function drawQr(canvas:HTMLCanvasElement,text:string):void {
 const qr=qrcode(0,'M');qr.addData(text,'Byte');qr.make();
 const quiet=4,scale=5,modules=qr.getModuleCount(),side=(modules+2*quiet)*scale;
 canvas.width=side;canvas.height=side;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);ctx.fillStyle='#000';
 for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))ctx.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale);
}
