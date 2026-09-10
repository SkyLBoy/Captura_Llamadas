import { createCanvas } from '@napi-rs/canvas';

export async function chartPng(title: string, labels: string[], values: number[]) {
  const canvas=createCanvas(700,400);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,700,400);
  ctx.fillStyle='#172554';ctx.font='bold 16px Arial';
  const words=title.split(' ');let line='';let y=25;
  for(const word of words) {
    if(ctx.measureText(line+word).width>650) {ctx.fillText(line,20,y);line='';y+=20;}
    line+=word+' ';
  }
  ctx.fillText(line,20,y);y+=30;
  const max=Math.max(1,...values);const step=Math.min(55,(380-y)/Math.max(1,labels.length));
  labels.forEach((label,i)=>{
    ctx.font='13px Arial';ctx.fillStyle='#172554';ctx.fillText(label,20,y+i*step,270);
    const width=(values[i]??0)/max*310;
    ctx.fillStyle='#2E86AB';ctx.fillRect(300,y+i*step-14,width,20);
    ctx.fillStyle='#172554';ctx.fillText(String(values[i]??0),615,y+i*step);
  });
  return canvas.encode('png');
}
